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
/// below every fence and takes the mouse across its whole area, because with Explorer's icon view
/// gone there is nothing else left to answer a rubber-band selection or a right-click. The desktop
/// gestures still reach the mouse hook, which counts this window as desktop surface, and the menus
/// come from the shell itself rather than being written out again here.
/// </summary>
public partial class DesktopLayerWindow : Window
{
    /// <summary>The cell an icon is drawn in; the same size the layer lays its lattice out on.</summary>
    private const double CellWidth = 78;

    private const double CellHeight = 94;

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

    /// <summary>Screen pixels in, true when an icon MyDesktop drew is there.</summary>
    public bool IsOverItem(Point screenPoint) => ItemUnder(screenPoint) is not null;

    /// <summary>Drops the desktop's selection, because a fence has taken it over.</summary>
    public void ClearSelection() => ItemsView.SelectedItems.Clear();

    /// <summary>
    /// The icon at a point in screen pixels, or null.
    ///
    /// The visual hit test answers first, because it knows which icon is drawn on top. Whatever it
    /// misses is answered from the cells themselves, so that every pixel of an icon's cell counts as
    /// that icon — and so the mouse hook and the menu can never disagree about whether a click
    /// belongs to an icon or to the wallpaper. They used to: a click a couple of pixels off centre
    /// was read as bare desktop, which opened the desktop's background menu on top of an icon.
    /// </summary>
    private FenceItem? ItemUnder(Point screenPoint)
    {
        try
        {
            // PointFromScreen works in physical pixels, which is what the mouse hook reports.
            var local = ItemsView.PointFromScreen(screenPoint);
            if (local.X < 0 || local.Y < 0 || local.X > ItemsView.ActualWidth || local.Y > ItemsView.ActualHeight)
            {
                return null;
            }

            return ItemAt(ItemsView.InputHitTest(local) as DependencyObject) ?? CellAt(local);
        }
        catch (InvalidOperationException)
        {
            return null;
        }
    }

    /// <summary>
    /// The item whose cell holds a point, in the icon layer's own coordinates. Where cells overlap
    /// the one added last wins, which is the one drawn on top.
    /// </summary>
    private FenceItem? CellAt(Point local)
    {
        FenceItem? found = null;

        foreach (var item in _layer.Items)
        {
            if (new Rect(item.X, item.Y, CellWidth, CellHeight).Contains(local))
            {
                found = item;
            }
        }

        return found;
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

    // ---------------------------------------------------------------- empty desktop

    private bool _banding;
    private Point _bandOrigin;

    /// <summary>
    /// A left press on bare desktop starts a rubber band, exactly as it does on the shell's own
    /// desktop. Without this there is no way to select several icons at once, because the view that
    /// used to do it was switched off to make room for this one.
    /// </summary>
    private void Root_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        NativeMethods.GetCursorPos(out var cursor);
        if (ItemUnder(new Point(cursor.X, cursor.Y)) is not null)
        {
            return;
        }

        // A press that belongs to a fence must not start a rubber band across the desktop under it.
        if (FenceUnderCursor() is not null)
        {
            return;
        }

        // The band is about to make a selection here, so no fence may keep showing one.
        _manager.ClaimSelection(this);

        if ((Keyboard.Modifiers & (ModifierKeys.Control | ModifierKeys.Shift)) == 0)
        {
            ItemsView.SelectedItems.Clear();
        }

        _banding = true;
        _bandOrigin = e.GetPosition(Root);
        DrawBand(_bandOrigin);
        Band.Visibility = Visibility.Visible;
        Root.CaptureMouse();
    }

    private void Root_MouseMove(object sender, MouseEventArgs e)
    {
        if (!_banding)
        {
            return;
        }

        if (e.LeftButton != MouseButtonState.Pressed)
        {
            EndBand();
            return;
        }

        var corner = e.GetPosition(Root);
        DrawBand(corner);
        SelectWithin(Rect(_bandOrigin, corner));
    }

    private void Root_MouseLeftButtonUp(object sender, MouseButtonEventArgs e) => EndBand();

    /// <summary>
    /// The menu the wallpaper would show: Paste, New, the display and personalisation entries, and
    /// anything else registered on the desktop background.
    /// </summary>
    private void Root_MouseRightButtonUp(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        ShowMenuForPointer();
    }

