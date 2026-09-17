using System.IO;

namespace MyClockWinV10.Services;

/// <summary>Generates phone-style looping PCM WAV alarm tones.</summary>
internal static class WavToneGenerator
{
    private const int Rate = 44100;

    private static readonly string CacheDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "MyClock", "Sounds", "v2");

    public static string GetSoundPath(string soundId)
    {
        Directory.CreateDirectory(CacheDir);
        string path = Path.Combine(CacheDir, $"{soundId}.wav");
        if (!File.Exists(path))
            File.WriteAllBytes(path, BuildWav(CreatePattern(soundId)));
        return path;
    }

    private static float[] CreatePattern(string soundId) => soundId switch
    {
        "Marimba"  => PatternMarimba(),
        "Radar"    => PatternRadar(),
        "Beacon"   => PatternBeacon(),
        "Circuit"  => PatternCircuit(),
        "Crystals" => PatternCrystals(),
        "Hillside" => PatternMelody([64, 67, 71, 72, 71, 67], 0.22, 0.42, PluckVoice),
        "Sencha"   => PatternMelody([60, 64, 67, 64], 0.35, 0.38, SoftPluckVoice),
        "Silk"     => PatternMelody([67, 69, 71, 74, 71, 69], 0.28, 0.32, SoftBellVoice),
        "SlowRise" => PatternSlowRise(),
        "Stargaze" => PatternArpeggio([60, 64, 67, 72, 76], 0.18, 0.34, SoftBellVoice),
        "Summit"   => PatternMelody([60, 64, 67, 71, 74, 71, 67], 0.2, 0.45, PluckVoice),
        "Dawn"     => PatternMelody([67, 69, 71, 74, 76, 74, 71], 0.25, 0.36, SoftPluckVoice),
        "Galaxy"   => PatternArpeggio([48, 55, 60, 64, 67, 72], 0.16, 0.3, BellVoice),
        "Orbit"    => PatternOrbit(),
        "Ripple"   => PatternRipple(),
        "Chime"    => PatternChime(),
        "Bell"     => PatternBell(),
        "Digital"  => PatternDigital(),
        "Piano"    => PatternMelody([72, 76, 79, 84], 0.24, 0.5, PianoVoice),
        "Harp"     => PatternArpeggio([60, 64, 67, 71, 74, 78], 0.12, 0.28, HarpVoice),
        "Fanfare"  => PatternMelody([60, 64, 67, 72, 76, 72], 0.16, 0.48, BrassVoice),
        "Ladder"   => PatternLadder(),
        "Echo"     => PatternEcho(),
        "Wave"     => PatternWave(),
        "Gentle"   => PatternMelody([64, 67, 71], 0.45, 0.35, SoftBellVoice),
        "Pulse"    => PatternPulse(),
        "Bird"     => PatternBird(),
        "Clock"    => PatternClock(),
        "Breeze"   => PatternBreeze(),
        "Siren"    => PatternSiren(),
        "Urgent"   => PatternUrgent(),
        "Classic"  => PatternMelody([72, 76, 79, 84], 0.32, 0.44, BellVoice),
        _          => PatternMarimba(),
    };

    // ── Phone-style patterns ───────────────────────────────────────────────

    private static float[] PatternMarimba()
        => PatternMelody([76, 79, 84, 79, 76, 72, 76], 0.14, 0.52, PluckVoice);

    private static float[] PatternRadar()
    {
        const double dur = 2.4;
        int n = (int)(Rate * dur);
        var s = new float[n];
        for (int i = 0; i < n; i++)
        {
            double t = (double)i / Rate;
            double sweep = 0.5 + 0.5 * Math.Sin(2 * Math.PI * t / 0.55);
            double hz = 520 + sweep * 680;
            double env = FadeInOut(i, n, Rate * 0.02, Rate * 0.04);
            s[i] = (float)(Math.Sin(Phase(hz, t)) * 0.42 * env);
        }
        return s;
    }

    private static float[] PatternBeacon()
    {
        var a = Tone(880, 0.22, 0.5, SquareVoice);
        var gap = Silence(0.08);
        var b = Tone(660, 0.22, 0.45, SquareVoice);
        return Concat(RepeatPattern(Concat(a, gap, b, gap), 4));
    }

    private static float[] PatternCircuit()
    {
        var s = new float[(int)(Rate * 2.2)];
        double[] hz = [440, 554, 659, 880];
        int pos = 0;
        for (int r = 0; r < 3; r++)
        {
            foreach (double f in hz)
            {
                var blip = Tone(f, 0.07, 0.38, SquareVoice);
                AddAt(s, blip, pos);
                pos += (int)(Rate * 0.11);
            }
            pos += (int)(Rate * 0.06);
        }
        return s;
    }

    private static float[] PatternCrystals()
        => PatternArpeggio([84, 88, 91, 95, 91, 88], 0.1, 0.32, BellVoice);

    private static float[] PatternSlowRise()
    {
        int[] notes = [60, 62, 64, 65, 67, 69, 71, 72];
        var parts = new List<float[]>();
        foreach (int note in notes)
            parts.Add(SoftBellVoice(Midi(note), 0.38, 0.34));
        return Concat(parts.ToArray());
    }

    private static float[] PatternOrbit()
    {
        var s = new float[(int)(Rate * 2.5)];
        int[] seq = [67, 71, 74, 77, 74, 71];
        int pos = 0;
        for (int lap = 0; lap < 2; lap++)
        {
            foreach (int n in seq)
            {
                var tone = SoftPluckVoice(Midi(n), 0.2, 0.36);
                AddAt(s, tone, pos);
                pos += (int)(Rate * 0.19);
            }
        }
        return s;
    }

    private static float[] PatternRipple()
    {
        var s = new float[(int)(Rate * 2.4)];
        for (int i = 0; i < 6; i++)
        {
            double hz = 520 + i * 55;
            var drop = PluckVoice(hz, 0.28, 0.4 - i * 0.03);
            AddAt(s, drop, i * (int)(Rate * 0.22));
        }
        return s;
    }

    private static float[] PatternChime()
    {
        var a = BellVoice(Midi(72), 0.55, 0.45);
        var b = Offset(BellVoice(Midi(76), 0.65, 0.42), (int)(Rate * 0.32));
        return Concat(a, b, Silence(0.35));
    }

    private static float[] PatternBell()
    {
        var s = new float[(int)(Rate * 1.8)];
        AddAt(s, BellVoice(880, 1.0, 0.38), 0);
        AddAt(s, BellVoice(1320, 0.85, 0.18), 0);
        for (int i = 0; i < s.Length; i++)
            s[i] *= (float)Math.Exp(-2.2 * i / s.Length);
        return Concat(s, Silence(0.4));
    }

    private static float[] PatternDigital()
    {
        var beep = SquareVoice(988, 0.09, 0.42);
        var rest = Silence(0.07);
        return RepeatPattern(Concat(beep, rest, beep, rest, beep, Silence(0.28)), 2);
    }

    private static float[] PatternLadder()
    {
        int[] notes = [60, 64, 67, 71, 74, 77, 81];
        var parts = new List<float[]>();
        foreach (int n in notes)
            parts.Add(PluckVoice(Midi(n), 0.16, 0.44));
        return Concat(parts.ToArray());
    }

    private static float[] PatternEcho()
    {
        var core = PluckVoice(Midi(76), 0.35, 0.5);
        var s = new float[(int)(Rate * 2.2)];
        AddAt(s, core, 0);
        AddAt(s, Scale(core, 0.55), (int)(Rate * 0.38));
        AddAt(s, Scale(core, 0.32), (int)(Rate * 0.76));
        return s;
    }

    private static float[] PatternWave()
    {
        const double dur = 2.5;
        int n = (int)(Rate * dur);
        var s = new float[n];
        for (int i = 0; i < n; i++)
        {
            double t = (double)i / Rate;
            double lfo = Math.Sin(2 * Math.PI * 2.2 * t);
            double hz = 420 + lfo * 120;
            s[i] = (float)(Math.Sin(Phase(hz, t)) * 0.32 * FadeInOut(i, n, Rate * 0.05, Rate * 0.1));
        }
        return s;
    }

    private static float[] PatternPulse()
    {
        var s = new float[(int)(Rate * 2.0)];
        for (int p = 0; p < 6; p++)
        {
            var tone = SineVoice(740, 0.09, 0.48);
            AddAt(s, tone, p * (int)(Rate * 0.16));
        }
        return s;
    }

    private static float[] PatternBird()
    {
        var s = new float[(int)(Rate * 1.6)];
        double[] hz = [2000, 2350, 1800, 2500, 2100];
        int pos = 0;
        foreach (double f in hz)
        {
            var chirp = SineVoice(f, 0.1, 0.35);
            AddAt(s, chirp, pos);
            pos += (int)(Rate * 0.13);
        }
        return Concat(s, Silence(0.5));
    }

    private static float[] PatternClock()
    {
        var tick = SquareVoice(1200, 0.04, 0.25);
        var tock = SquareVoice(800, 0.04, 0.22);
        var pair = Concat(tick, Silence(0.04), tock, Silence(0.36));
        return RepeatPattern(pair, 3);
    }

    private static float[] PatternBreeze()
    {
        var s = new float[(int)(Rate * 2.3)];
        var rng = new Random(42);
        int pos = 0;
        while (pos < s.Length - Rate * 0.2)
        {
            double hz = 600 + rng.NextDouble() * 500;
            var tone = SoftBellVoice(hz, 0.14 + rng.NextDouble() * 0.08, 0.28);
            AddAt(s, tone, pos);
            pos += (int)(Rate * (0.14 + rng.NextDouble() * 0.12));
        }
        return s;
    }

    private static float[] PatternSiren()
    {
        const double dur = 2.2;
        int n = (int)(Rate * dur);
        var s = new float[n];
        for (int i = 0; i < n; i++)
        {
            double t = (double)i / Rate;
            double hz = 480 + 280 * Math.Sin(2 * Math.PI * t / 0.45);
            s[i] = (float)(Math.Sin(Phase(hz, t)) * 0.36);
        }
        return s;
    }

    private static float[] PatternUrgent()
    {
        var beep = SquareVoice(784, 0.12, 0.5);
        var rest = Silence(0.06);
        return RepeatPattern(Concat(beep, rest), 8);
    }

    // ── Pattern builders ────────────────────────────────────────────────────

    private static float[] PatternMelody(int[] midiNotes, double noteSec, double amp,
        Func<double, double, double, float[]> voice)
    {
        var buffers = new float[midiNotes.Length][];
        for (int i = 0; i < midiNotes.Length; i++)
            buffers[i] = voice(Midi(midiNotes[i]), noteSec, amp);
        return Concat(buffers);
    }

    private static float[] PatternArpeggio(int[] midiNotes, double noteSec, double amp,
        Func<double, double, double, float[]> voice)
        => PatternMelody(midiNotes, noteSec, amp, voice);

    // ── Voices ────────────────────────────────────────────────────────────

    private static float[] PluckVoice(double hz, double dur, double amp)
    {
        int n = (int)(Rate * dur);
        var s = new float[n];
        for (int i = 0; i < n; i++)
        {
            double t = (double)i / Rate;
            double env = Math.Exp(-7.0 * t / dur);
            s[i] = (float)(env * amp * (
                Math.Sin(Phase(hz, t)) * 0.75 +
                Math.Sin(Phase(hz * 2.01, t)) * 0.2 +
                Math.Sin(Phase(hz * 3.98, t)) * 0.08));
        }
        return s;
    }

    private static float[] SoftPluckVoice(double hz, double dur, double amp)
        => Scale(PluckVoice(hz, dur * 1.1, amp), 0.85);

    private static float[] SoftBellVoice(double hz, double dur, double amp)
    {
        int n = (int)(Rate * dur);
        var s = new float[n];
        for (int i = 0; i < n; i++)
        {
            double t = (double)i / Rate;
            double env = Math.Exp(-3.5 * t / dur);
            s[i] = (float)(env * amp * (
                Math.Sin(Phase(hz, t)) * 0.6 +
                Math.Sin(Phase(hz * 2.4, t)) * 0.25 +
                Math.Sin(Phase(hz * 5.2, t)) * 0.1));
        }
        return s;
    }

    private static float[] BellVoice(double hz, double dur, double amp)
        => SoftBellVoice(hz, dur, amp * 1.1);

    private static float[] PianoVoice(double hz, double dur, double amp)
    {
        int n = (int)(Rate * dur);
        var s = new float[n];
        for (int i = 0; i < n; i++)
        {
            double t = (double)i / Rate;
            double env = Math.Exp(-4.0 * t / dur) * (1 - Math.Exp(-30 * t));
            s[i] = (float)(env * amp * Math.Sin(Phase(hz, t)));
        }
        return s;
    }

    private static float[] HarpVoice(double hz, double dur, double amp)
        => PluckVoice(hz, dur * 0.9, amp * 0.9);

    private static float[] BrassVoice(double hz, double dur, double amp)
    {
        int n = (int)(Rate * dur);
        var s = new float[n];
        for (int i = 0; i < n; i++)
        {
            double t = (double)i / Rate;
            double env = FadeInOut(i, n, Rate * 0.01, Rate * 0.06);
            double wave = Math.Sin(Phase(hz, t)) * 0.7 + Math.Sin(Phase(hz * 2, t)) * 0.25;
            s[i] = (float)(wave * amp * env);
        }
        return s;
    }

    private static float[] SineVoice(double hz, double dur, double amp)
    {
        int n = (int)(Rate * dur);
        var s = new float[n];
        for (int i = 0; i < n; i++)
        {
            double t = (double)i / Rate;
            double env = FadeInOut(i, n, Rate * 0.005, Rate * 0.02);
            s[i] = (float)(Math.Sin(Phase(hz, t)) * amp * env);
        }
        return s;
    }

    private static float[] SquareVoice(double hz, double dur, double amp)
    {
        int n = (int)(Rate * dur);
        var s = new float[n];
        for (int i = 0; i < n; i++)
        {
            double t = (double)i / Rate;
            double wave = Math.Sin(Phase(hz, t)) >= 0 ? 1.0 : -1.0;
            s[i] = (float)(wave * amp * 0.35);
        }
        return s;
    }

    private static float[] Tone(double hz, double dur, double amp,
        Func<double, double, double, float[]> voice) => voice(hz, dur, amp);

    // ── Utilities ───────────────────────────────────────────────────────────

    private static double Midi(int note) => 440 * Math.Pow(2, (note - 69) / 12.0);

    private static double Phase(double hz, double t) => 2 * Math.PI * hz * t;

    private static double FadeInOut(int i, int n, double attack, double release)
    {
        double fadeIn  = Math.Min(1, i / Math.Max(1, attack));
        double fadeOut = Math.Min(1, (n - i) / Math.Max(1, release));
        return fadeIn * fadeOut;
    }

    private static float[] Silence(double seconds)
        => new float[(int)(Rate * seconds)];

    private static float[] Offset(float[] src, int offsetSamples)
    {
        var r = new float[src.Length + offsetSamples];
        Array.Copy(src, 0, r, offsetSamples, src.Length);
        return r;
    }

    private static float[] Scale(float[] src, double factor)
    {
        var r = new float[src.Length];
        for (int i = 0; i < src.Length; i++)
            r[i] = (float)(src[i] * factor);
        return r;
    }

    private static float[] Concat(params float[][] parts)
    {
        int len = parts.Sum(p => p.Length);
        var r = new float[len];
        int o = 0;
        foreach (var p in parts)
        {
            Array.Copy(p, 0, r, o, p.Length);
            o += p.Length;
        }
        return Normalize(r, 0.92f);
    }

    private static float[] RepeatPattern(float[] pattern, int times)
    {
        var parts = new float[times][];
        for (int i = 0; i < times; i++)
            parts[i] = pattern;
        return Concat(parts);
    }

    private static void AddAt(float[] dest, float[] src, int offset)
    {
        for (int i = 0; i < src.Length && offset + i < dest.Length; i++)
            dest[offset + i] += src[i];
    }

    private static float[] Normalize(float[] samples, float peak)
    {
        float max = samples.Max(Math.Abs);
        if (max < 1e-6f) return samples;
        float g = peak / max;
        for (int i = 0; i < samples.Length; i++)
            samples[i] *= g;
        return samples;
    }

    private static byte[] BuildWav(float[] samples)
    {
        const short channels = 1;
        const short bits = 16;
        int byteRate = Rate * channels * bits / 8;
        short blockAlign = (short)(channels * bits / 8);
        int dataBytes = samples.Length * 2;
        var wav = new byte[44 + dataBytes];

        void W(int o, string t) => Array.Copy(System.Text.Encoding.ASCII.GetBytes(t), 0, wav, o, t.Length);
        void I32(int o, int v) { wav[o] = (byte)v; wav[o + 1] = (byte)(v >> 8); wav[o + 2] = (byte)(v >> 16); wav[o + 3] = (byte)(v >> 24); }
        void I16(int o, short v) { wav[o] = (byte)v; wav[o + 1] = (byte)(v >> 8); }

        W(0, "RIFF");
        I32(4, 36 + dataBytes);
        W(8, "WAVE");
        W(12, "fmt ");
        I32(16, 16);
        I16(20, 1);
        I16(22, channels);
        I32(24, Rate);
        I32(28, byteRate);
        I16(32, blockAlign);
        I16(34, bits);
        W(36, "data");
        I32(40, dataBytes);

        for (int i = 0; i < samples.Length; i++)
        {
            short v = (short)Math.Clamp(samples[i] * 32767, -32768, 32767);
            int o = 44 + i * 2;
            wav[o] = (byte)v;
            wav[o + 1] = (byte)(v >> 8);
        }
        return wav;
    }
}
