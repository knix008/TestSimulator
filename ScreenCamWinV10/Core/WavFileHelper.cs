namespace ScreenCamWin.Core;

internal static class WavFileHelper
{
    /// <summary>Truncates a PCM WAV and fixes RIFF/data chunk sizes (canonical 44-byte header).</summary>
    public static void TrimToDataBytes(string path, long maxDataBytes)
    {
        if (maxDataBytes <= 0 || !File.Exists(path)) return;

        const int headerBytes = 44;
        using var fs = new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None);
        if (fs.Length <= headerBytes) return;

        long dataBytes = fs.Length - headerBytes;
        if (dataBytes <= maxDataBytes) return;

        fs.SetLength(headerBytes + maxDataBytes);

        fs.Position = 4;
        WriteUInt32(fs, (uint)(fs.Length - 8));
        fs.Position = 40;
        WriteUInt32(fs, (uint)maxDataBytes);
    }

    static void WriteUInt32(Stream stream, uint value)
    {
        Span<byte> b = stackalloc byte[4];
        b[0] = (byte)value;
        b[1] = (byte)(value >> 8);
        b[2] = (byte)(value >> 16);
        b[3] = (byte)(value >> 24);
        stream.Write(b);
    }

    public static long ExpectedPcmBytesForVideo(int frameCount, int fps)
    {
        if (frameCount <= 0 || fps <= 0) return 0;
        int blockAlign = MicrophoneCapture.Channels * MicrophoneCapture.BitsPerSample / 8;
        long samples = (long)Math.Round(frameCount * (MicrophoneCapture.SampleRate / (double)fps));
        return samples * blockAlign;
    }

    public static byte[] ReadPcmData(string path)
    {
        if (!File.Exists(path)) return [];

        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (fs.Length <= 44) return [];

        using var br = new BinaryReader(fs);
        if (br.ReadUInt32() != 0x46464952) // RIFF
            throw new InvalidDataException("WAV 파일이 아닙니다.");

        br.ReadUInt32();
        if (br.ReadUInt32() != 0x45564157) // WAVE
            throw new InvalidDataException("WAV 파일이 아닙니다.");

        int channels      = MicrophoneCapture.Channels;
        int sampleRate    = MicrophoneCapture.SampleRate;
        int bitsPerSample = MicrophoneCapture.BitsPerSample;
        long dataStart    = -1;
        int  dataSize     = 0;

        while (fs.Position + 8 <= fs.Length)
        {
            uint chunkId = br.ReadUInt32();
            uint size    = br.ReadUInt32();
            long chunkData = fs.Position;

            if (chunkId == 0x20746D66) // fmt
            {
                ushort format = br.ReadUInt16();
                if (format != 1)
                    throw new InvalidDataException("PCM WAV만 지원합니다.");
                channels      = br.ReadUInt16();
                sampleRate    = br.ReadInt32();
                br.ReadUInt32();
                br.ReadUInt16();
                bitsPerSample = br.ReadUInt16();
            }
            else if (chunkId == 0x61746164) // data
            {
                dataStart = chunkData;
                dataSize  = (int)Math.Min(size, fs.Length - chunkData);
                break;
            }

            fs.Position = chunkData + size + (size & 1);
        }

        if (dataStart < 0 || dataSize <= 0)
            return [];

        if (channels != MicrophoneCapture.Channels
            || sampleRate != MicrophoneCapture.SampleRate
            || bitsPerSample != MicrophoneCapture.BitsPerSample)
        {
            throw new InvalidDataException(
                $"오디오 형식이 맞지 않습니다 ({sampleRate} Hz, {channels} ch, {bitsPerSample} bit). " +
                $"필요: {MicrophoneCapture.SampleRate} Hz, {MicrophoneCapture.Channels} ch, {MicrophoneCapture.BitsPerSample} bit.");
        }

        fs.Position = dataStart;
        var pcm = new byte[dataSize];
        int read = fs.Read(pcm, 0, dataSize);
        if (read < dataSize)
            Array.Resize(ref pcm, read);
        return pcm;
    }
}
