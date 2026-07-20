using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using DeskSearch.Helpers;
using DeskSearch.Models;
using KeyEventArgs = System.Windows.Input.KeyEventArgs;
using MouseEventArgs = System.Windows.Input.MouseEventArgs;
using Point = System.Windows.Point;

namespace DeskSearch;

public partial class ResultsWindow : Window
{
    public event EventHandler? RequestSearchFocus;
    public event EventHandler<FileEntry>? EntryOpenRequested;
    public event EventHandler<FileEntry>? EntryOpenDefaultRequested;
    public event EventHandler<ListBoxItem>? ResultItemRightClick;
    public event EventHandler? HeightChangedByUser;

    private bool _isResizingHeight;
    private Point _resizeStartScreenPoint;
    private double _resizeStartHeight;
    private readonly ObservableCollection<FileEntry> _boundResults = [];
    private FileEntry? _toolTipEntry;

    public ResultsWindow()
    {
        InitializeComponent();
        ResultsList.ItemsSource = _boundResults;
        ResultToolTipPopup.PlacementTarget = this;
        ResultToolTipBorder.IsHitTestVisible = false;
        WindowTaskbarHelper.ExcludeFromTaskbar(this);
    }

    public void ApplyTheme(ResourceDictionary themeResources)
    {
        foreach (var key in themeResources.Keys)
            Resources[key] = themeResources[key];

        if (Resources["PrimaryTextBrush"] is System.Windows.Media.Brush textBrush)
            ResultToolTipNameText.Foreground = textBrush;

        if (Resources["SubTextBrush"] is System.Windows.Media.Brush subBrush)
            ResultToolTipPathText.Foreground = subBrush;
    }

    public void ApplyChrome(AppSettings settings)
    {
        var bgColor = ColorHelper.ParseColor(settings.BackgroundColor);
        var bgWithAlpha = ColorHelper.WithOpacity(bgColor, settings.BackgroundOpacity);
        var display = ColorHelper.ResolveDisplayColors(settings);

        RootBorder.Background = new SolidColorBrush(bgWithAlpha);
        RootBorder.BorderBrush = ColorHelper.ToBrush(display.BorderColor);
        RootBorder.BorderThickness = new Thickness(settings.BorderThickness);
        ResultToolTipBorder.Background = new SolidColorBrush(ColorHelper.WithOpacity(bgColor, Math.Min(100, settings.BackgroundOpacity + 5)));
        ResultToolTipBorder.BorderBrush = ColorHelper.ToBrush(display.BorderColor);
        ResultToolTipBorder.BorderThickness = new Thickness(settings.BorderThickness);
        Topmost = settings.AlwaysOnTop;
        Opacity = Math.Clamp(settings.WindowOpacity, 50, 100) / 100.0;
    }

    public int ResultCount => _boundResults.Count;

    /// <returns>True when the visible list changed.</returns>
    public bool UpdateResults(IReadOnlyList<FileEntry> results)
    {
        EmptyResultsLabel.Visibility = Visibility.Collapsed;
        ResultsList.Visibility = Visibility.Visible;

        if (ResultsSequenceEquals(_boundResults, results))
            return false;

        var selectedPath = (ResultsList.SelectedItem as FileEntry)?.FullPath;

        for (var i = 0; i < results.Count; i++)
        {
            if (i < _boundResults.Count)
            {
                if (!string.Equals(_boundResults[i].FullPath, results[i].FullPath, StringComparison.OrdinalIgnoreCase))
                    _boundResults[i] = results[i];
            }
            else
            {
                _boundResults.Add(results[i]);
            }
        }

        while (_boundResults.Count > results.Count)
            _boundResults.RemoveAt(_boundResults.Count - 1);

        RestoreSelection(selectedPath, results);
        return true;
    }

    public void ClearResults()
    {
        HideResultToolTip();
        _boundResults.Clear();
        EmptyResultsLabel.Visibility = Visibility.Collapsed;
        ResultsList.Visibility = Visibility.Visible;
    }

    public void ShowNoResults(string message)
    {
        HideResultToolTip();
        _boundResults.Clear();
        EmptyResultsLabel.Text = message;
        EmptyResultsLabel.Visibility = Visibility.Visible;
        ResultsList.Visibility = Visibility.Collapsed;
    }

