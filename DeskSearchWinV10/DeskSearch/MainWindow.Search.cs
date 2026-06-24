using System.Windows;
using DeskSearch.Models;
using DeskSearch.Services;

namespace DeskSearch;

public partial class MainWindow
{
    private readonly object _searchSessionLock = new();
    private SearchSession? _searchSession;
    private int _searchGeneration;

    private void PerformSearch()
    {
        if (!_indexService.IsSearchEnabled)
            return;

        var query = SearchBox.Text;
        var caseSensitive = _settingsService.Current.CaseSensitiveSearch;

        if (string.IsNullOrWhiteSpace(query))
        {
            Interlocked.Increment(ref _searchGeneration);
            lock (_searchSessionLock)
                _searchSession = null;

            ApplySearchResults([], _searchGeneration, query);
            return;
        }

        var generation = Interlocked.Increment(ref _searchGeneration);
        var session = GetOrCreateSearchSession(query, caseSensitive);
        Task.Run(() => RunSearchLoop(session, generation));
    }

    private SearchSession GetOrCreateSearchSession(string query, bool caseSensitive)
    {
        lock (_searchSessionLock)
        {
            if (_searchSession != null
                && _searchSession.Query == query
                && _searchSession.CaseSensitive == caseSensitive
                && !_searchSession.IsComplete)
            {
                return _searchSession;
            }

            _searchSession = new SearchSession
            {
                Query = query,
                CaseSensitive = caseSensitive,
                Offset = 0,
                IsComplete = false
            };
            return _searchSession;
        }
    }

    private void RunSearchLoop(SearchSession session, int generation)
    {
        while (true)
        {
            if (generation != Volatile.Read(ref _searchGeneration))
                return;

            int startOffset;
            List<(FileEntry Entry, int Score)> candidates;
            lock (_searchSessionLock)
            {
                if (!ReferenceEquals(_searchSession, session))
                    return;

                startOffset = session.Offset;
                candidates = session.TopCandidates;
            }

            var batch = _indexService.SearchBatch(
                session.Query,
                session.CaseSensitive,
                startOffset,
                FileSearchService.DefaultBatchSize,
                candidates);

            if (generation != Volatile.Read(ref _searchGeneration))
                return;

            lock (_searchSessionLock)
            {
                if (!ReferenceEquals(_searchSession, session))
                    return;

                session.Offset = batch.NextOffset;
                session.IsComplete = batch.IsComplete;
                session.TopCandidates = batch.TopCandidates;
            }

            Dispatcher.BeginInvoke(() => ApplySearchResults(batch.Results, generation, session.Query));

            if (batch.IsComplete)
                break;

            Thread.Sleep(1);
        }
    }

    private void ApplySearchResults(IReadOnlyList<FileEntry> results, int generation, string query)
    {
        if (generation != _searchGeneration || query != SearchBox.Text)
            return;

        ResultsList.ItemsSource = results;
        ResultsList.Visibility = results.Count > 0 ? Visibility.Visible : Visibility.Collapsed;

        if (results.Count > 0)
            ResultsList.SelectedIndex = 0;

        AdjustWindowHeightForContent();
    }

    private void RefreshSearchIfNeeded()
    {
        if (!string.IsNullOrWhiteSpace(SearchBox.Text))
            PerformSearch();
    }
}
