using System.Collections.Concurrent;
using System.IO.Enumeration;
using DeskSearch.Helpers;
using DeskSearch.Models;
using Microsoft.Data.Sqlite;

namespace DeskSearch.Services;

public sealed class SystemIndexService : IDisposable
{
    // Default skips Hidden | System | ReparsePoint. We clear AttributesToSkip so hidden/system
    // and dot-prefixed names stay indexed. Junctions/symlinks under C:\Users (Desktop, Documents,
    // OneDrive redirects, AppData links) must be followed; ShouldRecurseIntoDirectory blocks cycles.
    private static readonly EnumerationOptions ScanEnumerationOptions = new()
    {
        RecurseSubdirectories = true,
        IgnoreInaccessible = true,
        AttributesToSkip = FileAttributes.None
    };

    private IndexStore? _indexStore;
    private IndexStore? _activeBuildingStore;
    private readonly object _indexStoreSwapLock = new();
    private readonly string _databaseFolder;
    private readonly IndexBackgroundWorker _indexWorker = new();
    private readonly FileSearchService _searchService = new();    private readonly HashSet<string> _indexedRoots = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _rootsLock = new();
    private readonly HashSet<string> _scannedDirectoryPrefixes = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _scannedPrefixesLock = new();
    private readonly object _progressLock = new();
    private IndexInclusionPolicy _inclusion = IndexInclusionPolicy.Empty;

    // Set for the duration of ExecuteManualFullIndexScan; PromoteBuildingStore runs only while this is true.
    private volatile bool _manualFullScanActive;

    private int _lastProgressReport = -1;    private DateTime _lastProgressTime = DateTime.MinValue;
    private int _entriesSinceYield;
    private int _lastIndexUpdatedCount;
    private DateTime _lastIndexUpdatedTime = DateTime.MinValue;
    private bool _searchEnabledEventRaised;
    private volatile bool _isScanComplete;
    private volatile bool _isScanning;
    private volatile IndexProgressPhase _progressPhase = IndexProgressPhase.Idle;
    private bool _scanUsesShadowBuild;
    private int _scanProgressPercent;
    private int _totalScanSteps;
    private int _completedScanSteps;

    // Keyed by the root path currently being scanned, so multiple roots (e.g. separate
    // drives) can be scanned concurrently without one root's progress clobbering another's.
    private readonly ConcurrentDictionary<string, int> _activeStepEntries =
        new(StringComparer.OrdinalIgnoreCase);

    // Per-root error counts during the active scan pass; roots with errors stay
    // unmarked in indexed_roots so RetryPendingScanSteps can pick them up again.
    private readonly ConcurrentDictionary<string, int> _rootScanErrors =
        new(StringComparer.OrdinalIgnoreCase);

    private string? _currentScanPath;

    // A lock-free, "good enough for display" stand-in for Count while a scan writes
    // directly into the live store. The real Count property needs the live store's
    // lock — the same lock the writer holds during each batch commit — so polling it
    // from the UI thread (Settings window progress, tray menu) while indexing is active
    // can block the UI waiting for that lock. This counter is only ever incremented, so
    // reading it never contends with the writer.
    private long _approximateLiveCount;

    // Entries written during the active scan pass (building DB only; never used for search).
    private long _scanIndexedCount;

    // Paths added/removed by the filesystem watcher since the last completed full index.
    private long _incrementalUpdateCount;

    // Scan pass total preserved through promote for completion UI.
    private long _lastScanUpdatedCount;

    // Set when the user pauses indexing; suppresses automatic rescan retry until resumed.
    private volatile bool _indexingPaused;

    // Set when indexing is cancelled for shutdown/reset.
    private volatile bool _userStoppedScan;

    // While true, ScanTree scans every subdirectory (no prefix-based skip).
    private volatile bool _disableScannedPrefixSkip;

    // Set on reset / manual full rebuild; cleared only after a scan promotes a fresh index.
    private volatile bool _awaitingFreshFullScan;

    private int _scanGeneration;

    public SystemIndexService()
    {
        _databaseFolder = AppStoragePaths.DataFolder;

        // Drop any in-progress build from a prior session; keep the completed search index.
        DeleteDatabaseFiles(GetBuildingDatabasePath());

        var canonicalPath = GetCanonicalDatabasePath();
        if (File.Exists(canonicalPath))
        {
            var probe = new IndexStore(canonicalPath);
            if (probe.Count > 0)
            {
                _indexStore = probe;
                _approximateLiveCount = probe.Count;

                lock (_rootsLock)
                {
                    foreach (var root in probe.LoadIndexedRoots())
                        _indexedRoots.Add(root);
                }

                EnableSearchIfNeeded();
                _isScanComplete = true;
                _scanProgressPercent = 100;
            }
            else
            {
                probe.Dispose();
                SqliteConnection.ClearAllPools();
                DeleteAllIndexDatabaseFiles();
                _approximateLiveCount = 0;
            }
        }
        else
        {
            DeleteAllIndexDatabaseFiles();
            _approximateLiveCount = 0;
        }
    }

    /// <summary>
    /// Cheap, lock-free, approximate entry count — safe to poll from the UI thread even
    /// while a scan is actively writing to the live store. See <see cref="_approximateLiveCount"/>.
    /// </summary>
    public long ApproximateLiveCount => Interlocked.Read(ref _approximateLiveCount);

    /// <summary>Entries indexed in the current scan pass (0 at re-index start).</summary>
    public long ScanIndexedCount => Interlocked.Read(ref _scanIndexedCount);

    /// <summary>Watcher-driven path changes since the last completed full index.</summary>
    public long IncrementalUpdateCount => Interlocked.Read(ref _incrementalUpdateCount);

    /// <summary>Entries written in the scan pass that was just promoted (for completion UI).</summary>
    public long LastScanUpdatedCount => Interlocked.Read(ref _lastScanUpdatedCount);

    /// <summary>Always zero; kept for API compatibility. Progress uses scan steps only.</summary>
    public long ScanBaselineCount => 0;

    private string GetCanonicalDatabasePath() =>
        Path.Combine(_databaseFolder, IndexStoragePolicy.DatabaseFileName);

    private string GetBuildingDatabasePath() =>
        Path.Combine(_databaseFolder, IndexStoragePolicy.BuildingDatabaseFileName);

    /// <summary>True when a completed <see cref="IndexStoragePolicy.DatabaseFileName"/> exists with entries.</summary>
    public bool HasStableSearchIndex
    {
        get
        {
            lock (_indexStoreSwapLock)
                return _indexStore is not null && _indexStore.Count > 0;
        }
    }

    private bool HasCompletedSearchIndex() => HasStableSearchIndex;

    private bool CanUpdateLiveSearchIndex() =>
        !_isScanning && HasCompletedSearchIndex();

    /// <summary>
    /// Live search index (index.db) only. Watcher deltas never write to index.building.db.
    /// </summary>
    private IReadOnlyList<IndexStore> GetLiveSearchUpdateTargets()
    {
        lock (_indexStoreSwapLock)
        {
            if (_indexStore is { Count: > 0 })
                return [_indexStore];

            return [];
        }
    }

    private bool AreAllScanRootsIndexed()
    {
        lock (_rootsLock)
            return HasIndexedAllScannableRoots(_indexedRoots);
    }

    private bool AreAllScanStepsIndexed() => AreAllScanRootsIndexed();

