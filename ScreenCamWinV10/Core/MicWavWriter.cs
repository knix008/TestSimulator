using NAudio.Wave;

namespace ScreenCamWin.Core;

/// <summary>Writes microphone PCM to a WAV file on a dedicated thread.</summary>
internal sealed class MicWavWriter : IDisposable
{
    private readonly WaveFileWriter _writer;
    private readonly object _lock = new();

    public MicWavWriter(string path)
    {
        string? dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);

        var format = new WaveFormat(
            MicrophoneCapture.SampleRate,
            MicrophoneCapture.BitsPerSample,
            MicrophoneCapture.Channels);
        _writer = new WaveFileWriter(path, format);
    }

    public void Write(byte[] buffer, int count)
    {
        lock (_lock)
            _writer.Write(buffer, 0, count);
    }

    public void Dispose()
    {
        lock (_lock)
        {
            _writer.Flush();
            _writer.Dispose();
        }
    }
}
