using NAudio.Wave;
using NAudio.Lame;

namespace MIDIMasterWinV10.Core;

/// <summary>
/// Exports MIDI to WAV/MP3 via SoundFont synthesis (same GM bank as realistic instrument playback).
/// </summary>
public class AudioExporter
{
    private const int SampleRate = 44100;
    private const int Channels = 2;
    private const int BitsPerSample = 16;

    private readonly SoundFontRenderer _renderer = new();

    /// <summary>GM program number 0–127 from the instrument combo box.</summary>
    public int SelectedInstrument
    {
        get => _renderer.SelectedInstrument;
        set => _renderer.SelectedInstrument = value;
    }

    public event Action<int>? ProgressChanged;

    public async Task ExportWavAsync(MidiFileInfo fileInfo, string outputPath)
    {
        await Task.Run(() =>
        {
            var samples = RenderMidi(fileInfo);
            WriteWav(samples, outputPath);
        });
    }

    public async Task ExportMp3Async(MidiFileInfo fileInfo, string outputPath)
    {
        await Task.Run(() =>
        {
            var samples = RenderMidi(fileInfo);
            WriteMp3(samples, outputPath);
        });
    }

    private float[] RenderMidi(MidiFileInfo fileInfo)
    {
        if (string.IsNullOrEmpty(fileInfo.FilePath) || !File.Exists(fileInfo.FilePath))
            throw new FileNotFoundException("MIDI 파일을 찾을 수 없습니다.", fileInfo.FilePath);

        void OnProgress(int p) => ProgressChanged?.Invoke(p);
        _renderer.ProgressChanged += OnProgress;
        try
        {
            return _renderer.RenderFile(fileInfo.FilePath);
        }
        finally
        {
            _renderer.ProgressChanged -= OnProgress;
        }
    }

    private void WriteWav(float[] samples, string path)
    {
        var format = new WaveFormat(SampleRate, BitsPerSample, Channels);
        using var writer = new WaveFileWriter(path, format);
        // WriteSamples expects float in [-1, 1] (stereo interleaved L,R,L,R,…).
        writer.WriteSamples(samples, 0, samples.Length);
    }

    private void WriteMp3(float[] samples, string path)
    {
        var pcmFormat = new WaveFormat(SampleRate, BitsPerSample, Channels);
        byte[] pcmBytes = ToPcm16Bytes(samples);

        using var ms = new MemoryStream(pcmBytes);
        using var pcmReader = new RawSourceWaveStream(ms, pcmFormat);
        using var mp3Writer = new LameMP3FileWriter(path, pcmFormat, LAMEPreset.STANDARD);
        pcmReader.CopyTo(mp3Writer);
    }

    private static byte[] ToPcm16Bytes(float[] samples)
    {
        var pcmBytes = new byte[samples.Length * 2];
        for (int i = 0; i < samples.Length; i++)
        {
            short s = (short)Math.Round(Math.Clamp(samples[i], -1f, 1f) * 32767f);
            pcmBytes[i * 2] = (byte)(s & 0xFF);
            pcmBytes[i * 2 + 1] = (byte)((s >> 8) & 0xFF);
        }
        return pcmBytes;
    }
}
