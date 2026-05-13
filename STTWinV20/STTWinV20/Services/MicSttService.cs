using NAudio.Wave;

namespace STTWinV20.Services;

// Microphone capture + VAD + Whisper STT pipeline.
// Mirrors STTGTKV10 mic mode: VAD thresh 0.015, min_speech 8 frames, silence 700ms, normalize 8x.
public sealed class MicSttService : IDisposable
{
    private readonly SttProcessor _stt;
    private WaveInEvent? _waveIn;
    private VadProcessor? _vad;
    private CancellationTokenSource? _cts;
    private int _deviceNumber;
    private float _volumeGain = 1f;
    private bool _disposed;

    public bool IsRunning { get; private set; }

    public event EventHandler<string>? TranscriptionReceived;
    public event EventHandler<float>? AudioLevelChanged;
    public event EventHandler<string>? StatusChanged;
    public event EventHandler<string>? ErrorOccurred;

    public MicSttService(SttProcessor stt)
    {
        _stt = stt;
        _stt.TranscriptionReceived += (_, text) => TranscriptionReceived?.Invoke(this, text);
        _stt.ErrorOccurred += (_, err) => ErrorOccurred?.Invoke(this, err);
    }

    public static List<AudioDevice> GetDevices()
    {
        var list = new List<AudioDevice>();
        for (int i = 0; i < WaveInEvent.DeviceCount; i++)
        {
            var cap = WaveInEvent.GetCapabilities(i);
            list.Add(new AudioDevice { DeviceNumber = i, DeviceName = cap.ProductName });
        }
        return list;
    }

    public void SetDevice(int deviceNumber) => _deviceNumber = deviceNumber;

    public void SetVolume(float gain) => _volumeGain = Math.Clamp(gain, 0f, 2f);

    public void Start()
    {
        if (IsRunning) return;

        OutputFilter.Reset();
        _cts = new CancellationTokenSource();
        _vad = new VadProcessor(VadMode.Mic);
        _vad.SegmentReady += OnSegmentReady;

        _waveIn = new WaveInEvent
        {
            DeviceNumber = _deviceNumber,
            WaveFormat = new WaveFormat(16000, 16, 1),
            BufferMilliseconds = 30,
        };
        _waveIn.DataAvailable += OnData;
        _waveIn.RecordingStopped += OnStopped;
        _waveIn.StartRecording();

        IsRunning = true;
        StatusChanged?.Invoke(this, "마이크 STT 실행 중...");
    }

    public void Stop()
    {
        if (!IsRunning) return;

        IsRunning = false;
        _cts?.Cancel();
        _waveIn?.StopRecording();
        StatusChanged?.Invoke(this, "중지됨");
    }

    private void OnData(object? sender, WaveInEventArgs e)
    {
        int samples = e.BytesRecorded / 2;
        var floats = new float[samples];
        for (int i = 0; i < samples; i++)
        {
            short s = BitConverter.ToInt16(e.Buffer, i * 2);
            floats[i] = Math.Clamp(s / 32768f * _volumeGain, -1f, 1f);
        }

        // Compute RMS for the UI level meter
        float rms = 0f;
        foreach (var f in floats) rms += f * f;
        rms = MathF.Sqrt(rms / floats.Length);
        AudioLevelChanged?.Invoke(this, Math.Clamp(rms * 4f, 0f, 1f));

        _vad?.Feed(floats);
    }

    private void OnStopped(object? sender, StoppedEventArgs e)
    {
        _vad?.Flush();
        if (e.Exception != null)
            ErrorOccurred?.Invoke(this, $"녹음 오류: {e.Exception.Message}");
    }

    private async void OnSegmentReady(object? sender, float[] audio)
    {
        if (_cts == null || _cts.IsCancellationRequested) return;
        StatusChanged?.Invoke(this, $"처리 중... ({audio.Length / 16000f:F1}초)");
        await _stt.ProcessSegmentAsync(audio, isFileMode: false, _cts.Token);
        if (IsRunning) StatusChanged?.Invoke(this, "마이크 STT 실행 중...");
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Stop();
        _cts?.Dispose();
        if (_waveIn != null)
        {
            _waveIn.DataAvailable -= OnData;
            _waveIn.RecordingStopped -= OnStopped;
            _waveIn.Dispose();
            _waveIn = null;
        }
        if (_vad != null)
        {
            _vad.SegmentReady -= OnSegmentReady;
            _vad = null;
        }
    }
}
