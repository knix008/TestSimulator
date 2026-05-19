using RemoteViewing.Vnc;
using RemoteViewing.Windows.Forms;

namespace RemoteDesktopWinV10.App;

/// <summary>연결 시 사용할 VNC 클라이언트 설정 묶음. 프로필 또는 다이얼로그에서 채워진다.</summary>
public sealed record VncClientSettings
{
    public bool ViewOnly { get; init; } = false;
    public bool ShareDesktop { get; init; } = true;
    public bool ClipboardFromServer { get; init; } = true;
    public bool ClipboardToServer { get; init; } = true;
    public bool RemoteCursor { get; init; } = true;
    public bool AutoReconnect { get; init; } = false;
    public VncScaleMode SizeMode { get; init; } = VncScaleMode.Zoom;
    /// <summary>라이브러리 기본값은 15 fps. 0 이하이면 기본값 유지.</summary>
    public double MaxUpdateRate { get; init; } = 15;
    public bool UseTls { get; init; } = false;
    /// <summary>서버가 자체서명 인증서를 사용할 때 true로 설정.</summary>
    public bool IgnoreTlsCertErrors { get; init; } = false;

    /// <summary>녹화 프레임률(초당 프레임).</summary>
    public int RecordingFps { get; init; } = 15;

    /// <summary>녹화 파일 저장 폴더(비어 있으면 동영상/Videos 하위).</summary>
    public string? RecordingOutputFolder { get; init; }

    public static VncClientSettings Default { get; } = new();

    public static VncClientSettings FromProfile(ConnectionProfile p) => new()
    {
        ViewOnly = p.VncViewOnly ?? false,
        ShareDesktop = p.VncShareDesktop ?? true,
        ClipboardFromServer = p.VncClipboardFromServer ?? true,
        ClipboardToServer = p.VncClipboardToServer ?? true,
        RemoteCursor = p.VncRemoteCursor ?? true,
        AutoReconnect = p.VncAutoReconnect ?? false,
        SizeMode = p.VncSizeMode ?? VncScaleMode.Zoom,
        MaxUpdateRate = (double)(p.VncMaxFps ?? 0),  // 0 = 기본값
        UseTls = p.VncUseTls ?? false,
        IgnoreTlsCertErrors = p.VncIgnoreTlsCertErrors ?? false,
    };
}

/// <summary>TightVNC 및 일반 RFB 3.x 서버에 맞춘 클라이언트 기본값.</summary>
public static class VncConnectionDefaults
{
    /// <summary>표시 번호 :0 의 일반 포트.</summary>
    public const int DefaultPort = 5900;

    /// <summary>VncClientConnectOptions에 설정을 적용한다.</summary>
    public static void ApplyTo(VncClientConnectOptions options, VncClientSettings settings)
    {
        ArgumentNullException.ThrowIfNull(options);
        options.ShareDesktop = settings.ShareDesktop;
        options.AutoReconnect = settings.AutoReconnect;
        // PixelFormat 은 null → 서버와 협상(기본 동작)
    }

    /// <summary>VncControl의 입력·클립보드·커서·화면 맞춤·FPS 설정을 적용한다. UI 스레드에서 호출해야 한다.</summary>
    public static void ApplyControlSettings(VncControl control, VncClientSettings settings)
    {
        ArgumentNullException.ThrowIfNull(control);
        control.AllowInput = !settings.ViewOnly;
        control.AllowClipboardSharingFromServer = settings.ClipboardFromServer;
        control.AllowClipboardSharingToServer = settings.ClipboardToServer;
        control.AllowRemoteCursor = settings.RemoteCursor;
        control.SizeMode = settings.SizeMode switch
        {
            VncScaleMode.Stretch => VncControlSizeMode.Stretch,
            VncScaleMode.Clip => VncControlSizeMode.Clip,
            VncScaleMode.AutoSize => VncControlSizeMode.AutoSize,
            VncScaleMode.Center => VncControlSizeMode.Center,
            _ => VncControlSizeMode.Zoom,
        };
        if (settings.MaxUpdateRate > 0)
        {
            control.Client.MaxUpdateRate = settings.MaxUpdateRate;
        }
    }
}
