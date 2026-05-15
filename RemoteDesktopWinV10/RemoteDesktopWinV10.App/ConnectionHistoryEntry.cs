namespace RemoteDesktopWinV10.App;

public sealed class ConnectionHistoryEntry
{
    public RemoteDesktopProtocol Protocol { get; set; }

    public string Host { get; set; } = "";

    public int Port { get; set; }

    public DateTimeOffset LastUsed { get; set; }
}
