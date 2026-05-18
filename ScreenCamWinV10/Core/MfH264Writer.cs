using System.Runtime.InteropServices;

namespace ScreenCamWin.Core;

/// <summary>
/// Encodes BGR24 frames to H.264 MP4 using Windows Media Foundation.
/// Built into Windows 8+. No external codec required.
/// </summary>
internal sealed class MfH264Writer : IDisposable
{
    private IMFSinkWriter? _writer;
    private int    _streamIndex;
    private long   _timestamp;
    private readonly long _frameDuration;
    private readonly int  _width, _height;
    private bool _finalized;

    // ── Well-known GUIDs ─────────────────────────────────────────────────────
    static readonly Guid MFMediaType_Video        = new("73646976-0000-0010-8000-00AA00389B71");
    static readonly Guid MFVideoFormat_H264       = new("34363248-0000-0010-8000-00AA00389B71");
    static readonly Guid MFVideoFormat_NV12       = new("3231564E-0000-0010-8000-00AA00389B71");
    static readonly Guid MF_MT_MAJOR_TYPE         = new("48EBA18E-F8C9-4687-BF11-0A74C9F96A8F");
    static readonly Guid MF_MT_SUBTYPE            = new("F7E34C9A-42E8-4714-B74B-CB29D72C35E5");
    static readonly Guid MF_MT_AVG_BITRATE        = new("20332624-FB0D-4D9E-BD0D-CBF6786C102E");
    static readonly Guid MF_MT_INTERLACE_MODE     = new("E2724BB8-E676-4806-B4B2-A8D6EF8440EC");
    static readonly Guid MF_MT_FRAME_SIZE         = new("1652C33D-D6B2-4012-B834-72030849A37D");
    static readonly Guid MF_MT_FRAME_RATE         = new("C459A2E8-3D2C-11DE-AAED-00902707843C");
    static readonly Guid MF_MT_PIXEL_ASPECT_RATIO = new("C6376A1E-8D0A-4027-BE45-6D9A0AD39BB6");

    // ── COM imports ───────────────────────────────────────────────────────────

