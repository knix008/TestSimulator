using DeskSearch.Helpers;
using DeskSearch.Models;
using DeskSearch.Services;

namespace DeskSearch;

public partial class MainWindow
{
    private readonly object _searchSessionLock = new();
    private SearchSession? _searchSession;
    private int _searchGeneration;
    private DebounceDispatcher? _liveSearchRefreshDebounce;

    private DebounceDispatcher LiveSearchRefreshDebounce =>
        _liveSearchRefreshDebounce ??= new DebounceDispatcher(Dispatcher, delayMs: 300);

    private void PerformSearch()
    {
        var query = SearchBox.Text;
        var caseSensitive = _settingsService.Current.CaseSensitiveSearch;
        var useRegex = _settingsService.Current.UseRegexSearch;

        if (string.IsNullOrWhiteSpace(query))
        {
            Interlocked.Increment(ref _searchGeneration);
            lock (_searchSessionLock)
                _searchSession = null;

            ApplySearchResults([], _searchGeneration, query);
            return;
        }

        var generation = Interlocked.Increment(ref _searchGeneration);
        var session = GetOrCreateSearchSession(query, caseSensitive, useRegex);
        Task.Run(() => RunSearchLoop(session, generation));
    }

    private SearchSession GetOrCreateSearchSession(string query, bool caseSensitive, bool useRegex)
    {
        lock (_searchSessionLock)
        {
            if (_searchSession != null
                && _searchSession.Query == query
                && _searchSession.CaseSensitive == caseSensitive
                && _searchSession.UseRegexSearch == useRegex
                && !_searchSession.IsComplete)
            {
                return _searchSession;
            }

            var previousTop = _searchSession is not null
                && _searchSession.Query == query
                && _searchSession.CaseSensitive == caseSensitive
                && _searchSession.UseRegexSearch == useRegex
                ? _searchSession.TopCandidates
                : null;

            var normalizedQuery = SearchTextHelper.Normalize(query.Trim());
            var isInvalidRegex = false;
            System.Text.RegularExpressions.Regex? regex = null;

            if (useRegex)
            {
                if (!SearchTextHelper.TryCreateRegex(normalizedQuery, caseSensitive, out regex))
                    isInvalidRegex = true;
            }

            _searchSession = new SearchSession
            {
                Query = query,
                CaseSensitive = caseSensitive,
                UseRegexSearch = useRegex,
                Regex = regex,
                IsInvalidRegex = isInvalidRegex,
                Offset = 0,
                IsComplete = isInvalidRegex,
                LastScannedCount = 0,
                TopCandidates = previousTop ?? []
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

                if (session.IsInvalidRegex)
                {
                    Dispatcher.BeginInvoke(() => ApplySearchResults([], generation, session.Query));
                    return;
                }

                startOffset = session.Offset;
                candidates = session.TopCandidates;
            }

            var batch = _indexService.SearchBatch(
                session.Query,
                session.CaseSensitive,
                session.UseRegexSearch,
                session.Regex,
                startOffset,
                FileSearchService.DefaultBatchSize,
                candidates);

            if (generation != Volatile.Read(ref _searchGeneration))
                return;

            var indexCount = _indexService.Count;
            var indexComplete = _indexService.IsScanComplete;

            lock (_searchSessionLock)
            {
                if (!ReferenceEquals(_searchSession, session))
                    return;

                session.Offset = batch.NextOffset;
                session.TopCandidates = batch.TopCandidates;
            }

            Dispatcher.BeginInvoke(() => ApplySearchResults(batch.Results, generation, session.Query));

            if (batch.IsComplete)
            {
                if (!indexComplete)
                {
                    lock (_searchSessionLock)
                    {
                        if (!ReferenceEquals(_searchSession, session))
                            return;

                        session.LastScannedCount = indexCount;
                        session.Offset = 0;
                        session.IsComplete = false;
                    }

                    while (_indexService.IsScanning && !_indexService.IsScanComplete)
                    {
                        if (generation != Volatile.Read(ref _searchGeneration))
                            return;

                        lock (_searchSessionLock)
                        {
                            if (!ReferenceEquals(_searchSession, session))
                                return;
                        }

                        var currentCount = _indexService.Count;
                        if (currentCount > session.LastScannedCount)
                            break;

                        Thread.Sleep(IndexResourcePolicy.LiveSearchPollMs);
                    }

                    if (!_indexService.IsScanComplete)
                    {
                        continue;
                    }
                }

                lock (_searchSessionLock)
                {
                    if (ReferenceEquals(_searchSession, session))
                        session.IsComplete = true;
                }

                break;
            }

            Thread.Sleep(1);
        }
    }

    private void ApplySearchResults(IReadOnlyList<FileEntry> results, int generation, string query)
    {
        if (generation != _searchGeneration || query != SearchBox.Text)
            return;

        ResultsList.ItemsSource = results;
        ResultsList.Visibility = results.Count > 0 ? System.Windows.Visibility.Visible : System.Windows.Visibility.Collapsed;

        if (results.Count > 0)
            ResultsList.SelectedIndex = 0;

        AdjustWindowHeightForContent();
    }

    private void RefreshSearchIfNeeded()
    {
        if (string.IsNullOrWhiteSpace(SearchBox.Text))
            return;

        if (_indexService.IsScanComplete)
        {
            PerformSearch();
            return;
        }

        lock (_searchSessionLock)
        {
            if (_searchSession is not null
                && _searchSession.Query == SearchBox.Text
                && _searchSession.IsComplete)
            {
                _searchSession.Offset = 0;
                _searchSession.IsComplete = false;
                _searchSession.LastScannedCount = 0;
            }
        }

        PerformSearch();
    }

    private void ScheduleLiveSearchRefresh()
    {
        if (string.IsNullOrWhiteSpace(SearchBox.Text) || _indexService.IsScanComplete)
            return;

        LiveSearchRefreshDebounce.Debounce(RefreshSearchIfNeeded);
    }
}
