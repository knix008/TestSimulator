using NAudio.Wave;
using NAudio.Lame;
using MIDIMasterWinV10.Models;

namespace MIDIMasterWinV10.Core;

/// <summary>
/// Exports MIDI note data to WAV/MP3 using simple sine-wave synthesis.
/// For realistic sound, install a SoundFont synthesizer and replace SynthesizeToWav.
/// </summary>
public class AudioExporter
{
    private const int SampleRate = 44100;
    private const int Channels = 2;
    private const int BitsPerSample = 16;

    public int SelectedInstrument { get; set; } = 0;

    public event Action<int>? ProgressChanged; // 0-100

    public async Task ExportWavAsync(MidiFileInfo fileInfo, string outputPath)
    {
        await Task.Run(() =>
        {
            var samples = SynthesizeToSamples(fileInfo);
            WriteWav(samples, outputPath);
        });
    }

    public async Task ExportMp3Async(MidiFileInfo fileInfo, string outputPath)
    {
        await Task.Run(() =>
        {
            var samples = SynthesizeToSamples(fileInfo);
            WriteMp3(samples, outputPath);
        });
    }

    private float[] SynthesizeToSamples(MidiFileInfo fileInfo)
    {
        double totalSeconds = fileInfo.TotalSeconds + 2.0; // extra tail
        int totalSamples = (int)(totalSeconds * SampleRate) * Channels;
        var buffer = new float[totalSamples];

        var notes = fileInfo.AllNotes.Where(n => n.Channel != 10).ToList(); // skip drums (MIDI ch 10)
        int noteCount = notes.Count;
        int processed = 0;

        foreach (var note in notes)
        {
            double freq = note.Frequency;
            double amp = (note.Velocity / 127.0) * 0.3; // prevent clipping
            double dur = Math.Min(note.DurationSeconds, note.DurationSeconds + 0.1);

            int startSample = (int)(note.StartTimeSeconds * SampleRate) * Channels;
            int numSamples = (int)(dur * SampleRate);

            // Envelope: quick attack, short decay, sustain, release
            double attack = Math.Min(0.01, dur * 0.1);
            double release = Math.Min(0.15, dur * 0.3);

            for (int i = 0; i < numSamples; i++)
            {
                double t = (double)i / SampleRate;
                double envelope = ComputeEnvelope(t, dur, attack, release);

                // Waveform based on instrument family
                double sample = GenerateWave(freq, t, SelectedInstrument) * amp * envelope;

                int idx = startSample + i * Channels;
                if (idx >= 0 && idx + 1 < buffer.Length)
                {
                    buffer[idx] = Clamp((float)(buffer[idx] + sample));
                    buffer[idx + 1] = Clamp((float)(buffer[idx + 1] + sample));
                }
            }

            processed++;
            ProgressChanged?.Invoke((int)(processed * 100.0 / noteCount));
        }

        return buffer;
    }

    private static double ComputeEnvelope(double t, double duration, double attack, double release)
    {
        if (t < attack) return t / attack;
        double releaseStart = duration - release;
        if (t > releaseStart) return Math.Max(0, (duration - t) / release);
        return 1.0;
    }

    private static double GenerateWave(double freq, double t, int instrument)
    {
        double phase = 2.0 * Math.PI * freq * t;

        // Instrument family (every 8 programs is a family)
        int family = instrument / 8;

        return family switch
        {
            0 => // Piano: sine + harmonics
                Math.Sin(phase) * 0.6 +
                Math.Sin(2 * phase) * 0.25 +
                Math.Sin(3 * phase) * 0.1 +
                Math.Sin(4 * phase) * 0.05,

            1 => // Chromatic perc: pure sine
                Math.Sin(phase),

            2 or 3 => // Organ: additive sine
                Math.Sin(phase) * 0.5 +
                Math.Sin(2 * phase) * 0.3 +
                Math.Sin(3 * phase) * 0.2,

            4 or 5 => // Guitar/Bass: sawtooth-like
                Math.Sin(phase) * 0.5 +
                Math.Sin(2 * phase) * 0.3 +
                Math.Sin(3 * phase) * 0.15 +
                Math.Sin(4 * phase) * 0.05,

            6 or 7 => // Strings: rich harmonics
                Math.Sin(phase) * 0.4 +
                Math.Sin(2 * phase) * 0.3 +
                Math.Sin(3 * phase) * 0.2 +
                Math.Sin(4 * phase) * 0.07 +
                Math.Sin(5 * phase) * 0.03,

            8 or 9 => // Brass: bright
                Math.Sin(phase) * 0.5 +
                Math.Sin(2 * phase) * 0.35 +
                Math.Sin(3 * phase) * 0.1 +
                Math.Sin(4 * phase) * 0.05,

            10 or 11 => // Wind/Reed: square-ish
                Math.Sin(phase) +
                Math.Sin(3 * phase) * 0.33 +
                Math.Sin(5 * phase) * 0.2 +
                Math.Sin(7 * phase) * 0.14,

            _ => Math.Sin(phase) // default: pure sine
        };
    }

    private void WriteWav(float[] samples, string path)
    {
        var format = WaveFormat.CreateIeeeFloatWaveFormat(SampleRate, Channels);
        using var writer = new WaveFileWriter(path, format);
        writer.WriteSamples(samples, 0, samples.Length);
    }

    private void WriteMp3(float[] samples, string path)
    {
        var pcmFormat = new WaveFormat(SampleRate, BitsPerSample, Channels);
        var mp3Format = new Mp3WaveFormat(SampleRate, Channels, 0, 320 * 1000 / 8);

        // Convert float samples to 16-bit PCM
        var pcmBytes = new byte[samples.Length * 2];
        for (int i = 0; i < samples.Length; i++)
        {
            short s = (short)(Clamp(samples[i]) * 32767f);
            pcmBytes[i * 2] = (byte)(s & 0xFF);
            pcmBytes[i * 2 + 1] = (byte)((s >> 8) & 0xFF);
        }

        using var ms = new MemoryStream(pcmBytes);
        using var pcmReader = new RawSourceWaveStream(ms, pcmFormat);
        using var mp3Writer = new LameMP3FileWriter(path, pcmFormat, LAMEPreset.STANDARD);
        pcmReader.CopyTo(mp3Writer);
    }

    private static float Clamp(float v) => Math.Max(-1f, Math.Min(1f, v));
}
