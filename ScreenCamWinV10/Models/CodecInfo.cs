namespace ScreenCamWin.Models;

// Xvid and other 32-bit VFW codecs are excluded: this app targets x64 only.
public enum VideoCodecKind { Mjpeg, Uncompressed, H264_MF }

public class CodecInfo
{
    public VideoCodecKind Kind        { get; init; }
    public string         DisplayName { get; init; } = string.Empty;
    public string         FourCC      { get; init; } = string.Empty;
    public bool           IsBuiltIn   { get; init; }
    public string?        DirectDownloadUrl { get; init; }
    public string?        DownloadPageUrl   { get; init; }

    public override string ToString() => DisplayName;

    public static readonly CodecInfo Mjpeg = new()
    {
        Kind = VideoCodecKind.Mjpeg, DisplayName = "MJPEG (내장, .avi)",
        FourCC = "MJPG", IsBuiltIn = true,
    };
    public static readonly CodecInfo H264MF = new()
    {
        Kind = VideoCodecKind.H264_MF, DisplayName = "H.264 (Windows 내장, .mp4)",
        FourCC = "", IsBuiltIn = true,
    };
    public static readonly CodecInfo Uncompressed = new()
    {
        Kind = VideoCodecKind.Uncompressed, DisplayName = "무압축 RGB (.avi, 용량 큼)",
        FourCC = "", IsBuiltIn = true,
    };
    public static IReadOnlyList<CodecInfo> All { get; } =
        [Mjpeg, H264MF, Uncompressed];
}
