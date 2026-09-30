using System.Collections.ObjectModel;
using System.Collections.Specialized;
using System.ComponentModel;
using System.Windows;
using System.Windows.Threading;
using MyDesktop.Interop;
using MyDesktop.Models;
using MyDesktop.Views;

namespace MyDesktop.Services;

/// <summary>
/// Owns the fences: their windows, their folder portals, and the desktop gestures that create them.
/// </summary>
public sealed class FenceManager : IDisposable
{
    private readonly WorkspaceStore _store;
    private readonly Dictionary<string, FenceWindow> _windows = [];
    private readonly Dictionary<string, PortalSync> _portals = [];
    private readonly DesktopMouseHook _hook = new();
    private readonly RecycleBinWatcher _bin = new();
    private LassoWindow? _lasso;
    private DesktopLayer? _desktop;
    private DesktopLayerWindow? _desktopWindow;

    public FenceManager(WorkspaceStore store)
    {
        _store = store;
        Workspace = store.Load();

        if (Fences.Count == 0)
        {
            SeedFromDesktop();
        }

        Fences.CollectionChanged += OnFencesChanged;
        Settings.PropertyChanged += OnSettingsChanged;

        foreach (var fence in Fences)
        {
            Track(fence);
        }
    }

    public WorkspaceData Workspace { get; }

    public ObservableCollection<FenceData> Fences => Workspace.Fences;

    public AppSettings Settings => Workspace.Settings;

    public void Start()
    {
        // Before the first window exists: a fence translates itself as it is shown, and settling the
        // language afterwards would leave the ones opened here in whatever language came first.
        Strings.Language = Settings.Language;

        foreach (var fence in Fences.ToArray())
        {
            OpenWindow(fence);
        }

        _lasso = new LassoWindow();
        _hook.LassoUpdated += (origin, current) => _lasso?.Track(origin, current);
        _hook.LassoCompleted += OnLassoCompleted;
        _hook.DesktopDoubleClicked += ToggleQuickHide;
        Diagnostics.StartSession();
        ApplyGestureSettings();
        _hook.Install();

        _bin.Changed += RefreshRecycleBin;
        _bin.Start();

        Settings.LaunchAtLogin = StartupRegistration.IsRegistered();
        ApplyHiddenState();

        ApplyDesktopDrawing();
        Save();
    }

    /// <summary>
    /// When MyDesktop draws the desktop, the shell's icon layer goes away and our own layer takes
    /// over. Items that live in a fence are simply left out of it.
    /// </summary>
    public void ApplyDesktopDrawing()
    {
        if (Settings.DrawDesktop)
        {
            DesktopIcons.Apply(true);

            if (_desktop is null)
            {
                _desktop = new DesktopLayer(Dispatcher.CurrentDispatcher, Workspace.DesktopPositions, Save);
                _desktopWindow = new DesktopLayerWindow(_desktop, this);
                _desktopWindow.Show();
                _desktop.Start(() => Fences, FenceBounds);
                _hook.IsOverDrawnIcon = _desktopWindow.IsOverItem;
            }
            else
            {
                _desktopWindow?.Show();
                _desktop.Refresh();
            }

            DesktopAnchor.SinkAll();
            return;
        }

        _desktopWindow?.Hide();
        DesktopWindows.DrawnDesktop = IntPtr.Zero;
        _hook.IsOverDrawnIcon = null;
        DesktopIcons.Apply(Settings.HideDesktopIcons);
    }

    private void RefreshDesktopLayer() => _desktop?.RefreshSoon();

    /// <summary>
    /// Where the fences are on screen. Taken from the windows rather than the saved data, so the
    /// icons start moving out of the way while a fence is still being dragged, and so a fence that
    /// is hidden or rolled away stops pushing anything.
    /// </summary>
    private IEnumerable<Rect> FenceBounds()
    {
        foreach (var fence in Fences)
        {
            if (_windows.GetValueOrDefault(fence.Id) is { IsVisible: true } window)
            {
                yield return new Rect(window.Left, window.Top, window.Width, window.Height);
            }
        }
    }

    /// <summary>Called while a fence is being moved or resized, so the icons under it step aside.</summary>
    public void PushDesktopIcons() => _desktop?.ArrangeSoon();

    /// <summary>MyDesktop just deleted or restored something, so look at the bin without waiting.</summary>
    public void CheckRecycleBin() => _bin.Check();

    /// <summary>Full and empty are different icons, and every copy of the bin has to show the same one.</summary>
    private void RefreshRecycleBin()
    {
        foreach (var item in Fences.SelectMany(fence => fence.Items).Concat(_desktop?.Items ?? []))
        {
            if (item.IsRecycleBin)
            {
                item.RefreshIcon();
            }
        }
    }

