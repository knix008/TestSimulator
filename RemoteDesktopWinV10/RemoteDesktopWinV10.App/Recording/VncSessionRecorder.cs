using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using RemoteViewing.Vnc;
using RemoteViewing.Windows.Forms;



namespace RemoteDesktopWinV10.App.Recording;



public sealed class VncSessionRecorder : IDisposable

{

    private readonly VncControl _control;

    private readonly int _targetFps;

    private readonly string? _outputFolderOverride;



    private readonly object _stateLock = new();

    private readonly Stopwatch _elapsed = new();



    private Thread? _writerThread;

    private CancellationTokenSource? _writerCts;

    private Exception? _writerError;

    private string _outputPath = "";

    private int _encodeWidth;

    private int _encodeHeight;

    private long _framesWritten;

    private bool _disposed;

    private bool _isRecording;



    public event EventHandler<RecordingStatusEventArgs>? StatusChanged;



    public VncSessionRecorder(

        VncControl control,

        int targetFps,

        string? outputFolderOverride)

    {

        _control = control;

        _targetFps = Math.Clamp(targetFps, 1, 60);

        _outputFolderOverride = outputFolderOverride;

    }



    public bool IsRecording

    {

        get

        {

            lock (_stateLock) return _isRecording;

        }

    }



    public string? OutputPath

    {

        get

        {

            lock (_stateLock) return string.IsNullOrEmpty(_outputPath) ? null : _outputPath;

        }

    }



    public RecordingStatusSnapshot GetStatusSnapshot()

    {

        lock (_stateLock)

        {

            return new RecordingStatusSnapshot(

                _isRecording,

                _elapsed.Elapsed,

                _framesWritten,

                _outputPath,

                0);

        }

    }



    public Task StartAsync(string sessionLabel, CancellationToken cancellationToken = default)

    {

        ObjectDisposedException.ThrowIf(_disposed, this);

        lock (_stateLock)

        {

            if (_isRecording)

            {

                throw new InvalidOperationException("이미 녹화 중입니다.");

            }

        }



        cancellationToken.ThrowIfCancellationRequested();



        if (!_control.Client.IsConnected)

        {

            throw new InvalidOperationException("VNC에 연결된 상태에서만 녹화할 수 있습니다.");

        }



        MediaFoundationRuntime.VerifyH264EncodingAvailable();



        var folder = string.IsNullOrWhiteSpace(_outputFolderOverride)

            ? Path.Combine(

                Environment.GetFolderPath(Environment.SpecialFolder.MyVideos),

                "RemoteDesktopWinV10")

            : _outputFolderOverride!;



        Directory.CreateDirectory(folder);



        var safeLabel = SanitizeFileName(sessionLabel);

        var path = Path.Combine(folder, $"VNC_{safeLabel}_{DateTime.Now:yyyyMMdd_HHmmss}.mp4");



        int encodeWidth;

        int encodeHeight;

        lock (_control.Client.Framebuffer.SyncRoot)

        {

            var fb = _control.Client.Framebuffer;

            encodeWidth = H264Mp4Recorder.AlignEven(fb.Width);

            encodeHeight = H264Mp4Recorder.AlignEven(fb.Height);

            if (encodeWidth < 2 || encodeHeight < 2)

            {

                throw new InvalidOperationException("원격 화면 크기를 알 수 없습니다.");

            }

        }



        lock (_stateLock)

        {

            _writerError = null;

            _outputPath = path;

            _encodeWidth = encodeWidth;

            _encodeHeight = encodeHeight;

            _framesWritten = 0;

            _elapsed.Restart();

            _isRecording = true;

        }



        _writerCts = new CancellationTokenSource();

        _writerThread = new Thread(() => WriterLoop(path, encodeWidth, encodeHeight, _writerCts.Token))

        {

            IsBackground = true,

            Name = "VncSessionRecorder",

        };

        _writerThread.SetApartmentState(ApartmentState.STA);

        _writerThread.Start();



        RaiseStatus();

        return Task.CompletedTask;

    }



    public void Stop()
    {
        lock (_stateLock)
        {
            if (!_isRecording) return;
            _isRecording = false;
        }

        _writerCts?.Cancel();

        if (_writerThread is { IsAlive: true } t)
        {
            t.Join(TimeSpan.FromSeconds(5));
        }

        _writerCts?.Dispose();
        _writerCts = null;
        _writerThread = null;
        _elapsed.Stop();

        if (_writerError != null)
        {
            var error = _writerError;
            _writerError = null;
            throw new InvalidOperationException("녹화 파일을 저장하는 중 오류가 발생했습니다.", error);
        }

        RaiseStatus();
    }

