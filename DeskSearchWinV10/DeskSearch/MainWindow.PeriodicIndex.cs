using System.Windows.Threading;
using DeskSearch.Models;
using DeskSearch.Services;

namespace DeskSearch;

public partial class MainWindow
{
    private DispatcherTimer? _periodicIndexTimer;
    private bool _periodicIndexSeeded;

    private void ConfigurePeriodicIndexing(AppSettings settings)
    {
        SeedLastFullIndexIfNeeded(settings);

        var hours = AppSettings.NormalizePeriodicIndexIntervalHours(settings.PeriodicIndexIntervalHours);
        if (hours <= 0)
        {
            _periodicIndexTimer?.Stop();
            return;
        }

        _periodicIndexTimer ??= new DispatcherTimer(
            TimeSpan.FromMinutes(5),
            DispatcherPriority.Background,
            (_, _) => MaybeStartDuePeriodicIndex(),
            Dispatcher);

        if (!_periodicIndexTimer.IsEnabled)
            _periodicIndexTimer.Start();

        MaybeStartDuePeriodicIndex();
    }

    private void SeedLastFullIndexIfNeeded(AppSettings settings)
    {
        if (_periodicIndexSeeded)
            return;

        _periodicIndexSeeded = true;

        if (settings.LastFullIndexCompletedUtc is not null)
            return;

        if (!_indexService.HasStableSearchIndex)
            return;

        // Existing installs: avoid an immediate surprise re-index after upgrade.
        var updated = _settingsService.Current.Clone();
        updated.LastFullIndexCompletedUtc = DateTime.UtcNow;
        ApplyCurrentWindowLayout(updated);
        _settingsService.Save(updated);
    }

    private void OnFullIndexRebuildCompleted(object? sender, EventArgs e)
    {
        SafeBeginInvoke(() =>
        {
            var settings = _settingsService.Current.Clone();
            settings.LastFullIndexCompletedUtc = DateTime.UtcNow;
            ApplyCurrentWindowLayout(settings);
            _settingsService.Save(settings);
        });
    }

    private void MaybeStartDuePeriodicIndex()
    {
        if (!IsLoaded)
            return;

        var settings = _settingsService.Current;
        var hours = AppSettings.NormalizePeriodicIndexIntervalHours(settings.PeriodicIndexIntervalHours);
        if (hours <= 0)
            return;

        if (_indexService.IsScanning || !_indexService.IsScanComplete)
            return;

        if (!_indexService.HasStableSearchIndex)
            return;

        var lastCompleted = settings.LastFullIndexCompletedUtc;
        if (lastCompleted is null)
            return;

        if (DateTime.UtcNow - lastCompleted.Value < TimeSpan.FromHours(hours))
            return;

        // Scheduled runs do not show the completion dialog used for manual Index.
        _notifyOnIndexComplete = false;
        _indexService.RestartScan();
    }
}