    /// <summary>
    /// Makes the drawn desktop catch drops for the duration of a drag, so an item pulled out of a
    /// fence lands on MyDesktop rather than on Explorer's copy of the same file.
    /// </summary>
    public void SetDesktopDragCapture(bool capturing) => _desktopWindow?.SetDragCapture(capturing);

    public void RefreshDesktop() => _desktop?.Refresh();

    public void Save() => _store.ScheduleSave(Workspace);

    public FenceWindow? WindowFor(FenceData fence) => _windows.GetValueOrDefault(fence.Id);

    public FenceData? FenceById(string id) => Fences.FirstOrDefault(fence => fence.Id == id);

    public FenceData CreateFence(Rect bounds, string? name = null)
    {
        var fence = new FenceData
        {
            Name = name ?? NextName(),
            Left = Math.Round(bounds.Left),
            Top = Math.Round(bounds.Top),
            Width = Math.Max(Math.Round(bounds.Width), 160),
            Height = Math.Max(Math.Round(bounds.Height), 120)
        };

        fence.ExpandedHeight = fence.Height;
        Fences.Add(fence);
        return fence;
    }

    public FenceData CreateFenceAtCursor()
    {
        var cursor = CursorPosition();
        return CreateFence(new Rect(cursor.X, cursor.Y, 320, 240));
    }

    public FenceData CreatePortal(string folder, Rect? bounds = null)
    {
        var area = bounds ?? new Rect(CursorPosition(), new Size(340, 260));
        var fence = CreateFence(area, Path.GetFileName(folder.TrimEnd(Path.DirectorySeparatorChar)));
        fence.Kind = FenceKind.Portal;
        fence.PortalPath = folder;
        fence.Sort = FenceSort.Name;
        if (string.IsNullOrWhiteSpace(fence.Name))
        {
            fence.Name = folder;
        }

        RefreshPortal(fence);
        return fence;
    }

    public void Remove(FenceData fence)
    {
        Fences.Remove(fence);
    }

    public void ToggleQuickHide()
    {
        Settings.AllHidden = !Settings.AllHidden;
        Diagnostics.Write($"quick hide toggled, AllHidden={Settings.AllHidden}");
    }

    public void ApplyHiddenState()
    {
        foreach (var (id, window) in _windows)
        {
            var fence = FenceById(id);
            var visible = fence is not null && !fence.Hidden && !Settings.AllHidden;
            if (visible)
            {
                window.Show();
                DesktopAnchor.SinkAll();
            }
            else
            {
                window.Hide();
            }
        }

        // A fence that just went away stops pushing icons; one that came back starts again.
        PushDesktopIcons();
    }

    public void RefreshPortal(FenceData fence)
    {
        if (!fence.IsPortal)
        {
            if (_portals.Remove(fence.Id, out var stale))
            {
                stale.Dispose();
            }

            return;
        }

        if (!_portals.TryGetValue(fence.Id, out var sync))
        {
            sync = new PortalSync(fence, Dispatcher.CurrentDispatcher);
            _portals[fence.Id] = sync;
            sync.Start();
        }
        else
        {
            sync.Refresh();
        }
    }

    public void Dispose()
    {
        DesktopIcons.Restore();
        _desktop?.Dispose();
        _desktopWindow?.CloseLayer();
        _desktopWindow = null;
        _hook.Dispose();
        _bin.Dispose();
        foreach (var portal in _portals.Values)
        {
            portal.Dispose();
        }

        _portals.Clear();

        foreach (var window in _windows.Values.ToArray())
        {
            window.CloseFence();
        }

        _windows.Clear();
        _lasso?.Close();
        _store.Flush();
    }

    private void OpenWindow(FenceData fence)
    {
        if (_windows.ContainsKey(fence.Id))
        {
            return;
        }

        var window = new FenceWindow(fence, this);
        _windows[fence.Id] = window;
        if (!fence.Hidden && !Settings.AllHidden)
        {
            window.Show();
        }
    }

    private void CloseWindow(FenceData fence)
    {
        if (_windows.Remove(fence.Id, out var window))
        {
            window.CloseFence();
        }

        if (_portals.Remove(fence.Id, out var portal))
        {
            portal.Dispose();
        }

    }

    private void Track(FenceData fence)
    {
        fence.PropertyChanged += OnFencePropertyChanged;
        fence.Items.CollectionChanged += OnItemsChanged;
        if (fence.IsPortal)
        {
            RefreshPortal(fence);
        }
    }

    private void Untrack(FenceData fence)
    {
        fence.PropertyChanged -= OnFencePropertyChanged;
        fence.Items.CollectionChanged -= OnItemsChanged;
    }

    private void OnFencesChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        if (e.OldItems is not null)
        {
            foreach (FenceData fence in e.OldItems)
            {
                Untrack(fence);
                CloseWindow(fence);
            }
        }

        if (e.NewItems is not null)
        {
            foreach (FenceData fence in e.NewItems)
            {
                Track(fence);
                OpenWindow(fence);
            }
        }

