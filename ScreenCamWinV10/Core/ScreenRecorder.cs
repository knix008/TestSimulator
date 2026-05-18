using System.Drawing.Imaging;
using ScreenCamWin.Models;

namespace ScreenCamWin.Core;

public sealed class ScreenRecorder : IDisposable
{
    private readonly RecordingSettings _s;
    private Thread?        _thread;
    private CancellationTokenSource? _cts;
    private int  _captureW, _captureH;
    private volatile bool _isRecording;

    // Init synchronisation
    private ManualResetEventSlim _initSignal = new(false);
    private Exception? _initError;

    private static readonly ImageCodecInfo _jpegCodec =
        ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);

    public bool       IsRecording => _isRecording;
    public Exception? LastError   { get; private set; }

    public event EventHandler<TimeSpan>?  Elapsed;
    public event EventHandler<Exception>? Error;

    public ScreenRecorder(RecordingSettings settings) => _s = settings;

    // ── Start / Stop ─────────────────────────────────────────────────────────

    public void Start()
    {
        if (_isRecording) return;

        // Probe frame → actual render dimensions (avoids DPI/PrintWindow discrepancy)
        using (var probe = ScreenCapture.Capture(_s.Target))
        {
            _captureW = (probe.Width  / 2) * 2;
            _captureH = (probe.Height / 2) * 2;
        }
        if (_captureW < 2 || _captureH < 2)
            throw new InvalidOperationException("캡처 영역이 너무 작습니다.");

        // Validate output extension for H.264
        if (_s.Codec.Kind == VideoCodecKind.H264_MF &&
            !_s.OutputPath.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException(
                "H.264 (Windows 내장) 코덱은 .mp4 파일로 저장해야 합니다.\n" +
                "출력 경로의 확장자를 .mp4 로 변경해 주세요.");

        _initSignal.Reset();
        _initError   = null;
        _cts         = new CancellationTokenSource();
        _isRecording = true;

        _thread = new Thread(RecordingMain)
        {
            IsBackground = true,
            Name         = "ScreenCaptureThread",
        };
        _thread.Start();

        // Wait up to 10 s for the recording thread to finish initialisation
        _initSignal.Wait(10_000);
        if (_initError != null)
        {
            _isRecording = false;
            _cts.Cancel();
            throw _initError;
        }
    }

    public void Stop()
    {
        if (!_isRecording) return;
        _isRecording = false;
        _cts?.Cancel();
        _thread?.Join(4000);
        _thread = null;
    }

    // ── Recording thread ──────────────────────────────────────────────────────

    private void RecordingMain()
    {
        // ALL COM / MF / VFW objects are created here on this MTA thread.
        AviContainer?  avi = null;
        VfwEncoder?    vfw = null;
        MfH264Writer?  mf  = null;

        try
        {
            switch (_s.Codec.Kind)
            {
                case VideoCodecKind.H264_MF:
                    mf = new MfH264Writer(_s.OutputPath, _captureW, _captureH, _s.Fps);
                    break;

                case VideoCodecKind.Mjpeg:
                    avi = new AviContainer(_s.OutputPath, _captureW, _captureH, _s.Fps);
                    avi.WriteFileHeader(AviContainer.ParseFourCC("MJPG"),
                                        AviContainer.MakeMjpegStrf(_captureW, _captureH));
                    break;

                case VideoCodecKind.Uncompressed:
                    avi = new AviContainer(_s.OutputPath, _captureW, _captureH, _s.Fps);
                    avi.WriteFileHeader(0u, MakeRgbStrf(_captureW, _captureH));
                    break;

                default: // VFW (x264vfw 64bit)
                    vfw = new VfwEncoder(_s.Codec.FourCC, _captureW, _captureH, _s.Fps, _s.Quality);
                    avi = new AviContainer(_s.OutputPath, _captureW, _captureH, _s.Fps);
                    avi.WriteFileHeader(vfw.OutFourCC, vfw.StrfBytes);
                    break;
            }

            _initSignal.Set(); // ← signal success to Start()

            CaptureLoop(_cts!.Token, avi, vfw, mf);
        }
        catch (Exception ex)
        {
            if (!_initSignal.IsSet)
            {
                _initError = ex;
                _initSignal.Set(); // ← signal failure to Start()
            }
            else if (!(_cts?.IsCancellationRequested ?? true))
            {
                LastError    = ex;
                _isRecording = false;
                Error?.Invoke(this, ex);
            }
        }
        finally
        {
            // Dispose everything on this thread (important for COM objects)
            try { avi?.FinalizeFile(); mf?.FinalizeFile(); } catch { }
            avi?.Dispose();
            mf?.Dispose();
            vfw?.Dispose();
        }
    }

    // ── Capture loop ──────────────────────────────────────────────────────────

    private void CaptureLoop(CancellationToken ct,
                              AviContainer? avi, VfwEncoder? vfw, MfH264Writer? mf)
    {
        var interval  = TimeSpan.FromSeconds(1.0 / _s.Fps);
        var startTime = DateTime.UtcNow;
        var nextFrame = DateTime.UtcNow;

        while (!ct.IsCancellationRequested)
        {
            var now = DateTime.UtcNow;
            if (now >= nextFrame)
            {
                nextFrame += interval;
                if (nextFrame < now) nextFrame = now + interval;
                CaptureAndWrite(avi, vfw, mf);
                Elapsed?.Invoke(this, DateTime.UtcNow - startTime);
            }
            else
            {
                var wait = nextFrame - now;
                if (wait.TotalMilliseconds > 2)
                    Thread.Sleep((int)(wait.TotalMilliseconds - 1));
            }
        }
    }

    private void CaptureAndWrite(AviContainer? avi, VfwEncoder? vfw, MfH264Writer? mf)
    {
        using var bmp = ScreenCapture.Capture(_s.Target);
        if (_s.CaptureCursor) ScreenCapture.DrawCursor(bmp, _s.Target);

        switch (_s.Codec.Kind)
        {
            case VideoCodecKind.H264_MF:
                mf!.WriteFrame(ScreenCapture.ToBgr24TopDown(bmp, _captureW, _captureH));
                break;

            case VideoCodecKind.Mjpeg:
            {
                var jpeg = (bmp.Width == _captureW && bmp.Height == _captureH)
                    ? ToJpeg(bmp, _s.Quality)
                    : ToJpeg(new Bitmap(bmp, _captureW, _captureH), _s.Quality);
                lock (avi!) avi.WriteVideoFrame(jpeg, isKeyFrame: true);
                break;
            }
            case VideoCodecKind.Uncompressed:
                lock (avi!) avi.WriteVideoFrame(
                    ScreenCapture.ToBgr24BottomUp(bmp, _captureW, _captureH), isKeyFrame: true);
                break;

            default:
            {
                var raw = ScreenCapture.ToBgr24BottomUp(bmp, _captureW, _captureH);
                var (data, isKey) = vfw!.CompressFrame(raw);
                lock (avi!) avi.WriteVideoFrame(data, isKey);
                break;
            }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static byte[] ToJpeg(Bitmap bmp, int quality)
    {
        using var ms   = new MemoryStream();
        using var pars = new EncoderParameters(1);
        pars.Param[0]  = new EncoderParameter(Encoder.Quality, (long)quality);
        bmp.Save(ms, _jpegCodec, pars);
        return ms.ToArray();
    }

    private static byte[] MakeRgbStrf(int w, int h)
    {
        using var ms = new MemoryStream(40);
        using var bw = new BinaryWriter(ms);
        bw.Write(40u); bw.Write(w); bw.Write(h);
        bw.Write((ushort)1); bw.Write((ushort)24);
        bw.Write(0u); bw.Write((uint)(w * h * 3));
        bw.Write(0); bw.Write(0); bw.Write(0u); bw.Write(0u);
        return ms.ToArray();
    }

    public void Dispose() => Stop();
}
