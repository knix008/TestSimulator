using System.Collections.Concurrent;
using System.IO.Enumeration;
using DeskSearch.Helpers;
using DeskSearch.Models;
namespace DeskSearch.Services;

public sealed class SystemIndexService : IDisposable
{
    private static readonly EnumerationOptions ScanEnumerationOptions = new()
    {
        RecurseSubdirectories = true,
        IgnoreInaccessible = true,
        AttributesToSkip = FileAttributes.ReparsePoint
    };

    private volatile IndexStore _indexStore;
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
    private int _scanProgressPercent;
    private int _totalScanSteps;
    private int _completedScanSteps;

    // Keyed by the root path currently being scanned, so multiple roots (e.g. separate
    // drives) can be scanned concurrently without one root's progress clobbering another's.
    private readonly ConcurrentDictionary<string, int> _activeStepEntries =
        new(StringComparer.OrdinalIgnoreCase);

    private string? _currentScanPath;

    // A lock-free, "good enough for display" stand-in for Count while a scan writes
    // directly into the live store. The real Count property needs the live store's
    // lock — the same lock the writer holds during each batch commit — so polling it
    // from the UI thread (Settings window progress, tray menu) while indexing is active
    // can block the UI waiting for that lock. This counter is only ever incremented, so
    // reading it never contends with the writer.
    private long _approximateLiveCount;

    // Set when a previous session's shadow-build rescan never finished (the process was
    // closed mid-rescan), so the abandoned attempt gets automatically retried at startup
    // instead of silently falling back to whatever the live store had before that rescan.
    private readonly bool _hasInterruptedRescan;

    public SystemIndexService()
    {
        _databaseFolder = AppStoragePaths.DataFolder;

        // A leftover shadow-build file means a rescan was in progress when the process
        // last exited. Its partial content can't be trusted (no mid-scan resume point is
        // tracked), so it's discarded — but note that it existed, so the rescan can be
        // redone from scratch rather than just forgotten.
        _hasInterruptedRescan = File.Exists(GetBuildingDatabasePath());
        DeleteDatabaseFiles(GetBuildingDatabasePath());

        _indexStore = new IndexStore(GetCanonicalDatabasePath());
        _approximateLiveCount = _indexStore.Count;

        lock (_rootsLock)
        {
            foreach (var root in _indexStore.LoadIndexedRoots())
                _indexedRoots.Add(root);
        }

        EnableSearchIfNeeded();
    }

    /// <summary>
    /// Cheap, lock-free, approximate entry count — safe to poll from the UI thread even
    /// while a scan is actively writing to the live store. See <see cref="_approximateLiveCount"/>.
    /// </summary>
    public long ApproximateLiveCount => Interlocked.Read(ref _approximateLiveCount);

    private string GetCanonicalDatabasePath() =>
        Path.Combine(_databaseFolder, IndexStoragePolicy.DatabaseFileName);

    private string GetBuildingDatabasePath() =>
        Path.Combine(_databaseFolder, IndexStoragePolicy.BuildingDatabaseFileName);

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

    private static readonly string[] DatabaseFileSuffixes = ["", "-wal", "-shm", "-journal"];

    // Promoting a shadow build disposes the old live store and swaps in the new one;
    // any reader that grabs the reference must do so through this lock so it can never
    // observe a store that's mid-disposal (the lock only guards the reference read/swap
    // itself, not the actual DB work, so it's held for a moment, not the whole query).
    private IndexStore CurrentStore
    {
        get
        {
            lock (_indexStoreSwapLock)
                return _indexStore;
        }
    }

    public bool IsSearchEnabled => _isSearchEnabled;
    public bool IsScanComplete => _isScanComplete;
    public bool IsScanning => _isScanning;
    public int ScanProgressPercent => _scanProgressPercent;
    public int Count => CurrentStore.Count;

    public bool NeedsFtsMigration => CurrentStore.NeedsFtsMigration;

    public void RunFtsMigration(Action<int>? onProgress = null, CancellationToken cancellationToken = default) =>
        CurrentStore.RunFtsMigration(onProgress, cancellationToken);

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

    public void StartBackgroundScan()
    {
        _indexWorker.EnqueueExclusive(RunStartupIndexMaintenance);
    }