    private bool HasIndexedAllScannableRoots(IEnumerable<string> indexedRoots)
    {
        var indexed = indexedRoots as IReadOnlySet<string>
            ?? new HashSet<string>(indexedRoots, StringComparer.OrdinalIgnoreCase);

        var scannable = 0;
        foreach (var root in ScanRoots)
        {
            if (!Directory.Exists(root))
                continue;

            scannable++;
            var normalized = NormalizeDirectoryPrefix(root);
            if (normalized is null || !indexed.Contains(normalized))
                return false;
        }

        // No reachable roots (empty scope or all offline) — nothing left to wait for.
        return true;
    }

    private int CountScannableScanRoots(IReadOnlyList<string> roots)
    {
        var count = 0;
        foreach (var root in roots)
        {
            if (!Directory.Exists(root))
                continue;

            count++;
        }

        return count;
    }

    private bool HasStoreIndexedAllScannableRoots(IndexStore store)
    {
        try
        {
            return HasIndexedAllScannableRoots(store.LoadIndexedRoots());
        }
        catch
        {
            return false;
        }
    }

    private bool IsBuildingStoreReadyToPromote(IndexStore buildingStore)
    {
        if (buildingStore.Count <= 0)
            return false;

        // Every triggered rebuild must finish all scan steps; never promote a partial pass.
        return AreAllScanStepsIndexed()
            && HasStoreIndexedAllScannableRoots(buildingStore);
    }

    private bool CanFinalizeScan(int scanGeneration, CancellationToken cancellationToken) =>
        !cancellationToken.IsCancellationRequested
        && scanGeneration == Volatile.Read(ref _scanGeneration)
        && !_userStoppedScan
        && !_indexingPaused;

    /// <summary>
    /// True when the database backing live search is still being written.
    /// During a shadow rebuild the stable search index is read-only, so search batches
    /// can complete immediately even while a new index is building separately.
    /// </summary>
    private bool IsSearchTargetGrowing()
    {
        if (HasStableSearchIndex)
            return false;

        return _isScanning || !_isScanComplete || _awaitingFreshFullScan;
    }

    /// <summary>Entry count of index.db used for live search.</summary>
    public int SearchIndexCount
    {
        get
        {
            lock (_indexStoreSwapLock)
                return _indexStore?.Count ?? 0;
        }
    }

    /// <summary>Entry count of the canonical live index database with an accurate COUNT(*) refresh.</summary>
    public int GetLiveEntryCount()
    {
        lock (_indexStoreSwapLock)
        {
            if (_indexStore is null)
                return 0;

            _indexStore.RefreshCachedCount();
            var count = _indexStore.Count;
            Interlocked.Exchange(ref _approximateLiveCount, count);
            return count;
        }
    }

    /// <summary>Entry count of index.db — the only database used for search.</summary>
    public int GetIndexedEntryCount() => GetLiveEntryCount();

    /// <summary>
    /// Items changed in the active scan pass, or watcher deltas when indexing is idle.
    /// </summary>
    public long GetUpdatedEntryCount()
    {
        if (!_isScanComplete || _isScanning || _progressPhase != IndexProgressPhase.Idle)
            return ScanIndexedCount;

        return IncrementalUpdateCount;
    }

    private static void DeleteDatabaseFiles(string basePath)
    {
        foreach (var suffix in DatabaseFileSuffixes)
        {
            try
            {
                var path = basePath + suffix;
                if (File.Exists(path))
                    File.Delete(path);
            }
            catch
            {
                // best effort cleanup; a leftover file here doesn't corrupt anything
            }
        }
    }

    /// <summary>Removes every index database file in the data folder (main DB, shadow build, WAL/SHM sidecars).</summary>
    private void DeleteAllIndexDatabaseFiles()
    {
        DeleteDatabaseFiles(GetCanonicalDatabasePath());
        DeleteDatabaseFiles(GetBuildingDatabasePath());

        if (!Directory.Exists(_databaseFolder))
            return;

        foreach (var file in Directory.EnumerateFiles(_databaseFolder))
        {
            var name = Path.GetFileName(file);
            if (!name.StartsWith("index", StringComparison.OrdinalIgnoreCase))
                continue;

            try
            {
                File.Delete(file);
            }
            catch
            {
                // best effort
            }
        }
    }

    private static readonly string[] DatabaseFileSuffixes = ["", "-wal", "-shm", "-journal"];

    // Promoting a shadow build disposes the old live store and swaps in the new one;
    // any reader that grabs the reference must do so through this lock so it can never
    // observe a store that's mid-disposal (the lock only guards the reference read/swap
    // itself, not the actual DB work, so it's held for a moment, not the whole query).
    private IndexStore GetSearchStore()
    {
        lock (_indexStoreSwapLock)
        {
            if (_indexStore is not null)
                return _indexStore;

            throw new InvalidOperationException("No search index (index.db) is available.");
        }
    }

    public bool IsSearchEnabled => HasStableSearchIndex;
    public bool IsScanComplete => _isScanComplete;
    public bool IsIndexingPaused => _indexingPaused;
    public bool CanResumeIndexing => false;
    public bool IsScanning => _isScanning;
    public IndexProgressPhase ProgressPhase => _progressPhase;
    public bool ScanUsesShadowBuild => _scanUsesShadowBuild;
    public int ScanProgressPercent => _scanProgressPercent;
    public int IndexDisplayPercent =>
        _isScanComplete ? 100 : MapDisplayPercent(_progressPhase, ComputeActiveScanPercent());
    public int Count
    {
        get
        {
            lock (_indexStoreSwapLock)
                return _indexStore?.Count ?? 0;
        }
    }

    public bool NeedsFtsMigration => _indexStore?.NeedsFtsMigration ?? false;

    public void RunFtsMigration(Action<int>? onProgress = null, CancellationToken cancellationToken = default)
    {
        if (_indexStore is null)
            return;

        _indexStore.RunFtsMigration(onProgress, cancellationToken);
    }

    public IReadOnlyList<string> WatchPaths => FilterPathsInScope(GetPriorityPaths());
    public IReadOnlyList<string> ScanRoots => _inclusion.ScanRoots;

    public void ConfigureIndexScope(AppSettings settings)
    {
        _inclusion = IndexInclusionPolicy.FromSettings(settings);
    }

    public bool IsPathExcluded(string path) => _inclusion.IsPathExcluded(path);

    public event EventHandler? SearchEnabled;
    public event EventHandler<IndexProgressEventArgs>? IndexProgress;
    public event EventHandler? IndexUpdated;
    /// <summary>Raised when a user-requested full index rebuild starts.</summary>
    public event EventHandler? FullIndexRebuildStarted;

    /// <summary>
    /// Applies scope/metadata maintenance on startup. Does not scan filesystem paths.
    /// Full indexing is manual via <see cref="RestartScan"/> only.
    /// </summary>
    public void StartBackgroundScan()
    {
        _indexWorker.EnqueueExclusive(RunStartupIndexMaintenance);
    }

    /// <summary>
    /// Starts a user-requested full index from scratch. Always discards any partial
    /// building DB, cancels in-progress work, and rescans every configured drive root.
    /// </summary>
    public void RestartScan()
    {
        _indexingPaused = false;
        _userStoppedScan = false;
        _awaitingFreshFullScan = true;
        _isScanComplete = false;

        SetProgressPhase(IndexProgressPhase.Scanning, forceReport: false);
        ReportProgress(null, false, force: true);

        Interlocked.Increment(ref _scanGeneration);
        _indexWorker.CancelExclusiveWork();
        _indexWorker.EnqueueExclusive(ExecuteManualFullIndexScan);
    }

    public void StopScan()
    {
        _indexingPaused = true;
        _indexWorker.CancelExclusiveWork();
    }