    /// <summary>
    /// The menu for whatever the pointer is on: the fence in front, the icon under it, or the bare
    /// desktop. Both the icons and the empty area come through here, so an icon always gets the
    /// menu the shell would give it and never the wallpaper's.
    /// </summary>
    private void ShowMenuForPointer()
    {
        NativeMethods.GetCursorPos(out var cursor);
        var pointer = new Point(cursor.X, cursor.Y);
        var under = ItemUnder(pointer);
        Diagnostics.Write($"desktop right-click at {pointer.X:0},{pointer.Y:0} item={under?.Name ?? "<none>"}");

        // A fence is drawn above the icons, so a click inside one belongs to it even when an icon
        // happens to lie underneath.
        if (FenceUnderCursor() is { } fence)
        {
            fence.ShowMenuAt(pointer);
            return;
        }

        if (under is { } item)
        {
            _manager.ClaimSelection(this);
            if (!ItemsView.SelectedItems.Contains(item))
            {
                ItemsView.SelectedItem = item;
            }

            ShowItemMenu(item);
            return;
        }

        var picked = ShellContextMenu.ShowForDesktopBackground(this, pointer,
        [
            new ShellContextMenu.Entry(NewFenceCommand, Strings.T("New fence here")),
            new ShellContextMenu.Entry(SettingsCommand, Strings.T("MyDesktop settings…"))
        ]);

        switch (picked)
        {
            case NewFenceCommand:
                _manager.CreateFenceAtCursor();
                break;
            case SettingsCommand:
                App.OpenSettings();
                break;
            default:
                _layer.RefreshSoon();
                break;
        }
    }

    /// <summary>
    /// The fence the pointer is really over, or null. The drawn desktop lies under every fence and
    /// answers the mouse across the whole screen, so a click meant for a fence can still arrive
    /// here: pressing a fence raises it, that moves it in the z-order, and Windows works out where
    /// the release belongs all over again. Rather than guess, the desktop hands such a click to the
    /// fence that was clicked.
    /// </summary>
    private FenceWindow? FenceUnderCursor()
    {
        NativeMethods.GetCursorPos(out var cursor);
        return _manager.FenceAt(new Point(cursor.X, cursor.Y));
    }

    private void EndBand()
    {
        if (!_banding)
        {
            return;
        }

        _banding = false;
        Band.Visibility = Visibility.Collapsed;
        Root.ReleaseMouseCapture();
    }

    private void DrawBand(Point corner)
    {
        var area = Rect(_bandOrigin, corner);
        Canvas.SetLeft(Band, area.X);
        Canvas.SetTop(Band, area.Y);
        Band.Width = area.Width;
        Band.Height = area.Height;
    }

    /// <summary>Everything the band touches, the way a shell selection rectangle behaves.</summary>
    private void SelectWithin(Rect area)
    {
        foreach (var item in _layer.Items)
        {
            var cell = new Rect(item.X, item.Y, CellWidth, CellHeight);
            var inside = area.IntersectsWith(cell);
            var selected = ItemsView.SelectedItems.Contains(item);

            if (inside && !selected)
            {
                ItemsView.SelectedItems.Add(item);
            }
            else if (!inside && selected && (Keyboard.Modifiers & ModifierKeys.Control) == 0)
            {
                ItemsView.SelectedItems.Remove(item);
            }
        }
    }

    private static Rect Rect(Point first, Point second) => new(
        Math.Min(first.X, second.X),
        Math.Min(first.Y, second.Y),
        Math.Abs(first.X - second.X),
        Math.Abs(first.Y - second.Y));

    /// <summary>
    /// The item a plain press landed on while it was already part of a selection.
    ///
    /// WPF reduces a selection to the clicked item on the press; the shell waits for the release.
    /// The difference is everything when several icons are picked up at once: by the time the drag
    /// began, WPF had already thrown the rest of the selection away, so only the one under the
    /// cursor ever moved. So the press is held back, and the selection collapses on the release
    /// instead — unless a drag started, in which case the whole selection travels.
    /// </summary>
    private FenceItem? _collapseOnRelease;

    private void Items_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        _dragStart = e.GetPosition(this);
        _dragCandidate = ItemAt(e.OriginalSource as DependencyObject);

        // The desktop is about to hold the selection, so no fence may keep showing one.
        _manager.ClaimSelection(this);

        _collapseOnRelease = null;
        if (e.ClickCount == 1
            && _dragCandidate is { } pressed
            && ItemsView.SelectedItems.Count > 1
            && ItemsView.SelectedItems.Contains(pressed)
            && (Keyboard.Modifiers & (ModifierKeys.Control | ModifierKeys.Shift)) == 0)
        {
            _collapseOnRelease = pressed;
            ItemsView.Focus();
            e.Handled = true;
        }

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

        // The grabbed icon leads the list. The drop works out where everything lands from the icon
        // that was under the cursor, because that is the one the grab offset was measured against.
        paths = [_dragCandidate, .. paths.Where(item => item != _dragCandidate)];

        var carried = paths.Select(item => item.Path).ToArray();
        if (carried.Length == 0)
        {
            return;
        }

