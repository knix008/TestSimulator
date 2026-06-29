namespace MyGitWinV10.App.Services;

public sealed class RepositoryWorkingTreeChangeEventArgs : EventArgs
{
    public bool RequiresStructureRefresh { get; init; }

    public bool RequiresStatusRefresh { get; init; }

    /// <summary>Branch list, commit graph, and related repository state should refresh.</summary>
    public bool RequiresRepositoryRefresh { get; init; }

    public IReadOnlyList<string> AffectedDirectoryPaths { get; init; } = [];
}

/// <summary>
/// Debounced <see cref="FileSystemWatcher"/> for the repository working tree and selected
/// <c>.git</c> metadata files. Raises <see cref="Changed"/> after external edits settle.
/// </summary>
public sealed class RepositoryWorkingTreeWatcher : IDisposable
{
    private const int DebounceMs = 300;

    private readonly Control _syncControl;
    private readonly System.Windows.Forms.Timer _debounceTimer;
    private readonly HashSet<string> _affectedDirectories = new(StringComparer.OrdinalIgnoreCase);
    private FileSystemWatcher? _workingTreeWatcher;
    private FileSystemWatcher? _gitMetadataWatcher;
    private string? _workingDirectory;
    private string? _gitDirectory;
    private bool _requiresStructureRefresh;
    private bool _requiresStatusRefresh;
    private bool _requiresRepositoryRefresh;
    private bool _disposed;

    public RepositoryWorkingTreeWatcher(Control syncControl)
    {
        _syncControl = syncControl;
        _debounceTimer = new System.Windows.Forms.Timer { Interval = DebounceMs };
        _debounceTimer.Tick += (_, _) => FlushPendingChanges();
    }

    public event EventHandler<RepositoryWorkingTreeChangeEventArgs>? Changed;

