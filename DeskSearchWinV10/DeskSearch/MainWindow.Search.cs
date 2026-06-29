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

    internal void InvalidateSearchForIndexRebuild()
    {
        Interlocked.Increment(ref _searchGeneration);

        lock (_searchSessionLock)
            _searchSession = null;

        HideSearchResults();
    }

    private void PerformSearch()
    {
        if (!_indexService.IsSearchEnabled)
        {
            var blockedGeneration = Interlocked.Increment(ref _searchGeneration);
            lock (_searchSessionLock)
                _searchSession = null;

            ApplySearchResults([], blockedGeneration, SearchBox.Text);
            return;
        }

        var query = SearchBox.Text;
        var caseSensitive = _settingsService.Current.CaseSensitiveSearch;
        var useRegex = _settingsService.Current.UseRegexSearch;
        var resultSort = _settingsService.Current.SearchResultSort;

        if (string.IsNullOrWhiteSpace(query))
        {
            Interlocked.Increment(ref _searchGeneration);
            lock (_searchSessionLock)
                _searchSession = null;

            ApplySearchResults([], _searchGeneration, query);
            return;
        }

        var generation = Interlocked.Increment(ref _searchGeneration);
        var session = CreateFreshSearchSession(query, caseSensitive, useRegex, resultSort);
        Task.Run(() => RunSearchLoop(session, generation));
    }

    private SearchSession CreateFreshSearchSession(
        string query,
        bool caseSensitive,
        bool useRegex,
        SearchResultSortOrder resultSort)
    {
        lock (_searchSessionLock)
        {
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
                ResultSort = resultSort,
                SearchQuery = searchQuery,
                Offset = 0,
                LastScannedId = 0,
                PassStartCount = -1,
                IsComplete = searchQuery.IsInvalid,
                LastScannedCount = 0,
                TopCandidates = []
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
            int scannedEntryOffset;
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
                scannedEntryOffset = session.Offset;
                if (afterScanId == 0)
                    session.PassStartCount = _indexService.SearchIndexCount;

                candidates = session.TopCandidates;
            }

            var batch = _indexService.SearchBatch(
                session.SearchQuery,
                session.CaseSensitive,
                session.ResultSort,
                afterScanId,
                scannedEntryOffset,
                FileSearchService.DefaultBatchSize,
                candidates);

            if (generation != Volatile.Read(ref _searchGeneration))
                return;

            var indexCount = _indexService.SearchIndexCount;
            var indexComplete = _indexService.IsScanComplete;
            var stableSearchIndex = _indexService.HasStableSearchIndex;

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

            if (!batch.IsComplete)
            {
                if (!indexComplete && !stableSearchIndex)
                {
                    lock (_searchSessionLock)
                    {
                        if (!ReferenceEquals(_searchSession, session))
                            return;

                        session.LastScannedCount = indexCount;
                    }

                    WaitForIndexGrowthOrCompletion(session, generation);
                    if (generation != Volatile.Read(ref _searchGeneration))
                        return;
                }

                continue;
            }

            if (!indexComplete && !stableSearchIndex)
            {
                lock (_searchSessionLock)
                {
                    if (!ReferenceEquals(_searchSession, session))
                        return;

                    session.LastScannedCount = indexCount;
                    ResetSearchScanCursor(session);
                }

                WaitForIndexGrowthOrCompletion(session, generation);
                if (generation != Volatile.Read(ref _searchGeneration))
                    return;

                continue;
            }

            if (!indexComplete && stableSearchIndex)
            {
                lock (_searchSessionLock)
                {
                    if (ReferenceEquals(_searchSession, session))
                        session.IsComplete = true;
                }

                break;
            }

            int passStartCount;
            lock (_searchSessionLock)
            {
                if (!ReferenceEquals(_searchSession, session))
                    return;

                passStartCount = session.PassStartCount;
            }

            if (indexCount > passStartCount)
            {
                lock (_searchSessionLock)
                {
                    if (!ReferenceEquals(_searchSession, session))
                        return;

                    ResetSearchScanCursor(session);
                }

                continue;
            }

            lock (_searchSessionLock)
            {
                if (ReferenceEquals(_searchSession, session))
                    session.IsComplete = true;
            }

            break;
        }

        Dispatcher.BeginInvoke(
            System.Windows.Threading.DispatcherPriority.Background,
            () => ApplySearchResults(latestResults, generation, latestQuery));
    }

    private static void ResetSearchScanCursor(SearchSession session)
    {
        session.LastScannedId = 0;
        session.Offset = 0;
        session.PassStartCount = -1;
        session.IsComplete = false;
    }

    private void WaitForIndexGrowthOrCompletion(SearchSession session, int generation)
    {
        while (true)
        {
            if (generation != Volatile.Read(ref _searchGeneration))
                return;

            lock (_searchSessionLock)
            {
                if (!ReferenceEquals(_searchSession, session))
                    return;
            }

            var currentCount = _indexService.SearchIndexCount;
            if (currentCount > session.LastScannedCount)
                return;

            if (_indexService.IsScanComplete && !_indexService.IsScanning)
                return;

            Thread.Sleep(IndexResourcePolicy.LiveSearchPollMs);
        }
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
        var resultSort = _settingsService.Current.SearchResultSort;

        SearchSession? sessionToContinue;
        int generation;

        lock (_searchSessionLock)
        {
            if (_searchSession is null
                || _searchSession.Query != SearchBox.Text
                || _searchSession.CaseSensitive != caseSensitive
                || _searchSession.UseRegexSearch != useRegex
                || _searchSession.ResultSort != resultSort)
            {
                PerformSearch();
                return;
            }

            if (!_searchSession.IsComplete)
                return;

            generation = Interlocked.Increment(ref _searchGeneration);
            _searchSession.IsComplete = false;
            _searchSession.LastScannedId = 0;
            _searchSession.Offset = 0;
            _searchSession.PassStartCount = -1;
            _searchSession.LastScannedCount = _indexService.SearchIndexCount;
            _searchSession.TopCandidates.Clear();
            sessionToContinue = _searchSession;
        }

        Task.Run(() => RunSearchLoop(sessionToContinue, generation));
    }

    private void ScheduleLiveSearchRefresh()
    {
        if (!_indexService.IsSearchEnabled)
            return;

        if (string.IsNullOrWhiteSpace(SearchBox.Text))
            return;

        if (_indexService.IsScanComplete)
        {
            RefreshSearchIfNeeded();
            return;
        }

        LiveSearchRefreshDebounce.Debounce(RefreshSearchIfNeeded);
    }
}
