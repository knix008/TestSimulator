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
    private Action<byte[], int>? _recordSink;
    private readonly object _sinkLock = new();
    private volatile bool _acceptSamples = true;
    private long _bytesWritten;
    private int _inputBytesPerSecond;
    private bool _isRecording;
    private bool _disposed;
    private float _inputGain = 1f;
    private long _lastLevelTick;

    public event Action<float>? LevelChanged;

    public long BytesWritten => _bytesWritten;

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

    public void StartMonitoring(string deviceId) => Start(deviceId, recordSink: null);

    public void StartRecording(string deviceId, Action<byte[], int> recordSink)
    {
        ArgumentNullException.ThrowIfNull(recordSink);
        _bytesWritten = 0;
        _acceptSamples = true;
        Start(deviceId, recordSink);
    }

    public void StopAcceptingSamples() => _acceptSamples = false;

    void Start(string deviceId, Action<byte[], int>? recordSink)
    {
        Stop();
        if (string.IsNullOrWhiteSpace(deviceId))
            throw new ArgumentException("마이크 장치가 선택되지 않았습니다.", nameof(deviceId));

        _isRecording = recordSink is not null;

        using var enumerator = new MMDeviceEnumerator();
        var device = enumerator.GetDevice(deviceId);
        _capture = new WasapiCapture(device);

        _inputBytesPerSecond = Math.Max(_capture.WaveFormat.AverageBytesPerSecond, 1);
        int bytesPerSec = _inputBytesPerSecond;

        _captureBuffer = new BufferedWaveProvider(_capture.WaveFormat)
        {
            DiscardOnBufferOverflow = !_isRecording,
            BufferLength          = bytesPerSec * (_isRecording ? 10 : 4),
        };

        ISampleProvider samples = _captureBuffer.ToSampleProvider();
        if (samples.WaveFormat.Channels == 1)
            samples = new MonoToStereoSampleProvider(samples);
        if (samples.WaveFormat.SampleRate != SampleRate)
            samples = new WdlResamplingSampleProvider(samples, SampleRate);

        _pcmProvider = new SampleToWaveProvider16(samples);
        _recordSink  = recordSink;

        _capture.DataAvailable += OnDataAvailable;
        _capture.RecordingStopped += (_, _) => { };
        _capture.StartRecording();
    }

    void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        if (e.BytesRecorded <= 0 || _captureBuffer is null || _pcmProvider is null) return;

        _captureBuffer.AddSamples(e.Buffer, 0, e.BytesRecorded);

        int targetBytes = (int)Math.Ceiling(
            e.BytesRecorded * (double)BytesPerSecond / _inputBytesPerSecond);
        targetBytes = AlignDown(Math.Max(targetBytes, BytesPerSampleFrame));

        int maxDrainBytes = _isRecording
            ? Math.Min(Math.Max(targetBytes * 3, BytesPerSecond / 20), BytesPerSecond / 2)
            : Math.Min(Math.Max(targetBytes * 4, BytesPerSecond / 25), BytesPerSecond / 4);
        maxDrainBytes = AlignDown(maxDrainBytes);

        int chunkBytes = AlignDown(Math.Max(BytesPerSampleFrame * 32, BytesPerSecond / 50));
        var chunk = new byte[chunkBytes];

        int drained = 0;
        for (int i = 0; i < 128 && drained < maxDrainBytes; i++)
        {
            int want = Math.Min(chunk.Length, maxDrainBytes - drained);
            if (want < BytesPerSampleFrame) break;

            int read = _pcmProvider.Read(chunk, 0, want);
            if (read <= 0) break;

            read = AlignDown(read);
            if (read <= 0) break;

            drained += read;

            float peak = Math.Min(1f, ComputePeak(chunk, read) * _inputGain);
            RaiseLevelChanged(peak);

            if (_isRecording && _acceptSamples && _recordSink is not null)
                WriteToSink(chunk, read);
        }
    }

    void FlushRemainingToSink()
    {
        if (!_isRecording || _pcmProvider is null || _recordSink is null) return;

        var chunk = new byte[8192];
        for (int i = 0; i < 512; i++)
        {
            int read = _pcmProvider.Read(chunk, 0, chunk.Length);
            if (read <= 0) break;

            read = AlignDown(read);
            if (read > 0)
                WriteToSink(chunk, read, honorAcceptFlag: false);
        }
    }

    void WriteToSink(byte[] chunk, int count, bool honorAcceptFlag = true)
    {
        if (count <= 0) return;

        var pcm = new byte[count];
        Buffer.BlockCopy(chunk, 0, pcm, 0, count);
        if (Math.Abs(_inputGain - 1f) > 0.001f)
            ApplyGainInPlace(pcm, count, _inputGain);

        lock (_sinkLock)
        {
            if (honorAcceptFlag && (!_acceptSamples || _recordSink is null)) return;
            if (_recordSink is null) return;
            _recordSink.Invoke(pcm, count);
            _bytesWritten += count;
        }
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
        _acceptSamples = false;
        try { FlushRemainingToSink(); } catch { }

        _recordSink = null;

        if (_capture is null) return;
        try { _capture.StopRecording(); } catch { }
        _capture.DataAvailable -= OnDataAvailable;
        _capture.Dispose();
        _capture = null;
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
