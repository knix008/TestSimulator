namespace DeskSearch.Services;

internal static class IndexResourcePolicy
{
    public const int ScanYieldEveryEntries = 2000;
    public const int ScanYieldDelayMs = 15;
    public const int WatcherFlushDelayMs = 2000;
    public const int PeriodicResyncHours = 4;
    public const int WatcherErrorResyncDelayMinutes = 10;
    public const int LiveSearchPollMs = 250;
}
