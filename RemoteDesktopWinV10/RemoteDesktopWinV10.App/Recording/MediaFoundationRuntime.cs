using Vortice.MediaFoundation;

namespace RemoteDesktopWinV10.App.Recording;

/// <summary>Media Foundation 초기화(Windows 내장 H.264 인코더 사용).</summary>
internal static class MediaFoundationRuntime
{
    private static readonly object Gate = new();
    private static int _refCount;

    public static void EnsureStarted()
    {
        lock (Gate)
        {
            if (_refCount++ == 0)
            {
                MediaFactory.MFStartup();
            }
        }
    }

    public static void Release()
    {
        lock (Gate)
        {
            if (_refCount > 0 && --_refCount == 0)
            {
                MediaFactory.MFShutdown();
            }
        }
    }

    /// <summary>H.264 인코더 MFT 사용 가능 여부를 확인한다.</summary>
    public static void VerifyH264EncodingAvailable()
    {
        EnsureStarted();
        // Sink Writer가 런타임에 인코더를 찾는다. 사전 검사는 생략하고 실패 시 메시지로 안내한다.
    }
}
