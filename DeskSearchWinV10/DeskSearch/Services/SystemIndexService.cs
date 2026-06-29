using System.Collections.Concurrent;
using System.IO.Enumeration;
using DeskSearch.Helpers;
using DeskSearch.Models;
using Microsoft.Data.Sqlite;

namespace DeskSearch.Services;

public sealed class SystemIndexService : IDisposable
{
    // FileSystemEnumerable defaults to skipping Hidden | System | ReparsePoint.
    // Only reparse points (junctions/symlinks) are skipped so hidden/system files
    // and dot-prefixed names (e.g. .gitignore, .env) remain indexed and searchable.
    private static readonly EnumerationOptions ScanEnumerationOptions = new()
    {
        RecurseSubdirectories = true,
        IgnoreInaccessible = true,
        AttributesToSkip = FileAttributes.ReparsePoint
    };

    private IndexStore? _indexStore;
    private IndexStore? _activeBuildingStore;
    private readonly object _indexStoreSwapLock = new();
    private readonly string _databaseFolder;
    private readonly IndexBackgroundWorker _indexWorker = new();
    private readonly FileSearchService _searchService = new();    private readonly HashSet<string> _indexedRoots = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _rootsLock = new();
    private readonly HashSet<string> _pendingResyncPaths = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _resyncLock = new();
    private readonly HashSet<string> _scannedDirectoryPrefixes = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _scannedPrefixesLock = new();
    private readonly object _progressLock = new();
    private IndexExclusionPolicy _exclusions = IndexExclusionPolicy.Empty;

    private int _lastProgressReport = -1;    private DateTime _lastProgressTime = DateTime.MinValue;
    private int _entriesSinceYield;
    private int _lastIndexUpdatedCount;
    private DateTime _lastIndexUpdatedTime = DateTime.MinValue;
    private bool _isSearchEnabled;
    private bool _isScanComplete;
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

    // Entries written during the active scan pass (building DB for re-index, live DB for first index).
    private long _scanIndexedCount;

    // Set when a previous session's shadow-build rescan never finished (the process was
    // closed mid-rescan), so the abandoned attempt gets automatically retried at startup
    // instead of silently falling back to whatever the live store had before that rescan.
    private readonly bool _hasInterruptedRescan;

    // A full-scan request received while indexing is already running is deferred instead of
    // cancelling the active scan (EnqueueExclusive would abort mid-drive and leave a partial index).
    private volatile bool _deferredFullScan;

    // Set when the user pauses indexing; suppresses automatic rescan retry until resumed.
    private volatile bool _indexingPaused;

    // Set when indexing is cancelled for shutdown/reset.
    private volatile bool _userStoppedScan;

    private int _scanGeneration;

    public SystemIndexService()
    {
        _databaseFolder = AppStoragePaths.DataFolder;

        // Drop any in-progress build from a prior session; keep the completed search index.
        _hasInterruptedRescan = File.Exists(GetBuildingDatabasePath());
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

    private bool AreAllScanRootsIndexed()
    {
        foreach (var root in ScanRoots)
        {
            if (_exclusions.IsPathExcluded(root) || !Directory.Exists(root))
                continue;

            var normalized = NormalizeDirectoryPrefix(root);
            if (normalized is null)
                continue;

            lock (_rootsLock)
            {
                if (!_indexedRoots.Contains(normalized))
                    return false;
            }
        }

        return true;
    }

    private bool AreAllScanStepsIndexed()
    {
        foreach (var path in WatchPaths)
        {
            if (_exclusions.IsPathExcluded(path) || !Directory.Exists(path))
                continue;

            var normalized = NormalizeDirectoryPrefix(path);
            if (normalized is null)
                continue;

            lock (_rootsLock)
            {
                if (!_indexedRoots.Contains(normalized))
                    return false;
            }
        }

        return AreAllScanRootsIndexed();
    }

    private bool IsBuildingStoreReadyToPromote(IndexStore buildingStore)
    {
        if (buildingStore.Count <= 0)
            return false;

        // Every triggered rebuild must finish all scan steps; never promote a partial pass.
        return AreAllScanStepsIndexed();
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
            if (_indexStore is not null && _indexStore.Count > 0)
                return _indexStore;

            if (_activeBuildingStore is not null)
                return _activeBuildingStore;

            if (_indexStore is not null)
                return _indexStore;

            throw new InvalidOperationException("No index store is available for search.");
        }
    }

