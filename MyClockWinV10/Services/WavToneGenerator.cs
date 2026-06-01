using System.IO;

namespace MyClockWinV10.Services;

/// <summary>Generates short PCM WAV files for built-in alarm sounds.</summary>
internal static class WavToneGenerator
{
    private static readonly string CacheDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
        "MyClock", "Sounds");

    public static string GetSoundPath(string soundId)
    {
        Directory.CreateDirectory(CacheDir);
        string path = Path.Combine(CacheDir, $"{soundId}.wav");
        if (!File.Exists(path))
            File.WriteAllBytes(path, CreateWav(soundId));
        return path;
    }

    private static byte[] CreateWav(string soundId) => soundId switch
    {
        "Chime"   => BuildWav(MakeChimeSamples()),
        "Bell"    => BuildWav(MakeBellSamples()),
        "Digital" => BuildWav(MakeSquareTone(880, 0.35, 0.55)),
        "Gentle"  => BuildWav(MakeSineTone(392, 0.8, 0.45)),
        "Urgent"  => BuildWav(MakeUrgentSamples()),
        "Bird"    => BuildWav(MakeBirdSamples()),
        "Pulse"   => BuildWav(MakePulseSamples()),
        _         => BuildWav(MakeSineTone(740, 0.45, 0.65)), // Classic
    };

    private static float[] MakeSineTone(double hz, double seconds, double amplitude)
    {
        const int rate = 44100;
        int n = (int)(rate * seconds);
        var s = new float[n];
        for (int i = 0; i < n; i++)
        {
            double t = (double)i / rate;
            double env = Math.Min(1, i / (rate * 0.02)) * Math.Min(1, (n - i) / (rate * 0.08));
            s[i] = (float)(Math.Sin(2 * Math.PI * hz * t) * amplitude * env);
        }
        return s;
    }

    private static float[] MakeSquareTone(double hz, double seconds, double amplitude)
    {
        const int rate = 44100;
        int n = (int)(rate * seconds);
        var s = new float[n];
        for (int i = 0; i < n; i++)
        {
            double t = (double)i / rate;
            double wave = Math.Sin(2 * Math.PI * hz * t) >= 0 ? 1 : -1;
            s[i] = (float)(wave * amplitude * 0.35);
        }
        return s;
    }

    private static float[] MakeChimeSamples()
    {
        var a = MakeSineTone(523.25, 0.35, 0.5);
        var b = MakeSineTone(659.25, 0.45, 0.5);
        return Concat(a, Offset(b, (int)(44100 * 0.28)));
    }

    private static float[] MakeBellSamples()
    {
        var mix = new float[(int)(44100 * 1.2)];
        AddInto(mix, MakeSineTone(880, 1.0, 0.35), 0);
        AddInto(mix, MakeSineTone(1320, 0.9, 0.2), 0);
        for (int i = 0; i < mix.Length; i++)
            mix[i] *= (float)Math.Exp(-3.0 * i / mix.Length);
        return mix;
    }

    private static float[] MakeUrgentSamples()
    {
        var part = MakeSquareTone(720, 0.18, 0.6);
        return Concat(part, part, part, part);
    }

    private static float[] MakeBirdSamples()
    {
        var s = new float[(int)(44100 * 0.9)];
        int pos = 0;
        foreach (double hz in new[] { 1800.0, 2100.0, 1650.0, 2200.0 })
        {
            var tone = MakeSineTone(hz, 0.12, 0.4);
            AddInto(s, tone, pos);
            pos += (int)(44100 * 0.14);
        }
        return s;
    }

    private static float[] MakePulseSamples()
    {
        var s = new float[(int)(44100 * 1.0)];
        for (int p = 0; p < 5; p++)
        {
            var tone = MakeSineTone(600, 0.08, 0.55);
            AddInto(s, tone, p * (int)(44100 * 0.18));
        }
        return s;
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
        return r;
    }

    private static float[] Offset(float[] src, int offset)
    {
        var r = new float[src.Length + offset];
        Array.Copy(src, 0, r, offset, src.Length);
        return r;
    }

    private static void AddInto(float[] dest, float[] src, int offset)
    {
        for (int i = 0; i < src.Length && offset + i < dest.Length; i++)
            dest[offset + i] += src[i];
    }

    private static byte[] BuildWav(float[] samples)
    {
        const int rate = 44100;
        const short channels = 1;
        const short bits = 16;
        int byteRate = rate * channels * bits / 8;
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
        I32(24, rate);
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