    /// <summary>
    /// Stops indexing on exit. Closes the building DB connection but leaves <c>index.building.db</c> on disk.
    /// The completed search index (<c>index.db</c>) is never removed.
    /// </summary>
    public void AbortIndexingForShutdown()
    {
        _userStoppedScan = true;
        _indexWorker.CancelExclusiveWork();

        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (_isScanning && DateTime.UtcNow < deadline)
            Thread.Sleep(50);

        ReleaseActiveBuildingStoreConnection();

        if (HasCompletedSearchIndex())
            RestoreSearchIndexAfterAbortedBuild();
    }

    /// <summary>Closes the in-memory building store without deleting <c>index.building.db</c>.</summary>
    private void ReleaseActiveBuildingStoreConnection()
    {
        lock (_indexStoreSwapLock)
        {
            try
            {
                _activeBuildingStore?.Dispose();
            }
            catch
            {
                // best effort
            }

            _activeBuildingStore = null;
        }

        _isScanning = false;
        _scanUsesShadowBuild = false;
        Interlocked.Exchange(ref _scanIndexedCount, 0);
        Interlocked.Exchange(ref _incrementalUpdateCount, 0);
    }

    public void ResetIndexDatabase()
    {
        _userStoppedScan = true;
        _indexWorker.CancelExclusiveWork();
        // Must not use EnqueueExclusive: a subsequent Indexing click cancels the token
        // before this runs, leaving the old index.db in place.
        _indexWorker.Enqueue(ResetIndexDatabaseCore);
    }

    private void ResetIndexDatabaseCore()
    {
        DiscardActiveBuildingDatabase();

        lock (_indexStoreSwapLock)
        {
            try
            {
                _indexStore?.Checkpoint();
            }
            catch
            {
                // best effort before file deletion
            }

            try
            {
                _activeBuildingStore?.Dispose();
            }
            catch
            {
                // best effort
            }

            _indexStore?.Dispose();
            _indexStore = null;
            _activeBuildingStore = null;
            SqliteConnection.ClearAllPools();
            DeleteAllIndexDatabaseFiles();
            Interlocked.Exchange(ref _approximateLiveCount, 0);
        }

        lock (_rootsLock)
            _indexedRoots.Clear();

        lock (_scannedPrefixesLock)
            _scannedDirectoryPrefixes.Clear();

        _searchEnabledEventRaised = false;
        _isScanComplete = false;
        _awaitingFreshFullScan = true;
        _liveIndexAnalyzeScheduled = false;
        _isScanning = false;
        _scanUsesShadowBuild = false;
        _indexingPaused = false;
        _userStoppedScan = false;
        Interlocked.Exchange(ref _scanIndexedCount, 0);
        Interlocked.Exchange(ref _incrementalUpdateCount, 0);
        Interlocked.Exchange(ref _lastScanUpdatedCount, 0);
        _scanProgressPercent = 0;
        _completedScanSteps = 0;
        _totalScanSteps = 0;
        _currentScanPath = null;
        _activeStepEntries.Clear();
        _lastProgressReport = -1;
        _lastIndexUpdatedCount = 0;
        _lastIndexUpdatedTime = DateTime.MinValue;

        SetProgressPhase(IndexProgressPhase.Idle, forceReport: false);
        ReportProgress(null, false, force: true);
        IndexUpdated?.Invoke(this, EventArgs.Empty);
    }

    public IReadOnlyList<FileEntry> Search(
        bool caseSensitive,
        ResolvedSearchQuery searchQuery,
        SearchResultSortOrder sortOrder)
    {
        EnableSearchIfNeeded();
        if (!IsSearchEnabled)
            return [];

        var store = GetSearchStore();

        if (searchQuery.CanUseSqlScored)
        {
            return store.SearchSqlScored(searchQuery, caseSensitive, sortOrder);
        }

        return _searchService.Search(
            store.EnumerateAll(IndexStoragePolicy.RegexSearchPageSize),
            store.Count,
            searchQuery,
            caseSensitive,
            sortOrder);
    }

    public SearchBatchResult SearchBatch(
        ResolvedSearchQuery searchQuery,
        bool caseSensitive,
        SearchResultSortOrder sortOrder,
        long afterScanId,
        int scannedEntryOffset,
        int batchSize,
        List<(FileEntry Entry, int Score)>? existingTop = null)
    {
        EnableSearchIfNeeded();
        if (!IsSearchEnabled)
        {
            return new SearchBatchResult
            {
                Results = [],
                NextOffset = 0,
                NextScanId = afterScanId,
                IsComplete = true,
                TopCandidates = existingTop ?? []
            };
        }

        var store = GetSearchStore();
        var totalCount = store.Count;
        var indexStillGrowing = IsSearchTargetGrowing();

        if (searchQuery.CanUseSqlScored && afterScanId == 0)
        {
            var results = store.SearchSqlScored(searchQuery, caseSensitive, sortOrder);

            return new SearchBatchResult
            {
                Results = results,
                NextOffset = totalCount,
                NextScanId = 0,
                IsComplete = !indexStillGrowing,
                TopCandidates = []
            };
        }

        var page = store.ReadPageAfterId(afterScanId, batchSize);
        if (page.Entries.Count == 0)
        {
            return new SearchBatchResult
            {
                Results = [],
                NextOffset = scannedEntryOffset,
                NextScanId = afterScanId,
                IsComplete = !indexStillGrowing,
                TopCandidates = existingTop ?? []
            };
        }

        var result = _searchService.SearchBatch(
            page.Entries,
            totalCount,
            searchQuery,
            caseSensitive,
            sortOrder,
            startOffset: 0,
            batchSize: page.Entries.Count,
            existingTop);

        var isComplete = page.Entries.Count < batchSize;
        if (isComplete && indexStillGrowing)
            isComplete = false;

        var nextOffset = isComplete
            ? totalCount
            : Math.Min(totalCount, scannedEntryOffset + page.Entries.Count);
        return new SearchBatchResult
        {
            Results = result.Results,
            NextOffset = nextOffset,
            NextScanId = page.LastId,
            IsComplete = isComplete,
            TopCandidates = result.TopCandidates
        };
    }

    /// <summary>
    /// User-triggered full rebuild: wait for any prior scan to finish, discard partial
    /// state, then scan every drive root into a fresh building DB.
    /// </summary>
    private void ExecuteManualFullIndexScan(CancellationToken cancellationToken)
    {
        if (!WaitUntilScanIdle())
            return;

        if (cancellationToken.IsCancellationRequested)
            return;

        _manualFullScanActive = true;
        try
        {
            PrepareFreshFullScanState();

            if (HasCompletedSearchIndex())
            {
                Interlocked.Exchange(ref _approximateLiveCount, _indexStore!.Count);
                EnableSearchIfNeeded();
            }

            var scanGeneration = Volatile.Read(ref _scanGeneration);
            RunScan(cancellationToken, scanGeneration);
        }
        finally
        {
            _manualFullScanActive = false;
        }
    }

    private bool WaitUntilScanIdle()
    {
        var deadline = DateTime.UtcNow.AddMinutes(5);
        while (_isScanning && DateTime.UtcNow < deadline)
            Thread.Sleep(50);

        return !_isScanning;
    }

    private void WipeCanonicalSearchIndex()
    {
        lock (_indexStoreSwapLock)
        {
            _indexStore?.Dispose();
            _indexStore = null;
        }

        DeleteDatabaseFiles(GetCanonicalDatabasePath());
        Interlocked.Exchange(ref _approximateLiveCount, 0);
    }