    [ComImport, Guid("2CD2D921-C447-44A7-A13C-4ADABFC247E3"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMFAttributes
    {
        [PreserveSig] int GetItem(ref Guid k, IntPtr v);
        [PreserveSig] int GetItemType(ref Guid k, out int t);
        [PreserveSig] int CompareItem(ref Guid k, IntPtr v, out bool r);
        [PreserveSig] int Compare(IMFAttributes a, int m, out bool r);
        [PreserveSig] int GetUINT32(ref Guid k, out uint v);
        [PreserveSig] int GetUINT64(ref Guid k, out ulong v);
        [PreserveSig] int GetDouble(ref Guid k, out double v);
        [PreserveSig] int GetGUID(ref Guid k, out Guid v);
        [PreserveSig] int GetStringLength(ref Guid k, out uint n);
        [PreserveSig] int GetString(ref Guid k, [MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder buf, uint cap, out uint n);
        [PreserveSig] int GetAllocatedString(ref Guid k, [MarshalAs(UnmanagedType.LPWStr)] out string v, out uint n);
        [PreserveSig] int GetBlobSize(ref Guid k, out uint n);
        [PreserveSig] int GetBlob(ref Guid k, [Out, MarshalAs(UnmanagedType.LPArray)] byte[] buf, uint cap, out uint n);
        [PreserveSig] int GetAllocatedBlob(ref Guid k, out IntPtr buf, out uint n);
        [PreserveSig] int GetUnknown(ref Guid k, ref Guid iid, out IntPtr ppv);
        [PreserveSig] int SetItem(ref Guid k, IntPtr v);
        [PreserveSig] int DeleteItem(ref Guid k);
        [PreserveSig] int DeleteAllItems();
        [PreserveSig] int SetUINT32(ref Guid k, uint v);
        [PreserveSig] int SetUINT64(ref Guid k, ulong v);
        [PreserveSig] int SetDouble(ref Guid k, double v);
        [PreserveSig] int SetGUID(ref Guid k, ref Guid v);
        [PreserveSig] int SetString(ref Guid k, [MarshalAs(UnmanagedType.LPWStr)] string v);
        [PreserveSig] int SetBlob(ref Guid k, [MarshalAs(UnmanagedType.LPArray)] byte[] buf, uint n);
        [PreserveSig] int SetUnknown(ref Guid k, [MarshalAs(UnmanagedType.IUnknown)] object v);
        [PreserveSig] int LockStore();
        [PreserveSig] int UnlockStore();
        [PreserveSig] int GetCount(out uint n);
        [PreserveSig] int GetItemByIndex(uint i, out Guid k, IntPtr v);
        [PreserveSig] int CopyAllItems(IMFAttributes dest);
    }

    [ComImport, Guid("44AE0FA8-EA31-4109-8D2E-4CAE4997C555"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMFMediaType : IMFAttributes
    {
        [PreserveSig] new int GetMajorType(out Guid g);
        [PreserveSig] new int IsCompressedFormat(out bool c);
        [PreserveSig] new int IsEqual(IMFMediaType t, out uint f);
        [PreserveSig] new int GetRepresentation(Guid g, out IntPtr p);
        [PreserveSig] new int FreeRepresentation(Guid g, IntPtr p);
    }

    [ComImport, Guid("045FA593-8799-42B8-BC8D-8968C6453507"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMFMediaBuffer
    {
        [PreserveSig] int Lock(out IntPtr ppbBuffer, out uint pcbMaxLength, out uint pcbCurrentLength);
        [PreserveSig] int Unlock();
        [PreserveSig] int GetCurrentLength(out uint pcbCurrentLength);
        [PreserveSig] int SetCurrentLength(uint cbCurrentLength);
        [PreserveSig] int GetMaxLength(out uint pcbMaxLength);
    }

    [ComImport, Guid("C40A00F2-B93A-4D80-AE8C-BA2EBCD1BA9A"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMFSample : IMFAttributes
    {
        [PreserveSig] new int GetSampleFlags(out uint f);
        [PreserveSig] new int SetSampleFlags(uint f);
        [PreserveSig] new int GetSampleTime(out long t);
        [PreserveSig] new int SetSampleTime(long t);
        [PreserveSig] new int GetSampleDuration(out long d);
        [PreserveSig] new int SetSampleDuration(long d);
        [PreserveSig] new int GetBufferCount(out uint n);
        [PreserveSig] new int GetBufferByIndex(uint i, out IMFMediaBuffer buf);
        [PreserveSig] new int ConvertToContiguousBuffer(out IMFMediaBuffer buf);
        [PreserveSig] new int AddBuffer(IMFMediaBuffer buf);
        [PreserveSig] new int RemoveBufferByIndex(uint i);
        [PreserveSig] new int RemoveAllBuffers();
        [PreserveSig] new int GetTotalLength(out uint n);
        [PreserveSig] new int CopyTo(IMFSample dest);
    }

    [ComImport, Guid("3137F1CD-FE5E-4805-A5D8-FB477E53C4B9"),
     InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMFSinkWriter
    {
        [PreserveSig] int AddStream(IMFMediaType pTargetMediaType, out uint pdwStreamIndex);
        [PreserveSig] int SetInputMediaType(uint dwStreamIndex, IMFMediaType pInputMediaType, IMFAttributes? pEncodingParameters);
        [PreserveSig] int BeginWriting();
        [PreserveSig] int WriteSample(uint dwStreamIndex, IMFSample pSample);
        [PreserveSig] int SendStreamTick(uint dwStreamIndex, long llTimestamp);
        [PreserveSig] int PlaceMarker(uint dwStreamIndex, IntPtr pvContext);
        [PreserveSig] int NotifyEndOfSegment(uint dwStreamIndex);
        [PreserveSig] int Flush(uint dwStreamIndex);
        [PreserveSig] int Finalize();
        [PreserveSig] int GetServiceForStream(uint dwStreamIndex, ref Guid guidService, ref Guid riid, out IntPtr ppvObject);
        [PreserveSig] int GetStatistics(uint dwStreamIndex, IntPtr pStats);
    }

    // ── P/Invoke ──────────────────────────────────────────────────────────────
    [DllImport("mfplat.dll")]    static extern int MFStartup(uint Version, uint dwFlags);
    [DllImport("mfplat.dll")]    static extern int MFShutdown();
    [DllImport("mfreadwrite.dll")] static extern int MFCreateSinkWriterFromURL(
        [MarshalAs(UnmanagedType.LPWStr)] string pwszOutputURL,
        IntPtr pByteStream, IntPtr pAttributes, out IMFSinkWriter ppSinkWriter);
    [DllImport("mfplat.dll")] static extern int MFCreateMediaType(out IMFMediaType ppMFType);
    [DllImport("mfplat.dll")] static extern int MFCreateMemoryBuffer(uint cbMaxLength, out IMFMediaBuffer ppBuffer);
    [DllImport("mfplat.dll")] static extern int MFCreateSample(out IMFSample ppIMFSample);

    // ── Constructor ───────────────────────────────────────────────────────────
    public MfH264Writer(string path, int width, int height, int fps, int bitrateBps = 4_000_000)
    {
        _width  = width;
        _height = height;
        _frameDuration = 10_000_000L / fps;

        Check(MFStartup(0x00020070, 0), "MFStartup");
        try
        {
            Check(MFCreateSinkWriterFromURL(path, IntPtr.Zero, IntPtr.Zero, out _writer!),
                  "MFCreateSinkWriterFromURL — 출력 경로가 .mp4인지 확인하세요");

            // Output: H.264
            Check(MFCreateMediaType(out var outT), "MFCreateMediaType(out)");
            Check(outT.SetGUID(ref Unsafe(MF_MT_MAJOR_TYPE), ref Unsafe(MFMediaType_Video)), "SetGUID Major");
            Check(outT.SetGUID(ref Unsafe(MF_MT_SUBTYPE), ref Unsafe(MFVideoFormat_H264)), "SetGUID H264");
            Check(outT.SetUINT32(ref Unsafe(MF_MT_AVG_BITRATE), (uint)bitrateBps), "SetUINT32 Bitrate");
            Check(outT.SetUINT32(ref Unsafe(MF_MT_INTERLACE_MODE), 2), "SetUINT32 Interlace");
            Check(outT.SetUINT64(ref Unsafe(MF_MT_FRAME_SIZE), Pack(width, height)), "SetUINT64 Size");
            Check(outT.SetUINT64(ref Unsafe(MF_MT_FRAME_RATE), Pack(fps, 1)), "SetUINT64 FPS");
            Check(outT.SetUINT64(ref Unsafe(MF_MT_PIXEL_ASPECT_RATIO), Pack(1, 1)), "SetUINT64 PAR");
            Check(_writer.AddStream(outT, out uint si), "AddStream");
            _streamIndex = (int)si;
            Marshal.ReleaseComObject(outT);

            // Input: NV12
            Check(MFCreateMediaType(out var inT), "MFCreateMediaType(in)");
            Check(inT.SetGUID(ref Unsafe(MF_MT_MAJOR_TYPE), ref Unsafe(MFMediaType_Video)), "SetGUID Major(in)");
            Check(inT.SetGUID(ref Unsafe(MF_MT_SUBTYPE), ref Unsafe(MFVideoFormat_NV12)), "SetGUID NV12");
            Check(inT.SetUINT32(ref Unsafe(MF_MT_INTERLACE_MODE), 2), "SetUINT32 Interlace(in)");
            Check(inT.SetUINT64(ref Unsafe(MF_MT_FRAME_SIZE), Pack(width, height)), "SetUINT64 Size(in)");
            Check(inT.SetUINT64(ref Unsafe(MF_MT_FRAME_RATE), Pack(fps, 1)), "SetUINT64 FPS(in)");
            Check(inT.SetUINT64(ref Unsafe(MF_MT_PIXEL_ASPECT_RATIO), Pack(1, 1)), "SetUINT64 PAR(in)");
            Check(_writer.SetInputMediaType((uint)_streamIndex, inT, null), "SetInputMediaType");
            Marshal.ReleaseComObject(inT);

            Check(_writer.BeginWriting(), "BeginWriting");
        }
        catch
        {
            if (_writer != null) { Marshal.ReleaseComObject(_writer); _writer = null; }
            MFShutdown();
            throw;
        }
    }

    // ── Write frame (BGR24, top-down) ─────────────────────────────────────────
    public void WriteFrame(byte[] bgr24)
    {
        if (_finalized) throw new ObjectDisposedException(nameof(MfH264Writer));
        if (_writer  is null)  throw new ObjectDisposedException(nameof(MfH264Writer));

        byte[] nv12 = Bgr24ToNv12(bgr24, _width, _height);

        Check(MFCreateMemoryBuffer((uint)nv12.Length, out var buf), "MFCreateMemoryBuffer");
        Check(buf.Lock(out IntPtr pData, out _, out _), "Buffer::Lock");
        Marshal.Copy(nv12, 0, pData, nv12.Length);
        buf.Unlock();
        Check(buf.SetCurrentLength((uint)nv12.Length), "Buffer::SetCurrentLength");

        Check(MFCreateSample(out var smp), "MFCreateSample");
        Check(smp.AddBuffer(buf),                     "Sample::AddBuffer");
        Check(smp.SetSampleTime(_timestamp),           "Sample::SetSampleTime");
        Check(smp.SetSampleDuration(_frameDuration),   "Sample::SetSampleDuration");
        Check(_writer.WriteSample((uint)_streamIndex, smp), "WriteSample");

        Marshal.ReleaseComObject(smp);
        Marshal.ReleaseComObject(buf);

        _timestamp += _frameDuration;
    }

    // ── Finalize / Dispose ────────────────────────────────────────────────────
    public void FinalizeFile()
    {
        if (_finalized) return;
        _finalized = true;
        _writer?.Finalize();
    }

    public void Dispose()
    {
        try { FinalizeFile(); } catch { }
        if (_writer != null) { Marshal.ReleaseComObject(_writer); _writer = null; }
        MFShutdown();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    // Allows passing readonly Guid fields as ref without copying
    static ref Guid Unsafe(in Guid g) => ref System.Runtime.CompilerServices.Unsafe.AsRef(in g);

    static ulong Pack(long hi, long lo) => ((ulong)hi << 32) | (uint)lo;

    static void Check(int hr, string ctx)
    {
        if (hr < 0) throw new COMException($"MF 오류 ({ctx})", hr);
    }

    // BGR24 top-down → NV12 (required by the Windows H.264 encoder MFT)
    static byte[] Bgr24ToNv12(byte[] bgr, int w, int h)
    {
        int ySize = w * h;
        var nv12  = new byte[ySize + ySize / 2];
        for (int row = 0; row < h; row++)
        {
            for (int col = 0; col < w; col++)
            {
                int si = (row * w + col) * 3;
                int b = bgr[si], g = bgr[si + 1], r = bgr[si + 2];
                nv12[row * w + col] = (byte)Math.Clamp(((66 * r + 129 * g + 25 * b + 128) >> 8) + 16, 0, 255);
                if ((row & 1) == 0 && (col & 1) == 0)
                {
                    int off = ySize + (row / 2) * w + col;
                    nv12[off]     = (byte)Math.Clamp(((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128, 0, 255);
                    nv12[off + 1] = (byte)Math.Clamp(((112 * r - 94 * g - 18 * b + 128) >> 8) + 128, 0, 255);
                }
            }
        }
        return nv12;
    }
}