    public bool IsSearchEnabled => HasStableSearchIndex || _isSearchEnabled;
    public bool IsScanComplete => _isScanComplete;
    public bool IsIndexingPaused => _indexingPaused;
    public bool CanResumeIndexing => CanResumeBuildingIndex();
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
            {
                if (_indexStore is not null && _indexStore.Count > 0)
                    return _indexStore.Count;

                if (_activeBuildingStore is not null)
                    return _activeBuildingStore.Count;

                return _indexStore?.Count ?? 0;
            }
        }
    }

    public bool NeedsFtsMigration => _indexStore?.NeedsFtsMigration ?? false;

    public void RunFtsMigration(Action<int>? onProgress = null, CancellationToken cancellationToken = default)
    {
        if (_indexStore is null)
            return;

        _indexStore.RunFtsMigration(onProgress, cancellationToken);
    }

    public IReadOnlyList<string> WatchPaths => FilterScanPaths(GetPriorityPaths());
    public IReadOnlyList<string> ScanRoots => FilterScanPaths(GetAllScanRoots());

    public void ConfigureExclusions(AppSettings settings)
    {
        _exclusions = IndexExclusionPolicy.FromSettings(settings);
        _indexWorker.Enqueue(PurgeExcludedEntries);
    }

    public bool IsPathExcluded(string path) => _exclusions.IsPathExcluded(path);

    public event EventHandler? SearchEnabled;
    public event EventHandler<IndexProgressEventArgs>? IndexProgress;
    public event EventHandler? IndexUpdated;
    /// <summary>Raised when a full index rebuild starts (manual, scheduled, or startup).</summary>
    public event EventHandler? FullIndexRebuildStarted;

    public void StartBackgroundScan()
    {
        _indexWorker.EnqueueExclusive(RunStartupIndexMaintenance);
    }

    /// <summary>
    /// Starts a user-requested full index from scratch. Cancels any automatic/background
    /// indexing, deletes <c>index.building.db</c>, then builds a new index in the building DB.
    /// </summary>
    public void RestartScan()
    {
        _indexingPaused = false;
        BeginFullIndexScan(cancelCurrent: true, reportProgress: true);
    }

    public void StopScan()
    {
        _indexingPaused = true;
        _deferredFullScan = false;
        _indexWorker.CancelExclusiveWork();
    }

    /// <summary>
    /// Stops indexing on exit. Closes the building DB connection but leaves <c>index.building.db</c> on disk.
    /// The completed search index (<c>index.db</c>) is never removed.
    /// </summary>
    public void AbortIndexingForShutdown()
    {
        _userStoppedScan = true;
        _deferredFullScan = false;
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
    }

    public void ResetIndexDatabase()
    {
        _userStoppedScan = true;
        _deferredFullScan = false;
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

        lock (_resyncLock)
            _pendingResyncPaths.Clear();

        _isSearchEnabled = false;
        _isScanComplete = false;
        _liveIndexAnalyzeScheduled = false;
        _isScanning = false;
        _scanUsesShadowBuild = false;
        _indexingPaused = false;
        _userStoppedScan = false;
        _deferredFullScan = false;
        Interlocked.Exchange(ref _scanIndexedCount, 0);
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

        if (searchQuery.CanUseSqlScored && afterScanId == 0)
        {
            var results = store.SearchSqlScored(searchQuery, caseSensitive, sortOrder);

            return new SearchBatchResult
            {
                Results = results,
                NextOffset = totalCount,
                NextScanId = 0,
                IsComplete = true,
                TopCandidates = []
            };
        }

        var page = store.ReadPageAfterId(afterScanId, batchSize);
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
    /// Schedules a full re-index into <c>index.building.db</c>. The live search index
    /// (<c>index.db</c>) is replaced only after the scan completes successfully.
    /// Uses the same fresh building-DB rebuild as manual <see cref="RestartScan"/>.
    /// </summary>
    public void RequestResyncAllRoots()
    {
        if (_indexingPaused)
            return;

        BeginFullIndexScan(cancelCurrent: true, reportProgress: false);
    }

    public void ScanMissingDriveRoots()
    {
        if (_indexingPaused)
            return;

        var missingRoots = new List<string>();
        foreach (var root in ScanRoots)
        {
            var normalizedRoot = NormalizeDirectoryPrefix(root);
            if (normalizedRoot is null)
                continue;

            bool alreadyIndexed;
            lock (_rootsLock)
                alreadyIndexed = _indexedRoots.Contains(normalizedRoot);

            if (!alreadyIndexed)
                missingRoots.Add(root);
        }

        if (missingRoots.Count == 0)
            return;

        BeginFullIndexScan(cancelCurrent: true, reportProgress: false);
    }

    /// <summary>
    /// Queues a full <see cref="RunScan"/> through <see cref="BeginFullIndexScan"/>.
    /// </summary>
    private void EnqueueFullScan(bool cancelCurrent = false) =>
        BeginFullIndexScan(cancelCurrent, reportProgress: false);

    /// <summary>
    /// Discards any partial building DB and starts a full scan of every root/priority path,
    /// matching manual re-index behaviour (no resume skips, no live-index partial resync).
    /// </summary>
    private void BeginFullIndexScan(bool cancelCurrent, bool reportProgress)
    {
        _userStoppedScan = false;
        _deferredFullScan = false;
        _isScanComplete = false;

        if (cancelCurrent)
        {
            Interlocked.Increment(ref _scanGeneration);
            _indexWorker.CancelExclusiveWork();
            WaitForActiveScanToStop();
        }
        else if (_isScanning)
        {
            _deferredFullScan = true;
            return;
        }

        PrepareFreshFullScanState();

        if (HasCompletedSearchIndex())
        {
            Interlocked.Exchange(ref _approximateLiveCount, _indexStore!.Count);
            EnableSearchIfNeeded();
        }

        if (reportProgress)
        {
            SetProgressPhase(IndexProgressPhase.Scanning, forceReport: false);
            ReportProgress(null, false, force: true);
        }

        var scanGeneration = Interlocked.Increment(ref _scanGeneration);
        _indexWorker.EnqueueExclusive(token => RunScan(token, scanGeneration));
    }

    private void WaitForActiveScanToStop()
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (_isScanning && DateTime.UtcNow < deadline)
            Thread.Sleep(50);
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

        lock (_resyncLock)
            _pendingResyncPaths.Clear();

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
        _scanUsesShadowBuild = HasStableSearchIndex;
    }

    private void TryRunDeferredFullScan()
    {
        if (!_deferredFullScan || _isScanning || _userStoppedScan || _indexingPaused)
            return;

        _deferredFullScan = false;
        BeginFullIndexScan(cancelCurrent: false, reportProgress: false);
    }

    private bool ShouldRetryScan(bool succeeded, int scanGeneration) =>
        !succeeded && !_indexingPaused && !_userStoppedScan && scanGeneration == _scanGeneration;

    private void ScheduleScanRetry(int scanGeneration)
    {
        if (!ShouldRetryScan(succeeded: false, scanGeneration))
            return;

        _indexWorker.Enqueue(() =>
        {
            Thread.Sleep(IndexResourcePolicy.FailedScanRetryDelayMs);
            if (!ShouldRetryScan(succeeded: false, scanGeneration) || _isScanning)
                return;

            EnqueueFullScan();
        });
    }

    private void CleanupAbortedScan(IndexStore target, string buildingPath)
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
        RestoreAfterAbortedBuild();
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

    private void RestoreSearchIndexAfterAbortedBuild()
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

        _isScanComplete = AreAllScanRootsIndexed();
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

    private bool CanResumeBuildingIndex()
    {
        if (_activeBuildingStore is not null)
            return true;

        var buildingPath = GetBuildingDatabasePath();
        if (!File.Exists(buildingPath))
            return false;

        try
        {
            using var probe = new IndexStore(buildingPath);
            return probe.Count > 0 || probe.LoadIndexedRoots().Count > 0 || probe.HasScanCheckpoints();
        }
        catch
        {
            return false;
        }
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

    public void ApplyBatchChanges(IReadOnlyList<string> removes, IReadOnlyList<string> adds)
    {
        if (removes.Count == 0 && adds.Count == 0)
            return;

        var removesCopy = removes.ToArray();
        var addsCopy = adds.ToArray();
        _indexWorker.Enqueue(() => ApplyBatchChangesCore(removesCopy, addsCopy));
    }

    public void RequestResyncPath(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !Directory.Exists(path))
            return;

        if (_exclusions.IsPathExcluded(path))
            return;

        lock (_resyncLock)
            _pendingResyncPaths.Add(path);

        _indexWorker.Enqueue(ProcessResyncQueue);
    }

    public void RequestResyncPriorityPaths()
    {
        foreach (var path in WatchPaths)
            RequestResyncPath(path);
    }

    public void Dispose()
    {
        AbortIndexingForShutdown();
        _indexWorker.Dispose();
        lock (_indexStoreSwapLock)
        {
            _indexStore?.Dispose();
            _activeBuildingStore?.Dispose();
            _activeBuildingStore = null;
        }
    }

    private void ApplyBatchChangesCore(IReadOnlyList<string> removes, IReadOnlyList<string> adds)
    {
        if (!CanUpdateLiveSearchIndex() || _indexStore is null)
            return;

        foreach (var path in removes)
            _indexStore.RemovePathAndDescendants(path);

        var upserts = new List<FileEntry>(adds.Count);
        foreach (var path in adds)
        {
            if (_exclusions.IsPathExcluded(path))
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
            _indexStore.UpsertBatch(upserts);

        IndexUpdated?.Invoke(this, EventArgs.Empty);
    }

    private void ProcessResyncQueue()
    {
        if (_isScanning || !CanUpdateLiveSearchIndex())
            return;

        string? path;
        lock (_resyncLock)
        {
            if (_pendingResyncPaths.Count == 0)
                return;

            path = _pendingResyncPaths.First();
            _pendingResyncPaths.Remove(path);
        }

        try
        {
            ResyncPath(path);
            IndexUpdated?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception)
        {
            // 재동기화 실패 시 다음 주기에 재시도
        }

        Thread.Sleep(IndexResourcePolicy.BatchCommitDelayMs);

        lock (_resyncLock)
        {
            if (_pendingResyncPaths.Count > 0)
                _indexWorker.Enqueue(ProcessResyncQueue);
        }
    }

    private void ResyncPath(string root)
    {
        if (!CanUpdateLiveSearchIndex() || _indexStore is null)
            return;

        var normalizedRoot = NormalizeDirectoryPrefix(root);
        if (normalizedRoot is null)
            return;

        _indexStore.RemovePathAndDescendants(root);
        _indexStore.BeginBulkIngest();
        try
        {
            ScanTree(root, CancellationToken.None, batch => MergeEntriesBatchInto(_indexStore, root, batch));
        }
        finally
        {
            _indexStore.EndBulkIngest();
        }

        RememberScannedDirectoryPrefix(root);
        MarkRootIndexed(normalizedRoot);
    }

    private void RunStartupIndexMaintenance(CancellationToken cancellationToken)
    {
        ReconcileIndexMetadata();

        if (HasCompletedSearchIndex())
            EnsureLiveIndexAnalyzedForSearch();

        if (_indexingPaused)
        {
            if (HasCompletedSearchIndex())
                CompleteStartupWithExistingIndex();
            return;
        }

        // Every indexing run scans all configured roots from scratch in a new building DB.
        var needsFullScan = !HasStableSearchIndex
            || _hasInterruptedRescan
            || !AreAllScanStepsIndexed();

        if (needsFullScan)
        {
            PrepareFreshFullScanState();
            var scanGeneration = Interlocked.Increment(ref _scanGeneration);
            RunScan(cancellationToken, scanGeneration);
            return;
        }

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

        EnsureLiveIndexAnalyzedForSearch();

        if (!AreAllScanRootsIndexed())
        {
            BeginFullIndexScan(cancelCurrent: true, reportProgress: false);
            return;
        }

        _isScanComplete = true;
        _scanProgressPercent = 100;
        _totalScanSteps = 1;
        _completedScanSteps = 1;
        ReportProgress(null, true, force: true);
    }

    // Every full scan writes into a fresh index.building.db. Search reads index.db when a
    // completed index exists; otherwise it reads the in-progress building database.
    private void RunScan(CancellationToken cancellationToken, int scanGeneration)
    {
        FullIndexRebuildStarted?.Invoke(this, EventArgs.Empty);

        var previousPriority = Thread.CurrentThread.Priority;
        Thread.CurrentThread.Priority = ThreadPriority.Lowest;
        BackgroundThreadMode.EnterForCurrentThread();
        _isScanning = true;

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

        var priorityPaths = WatchPaths;
        var scanRoots = ScanRoots;
        BeginScanProgress(priorityPaths.Count + scanRoots.Count, completedSteps: 0);
        target.BeginBulkIngest();

        var succeeded = false;
        try
        {
            foreach (var path in priorityPaths)
            {
                cancellationToken.ThrowIfCancellationRequested();
                TryScanAndMerge(path, target, cancellationToken);
                PauseBetweenScanRoots(cancellationToken);
            }

            RunRootScansInParallel(scanRoots, target, cancellationToken);

            RetryPendingScanSteps(priorityPaths, scanRoots, target, cancellationToken);

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
            _currentScanPath = null;
            BackgroundThreadMode.ExitForCurrentThread();
            Thread.CurrentThread.Priority = previousPriority;
        }

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
                PromoteBuildingStore(target, buildingPath);
                lock (_resyncLock)
                    _pendingResyncPaths.Clear();
                promoted = true;
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

            if (promoted)
            {
                EnableSearchIfNeeded();
                _isScanComplete = true;
                _scanUsesShadowBuild = false;
                _scanProgressPercent = 100;
                Interlocked.Exchange(ref _approximateLiveCount, _indexStore?.Count ?? 0);
                ReportProgress(null, true, force: true);
            }
            else if (ShouldRetryScan(succeeded: false, scanGeneration))
            {
                CleanupAbortedScan(target, buildingPath);
                ScheduleScanRetry(scanGeneration);
            }
            else
            {
                CleanupAbortedScan(target, buildingPath);
            }
        }
        else if (_indexingPaused || _userStoppedScan)
        {
            PauseActiveScan(target);
        }
        else if (ShouldRetryScan(succeeded, scanGeneration))
        {
            CleanupAbortedScan(target, buildingPath);
            ScheduleScanRetry(scanGeneration);
        }
        else
        {
            CleanupAbortedScan(target, buildingPath);
        }

        TryRunDeferredFullScan();
    }

    private void RestoreAfterAbortedBuild() => RestoreSearchIndexAfterAbortedBuild();

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
        if (_exclusions.IsPathExcluded(path) || !Directory.Exists(path))
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
        IReadOnlyList<string> priorityPaths,
        IReadOnlyList<string> scanRoots,
        IndexStore target,
        CancellationToken cancellationToken)
    {
        for (var round = 0; round < IndexResourcePolicy.FailedRootScanRetryRounds; round++)
        {
            var pendingPriority = new List<string>();
            var pendingDrives = new List<string>();

            foreach (var path in priorityPaths)
            {
                if (ShouldAttemptScanStep(path))
                    pendingPriority.Add(path);
            }

            foreach (var root in scanRoots)
            {
                if (ShouldAttemptScanStep(root))
                    pendingDrives.Add(root);
            }

            if (pendingPriority.Count == 0 && pendingDrives.Count == 0)
                return;

            if (round > 0)
            {
                Thread.Sleep(IndexResourcePolicy.FailedRootScanRetryDelayMs);
                cancellationToken.ThrowIfCancellationRequested();
            }

            foreach (var path in pendingPriority)
            {
                TryScanAndMerge(path, target, cancellationToken);
                PauseBetweenScanRoots(cancellationToken);
            }

            if (pendingDrives.Count > 0)
                RunRootScansInParallel(pendingDrives, target, cancellationToken);
        }
    }

    private void PromoteBuildingStore(IndexStore buildingStore, string buildingPath)
    {
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
            Interlocked.Exchange(ref _scanIndexedCount, 0);
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
        if (_exclusions.IsPathExcluded(root))
        {
            AdvanceScanProgress(root);
            return;
        }

        if (!Directory.Exists(root))
        {
            AdvanceScanProgress(root);
            return;
        }

        _currentScanPath = root;
        ClearRootScanErrors(root);

        ScanTree(
            root,
            cancellationToken,
            batch => MergeEntriesBatchInto(target, root, batch));

        if (RootHadScanErrors(root))
            return;

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

    private void MarkRootIndexed(string normalizedRoot)
    {
        _indexStore?.MarkRootIndexed(normalizedRoot);
        lock (_rootsLock)
            _indexedRoots.Add(normalizedRoot);
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

        if (ReferenceEquals(target, _activeBuildingStore) && !HasCompletedSearchIndex())
        {
            EnableSearchIfNeeded();
            NotifyIndexUpdatedIfNeeded();
        }
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
                return !_exclusions.IsPathExcluded(entry.ToFullPath());
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
                if (_exclusions.IsPathExcluded(path))
                    return false;

                return !IsUnderScannedSubtree(path);
            }
            catch
            {
                return false;
            }
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
        if (HasStableSearchIndex)
        {
            if (_isSearchEnabled)
                return;

            _isSearchEnabled = true;
            SearchEnabled?.Invoke(this, EventArgs.Empty);
            return;
        }

        if (_isSearchEnabled)
            return;

        if (Count == 0)
            return;

        _isSearchEnabled = true;
        SearchEnabled?.Invoke(this, EventArgs.Empty);
    }

    private void DisableSearch()
    {
        if (HasStableSearchIndex)
            return;

        _isSearchEnabled = false;
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

        var restorePhase = _progressPhase;
        var reportUi = !_isScanning && restorePhase == IndexProgressPhase.Idle;
        if (reportUi)
            SetProgressPhase(IndexProgressPhase.Analyzing, forceReport: true);

        try
        {
            _indexStore.Analyze();
        }
        catch
        {
            // Search remains available even if ANALYZE fails.
        }
        finally
        {
            if (reportUi && restorePhase != IndexProgressPhase.Analyzing)
                SetProgressPhase(restorePhase, forceReport: restorePhase != IndexProgressPhase.Idle);
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
        var count = (int)Math.Min(int.MaxValue, Interlocked.Read(ref _scanIndexedCount));
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

    private void PurgeExcludedEntries()
    {
        if (!CanUpdateLiveSearchIndex() || _indexStore is null)
            return;

        if (_indexStore.PurgeExcluded(_exclusions) > 0)
            IndexUpdated?.Invoke(this, EventArgs.Empty);
    }

    private IReadOnlyList<string> FilterScanPaths(IEnumerable<string> paths) =>
        paths.Where(path => !_exclusions.IsPathExcluded(path)).ToList();

    private static IReadOnlyList<string> GetAllScanRoots()
    {
        var roots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var drive in DriveInfo.GetDrives())
        {
            try
            {
                if (!drive.IsReady)
                    continue;

                var root = drive.RootDirectory.FullName;
                if (!string.IsNullOrWhiteSpace(root))
                    roots.Add(root);
            }
            catch (IOException)
            {
                // 드라이브 정보를 읽을 수 없음
            }
            catch (UnauthorizedAccessException)
            {
                // 드라이브 접근 불가
            }
        }

        return roots.OrderBy(r => r, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static void AddIfExists(HashSet<string> paths, string path)
    {
        if (Directory.Exists(path))
            paths.Add(path);
    }
}
