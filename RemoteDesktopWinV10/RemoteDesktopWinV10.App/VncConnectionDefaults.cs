using RemoteViewing.Vnc;

namespace RemoteDesktopWinV10.App;

/// <summary>
/// TightVNC 및 일반 RFB 3.x 서버(Windows 로컬 테스트 포함)에 맞춘 클라이언트 기본값.
/// </summary>
public static class VncConnectionDefaults
{
    /// <summary>표시 번호 :0 일 때 일반적인 포트 (TightVNC 기본 서비스).</summary>
    public const int DefaultPort = 5900;

    /// <summary>
    /// true: 이미 연결된 다른 뷰어와 화면을 공유(RFB shared-flag). TightVNC에서 흔한 기본 동작에 맞춥니다.
    /// 독점 접속이 필요하면 false로 바꿀 수 있게 향후 옵션으로 노출할 수 있습니다.
    /// </summary>
    public const bool ShareDesktop = true;

    /// <summary>
    /// 자동 재연결은 라이브러리에서 실험적 기능으로 표시되어 있어 끈 상태를 유지합니다.
    /// </summary>
    public const bool AutoReconnect = false;

    /// <summary>
    /// <see cref="VncClientConnectOptions"/>에 TightVNC/일반 서버에 무난한 값을 넣습니다.
    /// 암호는 호출부에서 <see cref="VncClientConnectOptions.Password"/>에 넣습니다(null 이 아닌 빈 배열은 ‘빈 암호’ VNC 인증용).
    /// </summary>
    public static void ApplyTo(VncClientConnectOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);
        options.ShareDesktop = ShareDesktop;
        options.AutoReconnect = AutoReconnect;
        // PixelFormat 은 null 이면 서버와 협상(기본 동작).
    }
}
