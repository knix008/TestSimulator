using System.IO.Enumeration;
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

    private readonly IndexStore _indexStore;
    private readonly IndexBackgroundWorker _indexWorker = new();
    private readonly FileSearchService _searchService = new();    private readonly HashSet<string> _indexedRoots = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _rootsLock = new();
    private readonly HashSet<string> _pendingResyncPaths = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _resyncLock = new();
    private readonly HashSet<string> _scannedDirectoryPrefixes = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _scannedPrefixesLock = new();
    private readonly object _progressLock = new();
    private IndexExclusionPolicy _exclusions = IndexExclusionPolicy.Empty;

    private int _lastProgressReport;    private DateTime _lastProgressTime = DateTime.MinValue;
    private int _entriesSinceYield;
    private int _lastIndexUpdatedCount;
    private DateTime _lastIndexUpdatedTime = DateTime.MinValue;
    private bool _isSearchEnabled;
    private bool _isScanComplete;
    private volatile bool _isScanning;
    private int _scanProgressPercent;
    private int _totalScanSteps;
    private int _completedScanSteps;
    private string? _currentScanPath;
    private long _approximateScanCount;

    public SystemIndexService()
    {
        var folder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "DeskSearch");
        _indexStore = new IndexStore(Path.Combine(folder, IndexStoragePolicy.DatabaseFileName));

        lock (_rootsLock)
        {
            foreach (var root in _indexStore.LoadIndexedRoots())
                _indexedRoots.Add(root);
        }

        EnableSearchIfNeeded();
    }

    public bool IsSearchEnabled => _isSearchEnabled;
    public bool IsScanComplete => _isScanComplete;
    public bool IsScanning => _isScanning;
    public int ScanProgressPercent => _scanProgressPercent;
    public int Count => _indexStore.Count;

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
        _isScanComplete = false;
        _scanProgressPercent = 0;
        _completedScanSteps = 0;
        _indexWorker.EnqueueExclusive(RunScan);
    }

    public void RestartScan()
    {
        _isScanComplete = false;
        _scanProgressPercent = 0;
        _completedScanSteps = 0;

        _indexWorker.EnqueueExclusive(ct =>
        {
            _indexStore.Clear();

            lock (_rootsLock)
                _indexedRoots.Clear();

            RunScan(ct);
        });
    }

    public IReadOnlyList<FileEntry> Search(
        bool caseSensitive,
        ResolvedSearchQuery searchQuery)
    {
        if (searchQuery.CanUseFts && _indexStore.IsFtsCurrent)
        {
            var candidates = searchQuery.IsAndQuery
                ? _indexStore.SearchLiteralFtsAnd(searchQuery.Terms.Select(term => term.Text).ToList())
                : _indexStore.SearchLiteralFts(searchQuery.Terms[0].Text);

            return _searchService.Search(
                candidates,
                candidates.Count,
                searchQuery,
                caseSensitive);
        }

        return _searchService.Search(
            _indexStore.EnumerateAll(IndexStoragePolicy.RegexSearchPageSize),
            _indexStore.Count,
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
        var totalCount = _indexStore.Count;

        if (searchQuery.CanUseFts && _indexStore.IsFtsCurrent && afterScanId == 0)
        {
            var candidates = searchQuery.IsAndQuery
                ? _indexStore.SearchLiteralFtsAnd(searchQuery.Terms.Select(term => term.Text).ToList())
                : _indexStore.SearchLiteralFts(searchQuery.Terms[0].Text);

            var ftsResult = _searchService.SearchBatch(
                candidates,
                candidates.Count,
                searchQuery,
                caseSensitive,
                startOffset: 0,
                batchSize: candidates.Count,
                existingTop);

            return new SearchBatchResult
            {
                Results = ftsResult.Results,
                NextOffset = totalCount,
                NextScanId = 0,
                IsComplete = true,
                TopCandidates = ftsResult.TopCandidates
            };
        }

        var page = _indexStore.ReadPageAfterId(afterScanId, batchSize);
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
            ScanTree(root, CancellationToken.None, MergeEntriesBatch);
        }
        finally
        {
            _indexStore.EndBulkIngest();
        }

        RememberScannedDirectoryPrefix(root);
        MarkRootIndexed(normalizedRoot);
    }

    private void RunScan(CancellationToken cancellationToken)
    {
        _isScanning = true;
        _approximateScanCount = 0;
        _indexStore.BeginBulkIngest();

        try
        {
            _indexStore.ClearIndexedRoots();
            lock (_rootsLock)
                _indexedRoots.Clear();

            lock (_scannedPrefixesLock)
                _scannedDirectoryPrefixes.Clear();

            var priorityPaths = WatchPaths;
            var scanRoots = ScanRoots;
            _totalScanSteps = priorityPaths.Count + scanRoots.Count;
            if (_totalScanSteps <= 0)
                _totalScanSteps = 1;

            foreach (var path in priorityPaths)
            {
                cancellationToken.ThrowIfCancellationRequested();
                ScanAndMerge(path, cancellationToken);
                EnableSearchIfNeeded();
            }

            EnableSearchIfNeeded();

            foreach (var root in scanRoots)
            {
                cancellationToken.ThrowIfCancellationRequested();
                ScanAndMerge(root, cancellationToken);
            }

            _isScanComplete = true;
            _scanProgressPercent = 100;
            ReportProgress(null, true);
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
            _indexStore.EndBulkIngest();
            _isScanning = false;
            _currentScanPath = null;
        }
    }

    private void ScanAndMerge(string root, CancellationToken cancellationToken)
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
        ScanTree(root, cancellationToken, MergeEntriesBatch);
        RememberScannedDirectoryPrefix(root);

        var normalizedRoot = NormalizeDirectoryPrefix(root);
        if (normalizedRoot is not null)
            MarkRootIndexed(normalizedRoot);

        AdvanceScanProgress(root);
    }

    private void MarkRootIndexed(string normalizedRoot)
    {
        _indexStore.MarkRootIndexed(normalizedRoot);
        lock (_rootsLock)
            _indexedRoots.Add(normalizedRoot);
    }

    private void MergeEntriesBatch(IReadOnlyList<FileEntry> batch)
    {
        if (batch.Count == 0)
            return;

        _approximateScanCount += batch.Count;
        _indexStore.UpsertBatch(batch);
        EnableSearchIfNeeded();
        ReportProgress(_currentScanPath, false);
        NotifyIndexUpdatedIfNeeded();
    }

    private void NotifyIndexUpdatedIfNeeded()
    {
        var now = DateTime.UtcNow;

        if (_approximateScanCount - _lastIndexUpdatedCount < IndexResourcePolicy.IndexUpdatedMinEntries
            && (now - _lastIndexUpdatedTime).TotalSeconds < IndexResourcePolicy.IndexUpdatedMinSeconds)
        {
            return;
        }

        _lastIndexUpdatedCount = (int)Math.Min(int.MaxValue, _approximateScanCount);
        _lastIndexUpdatedTime = now;
        IndexUpdated?.Invoke(this, EventArgs.Empty);
    }

    private void AdvanceScanProgress(string? root)
    {
        lock (_progressLock)
        {
            _completedScanSteps++;
            _scanProgressPercent = Math.Min(99, _completedScanSteps * 100 / _totalScanSteps);
        }

        ReportProgress(root, false);
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
        _entriesSinceYield++;
        if (_entriesSinceYield < IndexResourcePolicy.ScanYieldEveryEntries)
            return;

        _entriesSinceYield = 0;
        Thread.Sleep(IndexResourcePolicy.ScanYieldDelayMs);
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

    private void ReportProgress(string? currentPath, bool isComplete)
    {
        var count = isComplete ? Count : (int)Math.Min(int.MaxValue, _approximateScanCount);
        var now = DateTime.UtcNow;

        if (!isComplete
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
