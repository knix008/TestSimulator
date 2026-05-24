using MeltySynth;

namespace MIDIMasterWinV10.Core;

/// <summary>
/// Renders a MIDI file to stereo PCM using a GM SoundFont (MeltySynth).
/// </summary>
internal sealed class SoundFontRenderer
{
    private const int SampleRate = 44100;
    private const int DrumChannel = 9; // MIDI channel 10 (0-based)

    public int SelectedInstrument { get; set; }

    public event Action<int>? ProgressChanged;

    public float[] RenderFile(string midiFilePath, string? soundFontPath = null)
    {
        soundFontPath ??= SoundFontPaths.RequireDefault();
        int program = Math.Clamp(SelectedInstrument, 0, 127);

        var synthesizer = new Synthesizer(soundFontPath, SampleRate);
        ApplySelectedInstrument(synthesizer, program);

        var midiFile = new MidiFile(midiFilePath);
        var sequencer = new MidiFileSequencer(synthesizer);

        sequencer.OnSendMessage = (syn, channel, command, data1, data2) =>
        {
            if (command == 0xC0 && channel != DrumChannel)
                data1 = program;
            syn.ProcessMidiMessage(channel, command, data1, data2);
        };

        sequencer.Play(midiFile, loop: false);

        double tailSeconds = 2.0;
        int sampleCount = (int)Math.Ceiling(SampleRate * (midiFile.Length.TotalSeconds + tailSeconds));
        if (sampleCount <= 0)
            throw new InvalidOperationException("보낼 음표가 없습니다.");

        var left = new float[sampleCount];
        var right = new float[sampleCount];

        const int blockFrames = 4096;
        int rendered = 0;
        ProgressChanged?.Invoke(0);

        while (rendered < sampleCount)
        {
            int frames = Math.Min(blockFrames, sampleCount - rendered);
            sequencer.Render(left.AsSpan(rendered, frames), right.AsSpan(rendered, frames));
            rendered += frames;
            ProgressChanged?.Invoke(Math.Min(99, (int)(100.0 * rendered / sampleCount)));
        }

        ProgressChanged?.Invoke(100);
        return Interleave(left, right);
    }

    private static void ApplySelectedInstrument(Synthesizer synthesizer, int program)
    {
        for (int ch = 0; ch < 16; ch++)
        {
            if (ch == DrumChannel) continue;
            synthesizer.ProcessMidiMessage(ch, 0xC0, program, 0);
        }
    }

    private static float[] Interleave(float[] left, float[] right)
    {
        var buffer = new float[left.Length * 2];
        for (int i = 0; i < left.Length; i++)
        {
            buffer[i * 2] = left[i];
            buffer[i * 2 + 1] = right[i];
        }
        Normalize(buffer);
        return buffer;
    }

    private static void Normalize(float[] buffer)
    {
        float peak = 0;
        foreach (float s in buffer)
            peak = Math.Max(peak, Math.Abs(s));

        if (peak < 1e-6f) return;

        float gain = 0.95f / peak;
        for (int i = 0; i < buffer.Length; i++)
            buffer[i] = Math.Clamp(buffer[i] * gain, -1f, 1f);
    }
}
