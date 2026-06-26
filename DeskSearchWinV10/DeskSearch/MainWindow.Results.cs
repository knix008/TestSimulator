using System.Windows;
using DeskSearch.Helpers;
using DeskSearch.Models;
using DeskSearch.Services;

namespace DeskSearch;

public partial class MainWindow
{
    private const double ResultsWindowGap = 0;
    private const int MinVisibleResults = 10;
    private const double ResultItemHeight = 52;
    private const double ResultsChromeHeight = 26;
    private const double ResultsMinHeight = ResultsChromeHeight + ResultItemHeight;
    private const double ResultsMaxHeight = 560;

    private ResultsWindow? _resultsWindow;
    private bool _resultsWindowShown;

    private ResultsWindow Results => _resultsWindow ??= CreateResultsWindow();

    private ResultsWindow CreateResultsWindow()
    {
        var window = new ResultsWindow
        {
            Owner = this,
            ShowActivated = false
        };

        window.RequestSearchFocus += (_, _) => SearchBox.Focus();
        window.EntryOpenRequested += (_, entry) => OpenEntry(entry);
        window.EntryOpenDefaultRequested += (_, entry) => OpenEntryDefault(entry);
        window.ResultItemRightClick += OnResultItemRightClick;
        window.HeightChangedByUser += (_, _) => PersistSettings();
        window.SetContextMenu(_mainContextMenu);
        window.ApplyTheme(Resources);
        window.ApplyChrome(_settingsService.Current);

        if (_settingsService.Current.WindowHeight is double savedHeight
            && savedHeight >= ResultsMinHeight)
            window.Height = ClampResultsWindowHeight(savedHeight);
        else
            window.Height = ResultsMinHeight;

        WindowTaskbarHelper.ExcludeFromTaskbar(window, noActivate: true);
        return window;
    }

    private void OnResultItemRightClick(object? sender, System.Windows.Controls.ListBoxItem item)
    {
        _contextFileEntry = item.DataContext as FileEntry;
        item.ContextMenu = _resultItemContextMenu;
    }

    private void ShowSearchResults(IReadOnlyList<FileEntry> results)
    {
        var restoreSearchFocus = SearchBox.IsKeyboardFocused;
        var resultsWindow = Results;

        if (results.Count == 0)
        {
            if (string.IsNullOrWhiteSpace(SearchBox.Text))
            {
                HideSearchResults();
                return;
            }

            resultsWindow.ShowNoResults(LocalizationService.T("Search_NoResults"));
            resultsWindow.ConfigureForResultCount(0, MinVisibleResults);
            resultsWindow.Height = ClampResultsWindowHeight(ResultsMinHeight);

            if (!_resultsWindowShown)
            {
                SyncResultsWindowLayout(show: true);
                resultsWindow.Show();
                _resultsWindowShown = true;
            }
            else
            {
                SyncResultsWindowLayoutIfChanged();
            }

            if (restoreSearchFocus)
                SearchBox.Focus();

            return;
        }

        var firstShow = !_resultsWindowShown;

        var changed = resultsWindow.UpdateResults(results);
        if (!changed && !firstShow)
        {
            if (restoreSearchFocus)
                SearchBox.Focus();

            return;
        }

        ApplyResultsWindowHeight(resultsWindow, results.Count);

        if (firstShow)
        {
            SyncResultsWindowLayout(show: true);
            resultsWindow.Show();
            _resultsWindowShown = true;
        }
        else
        {
            SyncResultsWindowLayoutIfChanged();
        }

        if (restoreSearchFocus)
            SearchBox.Focus();
    }

    private void HideSearchResults()
    {
        _resultsWindow?.ClearResults();
        _resultsWindow?.Hide();
        _resultsWindowShown = false;
    }

    private void SyncResultsWindowLayout(bool show)
    {
        if (_resultsWindow is null)
            return;

        _resultsWindow.Width = Width;
        _resultsWindow.Left = Left;
        _resultsWindow.Top = Top + ActualHeight + ResultsWindowGap;

        if (!show)
            return;

        _resultsWindow.Topmost = Topmost;
    }

    private void SyncResultsWindowLayoutIfChanged()
    {
        if (_resultsWindow is null)
            return;

        var targetTop = Top + ActualHeight + ResultsWindowGap;
        if (Math.Abs(_resultsWindow.Left - Left) > 0.5
            || Math.Abs(_resultsWindow.Top - targetTop) > 0.5
            || Math.Abs(_resultsWindow.Width - Width) > 0.5)
        {
            _resultsWindow.Width = Width;
            _resultsWindow.Left = Left;
            _resultsWindow.Top = targetTop;
        }
    }

    private double ClampResultsWindowHeight(double height) =>
        Math.Clamp(height, ResultsMinHeight, ResultsMaxHeight);

    private static double CalculateResultsWindowHeight(ResultsWindow window, int resultCount) =>
        window.CalculateHeightForResultCount(resultCount, MinVisibleResults, ResultItemHeight, ResultsChromeHeight);

    private void ApplyResultsWindowHeight(ResultsWindow window, int resultCount)
    {
        var calculated = CalculateResultsWindowHeight(window, resultCount);
        var height = ClampResultsWindowHeight(calculated);

        var maxVisibleWithoutScroll = MinVisibleResults;
        if (height < calculated - 0.5)
        {
            var itemHeight = window.CalculateHeightForResultCount(1, 1, ResultItemHeight, 0);
            if (itemHeight > 0)
            {
                maxVisibleWithoutScroll = Math.Max(
                    1,
                    (int)Math.Floor((height - ResultsChromeHeight) / itemHeight));
            }
        }

        window.ConfigureForResultCount(resultCount, maxVisibleWithoutScroll);
        window.Height = height;
    }

    private void ApplyThemeToResultsWindow()
    {
        if (_resultsWindow is null)
            return;

        _resultsWindow.ApplyTheme(Resources);
        _resultsWindow.ApplyChrome(_settingsService.Current);
    }

    private void HideResultsWithMain()
    {
        _resultsWindow?.Hide();
        _resultsWindowShown = false;
    }

    private void ShowResultsIfNeeded()
    {
        if (_resultsWindow is null || _resultsWindow.ResultCount == 0)
            return;

        ApplyResultsWindowHeight(_resultsWindow, _resultsWindow.ResultCount);
        SyncResultsWindowLayout(show: true);
        _resultsWindow.ShowActivated = false;
        _resultsWindow.Show();
        _resultsWindowShown = true;
        SearchBox.Focus();
    }
}