        // Where each icon started, so a selection dropped somewhere else keeps its shape instead of
        // piling every icon onto the one spot under the cursor.
        _dragOrigins.Clear();
        foreach (var item in paths)
        {
            _dragOrigins[item.Path] = new Point(item.X, item.Y);
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

        // This press turned out to be a drag, so the selection it was holding travels with it.
        _collapseOnRelease = null;

        Diagnostics.Write($"desktop drag start, {carried.Length} item(s)");

        _dragging = true;
        try
        {
            DragDrop.DoDragDrop(ItemsView, data, DragDropEffects.Move | DragDropEffects.Copy);
        }
        finally
        {
            ghost?.Dispose();
            _dragging = false;
            _dragCandidate = null;
        }

        _layer.RefreshSoon();
    }

    /// <summary>A press on a selection that did not become a drag is an ordinary click after all.</summary>
    private void Items_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (_collapseOnRelease is not { } item)
        {
            return;
        }

        _collapseOnRelease = null;
        ItemsView.SelectedItem = item;
    }

    private void Items_PreviewMouseRightButtonUp(object sender, MouseButtonEventArgs e)
    {
        e.Handled = true;
        ShowMenuForPointer();
    }

    /// <summary>
    /// The shell's own menu, with MyDesktop's few extras underneath it.
    ///
    /// While MyDesktop draws the desktop there is no Explorer icon view to right-click, so a menu
    /// written here would be the only one the user ever sees — and it could never carry Cut, Copy,
    /// Send to, Properties or any of the handlers the user has installed, such as an archiver.
    /// Asking the shell for the menu it would have shown brings all of it back, including the
    /// entries MyDesktop used to reimplement badly.
    /// </summary>
    private void ShowItemMenu(FenceItem item)
    {
        var chosen = ItemsView.SelectedItems.OfType<FenceItem>().ToList();
        if (!chosen.Contains(item))
        {
            chosen = [item];
        }

        var extras = new List<ShellContextMenu.Entry>();

        var fences = _manager.Fences.Where(fence => !fence.IsPortal).ToList();
        if (fences.Count > 0)
        {
            var targets = new List<ShellContextMenu.Entry>();
            for (var index = 0; index < fences.Count; index++)
            {
                targets.Add(new ShellContextMenu.Entry(PutIntoFenceCommand + index, fences[index].Name));
            }

            extras.Add(new ShellContextMenu.Entry(0, Strings.T("Put into fence"), targets));
        }

        extras.Add(new ShellContextMenu.Entry(NewFenceCommand, Strings.T("New fence here")));
        extras.Add(new ShellContextMenu.Entry(SettingsCommand, Strings.T("MyDesktop settings…")));

        // The desktop's own menu, whole. An icon still on the wallpaper is one Explorer would have
        // drawn, so a right-click on it gives everything the desktop gives — including the entries
        // other programs have installed — rather than a shorter menu of MyDesktop's own.
        NativeMethods.GetCursorPos(out var cursor);
        var picked = ShellContextMenu.ShowForItems(
            this, chosen.Select(entry => entry.Path).ToArray(), new Point(cursor.X, cursor.Y), extras);

        switch (picked)
        {
            case 0:
                // The shell ran the command itself; whatever it did, the layer may need a new look.
                _manager.CheckRecycleBin();
                _layer.RefreshSoon();
                break;

            case NewFenceCommand:
                _manager.CreateFenceAtCursor();
                break;

            case SettingsCommand:
                App.OpenSettings();
                break;

            default:
                if (picked >= PutIntoFenceCommand && picked - PutIntoFenceCommand < fences.Count)
                {
                    MoveInto(fences[picked - PutIntoFenceCommand]);
                }

                break;
        }
    }

    private const int NewFenceCommand = ShellContextMenu.FirstOwnCommand + 1;
    private const int SettingsCommand = ShellContextMenu.FirstOwnCommand + 2;
    private const int PutIntoFenceCommand = ShellContextMenu.FirstOwnCommand + 100;

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

    /// <summary>The Desktop folder, which is where anything dropped on the wallpaper belongs.</summary>
    private static string DesktopFolder => Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

    private void Items_DragOver(object sender, DragEventArgs e)
    {
        // Our own icons moving about are MyDesktop's business; everything arriving from another
        // program is the shell's, and the shell is also the one that knows what it can accept.
        e.Effects = e.Data.GetDataPresent(FenceWindow.TransferFormat)
            ? DragDropEffects.Move
            : ShellDropTarget.Over(DesktopFolder, e);

        e.Handled = true;
    }

    private void Items_DragLeave(object sender, DragEventArgs e) => ShellDropTarget.Leave();

    /// <summary>Dropping a fence item back here simply takes it out of the fence.</summary>
    private void Items_Drop(object sender, DragEventArgs e)
    {
        e.Handled = true;

        if (e.Data.GetData(FenceWindow.TransferFormat) is not string payload)
        {
            // MyDesktop is covering the wallpaper, so a drop meant for the desktop lands here. The
            // Desktop folder takes it, which is what would have happened without MyDesktop at all —
            // including the formats no application agrees on, such as a picture out of a browser or
            // an attachment out of a mail client.
            ShellDropTarget.Drop(DesktopFolder, e);
            _layer.RefreshSoon();
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