    public void ConfigureForResultCount(int resultCount, int maxVisibleWithoutScroll)
    {
        ResultsList.SetValue(
            ScrollViewer.VerticalScrollBarVisibilityProperty,
            resultCount > maxVisibleWithoutScroll
                ? ScrollBarVisibility.Auto
                : ScrollBarVisibility.Disabled);
    }

    /// <summary>Window height for <paramref name="resultCount"/> rows using measured item height when available.</summary>
    public double CalculateHeightForResultCount(int resultCount, int maxVisibleWithoutScroll, double fallbackItemHeight, double chromeHeight)
    {
        var visibleRows = Math.Clamp(resultCount, 1, maxVisibleWithoutScroll);
        var itemHeight = MeasureItemHeight(fallbackItemHeight);
        return chromeHeight + (visibleRows * itemHeight);
    }

    private double MeasureItemHeight(double fallback)
    {
        if (_boundResults.Count == 0)
            return fallback;

        ResultsList.UpdateLayout();

        if (ResultsList.ItemContainerGenerator.ContainerFromIndex(0) is FrameworkElement item)
        {
            if (item.ActualHeight > 0)
                return item.ActualHeight;

            item.Measure(new System.Windows.Size(ResultsList.ActualWidth > 0 ? ResultsList.ActualWidth : Width, double.PositiveInfinity));
            if (item.DesiredSize.Height > 0)
                return item.DesiredSize.Height;
        }

        return fallback;
    }

    private static bool ResultsSequenceEquals(
        IReadOnlyList<FileEntry> current,
        IReadOnlyList<FileEntry> next)
    {
        if (current.Count != next.Count)
            return false;

        for (var i = 0; i < current.Count; i++)
        {
            if (!string.Equals(current[i].FullPath, next[i].FullPath, StringComparison.OrdinalIgnoreCase))
                return false;
        }

        return true;
    }

    private void RestoreSelection(string? selectedPath, IReadOnlyList<FileEntry> results)
    {
        if (results.Count == 0)
            return;

        if (!string.IsNullOrEmpty(selectedPath))
        {
            for (var i = 0; i < results.Count; i++)
            {
                if (string.Equals(results[i].FullPath, selectedPath, StringComparison.OrdinalIgnoreCase))
                {
                    ResultsList.SelectedIndex = i;
                    return;
                }
            }
        }

        if (ResultsList.SelectedIndex < 0)
            ResultsList.SelectedIndex = 0;
    }

    public void FocusResults()
    {
        ResultsList.Focus();
        if (ResultsList.Items.Count > 0 && ResultsList.SelectedIndex < 0)
            ResultsList.SelectedIndex = 0;
    }

    public FileEntry? GetSelectedEntry() => ResultsList.SelectedItem as FileEntry;

    protected override void OnSourceInitialized(EventArgs e)
    {
        base.OnSourceInitialized(e);
        WindowTaskbarHelper.ApplyExStyle(this, noActivate: true);
    }

    public void SetContextMenu(ContextMenu menu) => ResultsList.ContextMenu = menu;

    private void ResultsList_MouseMove(object sender, MouseEventArgs e)
    {
        if (_isResizingHeight)
        {
            HideResultToolTip();
            return;
        }

        var item = FindVisualParent<ListBoxItem>(e.OriginalSource as DependencyObject);
        if (item?.DataContext is FileEntry entry)
        {
            if (!ReferenceEquals(_toolTipEntry, entry))
            {
                _toolTipEntry = entry;
                UpdateResultToolTipContent(entry);
            }

            UpdateResultToolTipPosition(e);
            ResultToolTipPopup.IsOpen = true;
            return;
        }

        HideResultToolTip();
    }

    private void UpdateResultToolTipContent(FileEntry entry)
    {
        ResultToolTipNameText.Text = entry.FileName;
        ResultToolTipPathText.Text = entry.FullPath;
    }

