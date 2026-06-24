namespace DeskSearch.Services;

internal static class IndexResourcePolicy
{
    public const int ScanYieldEveryEntries = 1000;
    public const int ScanYieldDelayMs = 10;
    public const int WatcherFlushDelayMs = 2000;
    public const int PeriodicResyncHours = 4;
    public const int WatcherErrorResyncDelayMinutes = 10;
    public const int LiveSearchPollMs = 150;
}
