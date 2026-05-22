namespace FileMasterWinV10.Helpers;

/// <summary>
/// 현재 폴더의 파일/하위 폴더 변경을 감지하고, 짧은 디바운스 후 한 번만 알립니다.
/// </summary>
internal sealed class DirectoryChangeWatcher : IDisposable
{
    private const int DebounceMs = 400;

    private readonly Control _sync;
    private readonly System.Windows.Forms.Timer _debounceTimer;
    private FileSystemWatcher? _watcher;
    private string? _watchedPath;
    private bool _disposed;

    public event EventHandler? Changed;

    public DirectoryChangeWatcher(Control syncControl)
    {
        _sync = syncControl;
        _debounceTimer = new System.Windows.Forms.Timer { Interval = DebounceMs };
        _debounceTimer.Tick += (_, _) =>
        {
            _debounceTimer.Stop();
            Changed?.Invoke(this, EventArgs.Empty);
        };
    }

    public void Watch(string? directoryPath)
    {
        if (_disposed) return;

        var path = string.IsNullOrWhiteSpace(directoryPath) ? null : directoryPath.TrimEnd('\\');
        if (string.Equals(_watchedPath, path, StringComparison.OrdinalIgnoreCase)
            && _watcher?.EnableRaisingEvents == true)
            return;

        StopWatcher();

        if (path == null || !Directory.Exists(path)) return;

        _watchedPath = path;
        _watcher = new FileSystemWatcher(path)
        {
            NotifyFilter = NotifyFilters.FileName
                | NotifyFilters.DirectoryName
                | NotifyFilters.LastWrite
                | NotifyFilters.Size,
            IncludeSubdirectories = false,
            EnableRaisingEvents = true,
        };

        _watcher.Created += OnFileSystemEvent;
        _watcher.Deleted += OnFileSystemEvent;
        _watcher.Changed += OnFileSystemEvent;
        _watcher.Renamed += OnRenamed;
        _watcher.Error += OnError;
    }

    private void OnFileSystemEvent(object sender, FileSystemEventArgs e) => ScheduleNotify();

    private void OnRenamed(object sender, RenamedEventArgs e) => ScheduleNotify();

    private void OnError(object sender, ErrorEventArgs e) => ScheduleNotify();

    private void ScheduleNotify()
    {
        if (_disposed) return;

        void RestartTimer()
        {
            _debounceTimer.Stop();
            _debounceTimer.Start();
        }

        if (_sync.InvokeRequired)
            _sync.BeginInvoke(RestartTimer);
        else
            RestartTimer();
    }

    private void StopWatcher()
    {
        _debounceTimer.Stop();
        _watchedPath = null;

        if (_watcher == null) return;

        _watcher.EnableRaisingEvents = false;
        _watcher.Created -= OnFileSystemEvent;
        _watcher.Deleted -= OnFileSystemEvent;
        _watcher.Changed -= OnFileSystemEvent;
        _watcher.Renamed -= OnRenamed;
        _watcher.Error -= OnError;
        _watcher.Dispose();
        _watcher = null;
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        StopWatcher();
        _debounceTimer.Dispose();
    }
}
