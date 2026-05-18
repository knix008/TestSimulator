using System.Runtime.InteropServices;
using ScreenCamWin.Native;

namespace ScreenCamWin.Core;

/// <summary>
/// Wraps Video for Windows (VFW / ICM) codec compression.
/// Opened once per recording session, disposed when done.
/// </summary>
internal sealed class VfwEncoder : IDisposable
{
    private IntPtr _hic;
    private IntPtr _biIn;
    private IntPtr _biOut;
    private IntPtr _outputBuf;
    private int    _outputBufSize;
    private int    _frameNum;
    private bool   _compressBegun;
    private bool   _disposed;

    public int  Width       { get; }
    public int  Height      { get; }
    public uint OutFourCC   { get; private set; }
    public byte[] StrfBytes { get; private set; } = [];

    public VfwEncoder(string fourcc, int width, int height, int fps, int quality)
    {
        Width  = width;
        Height = height;

        uint handler = NativeMethods.FourCCToUInt(fourcc);
        _hic = NativeMethods.ICOpen(NativeMethods.ICTYPE_VIDEO, handler, NativeMethods.ICMODE_COMPRESS);
        if (_hic == IntPtr.Zero)
            throw new InvalidOperationException($"코덱 '{fourcc}'을(를) 열 수 없습니다. 설치되어 있는지 확인하세요.");

        // Build input BITMAPINFOHEADER (BGR24, bottom-up)
        _biIn = AllocBitmapInfoHeader(width, height, 24, 0 /*BI_RGB*/);

        // Query output format size
        int outSize = NativeMethods.ICCompressGetFormat(_hic, _biIn, IntPtr.Zero);
        if (outSize <= 0) outSize = Marshal.SizeOf<BitmapInfoHeader>();

        _biOut = Marshal.AllocHGlobal(outSize);
        ZeroMemory(_biOut, outSize);
        NativeMethods.ICCompressGetFormat(_hic, _biIn, _biOut);

        // Read back the out FourCC (biCompression field, offset 16)
        OutFourCC = (uint)Marshal.ReadInt32(_biOut, 16);

        // Build strf bytes (the raw BITMAPINFOHEADER for the AVI file)
        StrfBytes = new byte[outSize];
        Marshal.Copy(_biOut, StrfBytes, 0, outSize);

        // Allocate output buffer
        _outputBufSize = NativeMethods.ICCompressGetSize(_hic, _biIn, _biOut);
        if (_outputBufSize <= 0) _outputBufSize = width * height * 4;
        _outputBuf = Marshal.AllocHGlobal(_outputBufSize);

        // Begin compression
        int r = NativeMethods.ICCompressBegin(_hic, _biIn, _biOut);
        if (r != 0)
            throw new InvalidOperationException($"ICCompressBegin 실패 (오류 코드 {r}).");
        _compressBegun = true;
    }

    // ── Encode one frame ─────────────────────────────────────────────────────

    /// <summary>Compresses one BGR24 bottom-up frame. Returns compressed bytes.</summary>
    public (byte[] Data, bool IsKeyFrame) CompressFrame(byte[] bgr24BottomUp)
    {
        GCHandle pinned = GCHandle.Alloc(bgr24BottomUp, GCHandleType.Pinned);
        try
        {
            IntPtr pBits = pinned.AddrOfPinnedObject();
            uint ckid  = 0;
            uint flags = 0;
            int  result = NativeMethods.ICCompress(
                _hic,
                _frameNum == 0 ? 1u : 0u, // ICCOMPRESS_KEYFRAME on first frame
                _biOut, _outputBuf,
                _biIn,  pBits,
                out ckid, out flags,
                _frameNum, 0, 0,
                IntPtr.Zero, IntPtr.Zero);

            if (result != 0)
                throw new InvalidOperationException($"ICCompress 실패 (오류 코드 {result}).");

            // Read compressed size from biSizeImage field (offset 20 in BITMAPINFOHEADER)
            int compressedSize = Marshal.ReadInt32(_biOut, 20);
            if (compressedSize <= 0 || compressedSize > _outputBufSize)
                compressedSize = _outputBufSize; // fallback

            byte[] data = new byte[compressedSize];
            Marshal.Copy(_outputBuf, data, 0, compressedSize);

            bool isKey = (flags & 0x10) != 0 || _frameNum == 0; // AVIIF_KEYFRAME
            _frameNum++;
            return (data, isKey);
        }
        finally
        {
            pinned.Free();
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    [StructLayout(LayoutKind.Sequential)]
    private struct BitmapInfoHeader
    {
        public uint   biSize;
        public int    biWidth;
        public int    biHeight;
        public ushort biPlanes;
        public ushort biBitCount;
        public uint   biCompression;
        public uint   biSizeImage;
        public int    biXPelsPerMeter;
        public int    biYPelsPerMeter;
        public uint   biClrUsed;
        public uint   biClrImportant;
    }

    private static IntPtr AllocBitmapInfoHeader(int w, int h, ushort bpp, uint compression)
    {
        int sz = Marshal.SizeOf<BitmapInfoHeader>();
        IntPtr p = Marshal.AllocHGlobal(sz);
        ZeroMemory(p, sz);
        var hdr = new BitmapInfoHeader
        {
            biSize        = (uint)sz,
            biWidth       = w,
            biHeight      = h,  // positive = bottom-up
            biPlanes      = 1,
            biBitCount    = bpp,
            biCompression = compression,
            biSizeImage   = (uint)(w * h * (bpp / 8)),
        };
        Marshal.StructureToPtr(hdr, p, false);
        return p;
    }

    private static void ZeroMemory(IntPtr p, int size)
    {
        for (int i = 0; i < size; i++)
            Marshal.WriteByte(p, i, 0);
    }

    // ── IDisposable ──────────────────────────────────────────────────────────

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        if (_compressBegun && _hic != IntPtr.Zero)
            NativeMethods.ICCompressEnd(_hic);

        if (_hic != IntPtr.Zero) { NativeMethods.ICClose(_hic); _hic = IntPtr.Zero; }
        if (_biIn   != IntPtr.Zero) { Marshal.FreeHGlobal(_biIn);   _biIn   = IntPtr.Zero; }
        if (_biOut  != IntPtr.Zero) { Marshal.FreeHGlobal(_biOut);  _biOut  = IntPtr.Zero; }
        if (_outputBuf != IntPtr.Zero) { Marshal.FreeHGlobal(_outputBuf); _outputBuf = IntPtr.Zero; }
    }
}
