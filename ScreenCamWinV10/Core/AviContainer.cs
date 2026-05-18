namespace ScreenCamWin.Core;

/// <summary>
/// Low-level AVI (RIFF) file writer. Codec-agnostic; the caller supplies
/// per-frame compressed bytes.
///
/// idx1 offsets follow the AVI spec: relative to the "movi" type-field
/// (i.e. the 4-byte "movi" FourCC inside the LIST chunk), NOT to "LIST".
/// First frame → offset 4.  VirtualDub / VLC / WMP all agree on this.
/// </summary>
internal sealed class AviContainer : IDisposable
{
    private readonly FileStream   _fs;
    private readonly BinaryWriter _bw;
    private readonly int _width, _height, _fps;

    private long _riffSizePos;
    private long _moviSizePos;
    private long _moviTypePos;        // position of "movi" FourCC — idx1 base
    private long _aviTotalFramesPos;
    private long _strhLengthPos;

    private readonly List<(long Offset, int Size, bool IsKey)> _frames = [];
    private bool _finalized;

    public AviContainer(string path, int width, int height, int fps)
    {
        _width  = width;
        _height = height;
        _fps    = fps;
        _fs = new FileStream(path, FileMode.Create, FileAccess.ReadWrite, FileShare.None);
        _bw = new BinaryWriter(_fs, System.Text.Encoding.ASCII, leaveOpen: true);
    }

    // ── Header writing ───────────────────────────────────────────────────────

    public void WriteFileHeader(uint fccHandler, byte[] strfData)
    {
        // ── RIFF ──────────────────────────────────────────────────────────────
        FourCC("RIFF");
        _riffSizePos = _fs.Position;
        _bw.Write(0u);
        FourCC("AVI ");

        // ── hdrl LIST ─────────────────────────────────────────────────────────
        FourCC("LIST");
        long hdrlSizePos = _fs.Position;
        _bw.Write(0u);
        FourCC("hdrl");

        // avih — 56 bytes
        FourCC("avih");
        _bw.Write(56u);
        _bw.Write((uint)(1_000_000u / (uint)_fps)); // MicroSecPerFrame
        _bw.Write(0u);    // MaxBytesPerSec
        _bw.Write(0u);    // PaddingGranularity
        _bw.Write(0x10u); // AVIF_HASINDEX
        _aviTotalFramesPos = _fs.Position;
        _bw.Write(0u);    // TotalFrames (patched later)
        _bw.Write(0u);    // InitialFrames
        _bw.Write(1u);    // Streams
        _bw.Write(0u);    // SuggestedBufferSize
        _bw.Write((uint)_width);
        _bw.Write((uint)_height);
        for (int i = 0; i < 4; i++) _bw.Write(0u); // Reserved[4]

        // strl LIST
        FourCC("LIST");
        long strlSizePos = _fs.Position;
        _bw.Write(0u);
        FourCC("strl");

        // strh — 56 bytes
        FourCC("strh");
        _bw.Write(56u);
        FourCC("vids");           // stream type: video
        _bw.Write(fccHandler);    // codec FourCC ("MJPG", "XVID", …)
        _bw.Write(0u);            // Flags
        _bw.Write((ushort)0);     // Priority
        _bw.Write((ushort)0);     // Language
        _bw.Write(0u);            // InitialFrames
        _bw.Write(1u);            // Scale
        _bw.Write((uint)_fps);    // Rate  →  fps/1 = fps
        _bw.Write(0u);            // Start
        _strhLengthPos = _fs.Position;
        _bw.Write(0u);            // Length (frame count, patched later)
        _bw.Write(0u);            // SuggestedBufferSize
        _bw.Write(uint.MaxValue); // Quality (-1 = default)
        _bw.Write(0u);            // SampleSize
        _bw.Write((short)0); _bw.Write((short)0);
        _bw.Write((short)_width); _bw.Write((short)_height);

        // strf (BITMAPINFOHEADER or codec-specific)
        FourCC("strf");
        _bw.Write((uint)strfData.Length);
        _bw.Write(strfData);

        PatchSize(strlSizePos);
        PatchSize(hdrlSizePos);

        // ── movi LIST ─────────────────────────────────────────────────────────
        FourCC("LIST");
        _moviSizePos = _fs.Position;   // size field of the movi LIST chunk
        _bw.Write(0u);
        _moviTypePos = _fs.Position;   // ← "movi" FourCC position (idx1 base)
        FourCC("movi");
        // First frame will be at _moviTypePos + 4  →  idx1 offset = 4
    }

    // ── Frame writing ────────────────────────────────────────────────────────

    public void WriteVideoFrame(byte[] data, bool isKeyFrame)
    {
        if (_finalized) throw new InvalidOperationException("Writer is finalized.");

        // idx1 offset = distance from the "movi" FourCC to this chunk's FourCC
        long offset = _fs.Position - _moviTypePos;  // first frame → 4

        FourCC("00dc");
        _bw.Write((uint)data.Length);
        _bw.Write(data);
        if (data.Length % 2 != 0) _bw.Write((byte)0); // RIFF even-padding

        _frames.Add((offset, data.Length, isKeyFrame));
    }

    public int FrameCount => _frames.Count;

    // ── Finalize ─────────────────────────────────────────────────────────────

    public void FinalizeFile()
    {
        if (_finalized) return;
        _finalized = true;

        _bw.Flush();

        PatchSize(_moviSizePos);

        // idx1 chunk
        FourCC("idx1");
        _bw.Write((uint)(_frames.Count * 16));
        foreach (var (offset, size, isKey) in _frames)
        {
            FourCC("00dc");
            _bw.Write(isKey ? 0x10u : 0u); // AVIIF_KEYFRAME
            _bw.Write((uint)offset);
            _bw.Write((uint)size);
        }

        PatchSize(_riffSizePos);

        // Patch frame counts in avih.TotalFrames and strh.Length
        _fs.Position = _aviTotalFramesPos;
        _bw.Write((uint)_frames.Count);
        _fs.Position = _strhLengthPos;
        _bw.Write((uint)_frames.Count);

        _bw.Flush();
        _fs.Flush();
    }

    // ── Static helpers ────────────────────────────────────────────────────────

    public static uint ParseFourCC(string s) =>
        (uint)s[0] | ((uint)s[1] << 8) | ((uint)s[2] << 16) | ((uint)s[3] << 24);

    /// <summary>Builds the 40-byte BITMAPINFOHEADER for an MJPEG stream.</summary>
    public static byte[] MakeMjpegStrf(int width, int height)
    {
        using var ms = new MemoryStream(40);
        using var bw = new BinaryWriter(ms, System.Text.Encoding.ASCII, leaveOpen: true);
        uint mjpg = ParseFourCC("MJPG");
        bw.Write(40u);                        // biSize
        bw.Write(width);                      // biWidth
        bw.Write(height);                     // biHeight (positive → bottom-up convention, OK for MJPEG)
        bw.Write((ushort)1);                  // biPlanes
        bw.Write((ushort)24);                 // biBitCount
        bw.Write(mjpg);                       // biCompression
        bw.Write((uint)(width * height * 3)); // biSizeImage
        bw.Write(0); bw.Write(0);             // biXPelsPerMeter / biYPelsPerMeter
        bw.Write(0u); bw.Write(0u);           // biClrUsed / biClrImportant
        return ms.ToArray();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private void FourCC(string s)
    {
        _bw.Write((byte)s[0]);
        _bw.Write((byte)s[1]);
        _bw.Write((byte)s[2]);
        _bw.Write((byte)s[3]);
    }

    // Writes the chunk size = (current pos) - sizePos - 4, then restores position.
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