    private void UpdateResultToolTipPosition(MouseEventArgs e)
    {
        const double offsetX = 16;
        const double offsetY = 18;

        var mouseInList = e.GetPosition(ResultsList);
        var screenPoint = ResultsList.PointToScreen(mouseInList);
        var windowPoint = PointFromScreen(screenPoint);

        ResultToolTipBorder.Measure(new System.Windows.Size(ResultToolTipBorder.MaxWidth, double.PositiveInfinity));
        var popupSize = ResultToolTipBorder.DesiredSize;
        if (popupSize.Width <= 0)
            popupSize = new System.Windows.Size(320, 40);

        var relX = windowPoint.X + offsetX;
        var relY = windowPoint.Y + offsetY;

        var workArea = ScreenHelper.GetMonitorWorkAreaInScreenDips(this, screenPoint);
        var popupScreenX = screenPoint.X + offsetX;
        var popupScreenY = screenPoint.Y + offsetY;

        if (popupScreenX + popupSize.Width > workArea.Right)
            relX = PointFromScreen(new Point(screenPoint.X - popupSize.Width - offsetX, screenPoint.Y)).X;

        if (popupScreenY + popupSize.Height > workArea.Bottom)
            relY = PointFromScreen(new Point(screenPoint.X, screenPoint.Y - popupSize.Height - offsetY)).Y;

        ResultToolTipPopup.PlacementTarget = this;
        ResultToolTipPopup.Placement = PlacementMode.Relative;
        ResultToolTipPopup.HorizontalOffset = relX;
        ResultToolTipPopup.VerticalOffset = relY;
    }

    private void ResultsList_MouseLeave(object sender, MouseEventArgs e)
    {
        HideResultToolTip();
    }

    private void HideResultToolTip()
    {
        _toolTipEntry = null;
        ResultToolTipPopup.IsOpen = false;
    }

    private static T? FindVisualParent<T>(DependencyObject? child) where T : DependencyObject
    {
        while (child is not null)
        {
            if (child is T match)
                return match;

            child = VisualTreeHelper.GetParent(child);
        }

        return null;
    }

    private void ResultsList_KeyDown(object sender, KeyEventArgs e)
    {
        switch (e.Key)
        {
            case Key.Enter when ResultsList.SelectedItem is FileEntry entry:
                EntryOpenRequested?.Invoke(this, entry);
                e.Handled = true;
                break;
            case Key.Escape:
                RequestSearchFocus?.Invoke(this, EventArgs.Empty);
                e.Handled = true;
                break;
            case Key.Up when ResultsList.SelectedIndex == 0:
                RequestSearchFocus?.Invoke(this, EventArgs.Empty);
                e.Handled = true;
                break;
        }
    }

    private void ResultsList_MouseDoubleClick(object sender, MouseButtonEventArgs e)
    {
        if (ResultsList.SelectedItem is FileEntry entry)
            EntryOpenDefaultRequested?.Invoke(this, entry);
    }

    private void ResultItem_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ClickCount != 1 || sender is not ListBoxItem { IsSelected: true, DataContext: FileEntry entry })
            return;

        EntryOpenRequested?.Invoke(this, entry);
    }

    private void ResultItem_PreviewMouseRightButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (sender is not ListBoxItem item)
            return;

        item.IsSelected = true;
        item.Focus();
        ResultItemRightClick?.Invoke(this, item);
    }

    private void BottomResizeGrip_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        HideResultToolTip();
        _isResizingHeight = true;
        _resizeStartScreenPoint = PointToScreen(e.GetPosition(this));
        _resizeStartHeight = Height;
        CaptureMouse();
        MouseMove += Window_ResizeMouseMove;
        MouseLeftButtonUp += Window_ResizeMouseLeftButtonUp;
        e.Handled = true;
    }

    private void Window_ResizeMouseMove(object sender, MouseEventArgs e)
    {
        if (!_isResizingHeight || e.LeftButton != MouseButtonState.Pressed)
            return;

        var current = PointToScreen(e.GetPosition(this));
        var deltaY = current.Y - _resizeStartScreenPoint.Y;
        Height = Math.Clamp(_resizeStartHeight + deltaY, MinHeight, MaxHeight);
    }

    private void Window_ResizeMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (!_isResizingHeight)
            return;

        _isResizingHeight = false;
        ReleaseMouseCapture();
        MouseMove -= Window_ResizeMouseMove;
        MouseLeftButtonUp -= Window_ResizeMouseLeftButtonUp;
        HeightChangedByUser?.Invoke(this, EventArgs.Empty);
    }
}
