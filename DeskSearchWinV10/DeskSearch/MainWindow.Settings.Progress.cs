using System.Diagnostics;
using DeskSearch.Models;
using DeskSearch.Services;

namespace DeskSearch;

public partial class MainWindow
{
    private readonly object _rescanLock = new();
    private Stopwatch? _rescanStopwatch;
    private TimeSpan? _lastRescanElapsed;

    internal SettingsProgressSnapshot GetSettingsProgress()
    {
        if (!_indexService.IsScanComplete)
        {
            // Count needs the live store's lock, which the active scan holds while
            // writing — polling it from this UI-thread timer could block the whole
            // window. ApproximateLiveCount is lock-free and good enough for display.
            var percent = _indexService.ScanProgressPercent;
            var approxCount = _indexService.ApproximateLiveCount;
            return new SettingsProgressSnapshot
            {
                Percent = percent,
                StatusText = LocalizationService.F("Settings_IndexingStatus", percent, approxCount),
                IsIndexing = true,
                IsScanRunning = _indexService.IsScanning,
                CanResetIndex = false
            };
        }

        // No scan is writing to the live store here, so Count is cheap/uncontended.
        var count = _indexService.Count;

        SearchSession? session;
        lock (_searchSessionLock)
            session = _searchSession;

        var query = SearchBox.Text;
        if (session != null
            && !session.IsComplete
            && !string.IsNullOrWhiteSpace(query)
            && session.Query == query
            && count > 0)
        {
            var percent = (int)Math.Min(100, session.Offset * 100L / count);
            return new SettingsProgressSnapshot
            {
                Percent = percent,
                StatusText = LocalizationService.F("Settings_SearchingStatus", percent, query),
                IsSearching = true,
                CanResetIndex = _indexService.IsScanComplete && !_indexService.IsScanning
            };
        }

        TimeSpan? elapsed;
        lock (_rescanLock)
            elapsed = _lastRescanElapsed;

        var statusText = elapsed is { } value
            ? LocalizationService.F("Settings_ReadyStatusWithElapsed", count, FormatElapsed(value))
            : LocalizationService.F("Settings_ReadyStatus", count);

        return new SettingsProgressSnapshot
        {
            Percent = 100,
            StatusText = statusText,
            CanResetIndex = _indexService.IsScanComplete && !_indexService.IsScanning
        };
    }

    internal void RequestResetIndexFromSettings()
    {
        Interlocked.Increment(ref _searchGeneration);

        lock (_searchSessionLock)
            _searchSession = null;

        HideSearchResults();

        lock (_rescanLock)
        {
            _lastRescanElapsed = null;
            if (_rescanStopwatch is { IsRunning: true } stopwatch)
                stopwatch.Stop();
        }

        _indexService.ResetIndexDatabase();
    }

    internal void RequestStartIndexingFromSettings()
    {
        Interlocked.Increment(ref _searchGeneration);

        lock (_searchSessionLock)
            _searchSession = null;

        HideSearchResults();

        lock (_rescanLock)
        {
            _lastRescanElapsed = null;
            _rescanStopwatch = Stopwatch.StartNew();
        }

        _indexService.RestartScan();
    }

    internal void RequestStopIndexingFromSettings()
    {
        lock (_rescanLock)
        {
            if (_rescanStopwatch is { IsRunning: true } stopwatch)
                stopwatch.Stop();
        }

        _indexService.StopScan();
    }

    private void OnRescanIndexProgress(object? sender, IndexProgressEventArgs e)
    {
        if (!e.IsScanComplete)
            return;

        lock (_rescanLock)
        {
            if (_rescanStopwatch is not { IsRunning: true } stopwatch)
                return;

            stopwatch.Stop();
            _lastRescanElapsed = stopwatch.Elapsed;
        }
    }

    private static string FormatElapsed(TimeSpan elapsed) =>
        elapsed.TotalMinutes >= 1
            ? LocalizationService.F("Duration_MinutesSeconds", (int)elapsed.TotalMinutes, elapsed.Seconds)
            : LocalizationService.F("Duration_Seconds", elapsed.TotalSeconds);
}
