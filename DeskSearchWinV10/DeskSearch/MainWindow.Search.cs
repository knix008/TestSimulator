using DeskSearch.Helpers;
using DeskSearch.Models;
using DeskSearch.Services;

namespace DeskSearch;

public partial class MainWindow
{
    private readonly object _searchSessionLock = new();
    private SearchSession? _searchSession;
    private int _searchGeneration;
    private long _lastResultsUiTick;
    private DebounceDispatcher? _liveSearchRefreshDebounce;

    private DebounceDispatcher LiveSearchRefreshDebounce =>
        _liveSearchRefreshDebounce ??= new DebounceDispatcher(Dispatcher, IndexResourcePolicy.LiveSearchRefreshDebounceMs);

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

            if (!SearchTextHelper.TryResolveSearchQuery(
                    normalizedQuery,
                    useRegex,
                    caseSensitive,
                    out var searchQuery))
            {
                searchQuery = ResolvedSearchQuery.Invalid;
            }

            _searchSession = new SearchSession
            {
                Query = query,
                CaseSensitive = caseSensitive,
                UseRegexSearch = useRegex,
                SearchQuery = searchQuery,
                Offset = 0,
                LastScannedId = 0,
                IsComplete = searchQuery.IsInvalid,
                LastScannedCount = 0,
                TopCandidates = previousTop ?? []
            };
            return _searchSession;
        }
    }

    private void RunSearchLoop(SearchSession session, int generation)
    {
        try
        {
            RunSearchLoopCore(session, generation);
        }
        catch (OutOfMemoryException ex)
        {
            ErrorDialogService.Show(LocalizationService.T("Error_OutOfMemory"), ex);
        }
        catch (Exception ex)
        {
            ErrorDialogService.Show(LocalizationService.T("Error_Search"), ex);
        }
    }

    private void RunSearchLoopCore(SearchSession session, int generation) =>
        RunSearchLoopCoreInner(session, generation);

    private void RunSearchLoopCoreInner(SearchSession session, int generation)
    {
        IReadOnlyList<FileEntry> latestResults = [];
        var latestQuery = session.Query;

        while (true)
        {
            if (generation != Volatile.Read(ref _searchGeneration))
                return;

            long afterScanId;
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

                afterScanId = session.LastScannedId;
                candidates = session.TopCandidates;
            }

            var batch = _indexService.SearchBatch(
                session.SearchQuery,
                session.CaseSensitive,
                afterScanId,
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

                session.LastScannedId = batch.NextScanId;
                session.Offset = batch.NextOffset;
                session.TopCandidates = batch.TopCandidates;
            }

            latestResults = batch.Results;
            latestQuery = session.Query;

            var now = Environment.TickCount64;
            if (batch.IsComplete
                || now - _lastResultsUiTick >= IndexResourcePolicy.SearchResultsUiMinIntervalMs)
            {
                _lastResultsUiTick = now;
                var results = latestResults;
                var query = latestQuery;
                Dispatcher.BeginInvoke(
                    System.Windows.Threading.DispatcherPriority.Background,
                    () => ApplySearchResults(results, generation, query));
            }

            if (batch.IsComplete)
            {
                if (!indexComplete)
                {
                    lock (_searchSessionLock)
                    {
                        if (!ReferenceEquals(_searchSession, session))
                            return;

                        session.LastScannedCount = indexCount;
                        session.LastScannedId = 0;
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
        }

        Dispatcher.BeginInvoke(
            System.Windows.Threading.DispatcherPriority.Background,
            () => ApplySearchResults(latestResults, generation, latestQuery));
    }

    private void ApplySearchResults(IReadOnlyList<FileEntry> results, int generation, string query)
    {
        if (generation != _searchGeneration || query != SearchBox.Text)
            return;

        ShowSearchResults(results);
    }

    private void RefreshSearchIfNeeded()
    {
        if (string.IsNullOrWhiteSpace(SearchBox.Text))
            return;

        var caseSensitive = _settingsService.Current.CaseSensitiveSearch;
        var useRegex = _settingsService.Current.UseRegexSearch;

        SearchSession? sessionToContinue;
        int generation;

        lock (_searchSessionLock)
        {
            if (_searchSession is null
                || _searchSession.Query != SearchBox.Text
                || _searchSession.CaseSensitive != caseSensitive
                || _searchSession.UseRegexSearch != useRegex)
            {
                PerformSearch();
                return;
            }

            if (!_searchSession.IsComplete)
                return;

            _searchSession.IsComplete = false;
            _searchSession.LastScannedId = 0;
            _searchSession.Offset = 0;
            _searchSession.LastScannedCount = _indexService.Count;
            sessionToContinue = _searchSession;
            generation = _searchGeneration;
        }

        Task.Run(() => RunSearchLoop(sessionToContinue, generation));
    }

    private void ScheduleLiveSearchRefresh()
    {
        if (string.IsNullOrWhiteSpace(SearchBox.Text) || _indexService.IsScanComplete)
            return;

        LiveSearchRefreshDebounce.Debounce(RefreshSearchIfNeeded);
    }
}
