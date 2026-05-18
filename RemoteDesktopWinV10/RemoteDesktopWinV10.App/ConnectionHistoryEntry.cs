namespace RemoteDesktopWinV10.App;

public sealed class ConnectionHistoryEntry
{
    public string Host { get; set; } = "";

    public int Port { get; set; }

    public DateTimeOffset LastUsed { get; set; }
}