    public void Watch(string? workingDirectory, string? gitDirectory = null)
    {
        if (_disposed)
        {
            return;
        }

        string? normalizedWorkingDirectory = NormalizeDirectory(workingDirectory);
        string? normalizedGitDirectory = ResolveGitDirectory(normalizedWorkingDirectory, gitDirectory);
        if (string.Equals(_workingDirectory, normalizedWorkingDirectory, StringComparison.OrdinalIgnoreCase)
            && string.Equals(_gitDirectory, normalizedGitDirectory, StringComparison.OrdinalIgnoreCase)
            && _workingTreeWatcher?.EnableRaisingEvents == true)
        {
            return;
        }

        StopInternal();

        if (normalizedWorkingDirectory is null || !Directory.Exists(normalizedWorkingDirectory))
        {
            return;
        }

        _workingDirectory = normalizedWorkingDirectory;
        _gitDirectory = normalizedGitDirectory;

        _workingTreeWatcher = new FileSystemWatcher(normalizedWorkingDirectory)
        {
            NotifyFilter = NotifyFilters.FileName
                | NotifyFilters.DirectoryName
                | NotifyFilters.LastWrite
                | NotifyFilters.Size,
            IncludeSubdirectories = true,
            EnableRaisingEvents = true,
            InternalBufferSize = 64 * 1024,
        };

        _workingTreeWatcher.Created += OnWorkingTreeStructureChanged;
        _workingTreeWatcher.Deleted += OnWorkingTreeStructureChanged;
        _workingTreeWatcher.Renamed += OnWorkingTreeRenamed;
        _workingTreeWatcher.Changed += OnWorkingTreeContentChanged;
        _workingTreeWatcher.Error += (_, _) => ScheduleNotify(requiresStructureRefresh: true, requiresStatusRefresh: true, requiresRepositoryRefresh: true, relativeDirectory: null);

        if (normalizedGitDirectory is not null && Directory.Exists(normalizedGitDirectory))
        {
            _gitMetadataWatcher = new FileSystemWatcher(normalizedGitDirectory)
            {
                NotifyFilter = NotifyFilters.FileName
                    | NotifyFilters.DirectoryName
                    | NotifyFilters.LastWrite
                    | NotifyFilters.Size,
                IncludeSubdirectories = true,
                EnableRaisingEvents = true,
                InternalBufferSize = 64 * 1024,
            };

            _gitMetadataWatcher.Created += OnGitMetadataChanged;
            _gitMetadataWatcher.Deleted += OnGitMetadataChanged;
            _gitMetadataWatcher.Renamed += OnGitMetadataChanged;
            _gitMetadataWatcher.Changed += OnGitMetadataChanged;
            _gitMetadataWatcher.Error += (_, _) => ScheduleNotify(requiresStructureRefresh: false, requiresStatusRefresh: true, requiresRepositoryRefresh: true, relativeDirectory: null);
        }
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

    private void OnWorkingTreeStructureChanged(object sender, FileSystemEventArgs e)
    {
        if (ShouldIgnoreWorkingTreePath(e.FullPath))
        {
            return;
        }

        ScheduleNotify(requiresStructureRefresh: true, requiresStatusRefresh: true, requiresRepositoryRefresh: false, GetRelativeDirectory(e.FullPath));
    }

    private void OnWorkingTreeContentChanged(object sender, FileSystemEventArgs e)
    {
        if (ShouldIgnoreWorkingTreePath(e.FullPath))
        {
            return;
        }

        ScheduleNotify(requiresStructureRefresh: false, requiresStatusRefresh: true, requiresRepositoryRefresh: false, GetRelativeDirectory(e.FullPath));
    }

    private void OnWorkingTreeRenamed(object sender, RenamedEventArgs e)
    {
        if (ShouldIgnoreWorkingTreePath(e.FullPath) && ShouldIgnoreWorkingTreePath(e.OldFullPath))
        {
            return;
        }

        ScheduleNotify(requiresStructureRefresh: true, requiresStatusRefresh: true, requiresRepositoryRefresh: false, GetRelativeDirectory(e.FullPath));
        ScheduleNotify(requiresStructureRefresh: true, requiresStatusRefresh: true, requiresRepositoryRefresh: false, GetRelativeDirectory(e.OldFullPath));
    }

    private void OnGitMetadataChanged(object sender, FileSystemEventArgs e)
    {
        if (_gitDirectory is null || !TryGetRelativeGitPath(e.FullPath, out string relativeGitPath))
        {
            return;
        }

        if (!IsTrackedGitMetadataPath(relativeGitPath))
        {
            return;
        }

        ScheduleNotify(
            requiresStructureRefresh: false,
            requiresStatusRefresh: true,
            requiresRepositoryRefresh: IsRepositoryStateGitMetadataPath(relativeGitPath),
            relativeDirectory: null);
    }

    private void ScheduleNotify(bool requiresStructureRefresh, bool requiresStatusRefresh, bool requiresRepositoryRefresh, string? relativeDirectory)
    {
        if (_disposed)
        {
            return;
        }

        if (requiresStructureRefresh)
        {
            _requiresStructureRefresh = true;
        }

        if (requiresStatusRefresh)
        {
            _requiresStatusRefresh = true;
        }

        if (requiresRepositoryRefresh)
        {
            _requiresRepositoryRefresh = true;
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

        if (!_requiresStructureRefresh
            && !_requiresStatusRefresh
            && !_requiresRepositoryRefresh
            && _affectedDirectories.Count == 0)
        {
            return;
        }

        var args = new RepositoryWorkingTreeChangeEventArgs
        {
            RequiresStructureRefresh = _requiresStructureRefresh,
            RequiresStatusRefresh = _requiresStatusRefresh,
            RequiresRepositoryRefresh = _requiresRepositoryRefresh,
            AffectedDirectoryPaths = _affectedDirectories.ToList(),
        };

        _requiresStructureRefresh = false;
        _requiresStatusRefresh = false;
        _requiresRepositoryRefresh = false;
        _affectedDirectories.Clear();
        Changed?.Invoke(this, args);
    }

    private bool ShouldIgnoreWorkingTreePath(string fullPath)
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

    private bool TryGetRelativeGitPath(string fullPath, out string relativeGitPath)
    {
        relativeGitPath = string.Empty;
        if (_gitDirectory is null)
        {
            return false;
        }

        try
        {
            relativeGitPath = Path.GetRelativePath(_gitDirectory, fullPath).Replace('\\', '/');
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static bool IsTrackedGitMetadataPath(string relativeGitPath)
    {
        if (string.IsNullOrEmpty(relativeGitPath) || string.Equals(relativeGitPath, ".", StringComparison.Ordinal))
        {
            return false;
        }

        if (relativeGitPath.EndsWith(".lock", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (relativeGitPath.StartsWith("objects/", StringComparison.OrdinalIgnoreCase)
            || relativeGitPath.StartsWith("hooks/", StringComparison.OrdinalIgnoreCase)
            || relativeGitPath.StartsWith("info/", StringComparison.OrdinalIgnoreCase)
            || relativeGitPath.StartsWith("modules/", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (string.Equals(relativeGitPath, "index", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.Equals(relativeGitPath, "HEAD", StringComparison.OrdinalIgnoreCase)
            || string.Equals(relativeGitPath, "FETCH_HEAD", StringComparison.OrdinalIgnoreCase)
            || string.Equals(relativeGitPath, "ORIG_HEAD", StringComparison.OrdinalIgnoreCase)
            || string.Equals(relativeGitPath, "config", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (relativeGitPath.StartsWith("refs/", StringComparison.OrdinalIgnoreCase)
            || relativeGitPath.StartsWith("logs/refs/", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return relativeGitPath.EndsWith("_HEAD", StringComparison.OrdinalIgnoreCase)
            && !relativeGitPath.Contains('/');
    }

    private static bool IsRepositoryStateGitMetadataPath(string relativeGitPath) =>
        !string.Equals(relativeGitPath, "index", StringComparison.OrdinalIgnoreCase);

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

    private static string? NormalizeDirectory(string? directoryPath)
    {
        if (string.IsNullOrWhiteSpace(directoryPath))
        {
            return null;
        }

        return directoryPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
    }

    private static string? ResolveGitDirectory(string? workingDirectory, string? gitDirectory)
    {
        string? normalizedGitDirectory = NormalizeDirectory(gitDirectory);
        if (normalizedGitDirectory is not null && Directory.Exists(normalizedGitDirectory))
        {
            return normalizedGitDirectory;
        }

        if (workingDirectory is null)
        {
            return null;
        }

        string defaultGitDirectory = Path.Combine(workingDirectory, ".git");
        if (Directory.Exists(defaultGitDirectory))
        {
            return defaultGitDirectory;
        }

        if (File.Exists(defaultGitDirectory))
        {
            try
            {
                string? firstLine = File.ReadLines(defaultGitDirectory).FirstOrDefault();
                const string gitDirPrefix = "gitdir: ";
                if (firstLine is not null
                    && firstLine.StartsWith(gitDirPrefix, StringComparison.OrdinalIgnoreCase))
                {
                    string linkedGitDirectory = firstLine[gitDirPrefix.Length..].Trim().Trim('"');
                    if (!Path.IsPathRooted(linkedGitDirectory))
                    {
                        linkedGitDirectory = Path.GetFullPath(Path.Combine(workingDirectory, linkedGitDirectory));
                    }

                    return Directory.Exists(linkedGitDirectory) ? linkedGitDirectory : null;
                }
            }
            catch
            {
                return null;
            }
        }

        return null;
    }

    private void StopInternal()
    {
        _debounceTimer.Stop();
        _workingDirectory = null;
        _gitDirectory = null;
        _requiresStructureRefresh = false;
        _requiresStatusRefresh = false;
        _requiresRepositoryRefresh = false;
        _affectedDirectories.Clear();
        DisposeWatcher(ref _workingTreeWatcher);
        DisposeWatcher(ref _gitMetadataWatcher);
    }

    private static void DisposeWatcher(ref FileSystemWatcher? watcher)
    {
        if (watcher is null)
        {
            return;
        }

        watcher.EnableRaisingEvents = false;
        watcher.Dispose();
        watcher = null;
    }
}
