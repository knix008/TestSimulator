using System.Runtime.InteropServices;
using Vortice.MediaFoundation;

namespace ScreenCamWin.Core;

file static class MfVideoGuids
{
    public static readonly Guid H264 = new("34363248-0000-0010-8000-00AA00389B71");
    public static readonly Guid NV12 = new("3231564E-0000-0010-8000-00AA00389B71");
}

file static class MfAudioGuids
{
    public static readonly Guid Aac = new("000000FF-0000-0010-8000-00AA00389B71");
    public static readonly Guid Pcm = new("00000001-0000-0010-8000-00AA00389B71");
}

/// <summary>
/// Encodes BGR24 frames to H.264 MP4 using Windows Media Foundation (Vortice bindings).
/// Optional AAC audio from microphone PCM.
/// </summary>
internal sealed class MfH264Writer : IDisposable
{
    private IMFSinkWriter? _writer;
    private int    _videoStreamIndex;
    private int    _audioStreamIndex = -1;
    private long   _timestamp;
    private long   _audioSamplePosition;
    private readonly long _frameDuration;
    private readonly int  _width, _height;
    private readonly bool _withAudio;
    private bool _finalized;
    private bool _mfStarted;

    const int MF_E_NOTACCEPTING = unchecked((int)0xC00D36B5);

    public MfH264Writer(string path, int width, int height, int fps, bool withAudio, int bitrateBps = 4_000_000)
    {
        if (width < 16 || height < 16 || (width & 15) != 0 || (height & 15) != 0)
            throw new ArgumentException(
                $"H.264 인코더는 가로·세로가 16의 배수여야 합니다 (현재 {width}x{height}).");

        _width      = width;
        _height     = height;
        _withAudio  = withAudio;
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

            _videoStreamIndex = (int)_writer.AddStream(outType);

            using var inType = MediaFactory.MFCreateMediaType();
            inType.Set(MediaTypeAttributeKeys.MajorType, MediaTypeGuids.Video);
            inType.Set(MediaTypeAttributeKeys.Subtype, MfVideoGuids.NV12);
            inType.Set(MediaTypeAttributeKeys.InterlaceMode, (uint)VideoInterlaceMode.Progressive);
            inType.Set(MediaTypeAttributeKeys.FrameSize, PackSize(width, height));
            inType.Set(MediaTypeAttributeKeys.FrameRate, PackRatio(fps, 1));
            inType.Set(MediaTypeAttributeKeys.PixelAspectRatio, PackRatio(1, 1));
            inType.Set(MediaTypeAttributeKeys.DefaultStride, (uint)width);

            _writer.SetInputMediaType(_videoStreamIndex, inType, null);

            if (_withAudio)
                ConfigureAudioStream();

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

    void ConfigureAudioStream()
    {
        ushort blockAlign = (ushort)(MicrophoneCapture.Channels * MicrophoneCapture.BitsPerSample / 8);
        uint avgBytes = (uint)(MicrophoneCapture.SampleRate * blockAlign);

        using var audioOut = MediaFactory.MFCreateMediaType();
        audioOut.Set(MediaTypeAttributeKeys.MajorType, MediaTypeGuids.Audio);
        audioOut.Set(MediaTypeAttributeKeys.Subtype, MfAudioGuids.Aac);
        audioOut.Set(MediaTypeAttributeKeys.AudioNumChannels, (uint)MicrophoneCapture.Channels);
        audioOut.Set(MediaTypeAttributeKeys.AudioSamplesPerSecond, (uint)MicrophoneCapture.SampleRate);
        audioOut.Set(MediaTypeAttributeKeys.AudioBitsPerSample, (uint)MicrophoneCapture.BitsPerSample);
        audioOut.Set(MediaTypeAttributeKeys.AudioAvgBytesPerSecond, 16_000u); // 128 kbps

        _audioStreamIndex = (int)_writer!.AddStream(audioOut);

        using var audioIn = MediaFactory.MFCreateMediaType();
        audioIn.Set(MediaTypeAttributeKeys.MajorType, MediaTypeGuids.Audio);
        audioIn.Set(MediaTypeAttributeKeys.Subtype, MfAudioGuids.Pcm);
        audioIn.Set(MediaTypeAttributeKeys.AudioNumChannels, (uint)MicrophoneCapture.Channels);
        audioIn.Set(MediaTypeAttributeKeys.AudioSamplesPerSecond, (uint)MicrophoneCapture.SampleRate);
        audioIn.Set(MediaTypeAttributeKeys.AudioBitsPerSample, (uint)MicrophoneCapture.BitsPerSample);
        audioIn.Set(MediaTypeAttributeKeys.AudioBlockAlignment, blockAlign);
        audioIn.Set(MediaTypeAttributeKeys.AudioAvgBytesPerSecond, avgBytes);

        _writer.SetInputMediaType(_audioStreamIndex, audioIn, null);
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

        WriteSampleWithRetry(_videoStreamIndex, sample);

        _timestamp += _frameDuration;
    }

    public long AudioBytesWritten =>
        _audioSamplePosition * MicrophoneCapture.Channels * MicrophoneCapture.BitsPerSample / 8;

    public void WriteAudioPcm(byte[] pcm, int byteCount)
    {
        if (_finalized || !_withAudio || _audioStreamIndex < 0 || byteCount <= 0)
            return;
        if (_writer is null) throw new ObjectDisposedException(nameof(MfH264Writer));

        int blockAlign = MicrophoneCapture.Channels * MicrophoneCapture.BitsPerSample / 8;
        int samples    = byteCount / blockAlign;
        if (samples <= 0) return;

        long duration = samples * 10_000_000L / MicrophoneCapture.SampleRate;
        long time     = _audioSamplePosition * 10_000_000L / MicrophoneCapture.SampleRate;

        using var buffer = MediaFactory.MFCreateMemoryBuffer(byteCount);
        buffer.Lock(out IntPtr pData, out _, out _);
        try
        {
            Marshal.Copy(pcm, 0, pData, byteCount);
        }
        finally
        {
            buffer.Unlock();
        }
        buffer.CurrentLength = byteCount;

        using var sample = MediaFactory.MFCreateSample();
        sample.AddBuffer(buffer);
        sample.SampleTime     = time;
        sample.SampleDuration = duration;

        WriteSampleWithRetry(_audioStreamIndex, sample);
        _audioSamplePosition += samples;
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

    void WriteSampleWithRetry(int streamIndex, IMFSample sample)
    {
        for (int attempt = 0; attempt < 30; attempt++)
        {
            try
            {
                _writer!.WriteSample(streamIndex, sample);
                return;
            }
            catch (COMException ex) when (ex.HResult == MF_E_NOTACCEPTING)
            {
                Thread.Sleep(5);
            }
        }
        // Drop sample instead of aborting recording (burst audio used to freeze MF).
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
