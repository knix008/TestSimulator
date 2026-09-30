using System.Windows.Threading;
using Palisades.Models;

namespace Palisades.Services;

/// <summary>
/// Mirrors a folder into a fence, the way a Fences portal shows live folder contents.
/// </summary>
public sealed class PortalSync : IDisposable
{
    private readonly FenceData _fence;
    private readonly Dispatcher _dispatcher;
    private readonly DispatcherTimer _debounce;
    private FileSystemWatcher? _watcher;

    public PortalSync(FenceData fence, Dispatcher dispatcher)
    {
        _fence = fence;
        _dispatcher = dispatcher;
        _debounce = new DispatcherTimer(DispatcherPriority.Background)
        {
            Interval = TimeSpan.FromMilliseconds(350)
        };
        _debounce.Tick += (_, _) =>
        {
            _debounce.Stop();
            Refresh();
        };
    }

    public void Start()
    {
        Refresh();
        Watch();
    }

    public void Refresh()
    {
        var folder = _fence.PortalPath;
        if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder))
        {
            _fence.Items.Clear();
            return;
        }

        List<string> paths;
        try
        {
            paths = [.. Directory.EnumerateDirectories(folder), .. Directory.EnumerateFiles(folder)];
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            return;
        }

        var visible = new List<FenceItem>();
        var existing = _fence.Items.ToDictionary(item => item.Path, StringComparer.OrdinalIgnoreCase);

        foreach (var path in paths)
        {
            if (!_fence.PortalShowHidden && IsHidden(path))
            {
                continue;
            }

            if (string.Equals(Path.GetFileName(path), "desktop.ini", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (existing.TryGetValue(path, out var item))
            {
                visible.Add(item);
            }
            else
            {
                visible.Add(new FenceItem { Name = DisplayName(path), Path = path });
            }
        }

        var comparer = FenceSorting.ComparerFor(_fence.Sort == FenceSort.Manual ? FenceSort.Name : _fence.Sort);
        visible.Sort(comparer);

        _fence.Items.Clear();
        foreach (var item in visible)
        {
            _fence.Items.Add(item);
        }
    }

    public void Dispose()
    {
        _debounce.Stop();
        _watcher?.Dispose();
        _watcher = null;
    }

    private void Watch()
    {
        _watcher?.Dispose();
        _watcher = null;

        var folder = _fence.PortalPath;
        if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder))
        {
            return;
        }

        try
        {
            _watcher = new FileSystemWatcher(folder)
            {
                NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName | NotifyFilters.Attributes,
                IncludeSubdirectories = false,
                EnableRaisingEvents = true
            };

            _watcher.Created += OnChanged;
            _watcher.Deleted += OnChanged;
            _watcher.Renamed += OnChanged;
            _watcher.Changed += OnChanged;
        }
        catch (Exception exception) when (exception is IOException or ArgumentException)
        {
            _watcher = null;
        }
    }

    private void OnChanged(object sender, FileSystemEventArgs e)
    {
        _dispatcher.BeginInvoke(() =>
        {
            _debounce.Stop();
            _debounce.Start();
        });
    }

    public static string DisplayName(string path)
    {
        if (path.StartsWith("::{", StringComparison.Ordinal))
        {
            return ShellIconService.GetShellDisplayName(path) ?? path;
        }

        var name = Path.GetFileName(path);
        if (string.IsNullOrEmpty(name))
        {
            return path;
        }

        // Explorer hides the extension of shortcuts and internet links.
        var extension = Path.GetExtension(name);
        return extension is ".lnk" or ".url" ? Path.GetFileNameWithoutExtension(name) : name;
    }

    private static bool IsHidden(string path)
    {
        try
        {
            var attributes = File.GetAttributes(path);
            return attributes.HasFlag(FileAttributes.Hidden) || attributes.HasFlag(FileAttributes.System);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            return true;
        }
    }
}
