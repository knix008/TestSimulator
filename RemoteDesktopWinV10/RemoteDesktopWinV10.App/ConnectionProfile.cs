using System.Text.Json.Serialization;

namespace RemoteDesktopWinV10.App;

public enum RemoteDesktopProtocol
{
    Rdp,
    Vnc,
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

    public ConnectionProfile Clone()
    {
        return new ConnectionProfile
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
        };
    }
}
