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
        var scanStillActive = _indexService.IsScanning
            || _indexService.ProgressPhase != IndexProgressPhase.Idle;

        if (!_indexService.IsScanComplete || scanStillActive)
        {
            var phase = _indexService.ProgressPhase;
            var indexedCount = _indexService.ScanIndexedCount;
            var percent = _indexService.IndexDisplayPercent;
            var isPostProcessing = phase is IndexProgressPhase.Analyzing or IndexProgressPhase.Applying;
            var isScanRunning = phase == IndexProgressPhase.Scanning && _indexService.IsScanning;
            var indexingStatus = !isScanRunning && phase == IndexProgressPhase.Idle && !_indexService.HasStableSearchIndex
                ? LocalizationService.T("Settings_IndexResetStatus")
                : FormatIndexPhaseStatus(phase, percent, indexedCount);

            return new SettingsProgressSnapshot
            {
                Percent = percent,
                PhaseText = FormatIndexPhaseLabel(phase, _indexService.ScanUsesShadowBuild),
                StatusText = indexingStatus,
                IsIndexing = true,
                IsScanRunning = isScanRunning,
                IsPostProcessing = isPostProcessing,
                CanResetIndex = false
            };
        }

        if (!_indexService.HasStableSearchIndex)
        {
            return new SettingsProgressSnapshot
            {
                Percent = 0,
                StatusText = LocalizationService.T("Settings_IndexResetStatus"),
                IsIndexing = true,
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

    private static string FormatIndexPhaseLabel(IndexProgressPhase phase, bool usesShadowBuild)
    {
        if (phase == IndexProgressPhase.Idle)
            return string.Empty;

        var (step, total) = GetPhaseStepNumbers(phase, usesShadowBuild);
        var phaseName = phase switch
        {
            IndexProgressPhase.Scanning => LocalizationService.T("Settings_IndexPhaseName_Scanning"),
            IndexProgressPhase.Analyzing => LocalizationService.T("Settings_IndexPhaseName_Analyzing"),
            IndexProgressPhase.Applying => LocalizationService.T("Settings_IndexPhaseName_Applying"),
            _ => string.Empty
        };

        return LocalizationService.F("Settings_IndexPhaseLabel", step, total, phaseName);
    }

    private static string FormatIndexPhaseStatus(
        IndexProgressPhase phase,
        int percent,
        long indexedCount) =>
        phase switch
        {
            IndexProgressPhase.Scanning =>
                LocalizationService.F("Settings_IndexPhaseStatus_Scanning", percent, indexedCount),
            IndexProgressPhase.Analyzing =>
                LocalizationService.F("Settings_IndexPhaseStatus_Analyzing", indexedCount),
            IndexProgressPhase.Applying =>
                LocalizationService.F("Settings_IndexPhaseStatus_Applying", indexedCount),
            _ => LocalizationService.F("Settings_IndexingStatus", percent, indexedCount)
        };

    private static (int step, int total) GetPhaseStepNumbers(IndexProgressPhase phase, bool usesShadowBuild)
    {
        var total = usesShadowBuild ? 3 : 2;
        var step = phase switch
        {
            IndexProgressPhase.Scanning => 1,
            IndexProgressPhase.Analyzing => 2,
            IndexProgressPhase.Applying => 3,
            _ => total
        };
        return (step, total);
    }

    internal void RequestResetIndexFromSettings()
    {
        InvalidateSearchForIndexRebuild();

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
        InvalidateSearchForIndexRebuild();

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
