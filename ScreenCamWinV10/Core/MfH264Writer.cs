using System.Runtime.InteropServices;
using Vortice.MediaFoundation;

namespace ScreenCamWin.Core;

file static class MfVideoGuids
{
    public static readonly Guid H264 = new("34363248-0000-0010-8000-00AA00389B71"); // MFVideoFormat_H264
    public static readonly Guid NV12 = new("3231564E-0000-0010-8000-00AA00389B71"); // MFVideoFormat_NV12
}

/// <summary>
/// Encodes BGR24 frames to H.264 MP4 using Windows Media Foundation (Vortice bindings).
/// </summary>
internal sealed class MfH264Writer : IDisposable
{
    private IMFSinkWriter? _writer;
    private int    _streamIndex;
    private long   _timestamp;
    private readonly long _frameDuration;
    private readonly int  _width, _height;
    private bool _finalized;
    private bool _mfStarted;

    const int MF_E_NOTACCEPTING = unchecked((int)0xC00D36B5);

    public MfH264Writer(string path, int width, int height, int fps, int bitrateBps = 4_000_000)
    {
        if (width < 16 || height < 16 || (width & 15) != 0 || (height & 15) != 0)
            throw new ArgumentException(
                $"H.264 인코더는 가로·세로가 16의 배수여야 합니다 (현재 {width}x{height}).");

        _width  = width;
        _height = height;
        _frameDuration = 10_000_000L / fps;

        string outPath = Path.GetFullPath(path);
        string? dir = Path.GetDirectoryName(outPath);
        if (!string.IsNullOrEmpty(dir))
            Directory.CreateDirectory(dir);
        if (File.Exists(outPath))
            File.Delete(outPath);

        MediaFactory.MFStartup();
        _mfStarted = true;

        try
        {
            _writer = MediaFactory.MFCreateSinkWriterFromURL(outPath, null, null);

            using var outType = MediaFactory.MFCreateMediaType();
            outType.Set(MediaTypeAttributeKeys.MajorType, MediaTypeGuids.Video);
            outType.Set(MediaTypeAttributeKeys.Subtype, MfVideoGuids.H264);
            outType.Set(MediaTypeAttributeKeys.AvgBitrate, (uint)bitrateBps);
            outType.Set(MediaTypeAttributeKeys.InterlaceMode, (uint)VideoInterlaceMode.Progressive);
            outType.Set(MediaTypeAttributeKeys.FrameSize, PackSize(width, height));
            outType.Set(MediaTypeAttributeKeys.FrameRate, PackRatio(fps, 1));
            outType.Set(MediaTypeAttributeKeys.PixelAspectRatio, PackRatio(1, 1));

            _streamIndex = (int)_writer.AddStream(outType);

            using var inType = MediaFactory.MFCreateMediaType();
            inType.Set(MediaTypeAttributeKeys.MajorType, MediaTypeGuids.Video);
            inType.Set(MediaTypeAttributeKeys.Subtype, MfVideoGuids.NV12);
            inType.Set(MediaTypeAttributeKeys.InterlaceMode, (uint)VideoInterlaceMode.Progressive);
            inType.Set(MediaTypeAttributeKeys.FrameSize, PackSize(width, height));
            inType.Set(MediaTypeAttributeKeys.FrameRate, PackRatio(fps, 1));
            inType.Set(MediaTypeAttributeKeys.PixelAspectRatio, PackRatio(1, 1));
            inType.Set(MediaTypeAttributeKeys.DefaultStride, (uint)width);

            _writer.SetInputMediaType(_streamIndex, inType, null);
            _writer.BeginWriting();
        }
        catch
        {
            _writer?.Dispose();
            _writer = null;
            ShutdownMf();
            throw;
        }
    }

    public void WriteFrame(byte[] bgr24)
    {
        if (_finalized) throw new ObjectDisposedException(nameof(MfH264Writer));
        if (_writer is null) throw new ObjectDisposedException(nameof(MfH264Writer));

        byte[] nv12 = Bgr24ToNv12(bgr24, _width, _height);

        using var buffer = MediaFactory.MFCreateMemoryBuffer(nv12.Length);
        buffer.Lock(out IntPtr pData, out _, out _);
        try
        {
            Marshal.Copy(nv12, 0, pData, nv12.Length);
        }
        finally
        {
            buffer.Unlock();
        }
        buffer.CurrentLength = nv12.Length;

        using var sample = MediaFactory.MFCreateSample();
        sample.AddBuffer(buffer);
        sample.SampleTime     = _timestamp;
        sample.SampleDuration = _frameDuration;

        WriteSampleWithRetry(sample);

        _timestamp += _frameDuration;
    }

    public void FinalizeFile()
    {
        if (_finalized || _writer is null) return;
        _finalized = true;
        _writer.Finalize();
    }

    public void Dispose()
    {
        try { FinalizeFile(); } catch { }
        _writer?.Dispose();
        _writer = null;
        ShutdownMf();
    }

    void WriteSampleWithRetry(IMFSample sample)
    {
        for (int attempt = 0; attempt < 50; attempt++)
        {
            try
            {
                _writer!.WriteSample(_streamIndex, sample);
                return;
            }
            catch (COMException ex) when (ex.HResult == MF_E_NOTACCEPTING)
            {
                Thread.Sleep(2);
            }
        }
        throw new COMException("MF 오류 (WriteSample — 인코더 버퍼 대기 시간 초과)", MF_E_NOTACCEPTING);
    }

    void ShutdownMf()
    {
        if (!_mfStarted) return;
        _mfStarted = false;
        MediaFactory.MFShutdown();
    }

    static ulong PackSize(int w, int h) => ((ulong)(uint)w << 32) | (uint)h;
    static ulong PackRatio(int num, int den) => ((ulong)(uint)num << 32) | (uint)den;

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
