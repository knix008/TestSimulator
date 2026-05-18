namespace ScreenCamWin.Models;

// Xvid is excluded: the official installer only provides a 32-bit (x86) build,
// which cannot be loaded by this 64-bit application.
public enum VideoCodecKind { Mjpeg, Uncompressed, H264_MF, X264 }

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
    public static readonly CodecInfo X264 = new()
    {
        Kind = VideoCodecKind.X264, DisplayName = "x264vfw 64bit (.avi)",
        FourCC = "x264",
        // x264vfw_x64.exe is the 64-bit installer — must be selected explicitly on SourceForge.
        DirectDownloadUrl = null,
        DownloadPageUrl   = "https://sourceforge.net/projects/x264vfw/files/x264vfw/",
    };

    public static IReadOnlyList<CodecInfo> All { get; } =
        [Mjpeg, H264MF, Uncompressed, X264];
}
