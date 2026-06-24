namespace DeskSearch.Services;

internal static class IndexResourcePolicy
{
    /// <summary>Yield after this many enumerated entries during a scan.</summary>
    public const int ScanYieldEveryEntries = 600;

    /// <summary>Pause length after each yield (ms).</summary>
    public const int ScanYieldDelayMs = 24;

    /// <summary>Pause after each SQLite batch commit during scanning (ms).</summary>
    public const int BatchCommitDelayMs = 8;

    /// <summary>Pause between top-level drive/root scans (ms).</summary>
    public const int ScanDrivePauseMs = 400;

    public const int ParallelScanRootCount = 1;

    public const int ProgressReportMinEntries = 25_000;
    public const int ProgressReportMinSeconds = 5;
    public const int IndexUpdatedMinEntries = 50_000;
    public const int IndexUpdatedMinSeconds = 8;

    public const int IndexUiUpdateDebounceMs = 1000;
    public const int LiveSearchRefreshDebounceMs = 3000;
    public const int SearchResultsUiMinIntervalMs = 150;

    public const int WatcherFlushDelayMs = 3000;
    public const int PeriodicResyncHours = 8;
    public const int WatcherErrorResyncDelayMinutes = 15;
    public const int LiveSearchPollMs = 750;
}