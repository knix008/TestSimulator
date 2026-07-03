using System.Diagnostics;
using System.Windows;
using DeskSearch.Models;
using DeskSearch.Services;

namespace DeskSearch;

public partial class MainWindow
{
    private readonly object _rescanLock = new();
    private Stopwatch? _rescanStopwatch;
    private TimeSpan? _lastRescanElapsed;
    private volatile bool _notifyOnIndexComplete;

    internal SettingsProgressSnapshot GetSettingsProgress()
    {
        var scanStillActive = _indexService.IsScanning
            || (_indexService.ProgressPhase != IndexProgressPhase.Idle && !_indexService.IsScanComplete);

        var indexedCount = _indexService.GetIndexedEntryCount();
        var updatedCount = _indexService.GetUpdatedEntryCount();

        if ((!_indexService.IsScanComplete || scanStillActive)
            && !(_indexService.HasStableSearchIndex && !_indexService.IsScanning && _indexService.ProgressPhase == IndexProgressPhase.Idle))
        {
            var phase = _indexService.ProgressPhase;
            var percent = _indexService.IndexDisplayPercent;
            var isPostProcessing = phase is IndexProgressPhase.Analyzing or IndexProgressPhase.Applying;
            var isScanRunning = !_indexService.IsScanComplete
                && (_indexService.IsScanning || phase != IndexProgressPhase.Idle);
            var indexingStatus = !isScanRunning && phase == IndexProgressPhase.Idle && !_indexService.HasStableSearchIndex
                ? LocalizationService.T("Settings_IndexResetStatus")
                : FormatIndexPhaseStatus(phase, percent, indexedCount, updatedCount);

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

        var count = indexedCount;

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
            ? LocalizationService.F("Settings_ReadyStatusWithElapsed", count, updatedCount, FormatElapsed(value))
            : LocalizationService.F("Settings_ReadyStatus", count, updatedCount);

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
        int indexedCount,
        long updatedCount) =>
        phase switch
        {
            IndexProgressPhase.Scanning =>
                LocalizationService.F("Settings_IndexPhaseStatus_Scanning", percent, indexedCount, updatedCount),
            IndexProgressPhase.Analyzing =>
                LocalizationService.F("Settings_IndexPhaseStatus_Analyzing", indexedCount, updatedCount),
            IndexProgressPhase.Applying =>
                LocalizationService.F("Settings_IndexPhaseStatus_Applying", indexedCount, updatedCount),
            _ => LocalizationService.F("Settings_IndexingStatus", percent, indexedCount, updatedCount)
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

    internal void RequestResetIndexFromSettings(ResetScope scope)
    {
        _notifyOnIndexComplete = false;

        InvalidateSearchForIndexRebuild();

        lock (_rescanLock)
        {
            _lastRescanElapsed = null;
            if (_rescanStopwatch is { IsRunning: true } stopwatch)
                stopwatch.Stop();
        }

        _indexService.ResetIndexDatabase();

        if (scope != ResetScope.IndexDatabaseAndSettings)
            return;

        _settingsService.ResetToDefaults();
        _settingsService.Save(_settingsService.Current);
        ApplySettings(_settingsService.Current);
        RestoreWindowLayout();
        _indexService.ConfigureIndexScope(_settingsService.Current);
        _watcherService.Start();
        RefreshLocalization();
        _openSettingsWindow?.ApplyFactorySettings(_settingsService.Current);
    }

    internal void RequestStartIndexingFromSettings()
    {
        var phase = _indexService.ProgressPhase;
        if (phase is IndexProgressPhase.Analyzing or IndexProgressPhase.Applying)
            return;

        if (!_indexService.HasStableSearchIndex)
            InvalidateSearchForIndexRebuild();

        _notifyOnIndexComplete = true;

        lock (_rescanLock)
        {
            _lastRescanElapsed = null;
            _rescanStopwatch = Stopwatch.StartNew();
        }

        _indexService.RestartScan();
    }

    internal void RequestStopIndexingFromSettings()
    {
        _notifyOnIndexComplete = false;

        lock (_rescanLock)
        {
            if (_rescanStopwatch is { IsRunning: true } stopwatch)
                stopwatch.Stop();
        }

        _indexService.StopScan();
    }

    internal void HandleIndexProgressCompletion(int indexedCount)
    {
        if (!_notifyOnIndexComplete)
            return;

        _notifyOnIndexComplete = false;

        var updatedCount = _indexService.LastScanUpdatedCount;

        TimeSpan? elapsed;
        lock (_rescanLock)
            elapsed = _lastRescanElapsed;

        var message = elapsed is { } value
            ? LocalizationService.F("IndexComplete_Message", indexedCount, updatedCount, FormatElapsed(value))
            : LocalizationService.F("IndexComplete_MessageNoElapsed", indexedCount, updatedCount);

        Window? owner = null;
        if (_openSettingsWindow is { IsVisible: true })
            owner = _openSettingsWindow;
        else if (IsVisible)
            owner = this;

        var dialog = new IndexCompleteDialog(message);
        if (owner is not null)
            dialog.Owner = owner;

        dialog.ShowDialog();
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