    private void PrepareFreshFullScanState()
    {
        DiscardActiveBuildingDatabase();

        if (!HasStableSearchIndex)
            WipeCanonicalSearchIndex();

        lock (_rootsLock)
            _indexedRoots.Clear();

        lock (_scannedPrefixesLock)
            _scannedDirectoryPrefixes.Clear();

        _rootScanErrors.Clear();

        _scanProgressPercent = 0;
        _completedScanSteps = 0;
        _totalScanSteps = 0;
        _currentScanPath = null;
        _activeStepEntries.Clear();
        Interlocked.Exchange(ref _scanIndexedCount, 0);
        Interlocked.Exchange(ref _incrementalUpdateCount, 0);
        _scanUsesShadowBuild = HasStableSearchIndex;
        _isScanComplete = false;
    }

    private void CleanupAbortedScan(IndexStore target, string buildingPath, bool allowCompleteStatus = false)
    {
        try
        {
            DiscardBuildingStore(target, buildingPath);
        }
        catch
        {
            // building store may already be closed when the user stopped indexing
        }

        DiscardActiveBuildingDatabase();
        RestoreSearchIndexAfterAbortedBuild(allowCompleteStatus);
    }

    /// <summary>
    /// User pressed Stop: discard partial building work entirely so the next Index run starts fresh.
    /// </summary>
    private void HandleUserStoppedScan(IndexStore target, string buildingPath)
    {
        CleanupAbortedScan(target, buildingPath, allowCompleteStatus: HasStableSearchIndex);

        if (!HasStableSearchIndex)
            return;

        _awaitingFreshFullScan = false;
        _isScanComplete = true;
        _scanProgressPercent = 100;
        _scanUsesShadowBuild = false;
        SetProgressPhase(IndexProgressPhase.Idle, forceReport: false);
        ReportProgress(null, true, force: true);
    }

    private bool HasInterruptedBuildingWork() =>
        _isScanning
        || _activeBuildingStore is not null
        || _progressPhase is IndexProgressPhase.Scanning
            or IndexProgressPhase.Analyzing
            or IndexProgressPhase.Applying
        || File.Exists(GetBuildingDatabasePath());

    /// <summary>
    /// Closes and deletes only <c>index.building.db</c>. The completed search index (<c>index.db</c>) is never removed here.
    /// </summary>
    private void DiscardActiveBuildingDatabase()
    {
        ReleaseActiveBuildingStoreConnection();
        DeleteDatabaseFiles(GetBuildingDatabasePath());
    }

    private void ReloadIndexedRootsFromSearchDatabase()
    {
        if (_indexStore is null)
            return;

        ReloadIndexedRootsFromStore(_indexStore);
    }

    private void RestoreSearchIndexAfterAbortedBuild(bool allowCompleteStatus = true)
    {
        _scanUsesShadowBuild = false;
        Interlocked.Exchange(ref _scanIndexedCount, 0);

        if (!HasCompletedSearchIndex())
        {
            DisableSearch();
            _isScanComplete = false;
            SetProgressPhase(IndexProgressPhase.Idle, forceReport: false);
            ReportProgress(null, false, force: true);
            return;
        }

        ReloadIndexedRootsFromSearchDatabase();
        Interlocked.Exchange(ref _approximateLiveCount, _indexStore!.Count);
        EnableSearchIfNeeded();

        _isScanComplete = allowCompleteStatus
            && !_awaitingFreshFullScan
            && AreAllScanRootsIndexed()
            && HasStoreIndexedAllScannableRoots(_indexStore!);
        SetProgressPhase(IndexProgressPhase.Idle, forceReport: false);
        ReportProgress(null, _isScanComplete, force: true);
    }

    private void ReloadIndexedRootsFromStore(IndexStore store)
    {
        lock (_rootsLock)
        {
            _indexedRoots.Clear();
            foreach (var root in store.LoadIndexedRoots())
                _indexedRoots.Add(root);
        }

        RestoreScannedPrefixesFromIndexedRoots();
    }

    private bool IsRootScanComplete(string root)
    {
        var normalized = NormalizeDirectoryPrefix(root);
        if (normalized is null)
            return false;

        lock (_rootsLock)
            return _indexedRoots.Contains(normalized);
    }

    private void PauseActiveScan(IndexStore target) => PreservePausedScanState(target);

    private void PreservePausedScanState(IndexStore target)
    {
        try
        {
            target.Checkpoint();
        }
        catch
        {
            // best effort before releasing the scan thread
        }

        lock (_indexStoreSwapLock)
        {
            if (!ReferenceEquals(_activeBuildingStore, target))
            {
                try
                {
                    _activeBuildingStore?.Dispose();
                }
                catch
                {
                    // best effort
                }
            }

            _activeBuildingStore = target;
        }

        ReloadIndexedRootsFromStore(target);

        if (HasCompletedSearchIndex())
        {
            Interlocked.Exchange(ref _approximateLiveCount, _indexStore!.Count);
            EnableSearchIfNeeded();
        }
        else
            EnableSearchIfNeeded();

        _isScanComplete = false;
        SetProgressPhase(IndexProgressPhase.Idle, forceReport: false);
        ReportProgress(null, false, force: true);
    }

    /// <summary>
    /// Applies filesystem watcher deltas to index.db (add/update/remove/rename paths only).
    /// Does not clear or rebuild the index database.
    /// </summary>
    public void ApplyWatcherChanges(
        IReadOnlyList<string> removes,
        IReadOnlyList<string> adds,
        IReadOnlyList<(string OldPath, string NewPath)>? renames = null)
    {
        if (removes.Count == 0 && adds.Count == 0 && (renames is null || renames.Count == 0))
            return;

        var removesCopy = removes.ToArray();
        var addsCopy = adds.ToArray();
        var renamesCopy = renames?.ToArray() ?? [];
        _indexWorker.Enqueue(() => ApplyWatcherChangesCore(removesCopy, addsCopy, renamesCopy));
    }

    public void Dispose()
    {
        try
        {
            lock (_indexStoreSwapLock)
                _indexStore?.Checkpoint();
        }
        catch
        {
            // best effort before shutdown
        }

        AbortIndexingForShutdown();
        _indexWorker.Dispose();
        lock (_indexStoreSwapLock)
        {
            _indexStore?.Dispose();
            _activeBuildingStore?.Dispose();
            _activeBuildingStore = null;
        }
    }

    private void ApplyWatcherChangesCore(
        IReadOnlyList<string> removes,
        IReadOnlyList<string> adds,
        IReadOnlyList<(string OldPath, string NewPath)> renames)
    {
        var targets = GetLiveSearchUpdateTargets();
        if (targets.Count == 0)
            return;

        var changeCount = 0L;

        foreach (var target in targets)
        {
            foreach (var (oldPath, newPath) in renames)
            {
                if (_inclusion.IsPathInScope(newPath))
                {
                    changeCount += target.RewriteWatcherRenamedPath(oldPath, newPath);
                    continue;
                }

                // Renamed out of indexing scope — remove old path and all its descendants.
                // Only if oldPath is actually gone from disk; a stale or reversed rename event
                // would otherwise cascade-delete a directory tree that is still present in scope.
                if (!Directory.Exists(oldPath) && !File.Exists(oldPath))
                {
                    target.RemoveWatcherDeletedPath(oldPath);
                    changeCount++;
                }
            }

            var appliedRemoves = 0;
            foreach (var path in removes)
            {
                // Skip removes where the path was re-created since the watcher fired.
                // During a long scan, DELETE events queue behind the scan worker and
                // are processed after promotion against the new DB. If a directory was
                // temporarily deleted and re-created during that window, applying the
                // stale DELETE would cascade-wipe all its descendants from the fresh index.
                if (File.Exists(path) || Directory.Exists(path))
                    continue;

                target.RemoveWatcherDeletedPath(path);
                appliedRemoves++;
            }

            changeCount += appliedRemoves;
        }

        var upserts = new List<FileEntry>(adds.Count);
        foreach (var path in adds)
        {
            if (!_inclusion.IsPathInScope(path))
                continue;

            if (File.Exists(path))
            {
                var entry = TryCreateEntry(path, isDirectory: false);
                if (entry is not null)
                    upserts.Add(entry);
                continue;
            }

            if (Directory.Exists(path))
            {
                var entry = TryCreateEntry(path, isDirectory: true);
                if (entry is not null)
                    upserts.Add(entry);
            }
        }

        if (upserts.Count > 0)
        {
            foreach (var target in targets)
                target.UpsertBatch(upserts);

            changeCount += upserts.Count;
        }

        if (changeCount > 0)
            Interlocked.Add(ref _incrementalUpdateCount, changeCount);

        Interlocked.Exchange(ref _approximateLiveCount, GetLiveEntryCount());

        IndexUpdated?.Invoke(this, EventArgs.Empty);
    }

