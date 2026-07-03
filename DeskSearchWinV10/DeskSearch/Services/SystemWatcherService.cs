namespace DeskSearch.Services;

public sealed class SystemWatcherService : IDisposable
{
    private readonly SystemIndexService _indexService;
    private readonly List<FileSystemWatcher> _watchers = [];
    private readonly object _pendingLock = new();
    private readonly HashSet<string> _pendingAdds = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _pendingRemoves = new(StringComparer.OrdinalIgnoreCase);
    private readonly System.Threading.Timer _flushTimer;

    public SystemWatcherService(SystemIndexService indexService)
    {
        _indexService = indexService;
        _flushTimer = new System.Threading.Timer(_ => FlushPendingChanges(), null, Timeout.Infinite, Timeout.Infinite);
    }

    public void Start()
    {
        Stop();

        foreach (var path in _indexService.ScanRoots)
        {
            if (!Directory.Exists(path))
                continue;

            if (_indexService.IsPathExcluded(path))
                continue;

            var watcher = new FileSystemWatcher(path)
            {
                IncludeSubdirectories = true,
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName
            };

            watcher.Created += OnCreated;
            watcher.Deleted += OnDeleted;
            watcher.Renamed += OnRenamed;
            watcher.Error += OnWatcherError;
            watcher.EnableRaisingEvents = true;
            watcher.InternalBufferSize = 32 * 1024;

            _watchers.Add(watcher);
        }
    }

    public void Stop()
    {
        foreach (var watcher in _watchers)
        {
            watcher.EnableRaisingEvents = false;
            watcher.Dispose();
        }

        _watchers.Clear();
    }

    public void Dispose()
    {
        Stop();
        _flushTimer.Dispose();
    }

    private void OnCreated(object sender, FileSystemEventArgs e)
    {
        if (_indexService.IsPathExcluded(e.FullPath))
            return;

        if (!File.Exists(e.FullPath) && !Directory.Exists(e.FullPath))
            return;

        QueueAdd(e.FullPath);
    }

    private void OnDeleted(object sender, FileSystemEventArgs e)
    {
        QueueRemove(e.FullPath);
    }

    private void OnRenamed(object sender, RenamedEventArgs e)
    {
        QueueRemove(e.OldFullPath);

        if (File.Exists(e.FullPath) || Directory.Exists(e.FullPath))
        {
            if (!_indexService.IsPathExcluded(e.FullPath))
                QueueAdd(e.FullPath);
        }
    }

    private void OnWatcherError(object sender, ErrorEventArgs e)
    {
        if (sender is not FileSystemWatcher watcher)
            return;

        try
        {
            watcher.EnableRaisingEvents = false;
            watcher.EnableRaisingEvents = true;
        }
        catch
        {
            // best effort; user can run a manual full index if changes were missed
        }
    }

    private void QueueAdd(string fullPath)
    {
        lock (_pendingLock)
        {
            _pendingRemoves.Remove(fullPath);
            _pendingAdds.Add(fullPath);
        }

        ScheduleFlush();
    }

    private void QueueRemove(string fullPath)
    {
        lock (_pendingLock)
        {
            _pendingAdds.Remove(fullPath);
            _pendingRemoves.Add(fullPath);
        }

        ScheduleFlush();
    }

    private void ScheduleFlush()
    {
        _flushTimer.Change(IndexResourcePolicy.WatcherFlushDelayMs, Timeout.Infinite);
    }

    private void FlushPendingChanges()
    {
        string[] adds;
        string[] removes;

        lock (_pendingLock)
        {
            adds = _pendingAdds.ToArray();
            removes = _pendingRemoves.ToArray();
            _pendingAdds.Clear();
            _pendingRemoves.Clear();
        }

        _indexService.ApplyWatcherChanges(removes, adds);
    }
}
