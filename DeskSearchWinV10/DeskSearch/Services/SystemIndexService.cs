using System.IO.Enumeration;
using System.Text.RegularExpressions;
using DeskSearch.Models;

namespace DeskSearch.Services;

public sealed class SystemIndexService : IDisposable
{
    private const int MergeBatchSize = 4096;

    private static readonly EnumerationOptions DirectoryEnumerationOptions = new()
    {
        IgnoreInaccessible = true,
        AttributesToSkip = FileAttributes.None
    };

    private readonly object _lock = new();
    private readonly Dictionary<string, FileEntry> _entries = new(StringComparer.OrdinalIgnoreCase);
    private readonly FileSearchService _searchService = new();
    private readonly HashSet<string> _pendingResyncPaths = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _indexedRoots = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _resyncLock = new();
    private IndexExclusionPolicy _exclusions = IndexExclusionPolicy.Empty;

    private CancellationTokenSource? _scanCts;
    private int _lastProgressReport;
    private DateTime _lastProgressTime = DateTime.MinValue;
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

    public bool IsSearchEnabled => _isSearchEnabled;
    public bool IsScanComplete => _isScanComplete;
    public bool IsScanning => _isScanning;
    public int ScanProgressPercent => _scanProgressPercent;

    public int Count
    {
        get
        {
            lock (_lock)
                return _entries.Count;
        }
    }

    public IReadOnlyList<string> WatchPaths => FilterScanPaths(GetPriorityPaths());
    public IReadOnlyList<string> ScanRoots => FilterScanPaths(GetAllScanRoots());

    public void ConfigureExclusions(AppSettings settings)
    {
        _exclusions = IndexExclusionPolicy.FromSettings(settings);
        PurgeExcludedEntries();
    }

    public bool IsPathExcluded(string path) => _exclusions.IsPathExcluded(path);

    public event EventHandler? SearchEnabled;
    public event EventHandler<IndexProgressEventArgs>? IndexProgress;
    public event EventHandler? IndexUpdated;

    public void StartBackgroundScan()
    {
        _scanCts?.Cancel();
        _scanCts?.Dispose();
        _scanCts = new CancellationTokenSource();

        _isScanComplete = false;
        _scanProgressPercent = 0;
        _completedScanSteps = 0;
        _ = Task.Run(() => RunScan(_scanCts.Token), _scanCts.Token);
    }

    public void RestartScan()
    {
        lock (_lock)
        {
            _entries.Clear();
            _indexedRoots.Clear();
            _isScanComplete = false;
        }

        _scanProgressPercent = 0;
        _completedScanSteps = 0;
        StartBackgroundScan();
    }

    public IReadOnlyList<FileEntry> Search(string query, bool caseSensitive, bool useRegex, Regex? regex)
    {
        var snapshot = CreateSearchSnapshot();
        return _searchService.Search(snapshot, query, caseSensitive, useRegex, regex);
    }

    public SearchBatchResult SearchBatch(
        string query,
        bool caseSensitive,
        bool useRegex,
        Regex? regex,
        int startOffset,
        int batchSize,
        List<(FileEntry Entry, int Score)>? existingTop = null)
    {
        var snapshot = CreateSearchSnapshot();
        return _searchService.SearchBatch(
            snapshot, query, caseSensitive, useRegex, regex, startOffset, batchSize, existingTop);
    }

    private FileEntry[] CreateSearchSnapshot()
    {
        lock (_lock)
        {
            return _entries.Values
                .OrderBy(static entry => entry.FullPath, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }
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
            lock (_lock)
                alreadyIndexed = _indexedRoots.Contains(normalizedRoot);

            if (!alreadyIndexed)
                RequestResyncPath(root);
        }
    }

    public void ApplyBatchChanges(IReadOnlyList<string> removes, IReadOnlyList<string> adds)
    {
        if (removes.Count == 0 && adds.Count == 0)
            return;

        lock (_lock)
        {
            foreach (var path in removes)
                RemoveEntryAndDescendants(path);

            foreach (var path in adds)
            {
                if (_exclusions.IsPathExcluded(path))
                    continue;

                if (File.Exists(path))
                {
                    var entry = CreateEntry(path, isDirectory: false);
                    _entries[entry.FullPath] = entry;
                    continue;
                }

                if (Directory.Exists(path))
                {
                    var entry = CreateEntry(path, isDirectory: true);
                    _entries[entry.FullPath] = entry;
                }
            }
        }

        IndexUpdated?.Invoke(this, EventArgs.Empty);
    }

    public void RequestResyncPath(string path)
    {
        if (string.IsNullOrWhiteSpace(path) || !Directory.Exists(path))
            return;

        if (_exclusions.IsPathExcluded(path))
            return;

        lock (_resyncLock)
            _pendingResyncPaths.Add(path);

        _ = Task.Run(ProcessResyncQueue);
    }

    public void RequestResyncPriorityPaths()
    {
        foreach (var path in WatchPaths)
            RequestResyncPath(path);
    }