    private void RunStartupIndexMaintenance(CancellationToken cancellationToken)
    {
        if (cancellationToken.IsCancellationRequested || _awaitingFreshFullScan)
            return;

        ReconcileIndexMetadata();
        ReloadIndexedRootsFromSearchDatabase();

        if (!HasCompletedSearchIndex())
        {
            _isScanComplete = false;
            SetProgressPhase(IndexProgressPhase.Idle, forceReport: false);
            ReportProgress(null, false, force: true);
            return;
        }

        EnsureLiveIndexAnalyzedForSearch();
        CompleteStartupWithExistingIndex();
    }

    private void ReconcileIndexMetadata()
    {
        lock (_rootsLock)
        {
            if (!HasCompletedSearchIndex() && _indexedRoots.Count > 0)
            {
                _indexStore?.ClearIndexedRoots();
                _indexedRoots.Clear();
            }
        }

        RestoreScannedPrefixesFromIndexedRoots();
    }

    private void RestoreScannedPrefixesFromIndexedRoots()
    {
        lock (_scannedPrefixesLock)
        {
            _scannedDirectoryPrefixes.Clear();

            lock (_rootsLock)
            {
                foreach (var root in _indexedRoots)
                    _scannedDirectoryPrefixes.Add(root);
            }
        }
    }

    private void CompleteStartupWithExistingIndex()
    {
        if (!HasCompletedSearchIndex())
            return;

        if (_awaitingFreshFullScan)
            return;

        EnsureLiveIndexAnalyzedForSearch();

        // Existing search DB is usable immediately; full re-index is manual only.
        _isScanComplete = true;
        _scanProgressPercent = 100;
        _totalScanSteps = 1;
        _completedScanSteps = 1;
        Interlocked.Exchange(ref _approximateLiveCount, GetLiveEntryCount());
        ReportProgress(null, true, force: true);
    }

    // Every full scan writes into a fresh index.building.db. Search always reads index.db;
    // building.db replaces index.db only when a manual full index completes successfully.
    private void RunScan(CancellationToken cancellationToken, int scanGeneration)
    {
        FullIndexRebuildStarted?.Invoke(this, EventArgs.Empty);

        cancellationToken.ThrowIfCancellationRequested();
        if (scanGeneration != Volatile.Read(ref _scanGeneration))
            return;

        var previousPriority = Thread.CurrentThread.Priority;
        Thread.CurrentThread.Priority = ThreadPriority.Lowest;
        BackgroundThreadMode.EnterForCurrentThread();
        _isScanning = true;
        _disableScannedPrefixSkip = true;

        _scanUsesShadowBuild = HasStableSearchIndex;

        ReleaseActiveBuildingStoreConnection();
        var buildingPath = GetBuildingDatabasePath();
        DeleteDatabaseFiles(buildingPath);

        var target = new IndexStore(buildingPath);
        lock (_indexStoreSwapLock)
            _activeBuildingStore = target;

        target.Clear();
        target.ClearIndexedRoots();
        target.ClearAllScanCheckpoints();
        lock (_rootsLock)
            _indexedRoots.Clear();

        lock (_scannedPrefixesLock)
            _scannedDirectoryPrefixes.Clear();

        _rootScanErrors.Clear();
        Interlocked.Exchange(ref _scanIndexedCount, 0);
        Interlocked.Exchange(ref _incrementalUpdateCount, 0);

        // Drive roots cover the full machine; scanning WatchPaths first caused
        // IsUnderScannedSubtree to skip most of each drive on the follow-up pass.
        var scanRoots = ScanRoots;
        BeginScanProgress(CountScannableScanRoots(scanRoots), completedSteps: 0);
        target.BeginBulkIngest();

        var succeeded = false;
        try
        {
            RunRootScansInParallel(scanRoots, target, cancellationToken);

            RetryPendingScanSteps(scanRoots, target, cancellationToken);

            if (CanFinalizeScan(scanGeneration, cancellationToken))
                succeeded = true;
        }
        catch (AggregateException ex) when (ex.InnerExceptions.All(e => e is OperationCanceledException))
        {
        }
        catch (OperationCanceledException)
        {
        }
        catch (OutOfMemoryException ex)
        {
            ErrorDialogService.Show(LocalizationService.T("Error_OutOfMemory"), ex);
        }
        catch (Exception ex)
        {
            ErrorDialogService.Show(LocalizationService.T("Error_IndexScan"), ex);
        }
        finally
        {
            target.EndBulkIngest();
            _isScanning = false;
            _disableScannedPrefixSkip = false;
            _currentScanPath = null;
            BackgroundThreadMode.ExitForCurrentThread();
            Thread.CurrentThread.Priority = previousPriority;
        }

        if (succeeded && !CanFinalizeScan(scanGeneration, cancellationToken))
            succeeded = false;

        if (succeeded && !AreAllScanStepsIndexed())
            succeeded = false;

        if (succeeded && !IsBuildingStoreReadyToPromote(target))
            succeeded = false;

        if (succeeded)
        {
            var promoted = false;
            SetProgressPhase(IndexProgressPhase.Analyzing);
            try
            {
                if (CanFinalizeScan(scanGeneration, cancellationToken))
                {
                    PromoteBuildingStore(target, buildingPath);
                    promoted = true;
                }
            }
            catch (OutOfMemoryException ex)
            {
                ErrorDialogService.Show(LocalizationService.T("Error_OutOfMemory"), ex);
            }
            catch (Exception ex)
            {
                ErrorDialogService.Show(LocalizationService.T("Error_IndexScan"), ex);
            }
            finally
            {
                SetProgressPhase(IndexProgressPhase.Idle, forceReport: false);
            }

            if (promoted && CanFinalizeScan(scanGeneration, cancellationToken))
            {
                EnableSearchIfNeeded();
                _awaitingFreshFullScan = false;
                _isScanComplete = true;
                _scanUsesShadowBuild = false;
                _scanProgressPercent = 100;
                Interlocked.Exchange(ref _approximateLiveCount, _indexStore?.Count ?? 0);
                ReportProgress(null, true, force: true);
            }
            else if (promoted)
            {
                if (scanGeneration != Volatile.Read(ref _scanGeneration))
                {
                    // Superseded by a newer scan while analyze/apply was running.
                    _awaitingFreshFullScan = true;
                    _isScanComplete = false;
                    ReportProgress(null, false, force: true);
                }
                else
                {
                    // Promote finished (user may have pressed Stop during finalize; index is still valid).
                    EnableSearchIfNeeded();
                    _awaitingFreshFullScan = false;
                    _isScanComplete = true;
                    _scanUsesShadowBuild = false;
                    _scanProgressPercent = 100;
                    Interlocked.Exchange(ref _approximateLiveCount, _indexStore?.Count ?? 0);
                    ReportProgress(null, true, force: true);
                }
            }
            else
            {
                CleanupAbortedScan(target, buildingPath);
            }
        }
        else if (_indexingPaused)
        {
            HandleUserStoppedScan(target, buildingPath);
        }
        else if (_userStoppedScan)
        {
            PauseActiveScan(target);
        }
        else
        {
            CleanupAbortedScan(target, buildingPath);
        }
    }