    public void RestartScan()
    {
        _isScanComplete = false;
        _scanProgressPercent = 0;
        _completedScanSteps = 0;

        _indexWorker.EnqueueExclusive(RunScan);
    }

    public void StopScan() => _indexWorker.CancelExclusiveWork();

    public void ResetIndexDatabase()
    {
        if (_isScanning)
            return;

        _indexWorker.EnqueueExclusive(_ => ResetIndexDatabaseCore());
    }

    private void ResetIndexDatabaseCore()
    {
        if (_isScanning)
            return;

        lock (_indexStoreSwapLock)
        {
            _indexStore.Dispose();
            DeleteDatabaseFiles(GetCanonicalDatabasePath());
            DeleteDatabaseFiles(GetBuildingDatabasePath());
            _indexStore = new IndexStore(GetCanonicalDatabasePath());
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
        _isScanning = false;
        _scanProgressPercent = 0;
        _completedScanSteps = 0;
        _totalScanSteps = 0;
        _currentScanPath = null;
        _activeStepEntries.Clear();
        _lastProgressReport = -1;
        _lastIndexUpdatedCount = 0;
        _lastIndexUpdatedTime = DateTime.MinValue;

        ReportProgress(null, false, force: true);
        IndexUpdated?.Invoke(this, EventArgs.Empty);
    }

    public IReadOnlyList<FileEntry> Search(
        bool caseSensitive,
        ResolvedSearchQuery searchQuery)
    {
        var store = CurrentStore;

        if (searchQuery.CanUseFts)
        {
            var terms = searchQuery.Terms
                .Select(term => SearchTextHelper.Normalize(term.Text.Trim()))
                .ToList();

            var sqlResults = store.SearchSqlScored(terms, searchQuery.IsAndQuery, caseSensitive);
            return _searchService.FilterRanked(sqlResults, searchQuery, caseSensitive);
        }

        return _searchService.Search(
            store.EnumerateAll(IndexStoragePolicy.RegexSearchPageSize),
            store.Count,
            searchQuery,
            caseSensitive);
    }

    public SearchBatchResult SearchBatch(
        ResolvedSearchQuery searchQuery,
        bool caseSensitive,
        long afterScanId,
        int batchSize,
        List<(FileEntry Entry, int Score)>? existingTop = null)
    {
        var store = CurrentStore;
        var totalCount = store.Count;

        if (searchQuery.CanUseFts && afterScanId == 0)
        {
            var terms = searchQuery.Terms
                .Select(term => SearchTextHelper.Normalize(term.Text.Trim()))
                .ToList();

            var sqlResults = store.SearchSqlScored(terms, searchQuery.IsAndQuery, caseSensitive);
            var results = _searchService.FilterRanked(sqlResults, searchQuery, caseSensitive);

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
            startOffset: 0,
            batchSize: page.Entries.Count,
            existingTop);

        var isComplete = page.Entries.Count < batchSize;
        return new SearchBatchResult
        {
            Results = result.Results,
            NextOffset = isComplete ? totalCount : (int)Math.Min(totalCount, afterScanId + page.Entries.Count),
            NextScanId = page.LastId,
            IsComplete = isComplete,
            TopCandidates = result.TopCandidates
        };
    }

    public void RequestResyncAllRoots()
    {
        foreach (var root in ScanRoots)
            RequestResyncPath(root);
    }

    public void ScanMissingDriveRoots()
    {
        if (_isScanning)
            return;

        foreach (var root in ScanRoots)
        {
            var normalizedRoot = NormalizeDirectoryPrefix(root);
            if (normalizedRoot is null)
                continue;

            bool alreadyIndexed;
            lock (_rootsLock)
                alreadyIndexed = _indexedRoots.Contains(normalizedRoot);

            if (!alreadyIndexed)
                RequestResyncPath(root);
        }
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
        _indexWorker.Dispose();
        _indexStore.Dispose();
    }

    private void ApplyBatchChangesCore(IReadOnlyList<string> removes, IReadOnlyList<string> adds)
    {
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
        if (_isScanning)
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

        if (Count == 0)
        {
            RunScan(cancellationToken);
            return;
        }

        if (_hasInterruptedRescan)
        {
            // The live store still only reflects whatever finished before the last
            // rescan was interrupted, and indexed_roots already lists everything as
            // done from that earlier state — GetPathsNeedingScan would find nothing
            // to do. Redo the rescan instead of silently keeping the stale snapshot.
            RunScan(cancellationToken);
            return;
        }

        var pathsToScan = GetPathsNeedingScan();
        if (pathsToScan.Count == 0)
        {
            CompleteStartupWithExistingIndex();
            ScanMissingDriveRoots();
            return;
        }

        RunPartialScan(pathsToScan, cancellationToken);
        ScanMissingDriveRoots();
    }

    private void ReconcileIndexMetadata()
    {
        lock (_rootsLock)
        {
            if (Count == 0 && _indexedRoots.Count > 0)
            {
                _indexStore.ClearIndexedRoots();
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
        if (Count == 0)
            return;

        _isScanComplete = true;
        _scanProgressPercent = 100;
        _totalScanSteps = 1;
        _completedScanSteps = 1;
        EnableSearchIfNeeded();
        ReportProgress(null, true, force: true);
    }

    private IReadOnlyList<string> GetPathsNeedingScan()
    {
        var paths = new List<string>();

        foreach (var path in WatchPaths)
        {
            if (NeedsScan(path))
                paths.Add(path);
        }

        foreach (var root in ScanRoots)
        {
            if (NeedsScan(root) && !paths.Contains(root, StringComparer.OrdinalIgnoreCase))
                paths.Add(root);
        }

        return paths;
    }

    private bool NeedsScan(string path)
    {
        if (_exclusions.IsPathExcluded(path) || !Directory.Exists(path))
            return false;

        var normalized = NormalizeDirectoryPrefix(path);
        if (normalized is null)
            return false;

        lock (_rootsLock)
        {
            if (_indexedRoots.Contains(normalized))
                return false;
        }

        return !IsUnderIndexedRoot(path);
    }

    private bool IsUnderIndexedRoot(string path)
    {
        var prefix = NormalizeDirectoryPrefix(path);
        if (prefix is null)
            return false;

        lock (_rootsLock)
        {
            foreach (var indexedRoot in _indexedRoots)
            {
                if (prefix.StartsWith(indexedRoot, StringComparison.OrdinalIgnoreCase))
                    return true;
            }
        }

        return false;
    }

    private void RunPartialScan(IReadOnlyList<string> paths, CancellationToken cancellationToken)
    {
        var previousPriority = Thread.CurrentThread.Priority;
        Thread.CurrentThread.Priority = ThreadPriority.Lowest;
        BackgroundThreadMode.EnterForCurrentThread();
        _isScanning = true;
        BeginScanProgress(paths.Count);
        _indexStore.BeginBulkIngest();

        try
        {
            _totalScanSteps = paths.Count;
            if (_totalScanSteps <= 0)
                _totalScanSteps = 1;

            foreach (var path in paths)
            {
                cancellationToken.ThrowIfCancellationRequested();
                ScanAndMerge(path, _indexStore, cancellationToken);
                PauseBetweenScanRoots(cancellationToken);
            }

            Interlocked.Exchange(ref _approximateLiveCount, _indexStore.Count);
            _isScanComplete = AllScanRootsIndexed();
            _scanProgressPercent = _isScanComplete ? 100 : _scanProgressPercent;
            ReportProgress(null, _isScanComplete, force: _isScanComplete);
        }
        catch (OperationCanceledException)
        {
            // superseded by a newer scan
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
            _indexStore.EndBulkIngest();
            _isScanning = false;
            _currentScanPath = null;
            BackgroundThreadMode.ExitForCurrentThread();
            Thread.CurrentThread.Priority = previousPriority;
        }
    }

    private bool AllScanRootsIndexed()
    {
        foreach (var root in ScanRoots)
        {
            if (!NeedsScan(root))
                continue;

            return false;
        }

        return true;
    }

    // A full rescan with existing live data builds into a separate "shadow" database
    // instead of writing into the live one, so search keeps using the old (fully
    // indexed, fast) store without any lock contention from the scan's writes — the
    // GUI/search stays responsive throughout. The shadow store is promoted to become
    // the live store only once the scan finishes successfully. The very first scan
    // (nothing indexed yet) has nothing to protect, so it writes directly into the
    // live store and lets search become available progressively, as before.
    private void RunScan(CancellationToken cancellationToken)
    {
        var previousPriority = Thread.CurrentThread.Priority;
        Thread.CurrentThread.Priority = ThreadPriority.Lowest;
        BackgroundThreadMode.EnterForCurrentThread();
        _isScanning = true;

        var useShadowBuild = _indexStore.Count > 0;
        var buildingPath = useShadowBuild ? GetBuildingDatabasePath() : null;
        if (buildingPath is not null)
            DeleteDatabaseFiles(buildingPath);

        var target = buildingPath is not null ? new IndexStore(buildingPath) : _indexStore;

        if (!useShadowBuild)
            target.Clear();

        target.ClearIndexedRoots();
        lock (_rootsLock)
            _indexedRoots.Clear();

        lock (_scannedPrefixesLock)
            _scannedDirectoryPrefixes.Clear();

        var priorityPaths = WatchPaths;
        var scanRoots = ScanRoots;
        BeginScanProgress(priorityPaths.Count + scanRoots.Count);
        target.BeginBulkIngest();

        var succeeded = false;
        try
        {
            foreach (var path in priorityPaths)
            {
                cancellationToken.ThrowIfCancellationRequested();
                ScanAndMerge(path, target, cancellationToken);
                PauseBetweenScanRoots(cancellationToken);
            }

            // Separate roots (typically separate physical drives) are I/O-independent,
            // so scanning them concurrently overlaps their disk-wait time instead of
            // paying it serially. Each worker still runs at Lowest thread priority and
            // keeps the existing per-batch/per-yield throttling, so total system impact
            // stays bounded regardless of how many roots run at once.
            RunRootScansInParallel(scanRoots, target, cancellationToken);

            succeeded = true;
        }
        catch (AggregateException ex) when (ex.InnerExceptions.All(e => e is OperationCanceledException))
        {
            // 새 스캔 시작 시 이전 스캔 취소
        }
        catch (AggregateException ex)
        {
            var inner = ex.InnerExceptions.FirstOrDefault(e => e is not OperationCanceledException)
                ?? ex.InnerException
                ?? ex;

            if (inner is OutOfMemoryException oomEx)
                ErrorDialogService.Show(LocalizationService.T("Error_OutOfMemory"), oomEx);
            else
                ErrorDialogService.Show(LocalizationService.T("Error_IndexScan"), inner);
        }
        catch (OperationCanceledException)
        {
            // 새 스캔 시작 시 이전 스캔 취소
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

        if (succeeded)
        {
            if (buildingPath is not null)
            {
                PromoteBuildingStore(target, buildingPath);
            }
            else
            {
                _indexStore.Analyze();
                Interlocked.Exchange(ref _approximateLiveCount, _indexStore.Count);
            }

            _isScanComplete = true;
            _scanProgressPercent = 100;
            ReportProgress(null, true, force: true);
        }
        else if (buildingPath is not null)
        {
            DiscardBuildingStore(target, buildingPath);
        }
    }

    // Runs each root on its own dedicated, Lowest-priority OS thread (not the thread
    // pool) so priority is guaranteed per worker, bounded by a semaphore so at most
    // MaxParallelRootScans roots are ever scanning at once. Exceptions from workers are
    // collected and re-thrown together rather than dropped.
    private void RunRootScansInParallel(
        IReadOnlyList<string> roots,
        IndexStore target,
        CancellationToken cancellationToken)
    {
        if (roots.Count == 0)
            return;

        var maxParallelism = Math.Max(1, Math.Min(roots.Count, IndexResourcePolicy.MaxParallelRootScans));
        using var semaphore = new SemaphoreSlim(maxParallelism);
        var exceptions = new ConcurrentBag<Exception>();
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
                    ScanAndMerge(root, target, cancellationToken);
                }
                catch (Exception ex)
                {
                    exceptions.Add(ex);
                }
                finally
                {
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

        if (!exceptions.IsEmpty)
            throw new AggregateException(exceptions);
    }

    private void PromoteBuildingStore(IndexStore buildingStore, string buildingPath)
    {
        var canonicalPath = GetCanonicalDatabasePath();
        buildingStore.Analyze();
        buildingStore.Checkpoint();

        lock (_indexStoreSwapLock)
        {
            var oldStore = _indexStore;
            oldStore.Dispose();
            buildingStore.Dispose();

            DeleteDatabaseFiles(canonicalPath);
            File.Move(buildingPath, canonicalPath);
            DeleteDatabaseFiles(buildingPath);

            _indexStore = new IndexStore(canonicalPath);
            Interlocked.Exchange(ref _approximateLiveCount, _indexStore.Count);
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
        ScanTree(root, cancellationToken, batch => MergeEntriesBatchInto(target, root, batch));
        RememberScannedDirectoryPrefix(root);

        var normalizedRoot = NormalizeDirectoryPrefix(root);
        if (normalizedRoot is not null)
        {
            target.MarkRootIndexed(normalizedRoot);
            lock (_rootsLock)
                _indexedRoots.Add(normalizedRoot);
        }

        AdvanceScanProgress(root);
    }

    private void MarkRootIndexed(string normalizedRoot)
    {
        _indexStore.MarkRootIndexed(normalizedRoot);
        lock (_rootsLock)
            _indexedRoots.Add(normalizedRoot);
    }

    private void MergeEntriesBatchInto(IndexStore target, string root, IReadOnlyList<FileEntry> batch)
    {
        if (batch.Count == 0)
            return;

        target.UpsertBatch(batch);
        Thread.Sleep(IndexResourcePolicy.BatchCommitDelayMs);
        _activeStepEntries.AddOrUpdate(root, batch.Count, (_, existing) => existing + batch.Count);
        UpdateScanProgressPercent();
        ReportProgress(root, false);

        if (ReferenceEquals(target, _indexStore))
        {
            Interlocked.Add(ref _approximateLiveCount, batch.Count);
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

            mergeBatch(batch);
            batch = new List<FileEntry>(IndexStoragePolicy.BulkMergeBatchSize);
        }

        var enumerable = new FileSystemEnumerable<FileEntry>(
            root,
            TransformEntry,
            ScanEnumerationOptions)
        {
            ShouldIncludePredicate = ShouldIncludeEntry,
            ShouldRecursePredicate = ShouldRecurseIntoDirectory
        };

        foreach (var entry in enumerable)
        {
            cancellationToken.ThrowIfCancellationRequested();
            batch.Add(entry);
            MaybeYield(cancellationToken);

            if (batch.Count >= IndexStoragePolicy.BulkMergeBatchSize)
                FlushBatch();
        }

        FlushBatch();
        return;

        FileEntry TransformEntry(ref FileSystemEntry entry)
        {
            var fullPath = entry.ToFullPath();
            return CreateEntry(fullPath, entry.IsDirectory);
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
        if (_isSearchEnabled)
            return;

        if (Count == 0)
            return;

        _isSearchEnabled = true;
        SearchEnabled?.Invoke(this, EventArgs.Empty);
    }

    private void BeginScanProgress(int totalSteps)
    {
        lock (_progressLock)
        {
            _totalScanSteps = Math.Max(1, totalSteps);
            _completedScanSteps = 0;
            _activeStepEntries.Clear();
            _scanProgressPercent = 0;
            _lastProgressReport = -1;
            _lastProgressTime = DateTime.MinValue;
        }

        _isScanComplete = false;
        ReportProgress(null, false, force: true);
    }

    private void ReportProgress(string? currentPath, bool isComplete, bool force = false)
    {
        var count = (int)Math.Min(int.MaxValue, Count);
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
        var percent = isComplete ? 100 : _scanProgressPercent;
        IndexProgress?.Invoke(this, new IndexProgressEventArgs(count, currentPath, isComplete, percent));
    }

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

    private static FileEntry CreateEntry(string fullPath, bool isDirectory)
    {
        var normalizedPath = isDirectory ? fullPath.TrimEnd('\\') : fullPath;
        var fileName = Path.GetFileName(normalizedPath);

        if (string.IsNullOrEmpty(fileName) && isDirectory)
            fileName = Path.GetPathRoot(normalizedPath)?.TrimEnd('\\') ?? normalizedPath;

        var directory = isDirectory
            ? Path.GetDirectoryName(normalizedPath) ?? string.Empty
            : Path.GetDirectoryName(fullPath) ?? string.Empty;

        return new FileEntry(normalizedPath, fileName, directory, isDirectory);
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
