using System.Drawing.Imaging;
using ScreenCamWin.Models;

namespace ScreenCamWin.Core;

public sealed class ScreenRecorder : IDisposable
{
    private readonly RecordingSettings _s;
    private Thread? _thread;
    private CancellationTokenSource? _cts;
    private int _captureW, _captureH;
    private volatile bool _isRecording;

    private ManualResetEventSlim _initSignal = new(false);
    private Exception? _initError;

    private MicrophoneCapture? _mic;
    private Action<float>? _micLevelHandler;

    // Audio accumulator: tracks how many PCM bytes have been written so far,
    // so each video frame pulls exactly the right number of samples.
    private long _audioBytesPulled;
    private byte[]? _audioFrameBuffer;

    private RecordingStopResult? _lastStopResult;

    private static readonly ImageCodecInfo _jpegCodec =
        ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);

    public bool       IsRecording => _isRecording;
    public Exception? LastError   { get; private set; }

    public event EventHandler<TimeSpan>?  Elapsed;
    public event EventHandler<Exception>? Error;
    public event Action<float>? MicLevel;

    public ScreenRecorder(RecordingSettings settings) => _s = settings;

    public RecordingStopResult? GetStopResult() => _lastStopResult;

    public void SetMicrophoneGain(int gainPercent)
    {
        if (_mic is not null)
            _mic.InputGain = Math.Clamp(gainPercent, 0, 100) / 100f;
    }

    public void Start()
    {
        if (_isRecording) return;

        if (_s.CaptureMicrophone && string.IsNullOrWhiteSpace(_s.MicrophoneDeviceId))
            throw new InvalidOperationException("마이크 장치를 선택해 주세요.");

        using (var probe = ScreenCapture.Capture(_s.Target))
        {
            _captureW = (probe.Width  / 2) * 2;
            _captureH = (probe.Height / 2) * 2;
            if (_s.Codec.Kind == VideoCodecKind.H264_MF)
            {
                _captureW = (_captureW / 16) * 16;
                _captureH = (_captureH / 16) * 16;
            }
        }

        int minSize = _s.Codec.Kind == VideoCodecKind.H264_MF ? 16 : 2;
        if (_captureW < minSize || _captureH < minSize)
            throw new InvalidOperationException("캡처 영역이 너무 작습니다.");

        string? dir = Path.GetDirectoryName(_s.OutputPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        _initSignal.Reset();
        _initError      = null;
        _lastStopResult = null;
        _cts            = new CancellationTokenSource();
        _isRecording    = true;

        _thread = new Thread(RecordingMain)
        {
            IsBackground = true,
            Name         = "ScreenCaptureThread",
        };
        // MTA required for Media Foundation codec discovery (AAC encoder MFT)
        _thread.SetApartmentState(ApartmentState.MTA);
        _thread.Start();

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
        _thread?.Join(10_000);
        _thread = null;
    }

    void RecordingMain()
    {
        AviContainer? avi = null;
        MfH264Writer? mf  = null;
        bool withAudio = _s.CaptureMicrophone;

        try
        {
            if (withAudio)
            {
                _mic = new MicrophoneCapture
                {
                    InputGain = Math.Clamp(_s.MicrophoneGain, 0, 100) / 100f,
                };
                _micLevelHandler = level => MicLevel?.Invoke(level);
                _mic.LevelChanged += _micLevelHandler;
            }

            switch (_s.Codec.Kind)
            {
                case VideoCodecKind.H264_MF:
                    mf = new MfH264Writer(_s.OutputPath, _captureW, _captureH, _s.Fps,
                                          withAudio: withAudio);
                    break;

                case VideoCodecKind.Mjpeg:
                    avi = new AviContainer(_s.OutputPath, _captureW, _captureH, _s.Fps,
                                           withAudio: withAudio);
                    avi.WriteFileHeader(AviContainer.ParseFourCC("MJPG"),
                        AviContainer.MakeMjpegStrf(_captureW, _captureH));
                    break;

                case VideoCodecKind.Uncompressed:
                    avi = new AviContainer(_s.OutputPath, _captureW, _captureH, _s.Fps,
                                           withAudio: withAudio);
                    avi.WriteFileHeader(0u, MakeRgbStrf(_captureW, _captureH));
                    break;
            }

            if (withAudio)
            {
                // Pre-allocate audio buffer: maximum bytes for one video frame (with margin)
                int maxBytesPerFrame = (int)Math.Ceiling(
                    (double)MicrophoneCapture.SampleRate
                    * MicrophoneCapture.Channels
                    * (MicrophoneCapture.BitsPerSample / 8)
                    / _s.Fps) + MicrophoneCapture.Channels * (MicrophoneCapture.BitsPerSample / 8);
                _audioFrameBuffer = new byte[maxBytesPerFrame];
            }

            _initSignal.Set();

            if (_s.Target.IsDesktop)
                Thread.Sleep(350);

            if (withAudio)
                _mic!.StartRecording(_s.MicrophoneDeviceId);

            _audioBytesPulled = 0;
            int videoFrameCount = 0;
            CaptureLoop(_cts!.Token, avi, mf, ref videoFrameCount);
        }
        catch (Exception ex)
        {
            if (!_initSignal.IsSet)
            {
                _initError = ex;
                _initSignal.Set();
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
            try { _mic?.Stop(); } catch { }

            try { avi?.FinalizeFile(); mf?.FinalizeFile(); } catch { }
            avi?.Dispose();
            mf?.Dispose();

            if (_mic is not null && _micLevelHandler is not null)
                _mic.LevelChanged -= _micLevelHandler;
            _micLevelHandler = null;
            _mic?.Dispose();
            _mic = null;

            _lastStopResult = new RecordingStopResult { VideoPath = _s.OutputPath };
        }
    }

    void CaptureLoop(CancellationToken ct, AviContainer? avi, MfH264Writer? mf,
                     ref int frameCount)
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
                CaptureAndWrite(avi, mf, ref frameCount);
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

    void CaptureAndWrite(AviContainer? avi, MfH264Writer? mf, ref int frameCount)
    {
        using var bmp = ScreenCapture.Capture(_s.Target);
        if (_s.CaptureCursor) ScreenCapture.DrawCursor(bmp, _s.Target);

        frameCount++;

        switch (_s.Codec.Kind)
        {
            case VideoCodecKind.H264_MF:
                mf!.WriteFrame(ScreenCapture.ToBgr24TopDown(bmp, _captureW, _captureH));
                WriteAudioFrame(null, mf, frameCount);
                break;

            case VideoCodecKind.Mjpeg:
            {
                var jpeg = (bmp.Width == _captureW && bmp.Height == _captureH)
                    ? ToJpeg(bmp, _s.Quality)
                    : ToJpeg(new Bitmap(bmp, _captureW, _captureH), _s.Quality);
                lock (avi!) avi.WriteVideoFrame(jpeg, isKeyFrame: true);
                WriteAudioFrame(avi, null, frameCount);
                break;
            }
            case VideoCodecKind.Uncompressed:
                lock (avi!) avi.WriteVideoFrame(
                    ScreenCapture.ToBgr24BottomUp(bmp, _captureW, _captureH), isKeyFrame: true);
                WriteAudioFrame(avi, null, frameCount);
                break;
        }
    }

    // Pulls the exact audio bytes needed to keep audio in sync with frameCount video frames.
    // Any bytes not available yet are padded with silence.
    void WriteAudioFrame(AviContainer? avi, MfH264Writer? mf, int frameCount)
    {
        if (_mic is null || _audioFrameBuffer is null) return;

        int blockAlign = MicrophoneCapture.Channels * (MicrophoneCapture.BitsPerSample / 8);

        // Accumulator: how many PCM bytes should correspond to frameCount video frames
        long expectedBytes = (long)frameCount * MicrophoneCapture.SampleRate / _s.Fps * blockAlign;
        int wantBytes = (int)(expectedBytes - _audioBytesPulled);
        wantBytes = Math.Max(0, wantBytes - (wantBytes % blockAlign));

        if (wantBytes <= 0) return;

        // Ensure buffer is large enough (it should always be, given pre-allocation)
        if (_audioFrameBuffer.Length < wantBytes)
            _audioFrameBuffer = new byte[wantBytes];

        int got = _mic.PullPcm(_audioFrameBuffer, wantBytes);

        // Pad remainder with silence
        if (got < wantBytes)
            Array.Clear(_audioFrameBuffer, got, wantBytes - got);

        if (avi is not null)
            lock (avi) avi.WriteAudioFrame(_audioFrameBuffer[..wantBytes]);
        else
            mf?.WriteAudioPcm(_audioFrameBuffer, wantBytes);

        _audioBytesPulled += wantBytes;
    }

    static byte[] ToJpeg(Bitmap bmp, int quality)
    {
        using var ms   = new MemoryStream();
        using var pars = new EncoderParameters(1);
        pars.Param[0]  = new EncoderParameter(Encoder.Quality, (long)quality);
        bmp.Save(ms, _jpegCodec, pars);
        return ms.ToArray();
    }

    static byte[] MakeRgbStrf(int w, int h)
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