    private void RestoreAfterAbortedBuild() =>
        RestoreSearchIndexAfterAbortedBuild(allowCompleteStatus: false);

    // Runs each root on its own dedicated, Lowest-priority OS thread (not the thread
    // pool) so priority is guaranteed per worker, bounded by a semaphore so at most
    // MaxParallelRootScans roots are ever scanning at once. A failure on one root does
    // not abort the others; only cancellation propagates to the caller.
    private void RunRootScansInParallel(
        IReadOnlyList<string> roots,
        IndexStore target,
        CancellationToken cancellationToken)
    {
        if (roots.Count == 0)
            return;

        var maxParallelism = Math.Max(1, Math.Min(roots.Count, IndexResourcePolicy.MaxParallelRootScans));
        using var semaphore = new SemaphoreSlim(maxParallelism);
        var cancellations = new ConcurrentBag<OperationCanceledException>();
        var threads = new List<Thread>(roots.Count);

        foreach (var root in roots)
        {
            semaphore.Wait(cancellationToken);

            var thread = new Thread(() =>
            {
                try
                {
                    Thread.CurrentThread.Priority = ThreadPriority.Lowest;
                    BackgroundThreadMode.EnterForCurrentThread();
                    cancellationToken.ThrowIfCancellationRequested();
                    TryScanAndMerge(root, target, cancellationToken);
                }
                catch (OperationCanceledException ex)
                {
                    cancellations.Add(ex);
                }
                finally
                {
                    BackgroundThreadMode.ExitForCurrentThread();
                    semaphore.Release();
                }
            })
            {
                IsBackground = true,
                Name = "DeskSearch.RootScan",
                Priority = ThreadPriority.Lowest
            };

            threads.Add(thread);
            thread.Start();
        }

        foreach (var thread in threads)
            thread.Join();

        if (!cancellations.IsEmpty)
            throw new AggregateException(cancellations);
    }

    private bool ShouldAttemptScanStep(string path)
    {
        if (!_inclusion.IsPathInScope(path) || !Directory.Exists(path))
            return false;

        return !IsRootScanComplete(path);
    }

    private void ClearRootScanErrors(string root) => _rootScanErrors.TryRemove(root, out _);

    private void NoteRootScanError(string root) =>
        _rootScanErrors.AddOrUpdate(root, 1, (_, count) => count + 1);

    private bool RootHadScanErrors(string root) =>
        _rootScanErrors.TryGetValue(root, out var count) && count > 0;

    /// <summary>
    /// Re-scans roots that failed or finished with batch errors before the pass ends,
    /// so a single bad drive/path does not leave the rest of the system unindexed.
    /// </summary>
    private void RetryPendingScanSteps(
        IReadOnlyList<string> scanRoots,
        IndexStore target,
        CancellationToken cancellationToken)
    {
        for (var round = 0; round < IndexResourcePolicy.FailedRootScanRetryRounds; round++)
        {
            var pendingDrives = new List<string>();

            foreach (var root in scanRoots)
            {
                if (ShouldAttemptScanStep(root))
                    pendingDrives.Add(root);
            }

            if (pendingDrives.Count == 0)
                return;

            if (round > 0)
            {
                Thread.Sleep(IndexResourcePolicy.FailedRootScanRetryDelayMs);
                cancellationToken.ThrowIfCancellationRequested();
            }

            if (pendingDrives.Count > 0)
                RunRootScansInParallel(pendingDrives, target, cancellationToken);
        }
    }

    private void PromoteBuildingStore(IndexStore buildingStore, string buildingPath)
    {
        if (!_manualFullScanActive)
            throw new InvalidOperationException("index.db can only be replaced after a completed manual full index.");

        var canonicalPath = GetCanonicalDatabasePath();
        var backupPath = canonicalPath + ".previous";

        buildingStore.Analyze();
        SetProgressPhase(IndexProgressPhase.Applying);
        buildingStore.Checkpoint();
        buildingStore.Dispose();

        lock (_indexStoreSwapLock)
        {
            _activeBuildingStore = null;
            _indexStore?.Dispose();
            _indexStore = null;

            DeleteDatabaseFiles(backupPath);

            if (File.Exists(canonicalPath))
            {
                File.Move(canonicalPath, backupPath);
                DeleteDatabaseFiles(canonicalPath);
            }

            try
            {
                File.Move(buildingPath, canonicalPath);
            }
            catch
            {
                DeleteDatabaseFiles(canonicalPath);
                if (File.Exists(backupPath) && !File.Exists(canonicalPath))
                    File.Move(backupPath, canonicalPath);

                throw;
            }

            DeleteDatabaseFiles(backupPath);
            DeleteDatabaseFiles(buildingPath);

            _indexStore = new IndexStore(canonicalPath);
            Interlocked.Exchange(ref _approximateLiveCount, _indexStore.Count);
            Interlocked.Exchange(ref _lastScanUpdatedCount, Interlocked.Read(ref _scanIndexedCount));
            Interlocked.Exchange(ref _scanIndexedCount, 0);
            Interlocked.Exchange(ref _incrementalUpdateCount, 0);
        }

        lock (_rootsLock)
        {
            _indexedRoots.Clear();
            foreach (var root in _indexStore.LoadIndexedRoots())
                _indexedRoots.Add(root);
        }

        NotifyIndexUpdatedIfNeeded();
    }

    private static void DiscardBuildingStore(IndexStore buildingStore, string buildingPath)
    {
        try
        {
            buildingStore.Dispose();
        }
        catch
        {
            // best effort; the file cleanup below still runs
        }

        DeleteDatabaseFiles(buildingPath);
    }

