using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Threading;
using Microsoft.Win32;
using MyDesktop.Models;

namespace MyDesktop.Services;

/// <summary>
/// Everything the desktop should show that is not inside a fence: the shell places the user has
/// switched on (Recycle Bin and friends) and the loose contents of the Desktop folder. MyDesktop
/// draws these itself while the shell's own icon layer is switched off, so a file that lives in a
/// fence stops being drawn on the wallpaper while staying exactly where Explorer expects it.
/// </summary>
public sealed class DesktopLayer : IDisposable
{
    private const string HiddenIconsKey = @"Software\Microsoft\Windows\CurrentVersion\Explorer\HideDesktopIcons\NewStartPanel";

    /// <summary>
    /// The desktop places Windows can show. Only the Recycle Bin is on by default, so the others
    /// count as hidden unless the registry says otherwise — matching Desktop Icon Settings.
    /// </summary>
    private static readonly (string Clsid, string Name, bool ShownByDefault)[] ShellPlaces =
    [
        ("{20D04FE0-3AEA-1069-A2D8-08002B30309D}", "This PC", false),
        ("{59031a47-3f72-44a7-89c5-5595fe6b30ee}", "User", false),
        ("{645FF040-5081-101B-9F08-00AA002F954E}", "Recycle Bin", true),
        ("{F02C1A0D-BE21-4350-88B0-7367FC96EF3C}", "Network", false),
        ("{5399E694-6CE5-4D6C-8FCE-1D8870FDCBA0}", "Control Panel", false)
    ];

    private const double CellWidth = 78;
    private const double CellHeight = 94;

    private readonly Dispatcher _dispatcher;
    private readonly DispatcherTimer _debounce;
    private readonly DispatcherTimer _settle;
    private readonly List<FileSystemWatcher> _watchers = [];
    private readonly Dictionary<string, DesktopSpot> _spots;
    private readonly Action _save;
    private Func<IEnumerable<FenceData>> _fences = Array.Empty<FenceData>;
    private Func<IEnumerable<Rect>> _fenceBounds = Array.Empty<Rect>;

    public DesktopLayer(Dispatcher dispatcher, Dictionary<string, DesktopSpot> spots, Action save)
    {
        _dispatcher = dispatcher;
        _spots = spots;
        _save = save;
        _debounce = new DispatcherTimer(DispatcherPriority.Background) { Interval = TimeSpan.FromMilliseconds(300) };
        _debounce.Tick += (_, _) =>
        {
            _debounce.Stop();
            Refresh();
        };

        // Short on purpose: this one runs while a fence is being dragged across the icons.
        _settle = new DispatcherTimer(DispatcherPriority.Background) { Interval = TimeSpan.FromMilliseconds(40) };
        _settle.Tick += (_, _) =>
        {
            _settle.Stop();
            Arrange();
        };
    }

    public ObservableCollection<FenceItem> Items { get; } = [];

    public void Start(Func<IEnumerable<FenceData>> fences, Func<IEnumerable<Rect>> fenceBounds)
    {
        _fences = fences;
        _fenceBounds = fenceBounds;
        Refresh();
        Watch();
    }

    public void RefreshSoon()
    {
        _debounce.Stop();
        _debounce.Start();
    }

    /// <summary>Lays the icons out again a moment from now, while a fence is still being dragged.</summary>
    public void ArrangeSoon()
    {
        _settle.Stop();
        _settle.Start();
    }

    public void Refresh()
    {
        var claimed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var fence in _fences())
        {
            foreach (var item in fence.Items)
            {
                claimed.Add(item.Path);
            }
        }

        var wanted = new List<FenceItem>();

        foreach (var (clsid, name, shownByDefault) in ShellPlaces)
        {
            var parsingName = "::" + clsid;
            if (IsShellPlaceShown(clsid, shownByDefault) && !claimed.Contains(parsingName))
            {
                // Prefer the name Windows itself uses, so it comes out in the user's language.
                wanted.Add(new FenceItem
                {
                    Name = ShellIconService.GetShellDisplayName(parsingName) ?? name,
                    Path = parsingName
                });
            }
        }

        foreach (var folder in DesktopFolders())
        {
            IEnumerable<string> entries;
            try
            {
                entries = [.. Directory.EnumerateDirectories(folder), .. Directory.EnumerateFiles(folder)];
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
                continue;
            }

            foreach (var path in entries)
            {
                if (claimed.Contains(path) || IsSkipped(path))
                {
                    continue;
                }

                wanted.Add(new FenceItem { Name = PortalSync.DisplayName(path), Path = path });
            }
        }

        var comparer = FenceSorting.ComparerFor(FenceSort.Name);
        var places = wanted.Where(item => item.IsShellPlace).ToList();
        var files = wanted.Where(item => !item.IsShellPlace).ToList();
        files.Sort(comparer);

