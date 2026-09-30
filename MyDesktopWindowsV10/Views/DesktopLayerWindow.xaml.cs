using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using MyDesktop.Interop;
using MyDesktop.Models;
using MyDesktop.Services;

namespace MyDesktop.Views;

/// <summary>
/// The desktop MyDesktop draws for itself while the shell's icon layer is switched off. It sits
/// below every fence, and its empty area is fully transparent so clicks, right-drags and
/// double-clicks land on the real desktop underneath.
/// </summary>
public partial class DesktopLayerWindow : Window
{
    private readonly DesktopLayer _layer;
    private readonly FenceManager _manager;

    private bool _closing;
    private bool _dragging;
    private Point _dragStart;
    private Point _grabOffset;
    private FenceItem? _dragCandidate;
    private readonly Dictionary<string, Point> _dragOrigins = [];

    public DesktopLayerWindow(DesktopLayer layer, FenceManager manager)
    {
        _layer = layer;
        _manager = manager;

        InitializeComponent();
        DataContext = layer;
        ItemsView.ItemsSource = layer.Items;

        ApplyWorkArea();
        SystemParameters.StaticPropertyChanged += (_, e) =>
        {
            if (e.PropertyName is nameof(SystemParameters.WorkArea))
            {
                ApplyWorkArea();
            }
        };
    }

    public void CloseLayer()
    {
        _closing = true;
        Close();
    }

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        DisplayScale.CaptureFrom(this);

        // Lowest of everything MyDesktop owns, so fences float above the icons.
        DesktopAnchor.Attach(this, lowest: true);
        DesktopWindows.DrawnDesktop = new System.Windows.Interop.WindowInteropHelper(this).Handle;