    /// <summary>UI 스레드를 블로킹하지 않고 녹화를 종료한다. 버튼/메뉴에서 호출할 때 사용한다.</summary>
    public async Task StopAsync()
    {
        lock (_stateLock)
        {
            if (!_isRecording) return;
            _isRecording = false;
        }

        _writerCts?.Cancel();

        if (_writerThread is { IsAlive: true } t)
        {
            await Task.Run(() => t.Join(TimeSpan.FromSeconds(60))).ConfigureAwait(false);
        }

        _writerCts?.Dispose();
        _writerCts = null;
        _writerThread = null;
        _elapsed.Stop();

        if (_writerError != null)
        {
            var error = _writerError;
            _writerError = null;
            throw new InvalidOperationException("녹화 파일을 저장하는 중 오류가 발생했습니다.", error);
        }

        RaiseStatus();
    }



    private void WriterLoop(string path, int width, int height, CancellationToken cancellationToken)

    {

        H264Mp4Recorder? recorder = null;
        Bitmap? scratchBitmap = null;

        try
        {
            recorder = new H264Mp4Recorder(path, width, height, _targetFps);
            recorder.Initialize();

            var frameBytes = width * height * 4;
            var buffer = new byte[frameBytes];
            scratchBitmap = CreateCaptureBitmap(width, height);
            var frameInterval = TimeSpan.FromTicks(TimeSpan.TicksPerSecond / _targetFps);
            var clock = Stopwatch.StartNew();
            long frameIndex = 0;

            while (!cancellationToken.IsCancellationRequested)
            {
                var due = TimeSpan.FromTicks(frameInterval.Ticks * frameIndex);
                var now = clock.Elapsed;
                if (now < due)
                {
                    var waitMs = (int)Math.Min(250, (due - now).TotalMilliseconds);
                    if (waitMs > 0 && cancellationToken.WaitHandle.WaitOne(waitMs))
                    {
                        break;
                    }

                    continue;
                }

                if (!TryCaptureFrame(width, height, buffer, scratchBitmap))
                {
                    continue;
                }

                recorder.WriteFrame(buffer);
                Interlocked.Increment(ref _framesWritten);
                frameIndex++;
                RaiseStatus();
            }

        }

        catch (Exception ex)

        {

            _writerError = ex;

            Debug.WriteLine("VncSessionRecorder writer failed: " + ex);

        }

        finally
        {
            if (scratchBitmap != null)
            {
                DisposeCaptureBitmap(scratchBitmap);
            }

            try
            {
                recorder?.FinalizeRecording();
            }
            catch (Exception ex)
            {
                _writerError ??= ex;
            }

            try
            {
                recorder?.Dispose();
            }
            catch (Exception ex)
            {
                _writerError ??= ex;
            }
        }
    }



    private Bitmap CreateCaptureBitmap(int width, int height)
    {
        if (_control.InvokeRequired)
        {
            return (Bitmap)_control.Invoke(() => CreateCaptureBitmap(width, height))!;
        }

        return new Bitmap(width, height, PixelFormat.Format32bppArgb);
    }

    private void DisposeCaptureBitmap(Bitmap bitmap)
    {
        void Dispose() => bitmap.Dispose();
        if (_control.InvokeRequired)
        {
            _control.Invoke(Dispose);
        }
        else
        {
            Dispose();
        }
    }

    private bool TryCaptureFrame(int width, int height, byte[] buffer, Bitmap scratchBitmap)
    {
        bool Capture()
        {
            try
            {
                var client = _control.Client;
                if (!client.IsConnected)
                {
                    return false;
                }

                return VncFramebufferCapture.TryCopyRgb32(
                    client.Framebuffer,
                    width,
                    height,
                    buffer,
                    scratchBitmap);
            }
            catch
            {
                return false;
            }
        }

        if (_control.InvokeRequired)
        {
            return _control.Invoke(() => Capture());
        }

        return Capture();
    }



    private void RaiseStatus()

    {

        try

        {

            StatusChanged?.Invoke(this, new RecordingStatusEventArgs(GetStatusSnapshot()));

        }

        catch

        {

            // ignore

        }

    }



    private static string SanitizeFileName(string name)

    {

        var invalid = Path.GetInvalidFileNameChars();

        var chars = name.Select(ch => invalid.Contains(ch) ? '_' : ch).ToArray();

        var s = new string(chars).Trim();

        return string.IsNullOrEmpty(s) ? "session" : s.Length > 48 ? s[..48] : s;

    }



    public void Dispose()

    {

        if (_disposed)

        {

            return;

        }



        _disposed = true;

        try

        {

            Stop();

        }

        catch

        {

            // ignore during dispose

        }

    }

}



public sealed record RecordingStatusSnapshot(

    bool IsRecording,

    TimeSpan Elapsed,

    long FramesWritten,

    string OutputPath,

    int QueuedFrames);



public sealed class RecordingStatusEventArgs : EventArgs

{

    public RecordingStatusSnapshot Snapshot { get; }



    public RecordingStatusEventArgs(RecordingStatusSnapshot snapshot) => Snapshot = snapshot;

}

