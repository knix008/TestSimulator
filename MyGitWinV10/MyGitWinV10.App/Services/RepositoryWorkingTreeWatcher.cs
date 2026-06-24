namespace MyGitWinV10.App.Services;

public sealed class RepositoryWorkingTreeChangeEventArgs : EventArgs
{
    public bool RequiresStructureRefresh { get; init; }

    public IReadOnlyList<string> AffectedDirectoryPaths { get; init; } = [];
}

/// <summary>
/// Debounced <see cref="FileSystemWatcher"/> for the repository working tree. Raises
/// <see cref="Changed"/> after external create/delete/rename/content edits settle.
/// </summary>
public sealed class RepositoryWorkingTreeWatcher : IDisposable
{
    private const int DebounceMs = 400;

    private readonly Control _syncControl;
    private readonly System.Windows.Forms.Timer _debounceTimer;
    private readonly HashSet<string> _affectedDirectories = new(StringComparer.OrdinalIgnoreCase);
    private FileSystemWatcher? _watcher;
    private string? _workingDirectory;
    private bool _requiresStructureRefresh;
    private bool _disposed;

    public RepositoryWorkingTreeWatcher(Control syncControl)
    {
        _syncControl = syncControl;
        _debounceTimer = new System.Windows.Forms.Timer { Interval = DebounceMs };
        _debounceTimer.Tick += (_, _) => FlushPendingChanges();
    }

    public event EventHandler<RepositoryWorkingTreeChangeEventArgs>? Changed;

    public void Watch(string? workingDirectory)
    {
        if (_disposed)
        {
            return;
        }

        string? path = NormalizeDirectory(workingDirectory);
        if (string.Equals(_workingDirectory, path, StringComparison.OrdinalIgnoreCase)
            && _watcher?.EnableRaisingEvents == true)
        {
            return;
        }

        StopInternal();

        if (path is null || !Directory.Exists(path))
        {
            return;
        }

        _workingDirectory = path;
        _watcher = new FileSystemWatcher(path)
        {
            NotifyFilter = NotifyFilters.FileName
                | NotifyFilters.DirectoryName
                | NotifyFilters.LastWrite
                | NotifyFilters.Size,
            IncludeSubdirectories = true,
            EnableRaisingEvents = true,
            InternalBufferSize = 64 * 1024,
        };

        _watcher.Created += OnStructureChanged;
        _watcher.Deleted += OnStructureChanged;
        _watcher.Renamed += OnRenamed;
        _watcher.Changed += OnContentChanged;
        _watcher.Error += (_, _) => ScheduleNotify(requiresStructureRefresh: true, relativeDirectory: null);
    }

    public void Stop() => StopInternal();

    public void Dispose()
    {
        if (_disposed)
        {
            return;
        }

        _disposed = true;
        StopInternal();
        _debounceTimer.Dispose();
    }

    private void OnStructureChanged(object sender, FileSystemEventArgs e)
    {
        if (ShouldIgnore(e.FullPath))
        {
            return;
        }

        ScheduleNotify(requiresStructureRefresh: true, relativeDirectory: GetRelativeDirectory(e.FullPath));
    }

    private void OnContentChanged(object sender, FileSystemEventArgs e)
    {
        if (ShouldIgnore(e.FullPath))
        {
            return;
        }

        ScheduleNotify(requiresStructureRefresh: false, relativeDirectory: GetRelativeDirectory(e.FullPath));
    }

    private void OnRenamed(object sender, RenamedEventArgs e)
    {
        if (ShouldIgnore(e.FullPath) && ShouldIgnore(e.OldFullPath))
        {
            return;
        }

        ScheduleNotify(requiresStructureRefresh: true, relativeDirectory: GetRelativeDirectory(e.FullPath));
        ScheduleNotify(requiresStructureRefresh: true, relativeDirectory: GetRelativeDirectory(e.OldFullPath));
    }

    private void ScheduleNotify(bool requiresStructureRefresh, string? relativeDirectory)
    {
        if (_disposed)
        {
            return;
        }

        if (requiresStructureRefresh)
        {
            _requiresStructureRefresh = true;
        }

        if (relativeDirectory is not null)
        {
            _affectedDirectories.Add(relativeDirectory);
        }

        void RestartTimer()
        {
            _debounceTimer.Stop();
            _debounceTimer.Start();
        }

        if (_syncControl.InvokeRequired)
        {
            _syncControl.BeginInvoke(RestartTimer);
        }
        else
        {
            RestartTimer();
        }
    }

    private void FlushPendingChanges()
    {
        _debounceTimer.Stop();
        if (_disposed)
        {
            return;
        }

        if (!_requiresStructureRefresh && _affectedDirectories.Count == 0)
        {
            return;
        }

        var args = new RepositoryWorkingTreeChangeEventArgs
        {
            RequiresStructureRefresh = _requiresStructureRefresh,
            AffectedDirectoryPaths = _affectedDirectories.ToList(),
        };

        _requiresStructureRefresh = false;
        _affectedDirectories.Clear();
        Changed?.Invoke(this, args);
    }

    private bool ShouldIgnore(string fullPath)
    {
        if (_workingDirectory is null)
        {
            return true;
        }

        try
        {
            string relative = Path.GetRelativePath(_workingDirectory, fullPath);
            if (string.Equals(relative, ".git", StringComparison.OrdinalIgnoreCase)
                || relative.StartsWith(".git" + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
                || relative.StartsWith(".git/", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        catch
        {
            return true;
        }

        return false;
    }

    private string? GetRelativeDirectory(string fullPath)
    {
        if (_workingDirectory is null)
        {
            return null;
        }

        try
        {
            string directoryPath = Directory.Exists(fullPath)
                ? fullPath
                : Path.GetDirectoryName(fullPath) ?? _workingDirectory;

            string relative = Path.GetRelativePath(_workingDirectory, directoryPath);
            if (string.IsNullOrEmpty(relative) || relative == ".")
            {
                return string.Empty;
            }

            return PathCommitHistoryService.NormalizeGitPath(relative.Replace('\\', '/'));
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string? NormalizeDirectory(string? workingDirectory)
    {
        if (string.IsNullOrWhiteSpace(workingDirectory))
        {
            return null;
        }

        return workingDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    }

    private void StopInternal()
    {
        _debounceTimer.Stop();
        _workingDirectory = null;
        _requiresStructureRefresh = false;
        _affectedDirectories.Clear();

        if (_watcher is null)
        {
            return;
        }

        _watcher.EnableRaisingEvents = false;
        _watcher.Created -= OnStructureChanged;
        _watcher.Deleted -= OnStructureChanged;
        _watcher.Renamed -= OnRenamed;
        _watcher.Changed -= OnContentChanged;
        _watcher.Dispose();
        _watcher = null;
    }
}
