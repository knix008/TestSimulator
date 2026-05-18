using System.Text.Json.Serialization;

namespace RemoteDesktopWinV10.App;

public enum RemoteDesktopProtocol
{
    Rdp,
    Vnc,
}

public enum VncScaleMode
{
    Zoom,
    Stretch,
    Clip,
    AutoSize,
    Center,
}

public sealed class ConnectionProfile
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public string Name { get; set; } = "";

    public RemoteDesktopProtocol Protocol { get; set; }

    public string Host { get; set; } = "";

    public int Port { get; set; }

    public string User { get; set; } = "";

    /// <summary>DPAPI(CurrentUser)로 보호된 UTF-8 암호. 없으면 연결 시마다 입력.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? EncryptedPasswordBase64 { get; set; }

    // RDP 옵션
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? CredSspEnabled { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? NegotiateSecurityLayer { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? RelaxedCertificateValidation { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? RdpRedirectClipboard { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? RdpRedirectDrives { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? RdpRedirectPrinters { get; set; }

    // VNC 옵션
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? VncViewOnly { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? VncShareDesktop { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? VncClipboardFromServer { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? VncClipboardToServer { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? VncRemoteCursor { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? VncAutoReconnect { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public VncScaleMode? VncSizeMode { get; set; }

    // VNC 원거리 옵션
    /// <summary>null = 라이브러리 기본값(15 fps). 실제 FPS 값(5/10/15/30)을 저장.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public int? VncMaxFps { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? VncUseTls { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? VncIgnoreTlsCertErrors { get; set; }

    public ConnectionProfile Clone() => new()
    {
        Id = Id,
        Name = Name,
        Protocol = Protocol,
        Host = Host,
        Port = Port,
        User = User,
        EncryptedPasswordBase64 = EncryptedPasswordBase64,
        CredSspEnabled = CredSspEnabled,
        NegotiateSecurityLayer = NegotiateSecurityLayer,
        RelaxedCertificateValidation = RelaxedCertificateValidation,
        RdpRedirectClipboard = RdpRedirectClipboard,
        RdpRedirectDrives = RdpRedirectDrives,
        RdpRedirectPrinters = RdpRedirectPrinters,
        VncViewOnly = VncViewOnly,
        VncShareDesktop = VncShareDesktop,
        VncClipboardFromServer = VncClipboardFromServer,
        VncClipboardToServer = VncClipboardToServer,
        VncRemoteCursor = VncRemoteCursor,
        VncAutoReconnect = VncAutoReconnect,
        VncSizeMode = VncSizeMode,
        VncMaxFps = VncMaxFps,
        VncUseTls = VncUseTls,
        VncIgnoreTlsCertErrors = VncIgnoreTlsCertErrors,
    };
}
