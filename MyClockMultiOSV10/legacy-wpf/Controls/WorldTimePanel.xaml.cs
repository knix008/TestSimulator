using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using MyClockWinV10.Helpers;
using MyClockWinV10.Models;

namespace MyClockWinV10.Controls;

public partial class WorldTimePanel : UserControl
{
    public ObservableCollection<WorldTimeEntry> Entries { get; } = new();

    public event Action? EntriesChanged;

    private WorldTimeEntry? _dragEntry;
    private Point _dragStart;
    private WorldTimeEntry? _draggingEntry;
    private DragAdorner? _dragAdorner;
    private bool _orderChangedDuringDrag;

    public WorldTimePanel()
    {
        InitializeComponent();
        WorldTimeList.ItemsSource = Entries;
        LoadEntries(null);
    }

    public void LoadEntries(IEnumerable<WorldTimeCityDto>? saved)
    {
        Entries.Clear();
        var source = saved?.Any() == true ? saved : WorldTimeDefaults.Cities;
        foreach (var dto in source)
        {
            Entries.Add(new WorldTimeEntry
            {
                City       = dto.City,
                Region     = dto.Region,
                TimeZoneId = dto.TimeZoneId
            });
        }
        UpdateTimes(_use24h);
    }

    private bool _use24h;

    public List<WorldTimeCityDto> ToDtos() =>
        Entries.Select(e => new WorldTimeCityDto
        {
            City       = e.City,
            Region     = e.Region,
            TimeZoneId = e.TimeZoneId
        }).ToList();

    public void UpdateTimes(bool use24h)
    {
        _use24h = use24h;
        var utcNow = DateTime.UtcNow;
        foreach (var entry in Entries)
        {
            try
            {
                var tz    = TimeZoneInfo.FindSystemTimeZoneById(entry.TimeZoneId);
                var local = TimeZoneInfo.ConvertTimeFromUtc(utcNow, tz);
                entry.LocalDateTime = local;
                entry.DisplayTime   = use24h ? local.ToString("HH:mm") : local.ToString("hh:mm tt");
            }
            catch
            {
                entry.DisplayTime = "--:--";
            }
        }
    }

    private void NotifyChanged() => EntriesChanged?.Invoke();

