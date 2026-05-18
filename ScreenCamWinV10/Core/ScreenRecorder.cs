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
    private MicWavWriter? _wavWriter;
    private Action<float>? _micLevelHandler;

    private RecordingOutputPaths? _outputPaths;
    private string? _tempDirectory;
    private string? _videoPath;
    private string? _audioPath;
    private int _videoFrameCount;

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

        _outputPaths = _s.OutputPaths
            ?? RecordingPathHelper.CreateSessionPaths(_s.OutputPath, _s.CaptureMicrophone, _s.Codec.Kind);

        if (_s.Codec.Kind == VideoCodecKind.H264_MF && _s.CaptureMicrophone
            && _outputPaths.MergedPath is not null
            && !_outputPaths.MergedPath.EndsWith(".mp4", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException(
                "H.264 (Windows 내장) 코덱은 합친 동영상이 .mp4 여야 합니다.");

        Directory.CreateDirectory(_outputPaths.SessionDirectory);
        SetupOutputPaths();

        _initSignal.Reset();
        _initError        = null;
        _lastStopResult   = null;
        _cts              = new CancellationTokenSource();
        _isRecording      = true;

        _thread = new Thread(RecordingMain)
        {
            IsBackground = true,
            Name         = "ScreenCaptureThread",
        };
        _thread.SetApartmentState(ApartmentState.STA);
        _thread.Start();

        _initSignal.Wait(10_000);
        if (_initError != null)
        {
            _isRecording = false;
            _cts.Cancel();
            throw _initError;
        }
    }

    void SetupOutputPaths()
    {
        _tempDirectory = null;
        _audioPath     = null;

        if (_s.CaptureMicrophone)
        {
            _tempDirectory = Path.Combine(Path.GetTempPath(), "ScreenCamWin", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(_tempDirectory);

            string ext = Path.GetExtension(_outputPaths!.VideoPath);
            _videoPath = Path.Combine(_tempDirectory, "video" + ext);
            _audioPath = Path.Combine(_tempDirectory, "audio.wav");
        }
        else
        {
            _videoPath = _outputPaths!.VideoPath;
        }
    }

    public void Stop()
    {
        if (!_isRecording) return;
        _isRecording = false;
        _cts?.Cancel();
        _thread?.Join(8000);
        _thread = null;
    }

    void RecordingMain()
    {
        AviContainer? avi = null;
        MfH264Writer? mf  = null;
        bool separateAudio = _s.CaptureMicrophone;

        try
        {
            if (separateAudio)
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
                    mf = new MfH264Writer(_videoPath!, _captureW, _captureH, _s.Fps, withAudio: false);
                    break;

                case VideoCodecKind.Mjpeg:
                    avi = new AviContainer(_videoPath!, _captureW, _captureH, _s.Fps, withAudio: false);
                    avi.WriteFileHeader(AviContainer.ParseFourCC("MJPG"),
                        AviContainer.MakeMjpegStrf(_captureW, _captureH));
                    break;

                case VideoCodecKind.Uncompressed:
                    avi = new AviContainer(_videoPath!, _captureW, _captureH, _s.Fps, withAudio: false);
                    avi.WriteFileHeader(0u, MakeRgbStrf(_captureW, _captureH));
                    break;
            }

            _initSignal.Set();

            if (_s.Target.IsDesktop)
                Thread.Sleep(350);

            if (separateAudio)
            {
                _wavWriter = new MicWavWriter(_audioPath!);
                _mic!.StartRecording(_s.MicrophoneDeviceId, (buffer, count) =>
                    _wavWriter.Write(buffer, count));
            }

            _videoFrameCount = 0;
            CaptureLoop(_cts!.Token, avi, mf);
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
            try { _mic?.StopAcceptingSamples(); } catch { }
            try { _mic?.Stop(); } catch { }

            try { _wavWriter?.Dispose(); } catch { }
            _wavWriter = null;

            if (separateAudio && _audioPath is not null && File.Exists(_audioPath) && _videoFrameCount > 0)
            {
                long pcmBytes = Math.Max(0, new FileInfo(_audioPath).Length - 44);
                long expected = WavFileHelper.ExpectedPcmBytesForVideo(_videoFrameCount, _s.Fps);
                if (pcmBytes > 0 && expected > 0)
                    WavFileHelper.TrimToDataBytes(_audioPath, expected);
            }

            try { avi?.FinalizeFile(); mf?.FinalizeFile(); } catch { }
            avi?.Dispose();
            mf?.Dispose();

            if (_mic is not null && _micLevelHandler is not null)
                _mic.LevelChanged -= _micLevelHandler;
            _micLevelHandler = null;
            _mic?.Dispose();
            _mic = null;

            _lastStopResult = BuildStopResult();
        }
    }

    RecordingStopResult BuildStopResult() => new()
    {
        OutputPaths       = _outputPaths!,
        CaptureMicrophone = _s.CaptureMicrophone,
        TempDirectory     = _tempDirectory,
        TempVideoPath     = _s.CaptureMicrophone ? _videoPath : null,
        TempAudioPath     = _s.CaptureMicrophone ? _audioPath : null,
    };

    void CaptureLoop(CancellationToken ct, AviContainer? avi, MfH264Writer? mf)
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
                CaptureAndWrite(avi, mf);
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

    void CaptureAndWrite(AviContainer? avi, MfH264Writer? mf)
    {
        using var bmp = ScreenCapture.Capture(_s.Target);
        if (_s.CaptureCursor) ScreenCapture.DrawCursor(bmp, _s.Target);

        _videoFrameCount++;

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
        }
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
