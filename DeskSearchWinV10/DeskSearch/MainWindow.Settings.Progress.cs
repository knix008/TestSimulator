using DeskSearch.Models;
using DeskSearch.Services;

namespace DeskSearch;

public partial class MainWindow
{
    internal SettingsProgressSnapshot GetSettingsProgress()
    {
        var count = _indexService.Count;

        if (!_indexService.IsScanComplete)
        {
            var percent = _indexService.ScanProgressPercent;
            return new SettingsProgressSnapshot
            {
                Percent = percent,
                StatusText = LocalizationService.F("Settings_IndexingStatus", percent, count),
                IsIndexing = true
            };
        }

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
                IsSearching = true
            };
        }

        return new SettingsProgressSnapshot
        {
            Percent = 100,
            StatusText = LocalizationService.F("Settings_ReadyStatus", count)
        };
    }

    internal void RequestReSearchFromSettings()
    {
        Interlocked.Increment(ref _searchGeneration);

        lock (_searchSessionLock)
            _searchSession = null;

        HideSearchResults();

        _indexService.RestartScan();
    }
}
