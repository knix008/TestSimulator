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
        if (ItemAt(e.OriginalSource as DependencyObject) is not null)
        {
            return;
        }

        // A press that belongs to a fence must not start a rubber band across the desktop under it.
        if (FenceUnderCursor() is not null)
        {
            return;
        }

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
        if (ItemAt(e.OriginalSource as DependencyObject) is not null)
        {
            return;
        }

        if (HandedToFence(e))
        {
            e.Handled = true;
            return;
        }

        NativeMethods.GetCursorPos(out var cursor);
        var picked = ShellContextMenu.ShowForDesktopBackground(this, new Point(cursor.X, cursor.Y),
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

        e.Handled = true;
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

    private bool HandedToFence(MouseButtonEventArgs e)
    {
        if (FenceUnderCursor() is not { } fence)
        {
            return false;
        }

        NativeMethods.GetCursorPos(out var cursor);
        fence.ShowMenuAt(new Point(cursor.X, cursor.Y));
        return true;
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
            var cell = new Rect(item.X, item.Y, 78, 94);
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

    private void Items_PreviewMouseRightButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (HandedToFence(e))
        {
            e.Handled = true;
            return;
        }

        var item = ItemAt(e.OriginalSource as DependencyObject);
        if (item is null)
        {
            return;
        }

        if (!ItemsView.SelectedItems.Contains(item))
        {
            ItemsView.SelectedItem = item;
        }

        ShowItemMenu(item);
        e.Handled = true;
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