        Save();
    }

    private void OnFencePropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (sender is FenceData fence)
        {
            if (e.PropertyName is nameof(FenceData.Kind) or nameof(FenceData.PortalPath) or nameof(FenceData.PortalShowHidden))
            {
                RefreshPortal(fence);
            }
            else if (e.PropertyName == nameof(FenceData.Sort))
            {
                if (fence.IsPortal)
                {
                    RefreshPortal(fence);
                }
                else
                {
                    FenceSorting.Apply(fence.Items, fence.Sort);
                }
            }
            else if (e.PropertyName == nameof(FenceData.Hidden))
            {
                ApplyHiddenState();
            }
        }

        Save();
    }

    private void OnItemsChanged(object? sender, NotifyCollectionChangedEventArgs e)
    {
        // What a fence holds is exactly what the drawn desktop must leave out.
        RefreshDesktopLayer();
        Save();
    }

    private void OnSettingsChanged(object? sender, PropertyChangedEventArgs e)
    {
        switch (e.PropertyName)
        {
            case nameof(AppSettings.AllHidden):
                ApplyHiddenState();
                break;
            case nameof(AppSettings.LaunchAtLogin):
                StartupRegistration.Apply(Settings.LaunchAtLogin);
                break;
            case nameof(AppSettings.QuickHideOnDesktopDoubleClick):
            case nameof(AppSettings.CreateFenceWithRightDrag):
                ApplyGestureSettings();
                break;
            case nameof(AppSettings.HideDesktopIcons):
            case nameof(AppSettings.DrawDesktop):
                ApplyDesktopDrawing();
                break;
            case nameof(AppSettings.Language):
                Strings.Language = Settings.Language;
                break;
        }

        Save();
    }

    private void ApplyGestureSettings()
    {
        _hook.LassoEnabled = Settings.CreateFenceWithRightDrag;
        _hook.QuickHideEnabled = Settings.QuickHideOnDesktopDoubleClick;
    }

    private void OnLassoCompleted(Point origin, Point end)
    {
        var bounds = _lasso?.Finish(origin, end) ?? Rect.Empty;
        if (bounds.Width < 70 || bounds.Height < 60)
        {
            return;
        }

        var fence = CreateFence(bounds);
        WindowFor(fence)?.BeginRename();
    }

    private string NextName()
    {
        var index = Fences.Count + 1;
        while (Fences.Any(fence => fence.Name == Numbered(index)))
        {
            index++;
        }

        return Numbered(index);
    }

    /// <summary>
    /// The name a brand new fence is given. It goes into the saved workspace as plain text, so it
    /// keeps whatever language was in use when the fence was made, exactly as a folder name would.
    /// </summary>
    private static string Numbered(int index) => string.Format(Strings.T("Fence {0}"), index);

    private static Point CursorPosition()
    {
        NativeMethods.GetCursorPos(out var point);
        return DisplayScale.FromDevice(new Point(point.X, point.Y));
    }

    /// <summary>
    /// First run: sort whatever is already on the desktop into Programs / Folders / Documents,
    /// the same three buckets the Fences setup wizard offers.
    /// </summary>
    private void SeedFromDesktop()
    {
        // Stay clear of the icon column on the left, so the first run does not bury the Recycle Bin.
        var work = SystemParameters.WorkArea;
        var column = Math.Max(work.Left + 40, work.Right - 370);
        var top = work.Top + 40;

        var programs = new FenceData { Name = "Programs", Left = column, Top = top, Width = 330, Height = 250, ExpandedHeight = 250, Accent = "#D9F078" };
        var folders = new FenceData { Name = "Folders", Left = column, Top = top + 270, Width = 330, Height = 210, ExpandedHeight = 210, Accent = "#69A9A0" };
        var documents = new FenceData { Name = "Documents", Left = column, Top = top + 500, Width = 330, Height = 210, ExpandedHeight = 210, Accent = "#E78F67" };

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

            foreach (var entry in entries)
            {
                var name = Path.GetFileName(entry);
                if (string.Equals(name, "desktop.ini", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var target = Directory.Exists(entry)
                    ? folders
                    : Path.GetExtension(entry).ToLowerInvariant() is ".lnk" or ".url" or ".exe" or ".appref-ms"
                        ? programs
                        : documents;

                target.Items.Add(new FenceItem { Name = PortalSync.DisplayName(entry), Path = entry });
            }
        }

        foreach (var fence in new[] { programs, folders, documents })
        {
            FenceSorting.Apply(fence.Items, FenceSort.Name);
            if (fence.Items.Count > 0 || ReferenceEquals(fence, programs))
            {
                Fences.Add(fence);
            }
        }
    }

    private static IEnumerable<string> DesktopFolders()
    {
        yield return Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        yield return Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);
    }
}
