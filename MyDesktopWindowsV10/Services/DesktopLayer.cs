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

    /// <summary>
    /// One cell of the lattice the icons sit on.
    ///
    /// Whether a cell is taken is counted in cells rather than by comparing rectangles, and that is
    /// the whole point of this type. The lattice step is exactly the cell size, so an icon's cell
    /// shares an edge with each of its neighbours, and Rect.IntersectsWith counts a shared edge as
    /// an overlap. Asking rectangles whether a cell was free therefore made every icon collide with
    /// everything beside it: an icon dropped next to another one was taken to have landed on an
    /// occupied cell and sent off to look for a free one, which on a tidy desktop was usually the
    /// cell it had just been dragged out of. It looked as though the drop had been refused.
    /// </summary>
    private readonly record struct Cell(int Column, int Row);

    /// <summary>Where the first cell starts. Everything else is a multiple of the cell from here.</summary>
    private const double GridOriginX = 8;

    private const double GridOriginY = 6;

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

        var fences = new List<Rect>();
        foreach (var bounds in _fenceBounds())
        {
            fences.Add(new Rect(bounds.X - area.Left, bounds.Y - area.Top, bounds.Width, bounds.Height));
        }

        // Fences and icons are different kinds of obstacle. A fence lying over a spot pushes the
        // icon aside for as long as it is there; another icon means the two simply cannot share the
        // cell. Treating both the same is what used to send a hand-placed icon back to the top-left
        // corner the moment anything else refreshed the layer.
        var claimed = new HashSet<Cell>();

        // Icons the user has placed are laid out first, so a never-placed one fills in around them
        // instead of taking a cell that belongs to somebody.
        foreach (var item in Items.OrderByDescending(entry => _spots.ContainsKey(entry.Path)))
        {
            var remembered = _spots.TryGetValue(item.Path, out var spot) && spot is not null && OnScreen(spot, area)
                ? CellOf(new Point(spot.X, spot.Y), area)
                : (Cell?)null;

            var home = remembered ?? NearestFree(new Cell(0, 0), fences, claimed, area);
            if (remembered is null)
            {
                var fresh = PointOf(home);
                _spots[item.Path] = new DesktopSpot { X = fresh.X, Y = fresh.Y };
            }

            // Only a fence, or a cell already spoken for, moves an icon off its spot — and then only
            // for as long as that is true. The spot itself is kept, so it comes home afterwards.
            if (claimed.Contains(home) || Covered(home, fences))
            {
                home = NearestFree(home, fences, claimed, area);
            }

            var position = PointOf(home);
            item.X = position.X;
            item.Y = position.Y;
            claimed.Add(home);
        }
    }

    /// <summary>
    /// Remembers where the user put an icon. The drop is snapped to the same lattice the automatic
    /// placement uses, so hand-placed icons line up with the rest instead of sitting a few pixels
    /// off; and if that cell is taken, the nearest free one to the drop wins rather than the first
    /// free cell on the screen.
    /// </summary>
    public void SetSpot(string path, Point point)
    {
        var area = SystemParameters.WorkArea;
        var wanted = CellOf(point, area);

        var claimed = new HashSet<Cell>();
        foreach (var other in Items)
        {
            if (!string.Equals(other.Path, path, StringComparison.OrdinalIgnoreCase))
            {
                claimed.Add(CellOf(new Point(other.X, other.Y), area));
            }
        }

        if (claimed.Contains(wanted))
        {
            wanted = NearestFree(wanted, [], claimed, area);
        }

        var landing = PointOf(wanted);
        _spots[path] = new DesktopSpot { X = landing.X, Y = landing.Y };

        var item = Items.FirstOrDefault(entry => string.Equals(entry.Path, path, StringComparison.OrdinalIgnoreCase));
        if (item is not null)
        {
            item.X = landing.X;
            item.Y = landing.Y;
        }

        _save();
    }

    private static bool OnScreen(DesktopSpot spot, Rect area)
        => spot.X >= 0 && spot.Y >= 0 && spot.X <= area.Width - 20 && spot.Y <= area.Height - 20;

    /// <summary>The cell a free-hand point falls in: the nearest one, kept inside the work area.</summary>
    private static Cell CellOf(Point point, Rect area) => new(
        Math.Clamp((int)Math.Round((point.X - GridOriginX) / CellWidth), 0, Columns(area) - 1),
        Math.Clamp((int)Math.Round((point.Y - GridOriginY) / CellHeight), 0, Rows(area) - 1));

    /// <summary>Where a cell's icon is drawn.</summary>
    private static Point PointOf(Cell cell)
        => new(GridOriginX + (cell.Column * CellWidth), GridOriginY + (cell.Row * CellHeight));

    private static int Columns(Rect area) => Math.Max(1, (int)((area.Width - GridOriginX) / CellWidth));

    private static int Rows(Rect area) => Math.Max(1, (int)((area.Height - GridOriginY) / CellHeight));

    /// <summary>
    /// Whether a fence really lies over a cell. The test is a strict overlap, so a fence edge that
    /// happens to land exactly on a cell boundary is beside that cell rather than on top of it.
    /// </summary>
    private static bool Covered(Cell cell, List<Rect> fences)
    {
        var bounds = new Rect(PointOf(cell), new Size(CellWidth, CellHeight));
        foreach (var fence in fences)
        {
            if (fence.Left < bounds.Right && fence.Right > bounds.Left
                && fence.Top < bounds.Bottom && fence.Bottom > bounds.Top)
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// The free cell closest to where the icon wanted to be. Searching outwards from the spot rather
    /// than from the top-left is what keeps a displaced icon beside its neighbours.
    /// </summary>
    private static Cell NearestFree(Cell from, List<Rect> fences, HashSet<Cell> claimed, Rect area)
    {
        var columns = Columns(area);
        var rows = Rows(area);

        var best = new Cell(0, 0);
        var bestDistance = double.MaxValue;

        for (var column = 0; column < columns; column++)
        {
            for (var row = 0; row < rows; row++)
            {
                var candidate = new Cell(column, row);
                if (claimed.Contains(candidate) || Covered(candidate, fences))
                {
                    continue;
                }

                // Columns first, the way the shell fills its desktop, so ties break downwards.
                var distance = Math.Pow(column - from.Column, 2) + Math.Pow((row - from.Row) * 0.98, 2);
                if (distance < bestDistance)
                {
                    bestDistance = distance;
                    best = candidate;
                }
            }
        }

        return best;
    }

    public void ForgetSpot(string path)
    {
        if (_spots.Remove(path))
        {
            _save();
        }
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