    private void TryScanAndMerge(string root, IndexStore target, CancellationToken cancellationToken)
    {
        try
        {
            ScanAndMerge(root, target, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (OutOfMemoryException)
        {
            throw;
        }
        catch (Exception ex)
        {
            ReportScanRootError(root, ex);
            NoteRootScanError(root);
        }
    }

    private static void ReportScanRootError(string root, Exception ex)
    {
        System.Diagnostics.Trace.WriteLine(
            $"DeskSearch index scan skipped '{root}': {ex.GetType().Name}: {ex.Message}");
    }

    private void ScanAndMerge(string root, IndexStore target, CancellationToken cancellationToken)
    {
        if (!_inclusion.IsPathInScope(root))
            return;

        if (!Directory.Exists(root))
            return;

        _currentScanPath = root;
        ClearRootScanErrors(root);

        ScanTree(
            root,
            cancellationToken,
            batch => MergeEntriesBatchInto(target, root, batch));

        if (RootHadScanErrors(root))
            return;

        if (!_disableScannedPrefixSkip)
            RememberScannedDirectoryPrefix(root);

        var normalizedRoot = NormalizeDirectoryPrefix(root);
        if (normalizedRoot is not null)
        {
            target.MarkRootIndexed(normalizedRoot);
            target.ClearScanCheckpoint(normalizedRoot);
            lock (_rootsLock)
                _indexedRoots.Add(normalizedRoot);
        }

        AdvanceScanProgress(root);
    }

    private void MergeEntriesBatchInto(IndexStore target, string root, IReadOnlyList<FileEntry> batch)
    {
        if (batch.Count == 0)
            return;

        try
        {
            target.UpsertBatch(batch);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Trace.WriteLine(
                $"DeskSearch index upsert skipped for '{root}': {ex.GetType().Name}: {ex.Message}");
            NoteRootScanError(root);
            return;
        }

        Thread.Sleep(IndexResourcePolicy.BatchCommitDelayMs);
        Interlocked.Add(ref _scanIndexedCount, batch.Count);
        _activeStepEntries.AddOrUpdate(root, batch.Count, (_, existing) => existing + batch.Count);
        UpdateScanProgressPercent();
        ReportProgress(root, false);
    }

    private void NotifyIndexUpdatedIfNeeded()
    {
        // Check the cheap time-based throttle before touching Count: this is called on
        // every merged batch during scanning, and Count needs the same lock the writer
        // just used, so querying it unconditionally here would add avoidable contention.
        var now = DateTime.UtcNow;
        if ((now - _lastIndexUpdatedTime).TotalSeconds < IndexResourcePolicy.IndexUpdatedMinSeconds)
            return;

        var currentCount = Count;
        if (currentCount - _lastIndexUpdatedCount < IndexResourcePolicy.IndexUpdatedMinEntries)
            return;

        _lastIndexUpdatedCount = currentCount;
        _lastIndexUpdatedTime = now;
        IndexUpdated?.Invoke(this, EventArgs.Empty);
    }

    private void AdvanceScanProgress(string? root)
    {
        lock (_progressLock)
        {
            if (root is not null)
                _activeStepEntries.TryRemove(root, out _);

            _completedScanSteps++;
            _scanProgressPercent = _totalScanSteps <= 0
                ? 0
                : Math.Min(99, _completedScanSteps * 100 / _totalScanSteps);
        }

        ReportProgress(root, false, force: true);
    }

    private void UpdateScanProgressPercent()
    {
        lock (_progressLock)
        {
            if (_totalScanSteps <= 0)
                return;

            var stepWeight = 100.0 / _totalScanSteps;
            var completed = _completedScanSteps * stepWeight;

            var bonus = 0.0;
            var anyActiveEntries = false;
            foreach (var entries in _activeStepEntries.Values)
            {
                if (entries <= 0)
                    continue;

                anyActiveEntries = true;
                bonus += Math.Min(
                    stepWeight * 0.99,
                    stepWeight * (1.0 - Math.Exp(-entries / (double)IndexResourcePolicy.ScanStepProgressEntryScale)));
            }

            var percent = (int)Math.Min(99, completed + bonus);
            if (percent < 1 && (anyActiveEntries || _completedScanSteps > 0))
                percent = 1;

            _scanProgressPercent = percent;
        }
    }

    private void RememberScannedDirectoryPrefix(string root)
    {
        var prefix = NormalizeDirectoryPrefix(root);
        if (prefix is null)
            return;

        lock (_scannedPrefixesLock)
            _scannedDirectoryPrefixes.Add(prefix);
    }

    private bool IsUnderScannedSubtree(string directoryPath)
    {
        var prefix = NormalizeDirectoryPrefix(directoryPath);
        if (prefix is null)
            return false;

        lock (_scannedPrefixesLock)
        {
            foreach (var scanned in _scannedDirectoryPrefixes)
            {
                if (prefix.StartsWith(scanned, StringComparison.OrdinalIgnoreCase))
                    return true;
            }
        }

        return false;
    }

    private void ScanTree(
        string root,
        CancellationToken cancellationToken,
        Action<IReadOnlyList<FileEntry>> mergeBatch)
    {
        if (!Directory.Exists(root))
            return;

        var visitedReparseTargets = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var batch = new List<FileEntry>(IndexStoragePolicy.BulkMergeBatchSize);

        void FlushBatch()
        {
            if (batch.Count == 0)
                return;

            var toMerge = batch;
            batch = new List<FileEntry>(IndexStoragePolicy.BulkMergeBatchSize);
            try
            {
                mergeBatch(toMerge);
            }
            catch (Exception ex)
            {
                System.Diagnostics.Trace.WriteLine(
                    $"DeskSearch index batch skipped under '{root}': {ex.GetType().Name}: {ex.Message}");
            }
        }

        var enumerable = new FileSystemEnumerable<FileEntry>(
            root,
            TransformEntry,
            ScanEnumerationOptions)
        {
            ShouldIncludePredicate = ShouldIncludeEntry,
            ShouldRecursePredicate = ShouldRecurseIntoDirectory
        };

        try
        {
            foreach (var entry in enumerable)
            {
                try
                {
                    cancellationToken.ThrowIfCancellationRequested();

                    if (!ReferenceEquals(entry, FileEntry.Failed))
                        batch.Add(entry);

                    MaybeYield(cancellationToken);

                    if (batch.Count >= IndexStoragePolicy.BulkMergeBatchSize)
                        FlushBatch();
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    System.Diagnostics.Trace.WriteLine(
                        $"DeskSearch index entry skipped under '{root}': {ex.GetType().Name}: {ex.Message}");
                }
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Trace.WriteLine(
                $"DeskSearch index enumeration interrupted under '{root}': {ex.GetType().Name}: {ex.Message}");
            throw;
        }
        finally
        {
            FlushBatch();
        }

        return;

        FileEntry TransformEntry(ref FileSystemEntry entry)
        {
            try
            {
                var fullPath = entry.ToFullPath();
                return CreateEntry(fullPath, entry.IsDirectory);
            }
            catch
            {
                return FileEntry.Failed;
            }
        }

        bool ShouldIncludeEntry(ref FileSystemEntry entry)
        {
            try
            {
                return _inclusion.IsPathInScope(entry.ToFullPath());
            }
            catch
            {
                return false;
            }
        }

        bool ShouldRecurseIntoDirectory(ref FileSystemEntry entry)
        {
            if (!entry.IsDirectory)
                return false;

            try
            {
                var path = entry.ToFullPath();
                if (!_inclusion.IsPathInScope(path))
                    return false;

                if (!_disableScannedPrefixSkip && IsUnderScannedSubtree(path))
                    return false;

                var reparseTargetKey = TryGetReparseTargetDirectoryKey(path);
                if (reparseTargetKey is not null && !visitedReparseTargets.Add(reparseTargetKey))
                    return false;

                return true;
            }
            catch
            {
                return false;
            }
        }
    }

    private static string? TryGetReparseTargetDirectoryKey(string directoryPath)
    {
        try
        {
            var info = new DirectoryInfo(directoryPath);
            if ((info.Attributes & FileAttributes.ReparsePoint) == 0)
                return null;

            var target = info.ResolveLinkTarget(returnFinalTarget: true);
            return target is null ? null : NormalizeDirectoryPrefix(target.FullName);
        }
        catch
        {
            return null;
        }
    }

    private static string? TryNormalizeDirectoryPath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return null;

        try
        {
            return Path.GetFullPath(path.TrimEnd('\\', '/'));
        }
        catch
        {
            return path.TrimEnd('\\', '/');
        }
    }

    private static string? NormalizeDirectoryPrefix(string path)
    {
        var normalized = TryNormalizeDirectoryPath(path);
        return normalized is null ? null : normalized.TrimEnd('\\') + "\\";
    }

    private void MaybeYield(CancellationToken cancellationToken)
    {
        // Multiple root-scan threads can call this concurrently, so the counter needs
        // to be a real atomic increment rather than a plain read-modify-write.
        var count = Interlocked.Increment(ref _entriesSinceYield);
        if (count < IndexResourcePolicy.ScanYieldEveryEntries)
            return;

        Interlocked.Exchange(ref _entriesSinceYield, 0);
        Thread.Sleep(IndexResourcePolicy.ScanYieldDelayMs);
        cancellationToken.ThrowIfCancellationRequested();
    }

    private static void PauseBetweenScanRoots(CancellationToken cancellationToken)
    {
        Thread.Sleep(IndexResourcePolicy.ScanDrivePauseMs);
        cancellationToken.ThrowIfCancellationRequested();
    }

    private void EnableSearchIfNeeded()
    {
        if (!HasStableSearchIndex || _searchEnabledEventRaised)
            return;

        _searchEnabledEventRaised = true;
        SearchEnabled?.Invoke(this, EventArgs.Empty);
    }

    private void DisableSearch()
    {
        if (HasStableSearchIndex)
            return;

        _searchEnabledEventRaised = false;
    }

    private volatile bool _liveIndexAnalyzeScheduled;

    /// <summary>
    /// Enables search on the live index immediately and runs SQLite ANALYZE in the
    /// background (statistics only — search does not wait for it).
    /// </summary>
    private void EnsureLiveIndexAnalyzedForSearch()
    {
        if (_indexStore is null || _indexStore.Count == 0)
            return;

        EnableSearchIfNeeded();

        if (_liveIndexAnalyzeScheduled)
            return;

        _liveIndexAnalyzeScheduled = true;
        _indexWorker.Enqueue(AnalyzeLiveIndexInBackground);
    }

    private void AnalyzeLiveIndexInBackground()
    {
        if (_indexStore is null || _indexStore.Count == 0)
            return;

        try
        {
            _indexStore.Analyze();
        }
        catch
        {
            // Search remains available even if ANALYZE fails.
        }
    }

    private void BeginScanProgress(int totalSteps, int completedSteps = 0)
    {
        lock (_progressLock)
        {
            _totalScanSteps = Math.Max(1, totalSteps);
            _completedScanSteps = Math.Clamp(completedSteps, 0, _totalScanSteps);
            _activeStepEntries.Clear();
            _scanProgressPercent = _totalScanSteps <= 0
                ? 0
                : Math.Min(99, _completedScanSteps * 100 / _totalScanSteps);
            _lastProgressReport = -1;
            _lastProgressTime = DateTime.MinValue;
        }

        _isScanComplete = false;
        if (!HasCompletedSearchIndex())
            DisableSearch();
        else
            EnableSearchIfNeeded();

        SetProgressPhase(IndexProgressPhase.Scanning, forceReport: false);
        ReportProgress(null, false, force: true);
    }

    private void SetProgressPhase(IndexProgressPhase phase, bool forceReport = true)
    {
        _progressPhase = phase;
        if (forceReport)
            ReportProgress(_currentScanPath, false, force: true);
    }

    private void ReportProgress(string? currentPath, bool isComplete, bool force = false)
    {
        var count = isComplete
            ? GetCompletedIndexCountForProgress()
            : (int)Math.Min(int.MaxValue, Interlocked.Read(ref _scanIndexedCount));
        var now = DateTime.UtcNow;

        if (!force
            && !isComplete
            && count - _lastProgressReport < IndexResourcePolicy.ProgressReportMinEntries
            && (now - _lastProgressTime).TotalSeconds < IndexResourcePolicy.ProgressReportMinSeconds)
        {
            return;
        }

        _lastProgressReport = count;
        _lastProgressTime = now;
        var percent = isComplete ? 100 : MapDisplayPercent(_progressPhase, ComputeActiveScanPercent());
        var phase = isComplete ? IndexProgressPhase.Idle : _progressPhase;
        IndexProgress?.Invoke(this, new IndexProgressEventArgs(count, currentPath, isComplete, percent, phase));
    }

    private int ComputeActiveScanPercent() => _scanProgressPercent;

    private int GetCompletedIndexCountForProgress() => GetIndexedEntryCount();

    private static int MapDisplayPercent(IndexProgressPhase phase, int scanPercent) =>
        phase switch
        {
            IndexProgressPhase.Scanning => scanPercent,
            IndexProgressPhase.Analyzing => 92,
            IndexProgressPhase.Applying => 97,
            _ => scanPercent
        };

    private static FileEntry? TryCreateEntry(string fullPath, bool isDirectory)
    {
        try
        {
            return CreateEntry(fullPath, isDirectory);
        }
        catch
        {
            return null;
        }
    }

    private static FileEntry CreateEntry(string fullPath, bool isDirectory, DateTime? lastWriteTimeUtc = null)
    {
        var normalizedPath = isDirectory ? fullPath.TrimEnd('\\') : fullPath;
        var fileName = Path.GetFileName(normalizedPath);

        if (string.IsNullOrEmpty(fileName) && isDirectory)
            fileName = Path.GetPathRoot(normalizedPath)?.TrimEnd('\\') ?? normalizedPath;

        var directory = isDirectory
            ? Path.GetDirectoryName(normalizedPath) ?? string.Empty
            : Path.GetDirectoryName(fullPath) ?? string.Empty;

        var modifiedUtc = ToModifiedUtc(lastWriteTimeUtc, fullPath, isDirectory);

        return new FileEntry(normalizedPath, fileName, directory, isDirectory, modifiedUtc);
    }

    private static long ToModifiedUtc(DateTime? lastWriteTimeUtc, string fullPath, bool isDirectory)
    {
        if (lastWriteTimeUtc.HasValue)
            return ToUnixTimeSeconds(lastWriteTimeUtc.Value);

        try
        {
            var utc = isDirectory
                ? Directory.GetLastWriteTimeUtc(fullPath)
                : File.GetLastWriteTimeUtc(fullPath);
            return ToUnixTimeSeconds(utc);
        }
        catch
        {
            return 0;
        }
    }

    private static long ToUnixTimeSeconds(DateTime utc)
    {
        if (utc.Kind == DateTimeKind.Local)
            utc = utc.ToUniversalTime();
        else if (utc.Kind == DateTimeKind.Unspecified)
            utc = DateTime.SpecifyKind(utc, DateTimeKind.Utc);

        return new DateTimeOffset(utc).ToUnixTimeSeconds();
    }

    private static IReadOnlyList<string> GetPriorityPaths()
    {
        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        AddIfExists(paths, Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory));
        AddIfExists(paths, Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments));
        AddIfExists(paths, Environment.GetFolderPath(Environment.SpecialFolder.MyMusic));
        AddIfExists(paths, Environment.GetFolderPath(Environment.SpecialFolder.MyPictures));
        AddIfExists(paths, Environment.GetFolderPath(Environment.SpecialFolder.MyVideos));
        AddIfExists(paths, Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"));
        AddIfExists(paths, Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "OneDrive"));
        AddIfExists(paths, Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "OneDrive", "Desktop"));
        AddIfExists(paths, Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "OneDrive", "바탕 화면"));

        return paths.OrderBy(p => p.Length).ToList();
    }

    private IReadOnlyList<string> FilterPathsInScope(IEnumerable<string> paths) =>
        paths.Where(path => _inclusion.IsPathInScope(path)).ToList();

    private static void AddIfExists(HashSet<string> paths, string path)
    {
        if (Directory.Exists(path))
            paths.Add(path);
    }
}
