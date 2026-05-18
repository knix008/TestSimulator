using System.Runtime.InteropServices;
using Vortice.MediaFoundation;

namespace RemoteDesktopWinV10.App.Recording;

/// <summary>Windows Media Foundation Sink Writer — H.264 MP4.</summary>
internal sealed class H264Mp4Recorder : IDisposable
{
    private const long TicksPerSecond = 10_000_000;

    private readonly int _width;
    private readonly int _height;
    private readonly int _fps;
    private readonly int _stride;
    private readonly int _frameBytes;
    private readonly long _frameDurationTicks;

    private IMFSinkWriter? _sinkWriter;
    private int _streamIndex;
    private long _frameIndex;
    private bool _disposed;

    public string OutputPath { get; }

    public H264Mp4Recorder(string outputPath, int width, int height, int fps)
    {
        OutputPath = Path.GetFullPath(outputPath);
        _width = AlignEven(width);
        _height = AlignEven(height);
        _fps = Math.Max(1, fps);
        _stride = _width * 4;
        _frameBytes = _stride * _height;
        _frameDurationTicks = TicksPerSecond / _fps;
    }

    public static int AlignEven(int value) => value <= 0 ? value : value & ~1;

    public void Initialize()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
        if (_width < 2 || _height < 2)
        {
            throw new InvalidOperationException("녹화 해상도가 너무 작습니다. 가로·세로는 각각 2픽셀 이상이어야 합니다.");
        }

        MediaFoundationRuntime.EnsureStarted();

        using var attributes = MediaFactory.MFCreateAttributes(1);
        attributes.Set(SinkWriterAttributeKeys.ReadwriteEnableHardwareTransforms, 1u);

        _sinkWriter = MediaFactory.MFCreateSinkWriterFromURL(OutputPath, null, attributes);

        using var outputType = MediaFactory.MFCreateMediaType();
        outputType.Set(MediaTypeAttributeKeys.MajorType, MediaTypeGuids.Video);
        outputType.Set(MediaTypeAttributeKeys.Subtype, MediaFoundationGuids.VideoH264);
        var bitrate = (uint)Math.Clamp(_width * _height * _fps, 1_000_000, 25_000_000);
        outputType.Set(MediaTypeAttributeKeys.AvgBitrate, bitrate);
        outputType.Set(MediaTypeAttributeKeys.InterlaceMode, (uint)VideoInterlaceMode.Progressive);
        outputType.Set(MediaTypeAttributeKeys.FrameSize, PackSize(_width, _height));
        outputType.Set(MediaTypeAttributeKeys.FrameRate, PackRatio(_fps, 1));
        outputType.Set(MediaTypeAttributeKeys.PixelAspectRatio, PackRatio(1, 1));

        _streamIndex = _sinkWriter.AddStream(outputType);

        using var inputType = MediaFactory.MFCreateMediaType();
        inputType.Set(MediaTypeAttributeKeys.MajorType, MediaTypeGuids.Video);
        inputType.Set(MediaTypeAttributeKeys.Subtype, VideoFormatGuids.Rgb32);
        inputType.Set(MediaTypeAttributeKeys.InterlaceMode, (uint)VideoInterlaceMode.Progressive);
        inputType.Set(MediaTypeAttributeKeys.FrameSize, PackSize(_width, _height));
        inputType.Set(MediaTypeAttributeKeys.FrameRate, PackRatio(_fps, 1));
        inputType.Set(MediaTypeAttributeKeys.PixelAspectRatio, PackRatio(1, 1));
        inputType.Set(MediaTypeAttributeKeys.DefaultStride, _stride);
        inputType.Set(MediaTypeAttributeKeys.SampleSize, (uint)_frameBytes);

        _sinkWriter.SetInputMediaType(_streamIndex, inputType, null);
        _sinkWriter.BeginWriting();
    }

    public void WriteFrame(byte[] frameBytes)
    {
        if (_sinkWriter == null)
        {
            throw new InvalidOperationException("녹화기가 초기화되지 않았습니다.");
        }

        if (frameBytes.Length < _frameBytes)
        {
            throw new ArgumentException("프레임 버퍼 크기가 올바르지 않습니다.", nameof(frameBytes));
        }

        using var buffer = MediaFactory.MFCreateMemoryBuffer(_frameBytes);
        buffer.Lock(out IntPtr dest, out var maxLen, out _);
        if (maxLen < _frameBytes)
        {
            buffer.Unlock();
            throw new InvalidOperationException("Media Foundation 버퍼 크기가 부족합니다.");
        }

        try
        {
            Marshal.Copy(frameBytes, 0, dest, _frameBytes);
        }
        finally
        {
            buffer.Unlock();
        }

        buffer.CurrentLength = _frameBytes;

        using var sample = MediaFactory.MFCreateSample();
        sample.AddBuffer(buffer);
        sample.SampleTime = _frameDurationTicks * _frameIndex;
        sample.SampleDuration = _frameDurationTicks;
        if (_frameIndex == 0)
        {
            sample.Set(SampleAttributeKeys.CleanPoint, 1u);
        }

        _sinkWriter.WriteSample(_streamIndex, sample);
        _frameIndex++;
    }

    public void FinalizeRecording()
    {
        if (_sinkWriter == null)
        {
            return;
        }

        var writer = _sinkWriter;
        _sinkWriter = null;
        writer.Finalize();
        writer.Dispose();
    }

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        try
        {
            FinalizeRecording();
        }
        catch
        {
            // ignore finalize errors on dispose
        }

        MediaFoundationRuntime.Release();
    }

    private static ulong PackSize(int width, int height) =>
        ((ulong)(uint)width << 32) | (uint)height;

    private static ulong PackRatio(int numerator, int denominator) =>
        ((ulong)(uint)numerator << 32) | (uint)denominator;
}
