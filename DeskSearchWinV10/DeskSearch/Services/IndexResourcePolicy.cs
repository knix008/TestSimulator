namespace DeskSearch.Services;

internal static class IndexResourcePolicy
{
    // System/GUI responsiveness while indexing matters more than indexing throughput,
    // but the main lever for that is now BackgroundThreadMode (OS-level CPU/IO/memory
    // deprioritization on the scanning threads) rather than these manual sleeps — so
    // they're tuned closer to throughput, not maximal yielding.

    /// <summary>Yield after this many enumerated entries during a scan.</summary>
    public const int ScanYieldEveryEntries = 400;

    /// <summary>Pause length after each yield (ms).</summary>
    public const int ScanYieldDelayMs = 15;

    /// <summary>Pause after each SQLite batch commit during scanning (ms).</summary>
    public const int BatchCommitDelayMs = 5;

    /// <summary>Pause between top-level drive/root scans (ms).</summary>
    public const int ScanDrivePauseMs = 200;

    /// <summary>Max number of top-level roots (e.g. drives) scanned concurrently during a full scan.</summary>
    public const int MaxParallelRootScans = 3;

    /// <summary>Pause before retrying a failed or interrupted full scan (ms).</summary>
    public const int FailedScanRetryDelayMs = 8_000;

    /// <summary>
    /// Minimum fraction of the previous live index entry count required before a shadow
    /// build may replace <c>index.db</c>. Prevents promoting an incomplete re-index.
    /// </summary>
    public const double MinPromoteEntryCountRatio = 0.90;

    public const int ProgressReportMinEntries = 25_000;
    public const int ProgressReportMinSeconds = 5;
    /// <summary>Indexed entries needed within one root scan to approach that step's share of 100%.</summary>
    public const int ScanStepProgressEntryScale = 25_000;
    public const int IndexUpdatedMinEntries = 50_000;
    public const int IndexUpdatedMinSeconds = 8;

    public const int IndexUiUpdateDebounceMs = 1000;
    public const int LiveSearchRefreshDebounceMs = 3000;
    public const int SearchResultsUiMinIntervalMs = 150;

    public const int WatcherFlushDelayMs = 3000;
    public const int WatcherErrorResyncDelayMinutes = 15;
    public const int LiveSearchPollMs = 750;

    public const int SettingsProgressPollMs = 1000;
    public const int SettingsScrollResumeDebounceMs = 180;
    public const int SettingsFocusRestoreDebounceMs = 120;
}