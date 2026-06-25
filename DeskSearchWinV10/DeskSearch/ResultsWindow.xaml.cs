using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Controls;
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

    public ResultsWindow()
    {
        InitializeComponent();
        ResultsList.ItemsSource = _boundResults;
        WindowTaskbarHelper.ExcludeFromTaskbar(this);
    }

    public void ApplyTheme(ResourceDictionary themeResources)
    {
        foreach (var key in themeResources.Keys)
            Resources[key] = themeResources[key];
    }

    public void ApplyChrome(AppSettings settings)
    {
        var bgColor = ColorHelper.ParseColor(settings.BackgroundColor);
        var bgWithAlpha = ColorHelper.WithOpacity(bgColor, settings.BackgroundOpacity);
        var display = ColorHelper.ResolveDisplayColors(settings);

        RootBorder.Background = new SolidColorBrush(bgWithAlpha);
        RootBorder.BorderBrush = ColorHelper.ToBrush(display.BorderColor);
        Topmost = settings.AlwaysOnTop;
        Opacity = Math.Clamp(settings.WindowOpacity, 50, 100) / 100.0;
    }

    public int ResultCount => _boundResults.Count;

    /// <returns>True when the visible list changed.</returns>
    public bool UpdateResults(IReadOnlyList<FileEntry> results)
    {
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

    public void ClearResults() => _boundResults.Clear();

    public void ConfigureForResultCount(int resultCount, int maxVisibleWithoutScroll)
    {
        ResultsList.SetValue(
            ScrollViewer.VerticalScrollBarVisibilityProperty,
            resultCount > maxVisibleWithoutScroll
                ? ScrollBarVisibility.Auto
                : ScrollBarVisibility.Disabled);
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
