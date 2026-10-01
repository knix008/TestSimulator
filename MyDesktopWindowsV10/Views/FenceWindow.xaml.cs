using System.ComponentModel;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using Microsoft.Win32;
using MyDesktop.Interop;
using Path = System.IO.Path;
using MyDesktop.Models;
using MyDesktop.Services;

namespace MyDesktop.Views;

/// <summary>
/// One fence: a translucent container that lives on the wallpaper, holds desktop items, and can be
/// moved, resized, rolled up and pointed at a folder.
/// </summary>
public partial class FenceWindow : Window
{
    /// <summary>Clipboard format for dragging items from one fence to another.</summary>
    public const string TransferFormat = "MyDesktop.FenceItems";

    /// <summary>Stands in for a fence id when the drag started on the drawn desktop.</summary>
    public const string DesktopSourceId = "::desktop";

    private const double RolledHeight = 32;
    private const double MinimumBodyHeight = 90;

    private static (string Label, string Value)[] BackgroundPalette => Palette.Backgrounds;

    private static (string Label, string Value)[] AccentPalette => Palette.Accents;

    private readonly FenceData _fence;
    private readonly FenceManager _manager;

    private bool _syncing;
    private bool _closing;
    private bool _moving;
    private bool _dragging;
    private string? _resizeEdge;
    private Point _gestureCursor;
    private Rect _gestureBounds;
    private Point _itemDragStart;
    private FenceItem? _itemDragCandidate;
    private FrameworkElement? _itemDragVisual;

    /// <summary>
    /// The item a plain press landed on while it was already part of a selection. The selection
    /// collapses to it when the button comes back up, and not before, so that a drag started from
    /// such a press carries everything that was selected — the way the desktop behaves.
    /// </summary>
    private FenceItem? _collapseOnRelease;

    private bool _banding;
    private Point _bandOrigin;
    private Point _itemGrabOffset;

    public FenceWindow(FenceData fence, FenceManager manager)
    {
        _fence = fence;
        _manager = manager;

        InitializeComponent();
        DataContext = fence;

        var bounds = ClampToDesktop(new Rect(fence.Left, fence.Top, Math.Max(fence.Width, MinWidth), Math.Max(fence.Height, MinHeight)));
        Left = bounds.X;
        Top = bounds.Y;
        Width = bounds.Width;
        Height = fence.RolledUp ? RolledHeight : Math.Max(bounds.Height, MinimumBodyHeight);

        fence.PropertyChanged += OnFencePropertyChanged;
    }

    public FenceData Fence => _fence;

    /// <summary>Drops this fence's selection, because another window has taken it over.</summary>
    public void ClearSelection() => ItemsView.SelectedItems.Clear();

    public void CloseFence()
    {
        _closing = true;
        _fence.PropertyChanged -= OnFencePropertyChanged;
        Close();
    }

    /// <summary>
    /// Shows the menu for whatever sits at a point in screen pixels: the item there, or the fence
    /// itself. It is how a right-click the drawn desktop was given, but that landed on this fence,
    /// still opens the menu the user was asking for.
    /// </summary>
    public void ShowMenuAt(Point screenPoint)
    {
        FenceItem? item = null;

        try
        {
            // PointFromScreen works in physical pixels, which is what a screen point is here.
            var local = ItemsView.PointFromScreen(screenPoint);
            if (local.X >= 0 && local.Y >= 0 && local.X <= ItemsView.ActualWidth && local.Y <= ItemsView.ActualHeight)
            {
                item = ItemAt(ItemsView.InputHitTest(local) as DependencyObject);
            }
        }
        catch (InvalidOperationException)
        {
            // The window has no source yet; the fence menu is still the right answer.
        }

        Diagnostics.Write($"fence '{_fence.Name}' was handed a right-click at {screenPoint.X:0},{screenPoint.Y:0} item={item?.Name ?? "<none>"}");

        if (item is null)
        {
            ShowFenceMenu();
            return;
        }

        _manager.ClaimSelection(this);
        if (!ItemsView.SelectedItems.Contains(item))
        {
            ItemsView.SelectedItem = item;
        }

        ShowItemMenu(item);
    }

    public void BeginRename()
    {
        if (_manager.Settings.FencesLocked)
        {
            return;
        }

        Activate();
        TitleEditor.Text = _fence.Name;
        TitleEditor.Visibility = Visibility.Visible;
        TitleText.Visibility = Visibility.Collapsed;
        TitleEditor.Focus();
        TitleEditor.SelectAll();
    }

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        DisplayScale.CaptureFrom(this);
        DesktopAnchor.Attach(this);
        ApplyRollState();

