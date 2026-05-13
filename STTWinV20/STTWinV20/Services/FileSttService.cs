using NAudio.Wave;
using NAudio.Wave.SampleProviders;

namespace STTWinV20.Services;

// Reads audio from a media file (MP4/MKV/MP3/WAV/etc.) using Windows Media Foundation,
// resamples to 16 kHz mono, and runs VAD + Whisper STT in the background.
// Mirrors STTGTKV10 file-transcription mode: VAD thresh 0.030, min_speech 12 frames.
public sealed class FileSttService : IDisposable
{
    private readonly SttProcessor _stt;
    private CancellationTokenSource? _cts;
    private ManualResetEventSlim? _pauseGate;
    private bool _disposed;

    public bool IsRunning { get; private set; }

    public event EventHandler<string>? TranscriptionReceived;
    public event EventHandler<string>? StatusChanged;
    public event EventHandler<string>? ErrorOccurred;
    public event EventHandler? Completed;

    public FileSttService(SttProcessor stt)
    {
        _stt = stt;
        _stt.TranscriptionReceived += (_, text) => TranscriptionReceived?.Invoke(this, text);
        _stt.ErrorOccurred += (_, err) => ErrorOccurred?.Invoke(this, err);
    }

    public void Start(string filePath, TimeSpan startAt = default)
    {
        Stop();
        OutputFilter.Reset();

        _cts = new CancellationTokenSource();
        _pauseGate = new ManualResetEventSlim(true); // initially unpaused
        IsRunning = true;

        _ = RunAsync(filePath, startAt, _cts.Token);
    }

    public void Pause()
    {
        _pauseGate?.Reset(); // blocks the reading loop
    }

    public void Resume()
    {
        _pauseGate?.Set(); // unblocks the reading loop
    }

    // Re-seek: stop current run and restart from the new position.
    public void SeekTo(string filePath, TimeSpan position)
    {
        Stop();
        Start(filePath, position);
    }

    public void Stop()
    {
        if (!IsRunning) return;
        IsRunning = false;
        _pauseGate?.Set(); // unblock if paused so the loop can exit
        _cts?.Cancel();
        _cts?.Dispose();
        _cts = null;
        _pauseGate?.Dispose();
        _pauseGate = null;
    }

    private async Task RunAsync(string filePath, TimeSpan startAt, CancellationToken ct)
    {
        try
        {
            StatusChanged?.Invoke(this, "파일 STT 준비 중...");

            await Task.Run(() => ReadAndProcess(filePath, startAt, ct), ct);

            if (!ct.IsCancellationRequested)
            {
                StatusChanged?.Invoke(this, "파일 STT 완료");
                Completed?.Invoke(this, EventArgs.Empty);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            ErrorOccurred?.Invoke(this, $"파일 STT 오류: {ex.Message}");
        }
        finally
        {
            IsRunning = false;
        }
    }

    private void ReadAndProcess(string filePath, TimeSpan startAt, CancellationToken ct)
    {
        // MediaFoundationReader decodes video/audio files via Windows MF codecs
        using var reader = new MediaFoundationReader(filePath);

        // Seek to requested position
        if (startAt > TimeSpan.Zero && startAt < reader.TotalTime)
            reader.CurrentTime = startAt;

        // Resample to 16 kHz mono PCM-16 for Whisper
        var targetFormat = new WaveFormat(16000, 16, 1);
        using var resampler = new MediaFoundationResampler(reader, targetFormat)
        {
            ResamplerQuality = 60,
        };

        // Wrap as float sample provider for easy conversion
        ISampleProvider samples = resampler.ToSampleProvider();
        if (resampler.WaveFormat.Channels > 1)
            samples = samples.ToMono();

        var vad = new VadProcessor(VadMode.File);
        vad.SegmentReady += (_, audio) =>
        {
            if (ct.IsCancellationRequested) return;
            StatusChanged?.Invoke(this, $"STT 처리 중... ({audio.Length / 16000f:F1}초)");
            // ProcessSegmentAsync is fire-and-forget here (called from background thread)
            _stt.ProcessSegmentAsync(audio, isFileMode: true, ct)
                .GetAwaiter().GetResult();
            if (IsRunning) StatusChanged?.Invoke(this, "파일 STT 실행 중...");
        };

        var buf = new float[512];
        int read;

        while (!ct.IsCancellationRequested)
        {
            // Honor pause
            _pauseGate?.Wait(ct);
            if (ct.IsCancellationRequested) break;

            read = samples.Read(buf, 0, buf.Length);
            if (read == 0) break; // end of file

            // Pad last partial frame with silence so VAD sees a full 512-sample frame
            if (read < buf.Length)
                Array.Clear(buf, read, buf.Length - read);

            vad.Feed(buf[..read]);
        }

        if (!ct.IsCancellationRequested)
            vad.Flush();
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Stop();
    }
}