        var ordered = new List<FenceItem>([.. places, .. files]);
        Reconcile(ordered);
        Arrange();
    }

    /// <summary>
    /// Gives every icon a spot. An icon goes back to the spot it was put in whenever that spot is
    /// clear; a fence moved on top of it pushes it aside, into the first free cell no fence and no
    /// other icon is sitting on. The spot itself is kept, so the icon comes home once the fence
    /// moves away again.
    /// </summary>
    public void Arrange()
    {
        var area = SystemParameters.WorkArea;
        var taken = new List<Rect>();

        foreach (var bounds in _fenceBounds())
        {
            taken.Add(new Rect(bounds.X - area.Left, bounds.Y - area.Top, bounds.Width, bounds.Height));
        }

        foreach (var item in Items)
        {
            Point home;
            if (_spots.TryGetValue(item.Path, out var spot)
                && spot.X >= 0 && spot.Y >= 0
                && spot.X <= area.Width - 20 && spot.Y <= area.Height - 20)
            {
                home = new Point(spot.X, spot.Y);
            }
            else
            {
                home = FirstFree(taken, area.Width, area.Height);
                _spots[item.Path] = new DesktopSpot { X = home.X, Y = home.Y };
            }

            var cell = new Rect(home.X, home.Y, CellWidth, CellHeight);
            if (taken.Any(occupied => occupied.IntersectsWith(cell)))
            {
                home = FirstFree(taken, area.Width, area.Height);
                cell = new Rect(home.X, home.Y, CellWidth, CellHeight);
            }

            item.X = home.X;
            item.Y = home.Y;
            taken.Add(cell);
        }
    }

    /// <summary>Remembers where the user put an icon.</summary>
    public void SetSpot(string path, Point point)
    {
        var area = SystemParameters.WorkArea;
        var x = Math.Clamp(Math.Round(point.X), 0, Math.Max(0, area.Width - CellWidth));
        var y = Math.Clamp(Math.Round(point.Y), 0, Math.Max(0, area.Height - CellHeight));

        _spots[path] = new DesktopSpot { X = x, Y = y };

        var item = Items.FirstOrDefault(entry => string.Equals(entry.Path, path, StringComparison.OrdinalIgnoreCase));
        if (item is not null)
        {
            item.X = x;
            item.Y = y;
        }

        _save();
    }

    public void ForgetSpot(string path)
    {
        if (_spots.Remove(path))
        {
            _save();
        }
    }

    private static Point FirstFree(List<Rect> taken, double width, double height)
    {
        for (var column = 0; column < 60; column++)
        {
            var x = 8 + (column * CellWidth);
            if (x + CellWidth > width)
            {
                break;
            }

            for (var row = 0; ; row++)
            {
                var y = 6 + (row * CellHeight);
                if (y + CellHeight > height)
                {
                    break;
                }

                var cell = new Rect(x, y, CellWidth, CellHeight);
                if (!taken.Any(area => area.IntersectsWith(cell)))
                {
                    return new Point(x, y);
                }
            }
        }

        return new Point(8, 6);
    }

    public void Dispose()
    {
        _debounce.Stop();
        _settle.Stop();
        foreach (var watcher in _watchers)
        {
            watcher.Dispose();
        }

        _watchers.Clear();
    }

    /// <summary>Keeps the existing instances so icons are not reloaded on every refresh.</summary>
    private void Reconcile(List<FenceItem> wanted)
    {
        var existing = Items.ToDictionary(item => item.Path, StringComparer.OrdinalIgnoreCase);

        for (var index = Items.Count - 1; index >= 0; index--)
        {
            if (!wanted.Any(item => string.Equals(item.Path, Items[index].Path, StringComparison.OrdinalIgnoreCase)))
            {
                Items.RemoveAt(index);
            }
        }

        for (var target = 0; target < wanted.Count; target++)
        {
            var item = existing.GetValueOrDefault(wanted[target].Path) ?? wanted[target];
            var current = Items.IndexOf(item);
            if (current < 0)
            {
                Items.Insert(Math.Min(target, Items.Count), item);
            }
            else if (current != target)
            {
                Items.Move(current, Math.Min(target, Items.Count - 1));
            }
        }
    }

    private void Watch()
    {
        foreach (var folder in DesktopFolders())
        {
            try
            {
                var watcher = new FileSystemWatcher(folder)
                {
                    NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName | NotifyFilters.Attributes,
                    EnableRaisingEvents = true
                };

                watcher.Created += OnChanged;
                watcher.Deleted += OnChanged;
                watcher.Renamed += OnChanged;
                watcher.Changed += OnChanged;
                _watchers.Add(watcher);
            }
            catch (Exception exception) when (exception is IOException or ArgumentException)
            {
            }
        }
    }

    private void OnChanged(object sender, FileSystemEventArgs e) => _dispatcher.BeginInvoke(RefreshSoon);

    private static bool IsSkipped(string path)
    {
        if (string.Equals(Path.GetFileName(path), "desktop.ini", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

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

    private static bool IsShellPlaceShown(string clsid, bool shownByDefault)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(HiddenIconsKey);
            // The value is only written once the user has touched that icon; 1 means hidden.
            return key?.GetValue(clsid) is int value ? value == 0 : shownByDefault;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            return shownByDefault;
        }
    }

    private static IEnumerable<string> DesktopFolders()
    {
        yield return Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        yield return Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);
    }
}