        Localizer.Apply(this);
        Strings.Changed += Localize;
        Closed += (_, _) => Strings.Changed -= Localize;
    }

    private void Localize() => Localizer.Apply(this);

    protected override void OnClosing(CancelEventArgs e)
    {
        if (!_closing)
        {
            // Nothing but MyDesktop itself may close a fence.
            e.Cancel = true;
            return;
        }

        base.OnClosing(e);
    }

    // ---------------------------------------------------------------- title bar

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ClickCount == 2)
        {
            ToggleRoll();
            e.Handled = true;
            return;
        }

        if (_manager.Settings.FencesLocked)
        {
            return;
        }

        _moving = true;
        _gestureCursor = CursorPosition();
        _gestureBounds = new Rect(Left, Top, Width, Height);
        TitleBar.CaptureMouse();
    }

    private void TitleBar_MouseMove(object sender, MouseEventArgs e)
    {
        if (!_moving)
        {
            return;
        }

        var cursor = CursorPosition();
        var moved = new Rect(
            _gestureBounds.X + (cursor.X - _gestureCursor.X),
            _gestureBounds.Y + (cursor.Y - _gestureCursor.Y),
            Width,
            Height);

        var snapped = SnapPosition(moved);
        Left = snapped.X;
        Top = snapped.Y;
        _manager.PushDesktopIcons();
    }

    private void TitleBar_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (!_moving)
        {
            return;
        }

        _moving = false;
        TitleBar.ReleaseMouseCapture();
        CommitBounds();
    }

    private void TitleEditor_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter)
        {
            CommitRename(true);
            e.Handled = true;
        }
        else if (e.Key == Key.Escape)
        {
            CommitRename(false);
            e.Handled = true;
        }
    }

    private void TitleEditor_LostFocus(object sender, RoutedEventArgs e) => CommitRename(true);

    private void CommitRename(bool accept)
    {
        if (TitleEditor.Visibility != Visibility.Visible)
        {
            return;
        }

        if (accept && TitleEditor.Text.Trim() is { Length: > 0 } name)
        {
            _fence.Name = name;
        }

        TitleEditor.Visibility = Visibility.Collapsed;
        TitleText.Visibility = Visibility.Visible;
    }

    private void Roll_Click(object sender, RoutedEventArgs e) => ToggleRoll();

    private void Menu_Click(object sender, RoutedEventArgs e) => ShowFenceMenu();

    private void Fence_MouseRightButtonUp(object sender, MouseButtonEventArgs e)
    {
        ShowFenceMenu();
        e.Handled = true;
    }

    private void ToggleRoll()
    {
        if (!_fence.RolledUp)
        {
            _fence.ExpandedHeight = Height;
        }

        _fence.RolledUp = !_fence.RolledUp;
        ApplyRollState();
        CommitBounds();
    }

    private void ApplyRollState()
    {
        RollButton.Content = _fence.RolledUp ? "▼" : "▲";
        Body.Visibility = _fence.RolledUp ? Visibility.Collapsed : Visibility.Visible;

        _syncing = true;
        Height = _fence.RolledUp ? RolledHeight : Math.Max(_fence.ExpandedHeight, MinimumBodyHeight);
        _syncing = false;
    }

    // ---------------------------------------------------------------- resizing

    private void Resize_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_manager.Settings.FencesLocked || sender is not Rectangle handle || handle.Tag is not string edge)
        {
            return;
        }

        if (_fence.RolledUp)
        {
            edge = new string(edge.Where(character => character is 'L' or 'R').ToArray());
            if (edge.Length == 0)
            {
                return;
            }
        }

        _resizeEdge = edge;
        _gestureCursor = CursorPosition();
        _gestureBounds = new Rect(Left, Top, Width, Height);
        handle.CaptureMouse();
        e.Handled = true;
    }

    private void Resize_MouseMove(object sender, MouseEventArgs e)
    {
        if (_resizeEdge is null)
        {
            return;
        }

        var cursor = CursorPosition();
        var dx = cursor.X - _gestureCursor.X;
        var dy = cursor.Y - _gestureCursor.Y;
        var start = _gestureBounds;

        var left = start.X;
        var top = start.Y;
        var width = start.Width;
        var height = start.Height;

        if (_resizeEdge.Contains('L'))
        {
            left = start.X + dx;
            width = start.Width - dx;
        }

        if (_resizeEdge.Contains('R'))
        {
            width = start.Width + dx;
        }

        if (_resizeEdge.Contains('T'))
        {
            top = start.Y + dy;
            height = start.Height - dy;
        }

        if (_resizeEdge.Contains('B'))
        {
            height = start.Height + dy;
        }

        if (width < MinWidth)
        {
            if (_resizeEdge.Contains('L'))
            {
                left = start.Right - MinWidth;
            }

            width = MinWidth;
        }

        var minimumHeight = _fence.RolledUp ? RolledHeight : MinimumBodyHeight;
        if (height < minimumHeight)
        {
            if (_resizeEdge.Contains('T'))
            {
                top = start.Bottom - minimumHeight;
            }

            height = minimumHeight;
        }

        Left = Snap(left);
        Top = Snap(top);
        Width = Snap(width);
        Height = Snap(height);
        _manager.PushDesktopIcons();
    }

    private void Resize_MouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (_resizeEdge is null)
        {
            return;
        }

        _resizeEdge = null;
        (sender as Rectangle)?.ReleaseMouseCapture();
        CommitBounds();
    }

    // ---------------------------------------------------------------- items

    private void Items_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        _itemDragStart = e.GetPosition(this);
        _itemDragCandidate = ItemAt(e.OriginalSource as DependencyObject);

        // This fence is about to hold the selection, so nowhere else may keep showing one.
        _manager.ClaimSelection(this);

        // WPF collapses a selection to the clicked item on the press, where the shell waits for the
        // release. Left alone, that threw the rest of the selection away before the drag could pick
        // it up, so dragging several items moved exactly one. The press is held back and the
        // collapse happens on the release instead — see _collapseOnRelease.
        _collapseOnRelease = null;
        if (e.ClickCount == 1
            && _itemDragCandidate is { } pressed
            && ItemsView.SelectedItems.Count > 1
            && ItemsView.SelectedItems.Contains(pressed)
            && (Keyboard.Modifiers & (ModifierKeys.Control | ModifierKeys.Shift)) == 0)
        {
            _collapseOnRelease = pressed;
            ItemsView.Focus();
            e.Handled = true;
        }

        // A press on the bare part of a fence starts a rubber band, exactly as it does on the
        // desktop. Without it the only way to take several items at once was Ctrl-clicking them one
        // by one, which is not how anybody selects a row of icons.
        if (_itemDragCandidate is null && e.ClickCount == 1)
        {
            BeginBand(e.GetPosition(ItemsView));
        }

        // Where the cursor sits inside the icon, so the ghost hangs off the pointer the way it was grabbed.
        _itemDragVisual = FindAncestor<ListBoxItem>(e.OriginalSource as DependencyObject);
        _itemGrabOffset = _itemDragVisual is null ? default : e.GetPosition(_itemDragVisual);

        // ListBoxItem marks the bubbling mouse down as handled, so ListBox.MouseDoubleClick is not
        // dependable here. Catching it in the preview pass always works, and it also keeps the second
        // click of a double-click from being mistaken for the start of a drag.
        Diagnostics.Write($"click {e.ClickCount} in fence '{_fence.Name}', item={_itemDragCandidate?.Name ?? "(none)"}");

        if (e.ClickCount == 2 && _itemDragCandidate is { } target)
        {
            _itemDragCandidate = null;
            e.Handled = true;
            Launch(target);
        }
    }

    private void Items_PreviewMouseMove(object sender, MouseEventArgs e)
    {
        if (_banding)
        {
            if (e.LeftButton != MouseButtonState.Pressed)
            {
                EndBand();
                return;
            }

            var corner = e.GetPosition(ItemsView);
            DrawBand(corner);
            SelectWithin(Between(_bandOrigin, corner));
            return;
        }

        if (_dragging || _itemDragCandidate is null || e.LeftButton != MouseButtonState.Pressed)
        {
            return;
        }

        var position = e.GetPosition(this);
        if (Math.Abs(position.X - _itemDragStart.X) < SystemParameters.MinimumHorizontalDragDistance
            && Math.Abs(position.Y - _itemDragStart.Y) < SystemParameters.MinimumVerticalDragDistance)
        {
            return;
        }

        var paths = DragPayload(_itemDragCandidate);
        if (paths.Count == 0)
        {
            return;
        }

        var data = new DataObject();
        data.SetData(TransferFormat, string.Join("\n", paths.Prepend(_fence.Id)));

        // Shell places have no file path, so only real files go out as a file drop.
        var files = paths.Where(path => !path.StartsWith("::{", StringComparison.Ordinal)).ToArray();
        if (files.Length > 0)
        {
            data.SetData(DataFormats.FileDrop, files);
        }

        // Nothing follows the cursor unless the drag carries a picture of what was grabbed.
        var carried = _itemDragVisual
            ?? ItemsView.ItemContainerGenerator.ContainerFromItem(_itemDragCandidate) as FrameworkElement;
        var ghost = carried is null ? null : DragGhost.Show(carried, _itemGrabOffset);

        // This press turned out to be a drag, so the selection it was holding travels with it.
        _collapseOnRelease = null;

        Diagnostics.Write($"drag start in fence '{_fence.Name}', {paths.Count} item(s), ghost={ghost is not null}");

        _dragging = true;
        try
        {
            DragDrop.DoDragDrop(ItemsView, data, DragDropEffects.Move | DragDropEffects.Copy);
        }
        finally
        {
            ghost?.Dispose();
            _dragging = false;
            _itemDragCandidate = null;
            _itemDragVisual = null;
        }

        // Whatever the drop target reported, what counts is whether the file is still where the
        // fence left it. If it moved out, the fence entry goes with it.
        if (!_fence.IsPortal)
        {
            foreach (var path in paths)
            {
                if (File.Exists(path) || Directory.Exists(path))
                {
                    continue;
                }

                var stale = _fence.Items.FirstOrDefault(item => PathsMatch(item.Path, path));
                if (stale is not null)
                {
                    _fence.Items.Remove(stale);
                }
            }
        }
    }

    /// <summary>A press on a selection that did not become a drag is an ordinary click after all.</summary>
    private void Items_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        EndBand();

        if (_collapseOnRelease is not { } item)
        {
            return;
        }

        _collapseOnRelease = null;
        ItemsView.SelectedItem = item;
    }

    // ---------------------------------------------------------------- rubber band

    private void BeginBand(Point origin)
    {
        if ((Keyboard.Modifiers & (ModifierKeys.Control | ModifierKeys.Shift)) == 0)
        {
            ItemsView.SelectedItems.Clear();
        }

        _banding = true;
        _bandOrigin = origin;
        DrawBand(origin);
        Band.Visibility = Visibility.Visible;
        ItemsView.CaptureMouse();
    }

    private void EndBand()
    {
        if (!_banding)
        {
            return;
        }

        _banding = false;
        Band.Visibility = Visibility.Collapsed;
        ItemsView.ReleaseMouseCapture();
    }

    private void DrawBand(Point corner)
    {
        var area = Between(_bandOrigin, corner);
        Canvas.SetLeft(Band, area.X);
        Canvas.SetTop(Band, area.Y);
        Band.Width = area.Width;
        Band.Height = area.Height;
    }

    /// <summary>
    /// Everything the band touches, the way a shell selection rectangle behaves. The cells come from
    /// the containers rather than from a lattice, because a fence lays its items out in a wrap panel
    /// whose cell size follows the icon size setting.
    /// </summary>
    private void SelectWithin(Rect area)
    {
        foreach (var item in _fence.Items)
        {
            if (ItemsView.ItemContainerGenerator.ContainerFromItem(item) is not FrameworkElement container
                || !container.IsVisible)
            {
                continue;
            }

            Rect cell;
            try
            {
                var corner = container.TransformToAncestor(ItemsView).Transform(new Point(0, 0));
                cell = new Rect(corner, new Size(container.ActualWidth, container.ActualHeight));
            }
            catch (InvalidOperationException)
            {
                // The container is not in the tree yet; it cannot be under the band either.
                continue;
            }

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

    private static Rect Between(Point first, Point second) => new(
        Math.Min(first.X, second.X),
        Math.Min(first.Y, second.Y),
        Math.Abs(first.X - second.X),
        Math.Abs(first.Y - second.Y));

    private void Items_PreviewMouseRightButtonUp(object sender, MouseButtonEventArgs e)
    {
        var item = ItemAt(e.OriginalSource as DependencyObject);
        if (item is null)
        {
            ShowFenceMenu();
        }
        else
        {
            _manager.ClaimSelection(this);
            if (!ItemsView.SelectedItems.Contains(item))
            {
                ItemsView.SelectedItem = item;
            }

            ShowItemMenu(item);
        }

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

    private void Items_DragOver(object sender, DragEventArgs e)
    {
        e.Effects = EffectFor(e);
        DropHint.Visibility = e.Effects == DragDropEffects.None ? Visibility.Collapsed : Visibility.Visible;
        e.Handled = true;
    }

    private void Items_DragLeave(object sender, DragEventArgs e)
    {
        DropHint.Visibility = Visibility.Collapsed;
    }

    private void Items_Drop(object sender, DragEventArgs e)
    {
        DropHint.Visibility = Visibility.Collapsed;
        e.Handled = true;

        if (EffectFor(e) == DragDropEffects.None)
        {
            return;
        }

        // Dropping onto an icon runs that icon's own behaviour: bin it, open it with, move it into.
        var over = ItemAt((e.OriginalSource as DependencyObject) ?? ItemsView.InputHitTest(e.GetPosition(ItemsView)) as DependencyObject);
        if (over is not null)
        {
            var carried = e.Data.GetData(TransferFormat) is string dragged
                ? dragged.Split('\n', StringSplitOptions.RemoveEmptyEntries).Skip(1)
                : e.Data.GetData(DataFormats.FileDrop) as string[] ?? [];

            if (ShellDrop.Perform(over, carried, new System.Windows.Interop.WindowInteropHelper(this).Handle))
            {
                _manager.CheckRecycleBin();
                if (_fence.IsPortal)
                {
                    _manager.RefreshPortal(_fence);
                }

                return;
            }
        }

        var index = DropIndex(e);

        if (e.Data.GetData(TransferFormat) is string payload)
        {
            AcceptTransfer(payload, index);
            return;
        }

        if (e.Data.GetData(DataFormats.FileDrop) is string[] paths)
        {
            if (_fence.IsPortal)
            {
                CopyIntoPortal(paths);
            }
            else
            {
                AddPaths(paths, index);
            }

            return;
        }

        TakeShellDrop(e, index);
    }

    /// <summary>
    /// A drop in a format only the shell can unpack — a picture dragged out of a browser, an
    /// attachment, a file inside an archive, a link. The folder behind this fence takes it, and
    /// whatever appears there goes into the fence.
    ///
    /// The folder is watched for a moment rather than read once, because the shell is often still
    /// working when it returns: a virtual file is produced on demand and a copy has a progress
    /// window of its own.
    /// </summary>
    private void TakeShellDrop(DragEventArgs e, int index)
    {
        var folder = DropFolder;
        var before = Listing(folder);

        if (ShellDropTarget.Drop(folder, e) == DragDropEffects.None)
        {
            return;
        }

        if (_fence.IsPortal)
        {
            // The portal's own watcher picks the new file up.
            return;
        }

        var rounds = 0;
        var watch = new System.Windows.Threading.DispatcherTimer(System.Windows.Threading.DispatcherPriority.Background)
        {
            Interval = TimeSpan.FromMilliseconds(400)
        };

        watch.Tick += (_, _) =>
        {
            var arrived = Listing(folder).Except(before, StringComparer.OrdinalIgnoreCase).ToArray();
            if (arrived.Length > 0)
            {
                Diagnostics.Write($"shell drop produced {arrived.Length} file(s) for fence '{_fence.Name}'");
                AddPaths(arrived, index);
                index += arrived.Length;
                before = Listing(folder);
            }

            if (++rounds >= 10)
            {
                watch.Stop();
            }
        };

        watch.Start();
    }

    private static HashSet<string> Listing(string folder)
    {
        try
        {
            return new HashSet<string>(Directory.EnumerateFileSystemEntries(folder), StringComparer.OrdinalIgnoreCase);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            return [];
        }
    }

    /// <summary>Delete sends the file to the Recycle Bin, exactly as it would from Explorer.</summary>
    private void RecycleSelection()
    {
        var chosen = ItemsView.SelectedItems.OfType<FenceItem>().Where(item => !item.IsShellPlace).ToArray();
        if (chosen.Length == 0)
        {
            return;
        }

        var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
        if (!ShellFileOperations.Recycle(chosen.Select(item => item.Path), handle))
        {
            return;
        }

        _manager.CheckRecycleBin();

        if (!_fence.IsPortal)
        {
            foreach (var item in chosen)
            {
                _fence.Items.Remove(item);
            }
        }
        else
        {
            _manager.RefreshPortal(_fence);
        }
    }

    private DragDropEffects EffectFor(DragEventArgs e)
    {
        if (e.Data.GetDataPresent(TransferFormat))
        {
            // Fence to fence moves shuffle references, so a portal cannot be a target.
            return _fence.IsPortal ? DragDropEffects.None : DragDropEffects.Move;
        }

        if (e.Data.GetDataPresent(DataFormats.FileDrop))
        {
            return DragDropEffects.Copy;
        }

        // Everything else is a format MyDesktop has no business knowing: a picture out of a
        // browser, an attachment out of a mail client, a file out of an archive, a link. The folder
        // behind this fence can take all of them, so it is asked whether it will.
        return ShellDropTarget.Over(DropFolder, e);
    }

    /// <summary>
    /// Where a file that arrives from another program actually goes. A portal mirrors a folder, so
    /// it goes there. An ordinary fence holds references to things on the desktop, so the file lands
    /// on the desktop and the fence then points at it.
    /// </summary>
    private string DropFolder => _fence.IsPortal && Directory.Exists(_fence.PortalPath)
        ? _fence.PortalPath
        : Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);

    private void AcceptTransfer(string payload, int index)
    {
        var lines = payload.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        if (lines.Length < 2)
        {
            return;
        }

        var source = _manager.FenceById(lines[0]);
        var paths = lines.Skip(1).ToArray();

        if (ReferenceEquals(source, _fence))
        {
            Reorder(paths, index);
            return;
        }

        foreach (var path in paths)
        {
            if (source is { IsPortal: false })
            {
                var original = source.Items.FirstOrDefault(item => PathsMatch(item.Path, path));
                if (original is not null)
                {
                    source.Items.Remove(original);
                }
            }

            if (_fence.Items.Any(item => PathsMatch(item.Path, path)))
            {
                continue;
            }

            _fence.Items.Insert(Math.Clamp(index, 0, _fence.Items.Count), new FenceItem
            {
                Name = PortalSync.DisplayName(path),
                Path = path
            });
            index++;
        }
    }

    private void Reorder(IEnumerable<string> paths, int index)
    {
        _fence.Sort = FenceSort.Manual;

        foreach (var path in paths)
        {
            var item = _fence.Items.FirstOrDefault(candidate => PathsMatch(candidate.Path, path));
            if (item is null)
            {
                continue;
            }

            var from = _fence.Items.IndexOf(item);
            var to = Math.Clamp(index > from ? index - 1 : index, 0, _fence.Items.Count - 1);
            if (from != to)
            {
                _fence.Items.Move(from, to);
            }

            index = to + 1;
        }
    }

    private void AddPaths(IEnumerable<string> paths, int index)
    {
        foreach (var path in paths)
        {
            // Shell places such as the Recycle Bin belong in a fence too, and they have no file path.
            var isShellPlace = path.StartsWith("::{", StringComparison.Ordinal);
            if (!isShellPlace && !File.Exists(path) && !Directory.Exists(path))
            {
                continue;
            }

            if (_fence.Items.Any(item => PathsMatch(item.Path, path)))
            {
                continue;
            }

            _fence.Items.Insert(Math.Clamp(index, 0, _fence.Items.Count), new FenceItem
            {
                Name = PortalSync.DisplayName(path),
                Path = path
            });
            index++;
        }
    }

    /// <summary>A portal shows a folder, so dropping onto it puts the files in that folder.</summary>
    private void CopyIntoPortal(IEnumerable<string> paths)
    {
        var folder = _fence.PortalPath;
        if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder))
        {
            return;
        }

        foreach (var path in paths)
        {
            try
            {
                if (Directory.Exists(path))
                {
                    continue;
                }

                var destination = Path.Combine(folder, Path.GetFileName(path));
                if (PathsMatch(destination, path) || File.Exists(destination))
                {
                    continue;
                }

                var sameVolume = string.Equals(
                    Path.GetPathRoot(Path.GetFullPath(path)),
                    Path.GetPathRoot(Path.GetFullPath(destination)),
                    StringComparison.OrdinalIgnoreCase);

                if (sameVolume)
                {
                    File.Move(path, destination);
                }
                else
                {
                    File.Copy(path, destination);
                }
            }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
            }
        }

        _manager.RefreshPortal(_fence);
    }

    private List<string> DragPayload(FenceItem candidate)
    {
        var selected = ItemsView.SelectedItems.OfType<FenceItem>().ToList();
        if (!selected.Contains(candidate))
        {
            selected = [candidate];
        }

        return selected.Select(item => item.Path).ToList();
    }

    private int DropIndex(DragEventArgs e)
    {
        var position = e.GetPosition(ItemsView);
        if (ItemsView.InputHitTest(position) is DependencyObject hit
            && FindAncestor<ListBoxItem>(hit) is { } container)
        {
            var index = ItemsView.ItemContainerGenerator.IndexFromContainer(container);
            if (index >= 0)
            {
                var middle = container.TranslatePoint(new Point(container.ActualWidth / 2, 0), ItemsView).X;
                return position.X > middle ? index + 1 : index;
            }
        }

        return _fence.Items.Count;
    }

    private FenceItem? ItemAt(DependencyObject? source)
        => FindAncestor<ListBoxItem>(source)?.DataContext as FenceItem;

    private void Launch(FenceItem item)
    {
        Diagnostics.Write($"launch '{item.Name}' path={item.Path} exists={item.Exists}");

        if (item.IsShellPlace)
        {
            try
            {
                Process.Start(new ProcessStartInfo("explorer.exe", $"shell:{item.Path}") { UseShellExecute = true });
            }
            catch (Exception exception) when (exception is System.ComponentModel.Win32Exception or InvalidOperationException)
            {
                Diagnostics.Write($"launch failed: {exception.Message}");
            }

            return;
        }

        if (!item.Exists)
        {
            MessageBox.Show(this, $"{Strings.T("MyDesktop cannot find")}\n{item.Path}", Strings.T("Item missing"),
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo(item.Path) { UseShellExecute = true });
        }
        catch (Exception exception) when (exception is System.ComponentModel.Win32Exception or InvalidOperationException)
        {
            Diagnostics.Write($"launch failed: {exception.Message}");
            MessageBox.Show(this, exception.Message, Strings.T("Could not open"), MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    // ---------------------------------------------------------------- menus

    private void ShowFenceMenu()
    {
        var settings = _manager.Settings;
        var menu = NewMenu();

        menu.Items.Add(Command(Strings.T("Rename fence"), MenuArt.Rename, BeginRename, !settings.FencesLocked));
        menu.Items.Add(_fence.RolledUp
            ? Command(Strings.T("Roll down"), MenuArt.RollDown, ToggleRoll)
            : Command(Strings.T("Roll up"), MenuArt.RollUp, ToggleRoll));
        menu.Items.Add(new Separator());

        var sort = MenuArt.Submenu(Strings.T("Sort items by"), MenuArt.Sort);
        foreach (var (label, value) in new[]
                 {
                     ("Manual order", FenceSort.Manual),
                     ("Name", FenceSort.Name),
                     ("Type", FenceSort.Kind),
                     ("Date modified", FenceSort.Modified)
                 })
        {
            var choice = value;
            sort.Items.Add(Toggle(Strings.T(label), _fence.Sort == choice, () =>
            {
                _fence.Sort = choice;
                if (!_fence.IsPortal)
                {
                    FenceSorting.Apply(_fence.Items, choice);
                }
            }));
        }

        menu.Items.Add(sort);

        var size = MenuArt.Submenu(Strings.T("Icon size"), MenuArt.IconSize);
        foreach (var (label, value) in new[] { ("Small", 32d), ("Medium", 48d), ("Large", 64d), ("Huge", 80d) })
        {
            var choice = value;
            size.Items.Add(Toggle(Strings.T(label), Math.Abs(_fence.IconSize - choice) < 0.5, () => _fence.IconSize = choice));
        }

        menu.Items.Add(size);
        menu.Items.Add(Toggle(Strings.T("Show labels"), _fence.ShowLabels, () => _fence.ShowLabels = !_fence.ShowLabels));

        var background = MenuArt.Submenu(Strings.T("Fence colour"), MenuArt.Colour);
        foreach (var (label, value) in BackgroundPalette)
        {
            var choice = value;
            background.Items.Add(Swatch(Strings.T(label), choice, () => _fence.Background = WithAlpha(choice, AlphaOf(_fence.Background))));
        }

        background.Items.Add(new Separator());
        background.Items.Add(Swatch(Strings.T("Custom colour…"), WithoutAlpha(_fence.Background), PickBackground));
        menu.Items.Add(background);

        var accent = MenuArt.Submenu(Strings.T("Accent"), MenuArt.Accent);
        foreach (var (label, value) in AccentPalette)
        {
            var choice = value;
            accent.Items.Add(Swatch(Strings.T(label), choice, () => _fence.Accent = choice));
        }

        accent.Items.Add(new Separator());
        accent.Items.Add(Swatch(Strings.T("Custom colour…"), _fence.Accent, PickAccent));
        menu.Items.Add(accent);

        var transparency = MenuArt.Submenu(Strings.T("Transparency"), MenuArt.Transparency);
        foreach (var (label, value) in new[] { ("Solid", 0.95), ("Light", 0.80), ("Medium", 0.62), ("Heavy", 0.45), ("Ghost", 0.28) })
        {
            var choice = value;
            var alpha = (byte)Math.Round(choice * 255);
            transparency.Items.Add(Toggle(Strings.T(label), AlphaOf(_fence.Background) == alpha,
                () => _fence.Background = WithAlpha(_fence.Background, alpha)));
        }

        menu.Items.Add(transparency);
        menu.Items.Add(new Separator());

        if (_fence.IsPortal)
        {
            menu.Items.Add(Command(Strings.T("Open folder in Explorer"), MenuArt.OpenExternal, () => OpenFolder(_fence.PortalPath)));
            menu.Items.Add(Command(Strings.T("Point at another folder…"), MenuArt.PointAtFolder, PickPortalFolder));
            menu.Items.Add(MenuArt.Check(Strings.T("Show hidden items"), _fence.PortalShowHidden,
                () => _fence.PortalShowHidden = !_fence.PortalShowHidden));
            menu.Items.Add(Command(Strings.T("Stop mirroring folder"), MenuArt.StopMirroring, () => _fence.Kind = FenceKind.Manual));
        }
        else
        {
            menu.Items.Add(Command(Strings.T("Turn into a folder portal…"), MenuArt.MakePortal, PickPortalFolder));
        }

        menu.Items.Add(new Separator());
        menu.Items.Add(Command(Strings.T("New fence here"), MenuArt.NewFence, () => _manager.CreateFenceAtCursor()));
        menu.Items.Add(Command(Strings.T("Duplicate this fence"), MenuArt.Copy, DuplicateFence));
        menu.Items.Add(Command(Strings.T("Delete this fence…"), MenuArt.Delete, DeleteFence));
        menu.Items.Add(new Separator());
        menu.Items.Add(MenuArt.Check(Strings.T("Lock all fences"), settings.FencesLocked,
            MenuArt.Locked, MenuArt.Unlocked, () => settings.FencesLocked = !settings.FencesLocked));
        menu.Items.Add(Toggle(Strings.T("MyDesktop draws the desktop"), settings.DrawDesktop,
            () => settings.DrawDesktop = !settings.DrawDesktop));
        menu.Items.Add(Command(Strings.T("Hide all fences"), MenuArt.Hide, _manager.ToggleQuickHide));
        menu.Items.Add(Command(Strings.T("MyDesktop settings…"), MenuArt.Settings, App.OpenSettings));
        menu.Items.Add(new Separator());
        menu.Items.Add(Command(Strings.T("Exit MyDesktop"), MenuArt.Exit, App.Quit));

        MenuArt.Show(menu);
    }

    private const int MoveToFenceCommand = ShellContextMenu.FirstOwnCommand + 100;
    private const int RemoveFromFenceCommand = ShellContextMenu.FirstOwnCommand + 1;
    private const int RefreshIconCommand = ShellContextMenu.FirstOwnCommand + 2;

    /// <summary>
    /// The shell's own menu for the item, with the entries that are about the fence underneath it.
    ///
    /// A fence holds real files, so everything the user expects of a file belongs here: Open with,
    /// Cut, Copy, Send to, Properties, and whatever handlers are installed, such as an archiver.
    /// None of that can be written out by hand, because it is code that belongs to somebody else.
    /// What MyDesktop adds is only what the shell cannot know about: which fence an item is in.
    /// </summary>
    private void ShowItemMenu(FenceItem item)
    {
        var chosen = ItemsView.SelectedItems.OfType<FenceItem>().ToList();
        if (!chosen.Contains(item))
        {
            chosen = [item];
        }

        var extras = new List<ShellContextMenu.Entry>();

        var others = _manager.Fences.Where(fence => !ReferenceEquals(fence, _fence) && !fence.IsPortal).ToList();
        if (others.Count > 0)
        {
            var targets = new List<ShellContextMenu.Entry>();
            for (var index = 0; index < others.Count; index++)
            {
                targets.Add(new ShellContextMenu.Entry(MoveToFenceCommand + index, others[index].Name));
            }

            extras.Add(new ShellContextMenu.Entry(0, Strings.T("Move to fence"), targets));
        }

        // Taking a file out of a fence is not deleting it, and the shell's own Delete is right
        // above, so the wording has to keep the two apart.
        if (!_fence.IsPortal)
        {
            extras.Add(new ShellContextMenu.Entry(RemoveFromFenceCommand, Strings.T("Remove from fence")));
        }

        extras.Add(new ShellContextMenu.Entry(RefreshIconCommand, Strings.T("Refresh icon")));

        // The same menu the desktop gives an icon, whole: an item in a fence is a desktop item that
        // happens to be kept here, so nothing the desktop would offer for it goes missing.
        NativeMethods.GetCursorPos(out var cursor);
        var picked = ShellContextMenu.ShowForItems(
            this, chosen.Select(entry => entry.Path).ToArray(), new Point(cursor.X, cursor.Y), extras);

        switch (picked)
        {
            case 0:
                // The shell ran the command. It may have renamed, moved or binned the file.
                _manager.CheckRecycleBin();
                if (_fence.IsPortal)
                {
                    _manager.RefreshPortal(_fence);
                }

                break;

            case RemoveFromFenceCommand:
                foreach (var selected in chosen)
                {
                    _fence.Items.Remove(selected);
                }

                break;

            case RefreshIconCommand:
                foreach (var selected in chosen)
                {
                    selected.RefreshIcon();
                }

                break;

            default:
                if (picked >= MoveToFenceCommand && picked - MoveToFenceCommand < others.Count)
                {
                    MoveItems(others[picked - MoveToFenceCommand]);
                }

                break;
        }
    }

    /// <summary>The shell asks for confirmation itself, and the icon changes once the bin is empty.</summary>
    private void EmptyRecycleBin(FenceItem bin)
    {
        var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
        if (ShellFileOperations.EmptyRecycleBin(handle))
        {
            bin.RefreshIcon();
            _manager.CheckRecycleBin();
        }
    }

    private ContextMenu NewMenu() => new()
    {
        PlacementTarget = this,
        Placement = PlacementMode.MousePoint,
        StaysOpen = false
    };

    private static MenuItem Command(string header, string glyph, Action action, bool enabled = true)
        => MenuArt.Command(header, glyph, action, enabled);

    private static MenuItem Toggle(string header, bool isChecked, Action action)
        => MenuArt.Check(header, isChecked, action);

    private static MenuItem Swatch(string header, string colour, Action action)
        => MenuArt.Swatch(header, colour, action);

    private void MoveItems(FenceData destination)
    {
        foreach (var item in ItemsView.SelectedItems.OfType<FenceItem>().ToArray())
        {
            if (destination.Items.Any(existing => PathsMatch(existing.Path, item.Path)))
            {
                continue;
            }

            destination.Items.Add(new FenceItem { Name = item.Name, Path = item.Path });
            if (!_fence.IsPortal)
            {
                _fence.Items.Remove(item);
            }
        }
    }

    private void DuplicateFence()
    {
        var copy = _fence.Clone();
        copy.Left += 28;
        copy.Top += 28;
        copy.Name = string.Format(Strings.T("{0} copy"), _fence.Name);
        _manager.Fences.Add(copy);
    }

    private void DeleteFence()
    {
        var question = string.Format(
            Strings.T(_fence.IsPortal
                ? "Remove the portal '{0}'? The folder itself is left alone."
                : "Delete the fence '{0}'? Its items go back to the desktop; no file is moved or deleted."),
            _fence.Name);

        if (MessageBox.Show(this, question, Strings.T("Delete fence"), MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
        {
            return;
        }

        _manager.Remove(_fence);
    }

    private void PickPortalFolder()
    {
        var dialog = new OpenFolderDialog
        {
            Title = Strings.T("Choose the folder this fence should mirror"),
            InitialDirectory = Directory.Exists(_fence.PortalPath) ? _fence.PortalPath : null
        };

        if (dialog.ShowDialog(this) != true)
        {
            return;
        }

        _fence.PortalPath = dialog.FolderName;
        _fence.Kind = FenceKind.Portal;
        if (_fence.Sort == FenceSort.Manual)
        {
            _fence.Sort = FenceSort.Name;
        }

        _manager.RefreshPortal(_fence);
    }

    private static void OpenFolder(string? path)
    {
        if (!string.IsNullOrWhiteSpace(path) && Directory.Exists(path))
        {
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
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

    // ---------------------------------------------------------------- geometry

    private void OnFencePropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (_syncing)
        {
            return;
        }

        switch (e.PropertyName)
        {
            case nameof(FenceData.Left):
                Left = _fence.Left;
                break;
            case nameof(FenceData.Top):
                Top = _fence.Top;
                break;
            case nameof(FenceData.Width):
                Width = _fence.Width;
                break;
            case nameof(FenceData.Height):
                if (!_fence.RolledUp)
                {
                    Height = Math.Max(_fence.Height, MinimumBodyHeight);
                }

                break;
            case nameof(FenceData.RolledUp):
                ApplyRollState();
                break;
        }
    }

    private void CommitBounds()
    {
        _syncing = true;
        _fence.Left = Math.Round(Left);
        _fence.Top = Math.Round(Top);
        _fence.Width = Math.Round(Width);
        _fence.Height = Math.Round(Height);
        if (!_fence.RolledUp)
        {
            _fence.ExpandedHeight = Math.Round(Height);
        }

        _syncing = false;
        _manager.Save();
        _manager.PushDesktopIcons();
    }

    private double Snap(double value)
    {
        var settings = _manager.Settings;
        if (!settings.SnapToGrid)
        {
            return Math.Round(value);
        }

        return Math.Round(value / settings.GridSize) * settings.GridSize;
    }

    /// <summary>Grid snapping plus the magnetic edges Fences gives you while dragging.</summary>
    private Rect SnapPosition(Rect bounds)
    {
        var left = Snap(bounds.X);
        var top = Snap(bounds.Y);

        if (_manager.Settings.SnapToEdges)
        {
            const double threshold = 12;
            var verticals = new List<double>();
            var horizontals = new List<double>();

            var work = SystemParameters.WorkArea;
            verticals.Add(work.Left);
            verticals.Add(work.Right - bounds.Width);
            horizontals.Add(work.Top);
            horizontals.Add(work.Bottom - bounds.Height);

            foreach (var other in _manager.Fences)
            {
                if (ReferenceEquals(other, _fence))
                {
                    continue;
                }

                verticals.Add(other.Left);
                verticals.Add(other.Left + other.Width - bounds.Width);
                verticals.Add(other.Left + other.Width);
                verticals.Add(other.Left - bounds.Width);
                horizontals.Add(other.Top);
                horizontals.Add(other.Top + other.Height - bounds.Height);
                horizontals.Add(other.Top + other.Height);
                horizontals.Add(other.Top - bounds.Height);
            }

            foreach (var candidate in verticals)
            {
                if (Math.Abs(candidate - left) <= threshold)
                {
                    left = candidate;
                    break;
                }
            }

            foreach (var candidate in horizontals)
            {
                if (Math.Abs(candidate - top) <= threshold)
                {
                    top = candidate;
                    break;
                }
            }
        }

        return new Rect(left, top, bounds.Width, bounds.Height);
    }

    private static Rect ClampToDesktop(Rect bounds)
    {
        var left = SystemParameters.VirtualScreenLeft;
        var top = SystemParameters.VirtualScreenTop;
        var right = left + SystemParameters.VirtualScreenWidth;
        var bottom = top + SystemParameters.VirtualScreenHeight;

        var x = Math.Clamp(bounds.X, left, Math.Max(left, right - 80));
        var y = Math.Clamp(bounds.Y, top, Math.Max(top, bottom - 40));
        return new Rect(x, y, bounds.Width, bounds.Height);
    }

    private static Point CursorPosition()
    {
        NativeMethods.GetCursorPos(out var point);
        return DisplayScale.FromDevice(new Point(point.X, point.Y));
    }

    /// <summary>The colour without its transparency, which is what a colour picker deals in.</summary>
    private static string WithoutAlpha(string colour)
    {
        try
        {
            if (ColorConverter.ConvertFromString(colour) is Color parsed)
            {
                return $"#{parsed.R:X2}{parsed.G:X2}{parsed.B:X2}";
            }
        }
        catch (FormatException)
        {
        }

        return colour;
    }

    /// <summary>
    /// Any colour at all, through the picker Windows already has. The fence's transparency is kept:
    /// it is a separate setting and the dialog knows nothing about it.
    /// </summary>
    private void PickBackground()
    {
        if (ColorPicker.Pick(this, WithoutAlpha(_fence.Background)) is { } picked)
        {
            _fence.Background = WithAlpha(picked, AlphaOf(_fence.Background));
        }
    }

    private void PickAccent()
    {
        if (ColorPicker.Pick(this, _fence.Accent) is { } picked)
        {
            _fence.Accent = picked;
        }
    }

    private static byte AlphaOf(string colour)
    {
        try
        {
            return ColorConverter.ConvertFromString(colour) is Color parsed ? parsed.A : (byte)196;
        }
        catch (FormatException)
        {
            return 196;
        }
    }

    private static string WithAlpha(string colour, byte alpha)
    {
        try
        {
            if (ColorConverter.ConvertFromString(colour) is Color parsed)
            {
                return $"#{alpha:X2}{parsed.R:X2}{parsed.G:X2}{parsed.B:X2}";
            }
        }
        catch (FormatException)
        {
        }

        return colour;
    }

    private static bool PathsMatch(string left, string right)
        => string.Equals(left, right, StringComparison.OrdinalIgnoreCase);

    private static T? FindAncestor<T>(DependencyObject? current) where T : DependencyObject
    {
        while (current is not null)
        {
            if (current is T match)
            {
                return match;
            }

            current = current is System.Windows.Media.Visual or System.Windows.Media.Media3D.Visual3D
                ? VisualTreeHelper.GetParent(current)
                : LogicalTreeHelper.GetParent(current);
        }

        return null;
    }
}
