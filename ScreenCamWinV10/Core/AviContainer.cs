namespace ScreenCamWin.Core;

/// <summary>
/// Low-level AVI (RIFF) writer with optional PCM audio stream.
/// </summary>
internal sealed class AviContainer : IDisposable
{
    private readonly FileStream   _fs;
    private readonly BinaryWriter _bw;
    private readonly int _width, _height, _fps;
    private readonly bool _withAudio;

    private long _riffSizePos;
    private long _moviSizePos;
    private long _moviTypePos;
    private long _aviTotalFramesPos;
    private long _strhLengthPos;
    private long _audioStrhLengthPos;

    private readonly List<(string FourCC, long Offset, int Size, uint Flags)> _index = [];
    private bool _finalized;

    public AviContainer(string path, int width, int height, int fps, bool withAudio = false)
    {
        _width     = width;
        _height    = height;
        _fps       = fps;
        _withAudio = withAudio;
        _fs = new FileStream(path, FileMode.Create, FileAccess.ReadWrite, FileShare.None);
        _bw = new BinaryWriter(_fs, System.Text.Encoding.ASCII, leaveOpen: true);
    }

    public void WriteFileHeader(uint fccHandler, byte[] strfData)
    {
        FourCC("RIFF");
        _riffSizePos = _fs.Position;
        _bw.Write(0u);
        FourCC("AVI ");

        FourCC("LIST");
        long hdrlSizePos = _fs.Position;
        _bw.Write(0u);
        FourCC("hdrl");

        FourCC("avih");
        _bw.Write(56u);
        _bw.Write((uint)(1_000_000u / (uint)_fps));
        _bw.Write(0u);
        _bw.Write(0u);
        _bw.Write(0x10u);
        _aviTotalFramesPos = _fs.Position;
        _bw.Write(0u);
        _bw.Write(0u);
        _bw.Write((uint)(_withAudio ? 2u : 1u));
        _bw.Write(0u);
        _bw.Write((uint)_width);
        _bw.Write((uint)_height);
        for (int i = 0; i < 4; i++) _bw.Write(0u);

        WriteVideoStreamList(fccHandler, strfData);

        if (_withAudio)
            WriteAudioStreamList();

        PatchSize(hdrlSizePos);

        FourCC("LIST");
        _moviSizePos = _fs.Position;
        _bw.Write(0u);
        _moviTypePos = _fs.Position;
        FourCC("movi");
    }

    void WriteVideoStreamList(uint fccHandler, byte[] strfData)
    {
        FourCC("LIST");
        long strlSizePos = _fs.Position;
        _bw.Write(0u);
        FourCC("strl");

        FourCC("strh");
        _bw.Write(56u);
        FourCC("vids");
        _bw.Write(fccHandler);
        _bw.Write(0u);
        _bw.Write((ushort)0);
        _bw.Write((ushort)0);
        _bw.Write(0u);
        _bw.Write(1u);
        _bw.Write((uint)_fps);
        _bw.Write(0u);
        _strhLengthPos = _fs.Position;
        _bw.Write(0u);
        _bw.Write(0u);
        _bw.Write(uint.MaxValue);
        _bw.Write(0u);
        _bw.Write((short)0); _bw.Write((short)0);
        _bw.Write((short)_width); _bw.Write((short)_height);

        FourCC("strf");
        _bw.Write((uint)strfData.Length);
        _bw.Write(strfData);

        PatchSize(strlSizePos);
    }

    void WriteAudioStreamList()
    {
        FourCC("LIST");
        long strlSizePos = _fs.Position;
        _bw.Write(0u);
        FourCC("strl");

        FourCC("strh");
        _bw.Write(56u);
        FourCC("auds");
        _bw.Write(1u); // WAVE_FORMAT_PCM
        _bw.Write(0u);
        _bw.Write((ushort)0);
        _bw.Write((ushort)0);
        _bw.Write(0u);
        _bw.Write(1u);
        _bw.Write((uint)MicrophoneCapture.SampleRate);
        _bw.Write(0u);
        _audioStrhLengthPos = _fs.Position;
        _bw.Write(0u);
        _bw.Write(0u);
        _bw.Write(uint.MaxValue);
        _bw.Write((uint)(MicrophoneCapture.Channels * MicrophoneCapture.BitsPerSample / 8));
        _bw.Write((short)0); _bw.Write((short)0);
        _bw.Write((short)0); _bw.Write((short)0);

        byte[] strf = MakePcmWaveFormat();
        FourCC("strf");
        _bw.Write((uint)strf.Length);
        _bw.Write(strf);

        PatchSize(strlSizePos);
    }

