namespace MyWorkspace.Core.Models;

public sealed class EmailSettings
{
    public bool Enabled { get; set; }
    public string SmtpHost { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public bool EnableSsl { get; set; } = true;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string FromAddress { get; set; } = string.Empty;
    public string FromDisplayName { get; set; } = "MyWorkspace";

    public bool IsConfigured =>
        Enabled &&
        !string.IsNullOrWhiteSpace(SmtpHost) &&
        !string.IsNullOrWhiteSpace(FromAddress);

    public EmailSettings Clone() => new()
    {
        Enabled = Enabled,
        SmtpHost = SmtpHost,
        Port = Port,
        EnableSsl = EnableSsl,
        Username = Username,
        Password = Password,
        FromAddress = FromAddress,
        FromDisplayName = FromDisplayName
    };
}
