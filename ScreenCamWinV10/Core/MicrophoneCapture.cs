using NAudio.CoreAudioApi;
using NAudio.Wave;
using NAudio.Wave.SampleProviders;
using ScreenCamWin.Models;

namespace ScreenCamWin.Core;

public sealed class MicrophoneCapture : IDisposable
{
    public const int SampleRate    = 44100;
    public const int Channels      = 2;
    public const int BitsPerSample = 16;

    private static readonly int BytesPerSampleFrame = Channels * (BitsPerSample / 8);
    private static readonly int BytesPerSecond = SampleRate * BytesPerSampleFrame;

    private WasapiCapture? _capture;
    private BufferedWaveProvider? _captureBuffer;
    private IWaveProvider? _pcmProvider;
    private readonly object _providerLock = new();
    private bool _isRecording;
    private bool _disposed;
    private float _inputGain = 1f;
    private long _lastLevelTick;
    private int _inputBytesPerSecond;

    public event Action<float>? LevelChanged;

    public float InputGain
    {
        get => _inputGain;
        set => _inputGain = Math.Clamp(value, 0f, 2f);
    }

    public static IReadOnlyList<AudioDeviceInfo> EnumerateDevices()
    {
        var list = new List<AudioDeviceInfo>();
        using var enumerator = new MMDeviceEnumerator();
        foreach (var device in enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active))
            list.Add(new AudioDeviceInfo(device.ID, device.FriendlyName));
        return list;
    }

    // Monitoring: drains buffer in callback for level metering
    public void StartMonitoring(string deviceId) => Start(deviceId, recording: false);

    // Recording: OnDataAvailable only fills buffer; video thread calls PullPcm() per frame
    public void StartRecording(string deviceId) => Start(deviceId, recording: true);

    void Start(string deviceId, bool recording)
    {
        Stop();
        if (string.IsNullOrWhiteSpace(deviceId))
            throw new ArgumentException("마이크 장치가 선택되지 않았습니다.", nameof(deviceId));

        _isRecording = recording;

        using var enumerator = new MMDeviceEnumerator();
        var device = enumerator.GetDevice(deviceId);
        _capture = new WasapiCapture(device);

        _inputBytesPerSecond = Math.Max(_capture.WaveFormat.AverageBytesPerSecond, 1);

        _captureBuffer = new BufferedWaveProvider(_capture.WaveFormat)
        {
            DiscardOnBufferOverflow = true,
            BufferLength = _inputBytesPerSecond * 10,
        };

        ISampleProvider samples = _captureBuffer.ToSampleProvider();
        if (samples.WaveFormat.Channels == 1)
            samples = new MonoToStereoSampleProvider(samples);
        if (samples.WaveFormat.SampleRate != SampleRate)
            samples = new WdlResamplingSampleProvider(samples, SampleRate);

        _pcmProvider = new SampleToWaveProvider16(samples);

        _capture.DataAvailable += OnDataAvailable;
        _capture.RecordingStopped += (_, _) => { };
        _capture.StartRecording();
    }

    void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        if (e.BytesRecorded <= 0 || _captureBuffer is null) return;

        _captureBuffer.AddSamples(e.Buffer, 0, e.BytesRecorded);

        if (!_isRecording && _pcmProvider is not null)
            DrainForMonitoring();
    }

    // Monitoring only: drain buffer and fire level events
    void DrainForMonitoring()
    {
        int targetBytes = (int)Math.Ceiling(
            BytesPerSecond * (double)_captureBuffer!.BufferedBytes / _inputBytesPerSecond);
        targetBytes = AlignDown(Math.Max(targetBytes, BytesPerSampleFrame));

        int maxDrain = AlignDown(Math.Min(Math.Max(targetBytes * 4, BytesPerSecond / 25), BytesPerSecond / 4));
        int chunkBytes = AlignDown(Math.Max(BytesPerSampleFrame * 32, BytesPerSecond / 50));
        var chunk = new byte[chunkBytes];

        int drained = 0;
        for (int i = 0; i < 64 && drained < maxDrain; i++)
        {
            int want = Math.Min(chunk.Length, maxDrain - drained);
            if (want < BytesPerSampleFrame) break;
            int read = _pcmProvider!.Read(chunk, 0, want);
            read = AlignDown(read);
            if (read <= 0) break;
            drained += read;

            float peak = Math.Min(1f, ComputePeak(chunk, read) * _inputGain);
            RaiseLevelChanged(peak);
        }
    }

    // Called by the video capture thread once per frame in recording mode.
    // Fills buffer[0..byteCount) with PCM; pads with silence if not enough data.
    public int PullPcm(byte[] buffer, int byteCount)
    {
        if (_pcmProvider is null) return 0;
        byteCount = AlignDown(Math.Min(byteCount, buffer.Length));
        if (byteCount <= 0) return 0;

        int totalRead = 0;
        for (int attempt = 0; attempt < 16 && totalRead < byteCount; attempt++)
        {
            int read = _pcmProvider.Read(buffer, totalRead, byteCount - totalRead);
            read = AlignDown(read);
            if (read <= 0) break;
            totalRead += read;
        }

        if (totalRead > 0)
        {
            if (Math.Abs(_inputGain - 1f) > 0.001f)
                ApplyGainInPlace(buffer, totalRead, _inputGain);

            float peak = Math.Min(1f, ComputePeak(buffer, totalRead) * _inputGain);
            RaiseLevelChanged(peak);
        }

        return totalRead;
    }

    static int AlignDown(int bytes)
    {
        if (bytes <= 0) return 0;
        return bytes - (bytes % BytesPerSampleFrame);
    }

    void RaiseLevelChanged(float peak)
    {
        long now = Environment.TickCount64;
        if (now - _lastLevelTick < 33) return;
        _lastLevelTick = now;
        LevelChanged?.Invoke(peak);
    }

    public void Stop()
    {
        if (_capture is null) return;
        try { _capture.StopRecording(); } catch { }
        _capture.DataAvailable -= OnDataAvailable;
        _capture.Dispose();
        _capture      = null;
        _captureBuffer = null;
        _pcmProvider   = null;
        _isRecording   = false;
    }

    static void ApplyGainInPlace(byte[] buffer, int count, float gain)
    {
        for (int i = 0; i + 1 < count; i += 2)
        {
            short s = BitConverter.ToInt16(buffer, i);
            int scaled = (int)Math.Clamp(s * gain, short.MinValue, short.MaxValue);
            BitConverter.TryWriteBytes(buffer.AsSpan(i, 2), (short)scaled);
        }
    }

    public static float ComputePeak(byte[] buffer, int count)
    {
        float max = 0f;
        for (int i = 0; i + 1 < count; i += 2)
        {
            short sample = BitConverter.ToInt16(buffer, i);
            float n = Math.Abs(sample / 32768f);
            if (n > max) max = n;
        }
        return max;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Stop();
    }
}