    private void AddCity_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new AddWorldTimeDialog { Owner = Window.GetWindow(this) };
        if (dlg.ShowDialog() == true && dlg.Result is not null)
        {
            Entries.Add(dlg.Result);
            NotifyChanged();
        }
    }

    private void ResetCities_Click(object sender, RoutedEventArgs e)
    {
        var owner = Window.GetWindow(this);
        var dlg = new ConfirmDialog(
            "기본 도시로 되돌리기",
            "세계 시간 도시 목록을 기본 도시로 되돌릴까요?",
            owner);
        if (dlg.ShowDialog() != true) return;

        LoadEntries(null);
        NotifyChanged();
    }

    private void DeleteCity_Click(object sender, RoutedEventArgs e)
    {
        var entry = ResolveEntry(sender);
        if (entry == null) return;

        Entries.Remove(entry);
        NotifyChanged();
    }

    // ── Drag & drop reorder ───────────────────────────────────────────────

    private void Item_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (IsFromButton(e.OriginalSource as DependencyObject))
            return;

        _dragEntry = ResolveEntryFrom(e.OriginalSource as DependencyObject)
                     ?? (sender as ListBoxItem)?.DataContext as WorldTimeEntry;
        _dragStart = e.GetPosition(null);
    }

    private void Item_PreviewMouseMove(object sender, MouseEventArgs e)
    {
        if (e.LeftButton != MouseButtonState.Pressed || _dragEntry == null)
            return;

        var pos = e.GetPosition(null);
        if (Math.Abs(pos.X - _dragStart.X) < SystemParameters.MinimumHorizontalDragDistance
            && Math.Abs(pos.Y - _dragStart.Y) < SystemParameters.MinimumVerticalDragDistance)
            return;

        var entry    = _dragEntry;
        var listItem = FindListBoxItem(e.OriginalSource as DependencyObject)
                       ?? sender as ListBoxItem
                       ?? WorldTimeList.ItemContainerGenerator.ContainerFromItem(entry) as ListBoxItem;
        _dragEntry = null;

        if (listItem != null)
            BeginDrag(listItem, entry);
        else
            DragDrop.DoDragDrop(WorldTimeList, entry, DragDropEffects.Move);
    }

    private void BeginDrag(ListBoxItem sourceItem, WorldTimeEntry entry)
    {
        _draggingEntry          = entry;
        _orderChangedDuringDrag = false;

        var layer = AdornerLayer.GetAdornerLayer(WorldTimeList)
                    ?? AdornerLayer.GetAdornerLayer(this);
        if (layer != null)
        {
            var ghost  = CreateDragGhost(sourceItem);
            var offset = Mouse.GetPosition(sourceItem);
            _dragAdorner = new DragAdorner(WorldTimeList, ghost, offset);
            layer.Add(_dragAdorner);
            _dragAdorner.UpdatePosition(Mouse.GetPosition(WorldTimeList));
        }

        UpdateDragPlaceholder(entry);

        WorldTimeList.QueryContinueDrag += OnQueryContinueDrag;
        WorldTimeList.GiveFeedback      += OnGiveFeedback;

        try
        {
            DragDrop.DoDragDrop(WorldTimeList, entry, DragDropEffects.Move);
        }
        finally
        {
            EndDrag();
        }
    }

    private void OnGiveFeedback(object sender, GiveFeedbackEventArgs e)
    {
        e.UseDefaultCursors = false;
        Mouse.SetCursor(Cursors.SizeAll);
        e.Handled = true;
    }

    private void OnQueryContinueDrag(object? sender, QueryContinueDragEventArgs e)
    {
        if (e.Action == DragAction.Continue)
            _dragAdorner?.UpdatePosition(Mouse.GetPosition(WorldTimeList));
    }

    private void EndDrag()
    {
        WorldTimeList.QueryContinueDrag -= OnQueryContinueDrag;
        WorldTimeList.GiveFeedback      -= OnGiveFeedback;

        var layer = AdornerLayer.GetAdornerLayer(WorldTimeList)
                    ?? AdornerLayer.GetAdornerLayer(this);
        if (_dragAdorner != null)
        {
            layer?.Remove(_dragAdorner);
            _dragAdorner = null;
        }
        RestoreAllItemVisibility();
        _draggingEntry = null;

        if (_orderChangedDuringDrag)
            NotifyChanged();
    }

    private void WorldTimeList_DragOver(object sender, DragEventArgs e)
    {
        if (e.Data.GetData(typeof(WorldTimeEntry)) is not WorldTimeEntry source)
        {
            e.Effects = DragDropEffects.None;
            return;
        }

        e.Effects = DragDropEffects.Move;
        e.Handled = true;

        var pos  = e.GetPosition(WorldTimeList);
        var item = FindListBoxItem(WorldTimeList.InputHitTest(pos) as DependencyObject);
        if (item?.DataContext is WorldTimeEntry target && !ReferenceEquals(source, target))
        {
            var rel          = e.GetPosition(item);
            bool insertAfter = rel.Y > item.ActualHeight / 2;
            TryReorderDuringDrag(source, target, insertAfter);
        }

        _dragAdorner?.UpdatePosition(pos);
    }

    private void Item_DragOver(object sender, DragEventArgs e)
    {
        if (e.Data.GetData(typeof(WorldTimeEntry)) is not WorldTimeEntry source)
        {
            e.Effects = DragDropEffects.None;
            return;
        }

        if (sender is not ListBoxItem targetItem
            || targetItem.DataContext is not WorldTimeEntry target
            || ReferenceEquals(source, target))
        {
            e.Effects = DragDropEffects.None;
            return;
        }

        e.Effects = DragDropEffects.Move;
        e.Handled = true;

        var pos          = e.GetPosition(targetItem);
        bool insertAfter = pos.Y > targetItem.ActualHeight / 2;
        TryReorderDuringDrag(source, target, insertAfter);
        _dragAdorner?.UpdatePosition(e.GetPosition(WorldTimeList));
    }

    private void TryReorderDuringDrag(WorldTimeEntry source, WorldTimeEntry target, bool insertAfter)
    {
        int targetIndex = Entries.IndexOf(target);
        if (targetIndex < 0) return;

        int insertIndex = insertAfter ? targetIndex + 1 : targetIndex;
        int from        = Entries.IndexOf(source);
        if (from < 0) return;

        if (insertIndex == from || insertIndex == from + 1)
            return;

        MoveEntry(source, insertIndex);
        _orderChangedDuringDrag = true;
        Dispatcher.BeginInvoke(System.Windows.Threading.DispatcherPriority.Loaded,
            new Action(() => UpdateDragPlaceholder(source)));
    }

    /// <summary>
    /// Keeps a layout slot for the dragged row (Hidden, not Collapsed) so other items reflow without overlapping.
    /// </summary>
    private void UpdateDragPlaceholder(WorldTimeEntry entry)
    {
        if (_draggingEntry == null) return;

        WorldTimeList.UpdateLayout();

        for (int i = 0; i < Entries.Count; i++)
        {
            if (WorldTimeList.ItemContainerGenerator.ContainerFromIndex(i) is not ListBoxItem item)
                continue;

            bool isDragged = ReferenceEquals(item.DataContext, entry);
            item.Visibility        = isDragged ? Visibility.Hidden : Visibility.Visible;
            item.IsHitTestVisible  = !isDragged;
            item.Opacity           = 1;
        }

        WorldTimeList.InvalidateArrange();
        WorldTimeList.UpdateLayout();
    }

    private void RestoreAllItemVisibility()
    {
        for (int i = 0; i < Entries.Count; i++)
        {
            if (WorldTimeList.ItemContainerGenerator.ContainerFromIndex(i) is ListBoxItem item)
            {
                item.Visibility       = Visibility.Visible;
                item.IsHitTestVisible = true;
                item.Opacity          = 1;
            }
        }

        WorldTimeList.InvalidateArrange();
        WorldTimeList.UpdateLayout();
    }

    private void WorldTimeList_Drop(object sender, DragEventArgs e)
        => e.Handled = true;

    private void Item_Drop(object sender, DragEventArgs e)
    {
        e.Handled = true;

        if (e.Data.GetData(typeof(WorldTimeEntry)) is not WorldTimeEntry source)
            return;
        if (sender is not ListBoxItem targetItem
            || targetItem.DataContext is not WorldTimeEntry target)
            return;
        if (ReferenceEquals(source, target))
            return;

        var pos          = e.GetPosition(targetItem);
        bool insertAfter = pos.Y > targetItem.ActualHeight / 2;
        int targetIndex  = Entries.IndexOf(target);
        int insertIndex  = insertAfter ? targetIndex + 1 : targetIndex;

        int from = Entries.IndexOf(source);
        if (from >= 0 && (insertIndex == from || insertIndex == from + 1))
            return;

        MoveEntry(source, insertIndex);
        _orderChangedDuringDrag = true;
        UpdateDragPlaceholder(source);
    }

    private void MoveEntry(WorldTimeEntry source, int insertIndex)
    {
        int from = Entries.IndexOf(source);
        if (from < 0) return;

        insertIndex = Math.Clamp(insertIndex, 0, Entries.Count);
        Entries.RemoveAt(from);
        if (from < insertIndex)
            insertIndex--;

        insertIndex = Math.Clamp(insertIndex, 0, Entries.Count);
        Entries.Insert(insertIndex, source);
    }

    private UIElement CreateDragGhost(ListBoxItem listItem)
    {
        var capture = FindItemCard(listItem) ?? listItem;
        capture.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        capture.Arrange(new Rect(capture.DesiredSize));

        int width  = Math.Max(1, (int)Math.Ceiling(capture.RenderSize.Width > 0 ? capture.RenderSize.Width : capture.ActualWidth));
        int height = Math.Max(1, (int)Math.Ceiling(capture.RenderSize.Height > 0 ? capture.RenderSize.Height : capture.ActualHeight));

        var rtb = new RenderTargetBitmap(width * 2, height * 2, 192, 192, PixelFormats.Pbgra32);
        rtb.Render(capture);

        var accent = FindResource("AccentBrush") as Brush ?? Brushes.DeepSkyBlue;
        var panel  = FindResource("PanelBackgroundBrush") as Brush ?? Brushes.White;

        return new Border
        {
            Width            = width,
            Height           = height,
            Background       = panel,
            BorderBrush      = accent,
            BorderThickness  = new Thickness(2.5),
            CornerRadius     = new CornerRadius(8),
            Opacity          = 1,
            SnapsToDevicePixels = true,
            Child = new Image
            {
                Source  = rtb,
                Stretch = Stretch.Fill,
                Width   = width,
                Height  = height
            },
            Effect = new DropShadowEffect
            {
                BlurRadius  = 24,
                ShadowDepth = 6,
                Opacity     = 0.7,
                Color       = Colors.Black
            },
            RenderTransform       = new ScaleTransform(1.04, 1.04),
            RenderTransformOrigin = new Point(0.5, 0.5)
        };
    }

    private static FrameworkElement? FindItemCard(DependencyObject root)
    {
        for (int i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
        {
            var child = VisualTreeHelper.GetChild(root, i);
            if (child is Border { Child: not null } border
                && border.CornerRadius.TopLeft >= 4)
                return border;

            var nested = FindItemCard(child);
            if (nested != null) return nested;
        }
        return null;
    }

    private static ListBoxItem? FindListBoxItem(DependencyObject? dep)
    {
        while (dep != null)
        {
            if (dep is ListBoxItem lbi) return lbi;
            dep = VisualTreeHelper.GetParent(dep);
        }
        return null;
    }

    private static WorldTimeEntry? ResolveEntry(object sender)
    {
        if (sender is Button btn)
        {
            if (btn.Tag is WorldTimeEntry fromTag) return fromTag;
            if (btn.DataContext is WorldTimeEntry fromDc) return fromDc;
        }

        return ResolveEntryFrom(sender as DependencyObject);
    }

    private static WorldTimeEntry? ResolveEntryFrom(DependencyObject? dep)
    {
        while (dep != null)
        {
            if (dep is FrameworkElement fe && fe.DataContext is WorldTimeEntry entry)
                return entry;
            dep = VisualTreeHelper.GetParent(dep);
        }
        return null;
    }

    private static bool IsFromButton(DependencyObject? obj)
    {
        while (obj != null)
        {
            if (obj is Button) return true;
            obj = VisualTreeHelper.GetParent(obj);
        }
        return false;
    }
}
