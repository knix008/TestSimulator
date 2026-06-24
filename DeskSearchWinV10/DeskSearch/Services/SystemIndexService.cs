using DeskSearch.Models;

namespace DeskSearch.Services;

public sealed class SystemIndexService : IDisposable
{
    private readonly object _lock = new();
    private readonly Dictionary<string, FileEntry> _entries = new(StringComparer.OrdinalIgnoreCase);
    private readonly FileSearchService _searchService = new();
    private readonly HashSet<string> _pendingResyncPaths = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _resyncLock = new();

    private CancellationTokenSource? _scanCts;
    private int _lastProgressReport;
    private DateTime _lastProgressTime = DateTime.MinValue;
    private int _entriesSinceYield;
    private bool _isSearchEnabled;
    private bool _isScanComplete;
    private volatile bool _isScanning;

    public bool IsSearchEnabled => _isSearchEnabled;
    public bool IsScanComplete => _isScanComplete;

    public int Count
    {
        get
        {
            lock (_lock)
                return _entries.Count;
        }
    }

    public IReadOnlyList<string> WatchPaths { get; } = GetPriorityPaths();
    public IReadOnlyList<string> ScanRoots { get; } = GetScanRoots();

    public event EventHandler? SearchEnabled;
    public event EventHandler<IndexProgressEventArgs>? IndexProgress;
    public event EventHandler? IndexUpdated;

    public void StartBackgroundScan()
    {
        _scanCts?.Cancel();
        _scanCts?.Dispose();
        _scanCts = new CancellationTokenSource();

        _isScanComplete = false;
        _ = Task.Run(() => RunScan(_scanCts.Token), _scanCts.Token);
    }

    public void RestartScan()
    {
        lock (_lock)
        {
            _entries.Clear();
            _isScanComplete = false;
        }

        StartBackgroundScan();
    }

    public IReadOnlyList<FileEntry> Search(string query)
    {
        FileEntry[] snapshot;
        lock (_lock)
            snapshot = _entries.Values.ToArray();

        return _searchService.Search(snapshot, query);
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
            var scanned = ScanTree(path, CancellationToken.None);
            MergePathEntries(path, scanned);
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

    private void RunScan(CancellationToken cancellationToken)
    {
        _isScanning = true;
        Thread.CurrentThread.Priority = ThreadPriority.BelowNormal;

        try
        {
            foreach (var path in WatchPaths)
            {
                cancellationToken.ThrowIfCancellationRequested();
                ScanAndMerge(path, cancellationToken);
                EnableSearchIfNeeded();
            }

            EnableSearchIfNeeded();

            foreach (var root in ScanRoots)
            {
                cancellationToken.ThrowIfCancellationRequested();
                ReportProgress(root, false);
                ScanAndMerge(root, cancellationToken);
            }

            _isScanComplete = true;
            ReportProgress(null, true);
        }
        catch (OperationCanceledException)
        {
            // 새 스캔 시작 시 이전 스캔 취소
        }
        finally
        {
            _isScanning = false;
            Thread.CurrentThread.Priority = ThreadPriority.Normal;
        }
    }

    private void ScanAndMerge(string root, CancellationToken cancellationToken)
    {
        if (!Directory.Exists(root))
            return;

        var scanned = ScanTree(root, cancellationToken);
        lock (_lock)
        {
            foreach (var entry in scanned)
                _entries[entry.FullPath] = entry;
        }

        ReportProgress(root, false);
    }

    private void MergePathEntries(string root, List<FileEntry> scanned)
    {
        var normalizedRoot = root.TrimEnd('\\') + "\\";

        lock (_lock)
        {
            var toRemove = _entries.Keys
                .Where(k => k.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase))
                .ToList();

            foreach (var key in toRemove)
                _entries.Remove(key);

            foreach (var entry in scanned)
                _entries[entry.FullPath] = entry;
        }
    }

    private List<FileEntry> ScanTree(string root, CancellationToken cancellationToken)
    {
        var results = new List<FileEntry>();
        var stack = new Stack<string>();
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        stack.Push(root);

        while (stack.Count > 0)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var directory = stack.Pop();
            var normalizedDir = NormalizeDirectoryPath(directory);

            if (!visited.Add(normalizedDir))
                continue;

            try
            {
                results.Add(CreateEntry(normalizedDir, isDirectory: true));

                foreach (var filePath in Directory.EnumerateFiles(normalizedDir))
                {
                    cancellationToken.ThrowIfCancellationRequested();

                    try
                    {
                        results.Add(CreateEntry(filePath, isDirectory: false));
                        MaybeYield(cancellationToken);
                    }
                    catch (UnauthorizedAccessException)
                    {
                        // 접근 불가 파일은 건너뜀
                    }
                }

                foreach (var subDir in Directory.EnumerateDirectories(normalizedDir))
                {
                    stack.Push(subDir);
                }
            }
            catch (UnauthorizedAccessException)
            {
                // 접근 불가 폴더는 건너뜀
            }
            catch (DirectoryNotFoundException)
            {
                // 스캔 중 삭제된 폴더
            }
        }

        return results;
    }

    private static string NormalizeDirectoryPath(string path) =>
        path.TrimEnd('\\', '/');

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
            && count - _lastProgressReport < 1000
            && (now - _lastProgressTime).TotalSeconds < 2)
        {
            return;
        }

        _lastProgressReport = count;
        _lastProgressTime = now;
        IndexProgress?.Invoke(this, new IndexProgressEventArgs(count, currentPath, isComplete));
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

    private static IReadOnlyList<string> GetScanRoots()
    {
        var roots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var drive in DriveInfo.GetDrives())
        {
            if (!drive.IsReady)
                continue;

            var root = drive.RootDirectory.FullName;
            if (!string.IsNullOrWhiteSpace(root))
                roots.Add(root);
        }

        return roots.OrderBy(r => r, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static void AddIfExists(HashSet<string> paths, string path)
    {
        if (Directory.Exists(path))
            paths.Add(path);
    }
}