    public void Dispose()
    {
        _scanCts?.Cancel();
        _scanCts?.Dispose();
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
            Thread.CurrentThread.Priority = ThreadPriority.BelowNormal;
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
                _ = Task.Run(ProcessResyncQueue);
        }
    }

    private void ResyncPath(string root)
    {
        var normalizedRoot = NormalizeDirectoryPrefix(root);
        if (normalizedRoot is null)
            return;

        lock (_lock)
        {
            var toRemove = _entries.Keys
                .Where(k => k.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase))
                .ToList();

            foreach (var key in toRemove)
                _entries.Remove(key);
        }

        ScanTree(root, CancellationToken.None, MergeEntriesBatch);

        lock (_lock)
            _indexedRoots.Add(normalizedRoot);
    }

    private void RunScan(CancellationToken cancellationToken)
    {
        _isScanning = true;
        Thread.CurrentThread.Priority = ThreadPriority.BelowNormal;

        try
        {
            lock (_lock)
                _indexedRoots.Clear();

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
        finally
        {
            _isScanning = false;
            _currentScanPath = null;
            Thread.CurrentThread.Priority = ThreadPriority.Normal;
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

        var normalizedRoot = NormalizeDirectoryPrefix(root);
        if (normalizedRoot is not null)
        {
            lock (_lock)
                _indexedRoots.Add(normalizedRoot);
        }

        AdvanceScanProgress(root);
    }

    private void MergeEntriesBatch(IReadOnlyList<FileEntry> batch)
    {
        if (batch.Count == 0)
            return;

        lock (_lock)
        {
            foreach (var entry in batch)
                _entries[entry.FullPath] = entry;
        }

        EnableSearchIfNeeded();
        ReportProgress(_currentScanPath, false);
        NotifyIndexUpdatedIfNeeded();
    }

    private void NotifyIndexUpdatedIfNeeded()
    {
        var count = Count;
        var now = DateTime.UtcNow;

        if (count - _lastIndexUpdatedCount < 2000
            && (now - _lastIndexUpdatedTime).TotalSeconds < 1)
        {
            return;
        }

        _lastIndexUpdatedCount = count;
        _lastIndexUpdatedTime = now;
        IndexUpdated?.Invoke(this, EventArgs.Empty);
    }

    private void AdvanceScanProgress(string? root)
    {
        _completedScanSteps++;
        _scanProgressPercent = Math.Min(99, _completedScanSteps * 100 / _totalScanSteps);
        ReportProgress(root, false);
    }

    private void ScanTree(
        string root,
        CancellationToken cancellationToken,
        Action<IReadOnlyList<FileEntry>> mergeBatch)
    {
        var batch = new List<FileEntry>(MergeBatchSize);
        var stack = new Stack<string>();
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        stack.Push(root);

        void FlushBatch()
        {
            if (batch.Count == 0)
                return;

            mergeBatch(batch);
            batch = new List<FileEntry>(MergeBatchSize);
        }

        while (stack.Count > 0)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var directory = stack.Pop();
            var normalizedDir = TryNormalizeDirectoryPath(directory);
            if (normalizedDir is null)
                continue;

            if (!visited.Add(normalizedDir))
                continue;

            if (_exclusions.IsPathExcluded(normalizedDir))
                continue;

            if (!Directory.Exists(normalizedDir))
                continue;

            batch.Add(CreateEntry(normalizedDir, isDirectory: true));

            try
            {
                foreach (var filePath in Directory.EnumerateFiles(normalizedDir, "*", DirectoryEnumerationOptions))
                {
                    cancellationToken.ThrowIfCancellationRequested();

                    if (_exclusions.IsPathExcluded(filePath))
                        continue;

                    try
                    {
                        batch.Add(CreateEntry(filePath, isDirectory: false));
                        MaybeYield(cancellationToken);

                        if (batch.Count >= MergeBatchSize)
                            FlushBatch();
                    }
                    catch (UnauthorizedAccessException)
                    {
                        // 접근 불가 파일은 건너뜀
                    }
                    catch (IOException)
                    {
                        // 경로 오류·잠긴 파일·경로 초과 등
                    }
                }
            }
            catch (UnauthorizedAccessException)
            {
                // 접근 불가 폴더의 파일 목록
            }
            catch (DirectoryNotFoundException)
            {
                // 스캔 중 삭제된 폴더
            }
            catch (IOException)
            {
                // 경로 오류
            }

            try
            {
                foreach (var subDir in Directory.EnumerateDirectories(normalizedDir, "*", DirectoryEnumerationOptions))
                {
                    if (_exclusions.IsPathExcluded(subDir))
                        continue;

                    var normalizedSubDir = TryNormalizeDirectoryPath(subDir);
                    if (normalizedSubDir is null || visited.Contains(normalizedSubDir))
                        continue;

                    stack.Push(subDir);
                }
            }
            catch (UnauthorizedAccessException)
            {
                // 접근 불가 하위 폴더 목록
            }
            catch (DirectoryNotFoundException)
            {
                // 스캔 중 삭제된 폴더
            }
            catch (IOException)
            {
                // 경로 오류
            }
        }

        FlushBatch();
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
        var count = Count;
        var now = DateTime.UtcNow;

        if (!isComplete
            && count - _lastProgressReport < 500
            && (now - _lastProgressTime).TotalSeconds < 1)
        {
            return;
        }

        _lastProgressReport = count;
        _lastProgressTime = now;
        var percent = isComplete ? 100 : _scanProgressPercent;
        IndexProgress?.Invoke(this, new IndexProgressEventArgs(count, currentPath, isComplete, percent));
    }

    private void RemoveEntryAndDescendants(string path)
    {
        _entries.Remove(path);

        var prefix = path.TrimEnd('\\') + "\\";
        var descendants = _entries.Keys
            .Where(k => k.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            .ToList();

        foreach (var key in descendants)
            _entries.Remove(key);
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
        List<string> toRemove;
        lock (_lock)
        {
            toRemove = _entries.Keys
                .Where(_exclusions.IsPathExcluded)
                .ToList();

            foreach (var key in toRemove)
                _entries.Remove(key);
        }

        if (toRemove.Count > 0)
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
