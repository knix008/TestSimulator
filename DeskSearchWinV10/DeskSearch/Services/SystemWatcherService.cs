namespace DeskSearch.Services;

public sealed class SystemWatcherService : IDisposable
{
    private readonly SystemIndexService _indexService;
    private readonly List<FileSystemWatcher> _watchers = [];
    private readonly object _pendingLock = new();
    private readonly HashSet<string> _pendingAdds = new(StringComparer.OrdinalIgnoreCase);
    private readonly HashSet<string> _pendingRemoves = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, DateTime> _lastErrorResync = new(StringComparer.OrdinalIgnoreCase);
    private readonly System.Threading.Timer _flushTimer;
    private readonly System.Threading.Timer _resyncTimer;
    private int _periodicResyncHours = IndexResyncPolicy.DefaultPeriodicResyncHours;

    public SystemWatcherService(SystemIndexService indexService, int periodicResyncHours)
    {
        _indexService = indexService;
        _flushTimer = new System.Threading.Timer(_ => FlushPendingChanges(), null, Timeout.Infinite, Timeout.Infinite);
        _resyncTimer = new System.Threading.Timer(_ => RunPeriodicResync());
        ConfigurePeriodicResync(periodicResyncHours);
    }

    public void ConfigurePeriodicResync(int hours)
    {
        _periodicResyncHours = IndexResyncPolicy.Normalize(hours);
        ReschedulePeriodicResync();
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
        _resyncTimer.Dispose();
    }

    private void ReschedulePeriodicResync()
    {
        if (_periodicResyncHours <= IndexResyncPolicy.Disabled)
        {
            _resyncTimer.Change(Timeout.Infinite, Timeout.Infinite);
            return;
        }

        var period = TimeSpan.FromHours(_periodicResyncHours);
        _resyncTimer.Change(period, period);
    }

    private void RunPeriodicResync()
    {
        _indexService.ScanMissingDriveRoots();
        _indexService.RequestResyncAllRoots();
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

        var path = watcher.Path;
        var now = DateTime.UtcNow;

        if (_lastErrorResync.TryGetValue(path, out var last)
            && (now - last).TotalMinutes < IndexResourcePolicy.WatcherErrorResyncDelayMinutes)
        {
            return;
        }

        _lastErrorResync[path] = now;
        _indexService.RequestResyncPath(path);
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

        _indexService.ApplyBatchChanges(removes, adds);
    }
}
