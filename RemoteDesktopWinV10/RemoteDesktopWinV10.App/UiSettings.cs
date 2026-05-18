namespace RemoteDesktopWinV10.App;

/// <summary>메뉴·UI 표시 옵션(로컬 JSON).</summary>
public sealed class UiSettings
{
    /// <summary>「보기」메뉴(전체 화면) 표시.</summary>
    public bool ShowViewMenu { get; set; } = true;

    /// <summary>「파일」에 데이터 폴더 열기 항목 표시.</summary>
    public bool ShowOpenDataFolderMenuItem { get; set; }

    /// <summary>마지막 VNC 서버 주소.</summary>
    public string? LastVncHost { get; set; }

    /// <summary>마지막 VNC 포트(없으면 5900).</summary>
    public int? LastVncPort { get; set; }

    // VNC 고급 설정(연결 시 기본 입력과 함께 적용)
    public bool VncViewOnly { get; set; }
    public bool VncShareDesktop { get; set; } = true;
    public bool VncClipboardFromServer { get; set; } = true;
    public bool VncClipboardToServer { get; set; } = true;
    public bool VncRemoteCursor { get; set; } = true;
    public bool VncAutoReconnect { get; set; }
    public string VncSizeMode { get; set; } = nameof(VncScaleMode.Zoom);
    public int VncMaxFps { get; set; }
    public bool VncUseTls { get; set; }
    public bool VncIgnoreTlsCertErrors { get; set; }

    public int RecordingFps { get; set; } = 15;
    public string? RecordingOutputFolder { get; set; }

    public VncClientSettings ToVncClientSettings()
    {
        if (!Enum.TryParse<VncScaleMode>(VncSizeMode, ignoreCase: true, out var mode))
        {
            mode = VncScaleMode.Zoom;
        }

        return new VncClientSettings
        {
            ViewOnly = VncViewOnly,
            ShareDesktop = VncShareDesktop,
            ClipboardFromServer = VncClipboardFromServer,
            ClipboardToServer = VncClipboardToServer,
            RemoteCursor = VncRemoteCursor,
            AutoReconnect = VncAutoReconnect,
            SizeMode = mode,
            MaxUpdateRate = VncMaxFps > 0 ? VncMaxFps : 15,
            UseTls = VncUseTls,
            IgnoreTlsCertErrors = VncIgnoreTlsCertErrors,
            RecordingFps = RecordingFps > 0 ? RecordingFps : 15,
            RecordingOutputFolder = RecordingOutputFolder,
        };
    }

    public void ApplyVncClientSettings(VncClientSettings settings)
    {
        VncViewOnly = settings.ViewOnly;
        VncShareDesktop = settings.ShareDesktop;
        VncClipboardFromServer = settings.ClipboardFromServer;
        VncClipboardToServer = settings.ClipboardToServer;
        VncRemoteCursor = settings.RemoteCursor;
        VncAutoReconnect = settings.AutoReconnect;
        VncSizeMode = settings.SizeMode.ToString();
        VncMaxFps = settings.MaxUpdateRate > 0 ? (int)settings.MaxUpdateRate : 0;
        VncUseTls = settings.UseTls;
        VncIgnoreTlsCertErrors = settings.IgnoreTlsCertErrors;
        RecordingFps = settings.RecordingFps > 0 ? settings.RecordingFps : 15;
        RecordingOutputFolder = settings.RecordingOutputFolder;
    }
}