        Localizer.Apply(this);
        Strings.Changed += Localize;
        Closed += (_, _) => Strings.Changed -= Localize;
    }

    private void Localize() => Localizer.Apply(this);

    /// <summary>
    /// While something is being dragged, the empty area has to catch the drop instead of letting it
    /// fall through to Explorer — otherwise the shell tries to copy a desktop file onto itself and
    /// asks about the name clash. A single unit of alpha is enough to make it a drop target and is
    /// invisible; the rest of the time the background is null so clicks reach the real desktop.
    /// </summary>
    public void SetDragCapture(bool capturing)
    {
        Root.Background = capturing ? new SolidColorBrush(Color.FromArgb(1, 0, 0, 0)) : null;
    }

    /// <summary>Screen pixels in, true when an icon MyDesktop drew is there.</summary>
    public bool IsOverItem(Point screenPoint)
    {
        try
        {
            // PointFromScreen works in physical pixels, which is what the mouse hook reports.
            var local = ItemsView.PointFromScreen(screenPoint);
            if (local.X < 0 || local.Y < 0 || local.X > ItemsView.ActualWidth || local.Y > ItemsView.ActualHeight)
            {
                return false;
            }

            return ItemAt(ItemsView.InputHitTest(local) as DependencyObject) is not null;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }

    protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
    {
        if (!_closing)
        {
            e.Cancel = true;
            return;
        }

        base.OnClosing(e);
    }

    private void ApplyWorkArea()
    {
        var area = SystemParameters.WorkArea;
        Left = area.Left;
        Top = area.Top;
        Width = area.Width;
        Height = area.Height;
    }

    private void Items_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        _dragStart = e.GetPosition(this);
        _dragCandidate = ItemAt(e.OriginalSource as DependencyObject);

        // Where the cursor sits inside the icon, so the ghost hangs off the pointer the way it was grabbed.
        var container = ContainerAt(e.OriginalSource as DependencyObject);
        _grabOffset = container is null ? default : e.GetPosition(container);

        if (e.ClickCount == 2 && _dragCandidate is { } target)
        {
            _dragCandidate = null;
            e.Handled = true;
            Launch(target);
        }
    }

    private void Items_PreviewMouseMove(object sender, MouseEventArgs e)
    {
        if (_dragging || _dragCandidate is null || e.LeftButton != MouseButtonState.Pressed)
        {
            return;
        }

        var position = e.GetPosition(this);
        if (Math.Abs(position.X - _dragStart.X) < SystemParameters.MinimumHorizontalDragDistance
            && Math.Abs(position.Y - _dragStart.Y) < SystemParameters.MinimumVerticalDragDistance)
        {
            return;
        }

        var paths = ItemsView.SelectedItems.OfType<FenceItem>().ToList();
        if (!paths.Contains(_dragCandidate))
        {
            paths = [_dragCandidate];
        }

        var carried = paths.Select(item => item.Path).ToArray();
        if (carried.Length == 0)
        {
            return;
        }

        var data = new DataObject();
        data.SetData(FenceWindow.TransferFormat, string.Join("\n", carried.Prepend(FenceWindow.DesktopSourceId)));

        // Shell places such as the Recycle Bin have no file path, so only real files go out as a
        // file drop that other applications can understand.
        var files = paths.Where(item => !item.IsShellPlace).Select(item => item.Path).ToArray();
        if (files.Length > 0)
        {
            data.SetData(DataFormats.FileDrop, files);
        }

        // Nothing follows the cursor unless the drag carries a picture of what was grabbed.
        var grabbed = ItemsView.ItemContainerGenerator.ContainerFromItem(_dragCandidate) as FrameworkElement;
        var ghost = grabbed is null ? null : DragGhost.Show(grabbed, _grabOffset);

        _dragging = true;
        SetDragCapture(true);
        try
        {
            DragDrop.DoDragDrop(ItemsView, data, DragDropEffects.Move | DragDropEffects.Copy);
        }
        finally
        {
            ghost?.Dispose();
            SetDragCapture(false);
            _dragging = false;
            _dragCandidate = null;
        }

        _layer.RefreshSoon();
    }

    private void Items_PreviewMouseRightButtonUp(object sender, MouseButtonEventArgs e)
    {
        var item = ItemAt(e.OriginalSource as DependencyObject);
        if (item is null)
        {
            return;
        }

        if (!ItemsView.SelectedItems.Contains(item))
        {
            ItemsView.SelectedItem = item;
        }

        var menu = new ContextMenu { PlacementTarget = this, Placement = PlacementMode.MousePoint, StaysOpen = false };
        menu.Items.Add(Command(Strings.T("Open"), MenuArt.Open, () => Launch(item)));

        // Nothing to empty means nothing to offer: the entry only appears when the bin holds something.
        if (item.IsRecycleBin && !RecycleBinWatcher.IsEmpty())
        {
            menu.Items.Add(Command(Strings.T("Empty Recycle Bin"), MenuArt.EmptyBin, () =>
            {
                var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
                if (ShellFileOperations.EmptyRecycleBin(handle))
                {
                    item.RefreshIcon();
                    _manager.CheckRecycleBin();
                }
            }));
        }

        if (!item.IsShellPlace)
        {
            menu.Items.Add(Command(Strings.T("Open file location"), MenuArt.FolderOpen, () => Reveal(item.Path)));
            menu.Items.Add(Command(Strings.T("Copy path"), MenuArt.Copy, () =>
            {
                try
                {
                    Clipboard.SetText(item.Path);
                }
                catch (System.Runtime.InteropServices.COMException)
                {
                }
            }));
        }

        var fences = _manager.Fences.Where(fence => !fence.IsPortal).ToList();
        if (fences.Count > 0)
        {
            var into = MenuArt.Submenu(Strings.T("Put into fence"), MenuArt.MoveToFence);
            foreach (var fence in fences)
            {
                var destination = fence;
                into.Items.Add(Command(destination.Name, MenuArt.Fence, () => MoveInto(destination)));
            }

            menu.Items.Add(into);
        }

        if (!item.IsShellPlace)
        {
            menu.Items.Add(new Separator());
            menu.Items.Add(Command(Strings.T("Delete"), MenuArt.Delete, RecycleSelection));
        }

        menu.Items.Add(new Separator());
        menu.Items.Add(Command(Strings.T("New fence here"), MenuArt.NewFence, () => _manager.CreateFenceAtCursor()));
        menu.Items.Add(Command(Strings.T("MyDesktop settings…"), MenuArt.Settings, App.OpenSettings));

        MenuArt.Show(menu);
        e.Handled = true;
    }

    private void Items_KeyDown(object sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Enter when ItemsView.SelectedItem is FenceItem selected:
                Launch(selected);
                e.Handled = true;
                break;

            case Key.Delete:
                RecycleSelection();
                e.Handled = true;
                break;
        }
    }

    /// <summary>Delete means what it means in Explorer: the file goes to the Recycle Bin.</summary>
    private void RecycleSelection()
    {
        var chosen = ItemsView.SelectedItems.OfType<FenceItem>().Where(item => !item.IsShellPlace).ToArray();
        if (chosen.Length == 0)
        {
            return;
        }

        var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
        if (ShellFileOperations.Recycle(chosen.Select(item => item.Path), handle))
        {
            _manager.CheckRecycleBin();
            foreach (var item in chosen)
            {
                _layer.ForgetSpot(item.Path);
            }
        }

        _layer.Refresh();
    }

    private void Items_DragOver(object sender, DragEventArgs e)
    {
        e.Effects = e.Data.GetDataPresent(FenceWindow.TransferFormat) ? DragDropEffects.Move
            : e.Data.GetDataPresent(DataFormats.FileDrop) ? DragDropEffects.Copy
            : DragDropEffects.None;
        e.Handled = true;
    }

    /// <summary>Dropping a fence item back here simply takes it out of the fence.</summary>
    private void Items_Drop(object sender, DragEventArgs e)
    {
        e.Handled = true;

        if (e.Data.GetData(FenceWindow.TransferFormat) is not string payload)
        {
            // MyDesktop is covering the wallpaper, so a file dropped "on the desktop" lands here.
            if (e.Data.GetData(DataFormats.FileDrop) is string[] dropped)
            {
                CopyToDesktop(dropped);
            }

            return;
        }

        var lines = payload.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length < 2)
        {
            return;
        }

        var drop = e.GetPosition(Root);

        // Dropping onto an icon means "do the thing that icon does" — bin it, open it with, move into.
        if (ItemAt(ItemsView.InputHitTest(e.GetPosition(ItemsView)) as DependencyObject) is { } target
            && ShellDrop.Perform(target, lines.Skip(1), new System.Windows.Interop.WindowInteropHelper(this).Handle))
        {
            _manager.CheckRecycleBin();
            _layer.Refresh();
            return;
        }

        if (lines[0] == FenceWindow.DesktopSourceId)
        {
            // Moving icons around the desktop: keep the shape of the selection.
            var anchor = new Point(drop.X - _grabOffset.X, drop.Y - _grabOffset.Y);
            var primary = _dragOrigins.TryGetValue(lines[1], out var start) ? start : anchor;

            foreach (var path in lines.Skip(1))
            {
                var origin = _dragOrigins.TryGetValue(path, out var spot) ? spot : primary;
                _layer.SetSpot(path, new Point(anchor.X + (origin.X - primary.X), anchor.Y + (origin.Y - primary.Y)));
            }

            return;
        }

        var source = _manager.FenceById(lines[0]);
        if (source is null || source.IsPortal)
        {
            return;
        }

        var taken = 0;
        foreach (var path in lines.Skip(1))
        {
            var item = source.Items.FirstOrDefault(entry => string.Equals(entry.Path, path, StringComparison.OrdinalIgnoreCase));
            if (item is not null)
            {
                source.Items.Remove(item);
                taken++;
            }
        }

        // Land exactly where it was dropped, so a fence can never end up covering it.
        var landing = new Point(drop.X - 39, drop.Y - 47);
        foreach (var path in lines.Skip(1))
        {
            _layer.SetSpot(path, landing);
            landing = new Point(landing.X + 78, landing.Y);
        }

        // The file never moves; it simply stops being drawn inside the fence and starts being drawn
        // on the desktop, so it is visible the whole way through.
        Diagnostics.Write($"desktop drop: {taken} item(s) left fence '{source.Name}' at {drop.X:0},{drop.Y:0}");
        _layer.Refresh();
    }

    /// <summary>Copies rather than moves, so a mis-drop never costs the user the original.</summary>
    private void CopyToDesktop(IEnumerable<string> paths)
    {
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

        foreach (var path in paths)
        {
            try
            {
                if (!File.Exists(path))
                {
                    continue;
                }

                var destination = Path.Combine(desktop, Path.GetFileName(path));
                if (!File.Exists(destination))
                {
                    File.Copy(path, destination);
                }
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
            }
        }

        _layer.RefreshSoon();
    }

    private void MoveInto(FenceData destination)
    {
        foreach (var item in ItemsView.SelectedItems.OfType<FenceItem>().ToArray())
        {
            if (destination.Items.Any(entry => string.Equals(entry.Path, item.Path, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            destination.Items.Add(new FenceItem { Name = item.Name, Path = item.Path });
        }

        _layer.Refresh();
    }

    private void Launch(FenceItem item)
    {
        Diagnostics.Write($"desktop launch '{item.Name}' path={item.Path}");

        try
        {
            if (item.IsShellPlace)
            {
                Process.Start(new ProcessStartInfo("explorer.exe", $"shell:{item.Path}") { UseShellExecute = true });
                return;
            }

            if (!item.Exists)
            {
                MessageBox.Show(this, $"{Strings.T("MyDesktop cannot find")}\n{item.Path}", Strings.T("Item missing"),
                    MessageBoxButton.OK, MessageBoxImage.Warning);
                return;
            }

            Process.Start(new ProcessStartInfo(item.Path) { UseShellExecute = true });
        }
        catch (Exception exception) when (exception is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            Diagnostics.Write($"desktop launch failed: {exception.Message}");
            MessageBox.Show(this, exception.Message, Strings.T("Could not open"), MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private static void Reveal(string path)
    {
        try
        {
            Process.Start("explorer.exe", $"/select,\"{path}\"");
        }
        catch (System.ComponentModel.Win32Exception)
        {
        }
    }

    private static MenuItem Command(string header, string glyph, Action action)
        => MenuArt.Command(header, glyph, action);

    private static FenceItem? ItemAt(DependencyObject? source)
        => ContainerAt(source)?.DataContext as FenceItem;

    private static ListBoxItem? ContainerAt(DependencyObject? source)
    {
        while (source is not null)
        {
            if (source is ListBoxItem container)
            {
                return container;
            }

            source = VisualTreeHelper.GetParent(source);
        }

        return null;
    }
}
