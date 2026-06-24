namespace DeskSearch.Services;

internal static class IndexResourcePolicy
{
    public const int ScanYieldEveryEntries = 4000;
    public const int ScanYieldDelayMs = 8;
    public const int ParallelScanRootCount = 1;

    public const int ProgressReportMinEntries = 10_000;
    public const int ProgressReportMinSeconds = 3;
    public const int IndexUpdatedMinEntries = 20_000;
    public const int IndexUpdatedMinSeconds = 5;

    public const int IndexUiUpdateDebounceMs = 800;
    public const int LiveSearchRefreshDebounceMs = 2000;
    public const int SearchResultsUiMinIntervalMs = 150;

    public const int WatcherFlushDelayMs = 2000;
    public const int PeriodicResyncHours = 4;
    public const int WatcherErrorResyncDelayMinutes = 10;
    public const int LiveSearchPollMs = 500;
}
