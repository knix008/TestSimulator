using ScreenCamWin.Models;

namespace ScreenCamWin.Core;

public enum CodecStatus
{
    Available,
}

public static class CodecManager
{
    public static bool IsCodecAvailable(CodecInfo codec)
        => GetCodecStatus(codec) == CodecStatus.Available;

    public static CodecStatus GetCodecStatus(CodecInfo codec)
        => CodecStatus.Available;
}