    public static byte[] MakePcmWaveFormat()
    {
        ushort blockAlign = (ushort)(MicrophoneCapture.Channels * MicrophoneCapture.BitsPerSample / 8);
        uint avgBytes = (uint)(MicrophoneCapture.SampleRate * blockAlign);
        using var ms = new MemoryStream(18);
        using var bw = new BinaryWriter(ms, System.Text.Encoding.ASCII, leaveOpen: true);
        bw.Write((ushort)1); // PCM
        bw.Write((ushort)MicrophoneCapture.Channels);
        bw.Write((uint)MicrophoneCapture.SampleRate);
        bw.Write(avgBytes);
        bw.Write(blockAlign);
        bw.Write((ushort)MicrophoneCapture.BitsPerSample);
        return ms.ToArray();
    }

    public void WriteVideoFrame(byte[] data, bool isKeyFrame)
    {
        if (_finalized) throw new InvalidOperationException("Writer is finalized.");
        long offset = _fs.Position - _moviTypePos;
        FourCC("00dc");
        _bw.Write((uint)data.Length);
        _bw.Write(data);
        if (data.Length % 2 != 0) _bw.Write((byte)0);
        _index.Add(("00dc", offset, data.Length, isKeyFrame ? 0x10u : 0u));
    }

    public void WriteAudioFrame(byte[] data)
    {
        if (_finalized) throw new InvalidOperationException("Writer is finalized.");
        if (!_withAudio || data.Length == 0) return;

        long offset = _fs.Position - _moviTypePos;
        FourCC("01wb");
        _bw.Write((uint)data.Length);
        _bw.Write(data);
        if (data.Length % 2 != 0) _bw.Write((byte)0);
        _index.Add(("01wb", offset, data.Length, 0x10u));
    }

    public int VideoFrameCount =>
        _index.Count(e => e.FourCC == "00dc");

    public int AudioByteCount =>
        _index.Where(e => e.FourCC == "01wb").Sum(e => e.Size);

    public void FinalizeFile()
    {
        if (_finalized) return;
        _finalized = true;

        _bw.Flush();
        PatchSize(_moviSizePos);

        FourCC("idx1");
        _bw.Write((uint)(_index.Count * 16));
        foreach (var (fourCC, offset, size, flags) in _index)
        {
            FourCC(fourCC);
            _bw.Write(flags);
            _bw.Write((uint)offset);
            _bw.Write((uint)size);
        }

        PatchSize(_riffSizePos);

        int videoFrames = VideoFrameCount;
        _fs.Position = _aviTotalFramesPos;
        _bw.Write((uint)videoFrames);

        _fs.Position = _strhLengthPos;
        _bw.Write((uint)videoFrames);

        if (_withAudio && _audioStrhLengthPos > 0)
        {
            int bytesPerSec = MicrophoneCapture.SampleRate
                * MicrophoneCapture.Channels * MicrophoneCapture.BitsPerSample / 8;
            uint audioSamples = (uint)(AudioByteCount * MicrophoneCapture.SampleRate / bytesPerSec);
            _fs.Position = _audioStrhLengthPos;
            _bw.Write(audioSamples);
        }

        _bw.Flush();
        _fs.Flush();
    }

    public static uint ParseFourCC(string s) =>
        (uint)s[0] | ((uint)s[1] << 8) | ((uint)s[2] << 16) | ((uint)s[3] << 24);

    public static byte[] MakeMjpegStrf(int width, int height)
    {
        using var ms = new MemoryStream(40);
        using var bw = new BinaryWriter(ms, System.Text.Encoding.ASCII, leaveOpen: true);
        uint mjpg = ParseFourCC("MJPG");
        bw.Write(40u);
        bw.Write(width);
        bw.Write(height);
        bw.Write((ushort)1);
        bw.Write((ushort)24);
        bw.Write(mjpg);
        bw.Write((uint)(width * height * 3));
        bw.Write(0); bw.Write(0);
        bw.Write(0u); bw.Write(0u);
        return ms.ToArray();
    }

    private void FourCC(string s)
    {
        _bw.Write((byte)s[0]);
        _bw.Write((byte)s[1]);
        _bw.Write((byte)s[2]);
        _bw.Write((byte)s[3]);
    }

    private void PatchSize(long sizePos)
    {
        long end = _fs.Position;
        _fs.Position = sizePos;
        _bw.Write((uint)(end - sizePos - 4));
        _fs.Position = end;
    }

    public void Dispose()
    {
        if (!_finalized)
            try { FinalizeFile(); } catch { }
        _bw.Dispose();
        _fs.Dispose();
    }
}
