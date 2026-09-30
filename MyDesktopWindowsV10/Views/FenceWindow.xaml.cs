using System.ComponentModel;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shapes;
using Microsoft.Win32;
using Palisades.Interop;
using Path = System.IO.Path;
using Palisades.Models;
using Palisades.Services;

namespace Palisades.Views;

/// <summary>
/// One fence: a translucent container that lives on the wallpaper, holds desktop items, and can be
/// moved, resized, rolled up and pointed at a folder.
/// </summary>
public partial class FenceWindow : Window
{
    /// <summary>Clipboard format for dragging items from one fence to another.</summary>
    public const string TransferFormat = "Palisades.FenceItems";

    /// <summary>Stands in for a fence id when the drag started on the drawn desktop.</summary>
    public const string DesktopSourceId = "::desktop";

    private const double RolledHeight = 32;
    private const double MinimumBodyHeight = 90;

    private static readonly (string Label, string Value)[] BackgroundPalette =
    [
        ("Forest", "#132B24"),
        ("Slate", "#1B232B"),
        ("Ink", "#131313"),
        ("Plum", "#251426"),
        ("Sand", "#2A2318"),
        ("Deep sea", "#0F2A2B")
    ];

    private static readonly (string Label, string Value)[] AccentPalette =
    [
        ("Sage", "#A8CE6A"),
        ("Lime", "#D9F078"),
        ("Coral", "#E78F67"),
        ("Sea glass", "#69A9A0"),
        ("Marigold", "#D9B75E"),
        ("Periwinkle", "#8C9BD0"),
        ("Rose", "#D87983")
    ];

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

    public void CloseFence()
    {
        _closing = true;
        _fence.PropertyChanged -= OnFencePropertyChanged;
        Close();
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
            // Nothing but Palisades itself may close a fence.
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
        Diagnostics.Write($"drag start in fence '{_fence.Name}', {paths.Count} item(s), ghost={ghost is not null}");

        _dragging = true;
        _manager.SetDesktopDragCapture(true);
        try
        {
            DragDrop.DoDragDrop(ItemsView, data, DragDropEffects.Move | DragDropEffects.Copy);
        }
        finally
        {
            ghost?.Dispose();
            _manager.SetDesktopDragCapture(false);
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

    private void Items_PreviewMouseRightButtonUp(object sender, MouseButtonEventArgs e)
    {
        var item = ItemAt(e.OriginalSource as DependencyObject);
        if (item is null)
        {
            ShowFenceMenu();
        }
        else
        {
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
        e.Effects = EffectFor(e.Data);
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

        if (EffectFor(e.Data) == DragDropEffects.None)
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

    private DragDropEffects EffectFor(IDataObject data)
    {
        if (data.GetDataPresent(TransferFormat))
        {
            // Fence to fence moves shuffle references, so a portal cannot be a target.
            return _fence.IsPortal ? DragDropEffects.None : DragDropEffects.Move;
        }

        return data.GetDataPresent(DataFormats.FileDrop) ? DragDropEffects.Copy : DragDropEffects.None;
    }

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
            MessageBox.Show(this, $"{Strings.T("Palisades cannot find")}\n{item.Path}", Strings.T("Item missing"),
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

        menu.Items.Add(background);

        var accent = MenuArt.Submenu(Strings.T("Accent"), MenuArt.Accent);
        foreach (var (label, value) in AccentPalette)
        {
            var choice = value;
            accent.Items.Add(Swatch(Strings.T(label), choice, () => _fence.Accent = choice));
        }

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
        menu.Items.Add(Toggle(Strings.T("Palisades draws the desktop"), settings.DrawDesktop,
            () => settings.DrawDesktop = !settings.DrawDesktop));
        menu.Items.Add(Command(Strings.T("Hide all fences"), MenuArt.Hide, _manager.ToggleQuickHide));
        menu.Items.Add(Command(Strings.T("Palisades settings…"), MenuArt.Settings, App.OpenSettings));
        menu.Items.Add(new Separator());
        menu.Items.Add(Command(Strings.T("Exit Palisades"), MenuArt.Exit, App.Quit));

        Activate();
        menu.IsOpen = true;
    }

    private void ShowItemMenu(FenceItem item)
    {
        var menu = NewMenu();
        menu.Items.Add(Command(Strings.T("Open"), MenuArt.Open, () => Launch(item)));

        // Nothing to empty means nothing to offer: the entry only appears when the bin holds something.
        if (item.IsRecycleBin && !RecycleBinWatcher.IsEmpty())
        {
            menu.Items.Add(Command(Strings.T("Empty Recycle Bin"), MenuArt.EmptyBin, () => EmptyRecycleBin(item)));
        }

        // A shell place is not a file: it has no folder to reveal and no path worth copying.
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

        var others = _manager.Fences.Where(fence => !ReferenceEquals(fence, _fence) && !fence.IsPortal).ToList();
        if (others.Count > 0)
        {
            var move = MenuArt.Submenu(Strings.T("Move to fence"), MenuArt.MoveToFence);
            foreach (var target in others)
            {
                var destination = target;
                move.Items.Add(Command(destination.Name, MenuArt.Fence, () => MoveItems(destination)));
            }

            menu.Items.Add(move);
        }

        menu.Items.Add(new Separator());
        menu.Items.Add(Command(Strings.T("Refresh icon"), MenuArt.Refresh, () =>
        {
            foreach (var selected in ItemsView.SelectedItems.OfType<FenceItem>())
            {
                selected.RefreshIcon();
            }
        }));

        if (!_fence.IsPortal)
        {
            menu.Items.Add(Command(Strings.T("Remove from fence"), MenuArt.Remove, () =>
            {
                foreach (var selected in ItemsView.SelectedItems.OfType<FenceItem>().ToArray())
                {
                    _fence.Items.Remove(selected);
                }
            }));
        }

        // Taking a file out of a fence and deleting it are different things, so Delete sits apart
        // from "Remove from fence" rather than beside it. A shell place such as the Recycle Bin is
        // not a file and cannot be deleted.
        if (!item.IsShellPlace)
        {
            menu.Items.Add(new Separator());
            menu.Items.Add(Command(Strings.T("Delete"), MenuArt.Delete, RecycleSelection));
        }

        Activate();
        menu.IsOpen = true;
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
