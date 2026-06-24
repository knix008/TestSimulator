using System.Windows;
using DeskSearch.Helpers;
using DeskSearch.Models;

namespace DeskSearch;

public partial class MainWindow
{
    private const double ResultsWindowGap = 4;
    private const int MinVisibleResults = 10;
    private const double ResultItemHeight = 46;
    private const double ResultsChromeHeight = 22;
    private const double DefaultResultsWindowHeight =
        ResultsChromeHeight + (MinVisibleResults * ResultItemHeight);
    private const double ResultsMinHeight = DefaultResultsWindowHeight;
    private const double ResultsMaxHeight = 560;

    private ResultsWindow? _resultsWindow;
    private bool _userResizedResultsHeight;
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
        window.HeightChangedByUser += (_, _) =>
        {
            _userResizedResultsHeight = true;
            PersistSettings();
        };
        window.SetContextMenu(_mainContextMenu);
        window.ApplyTheme(Resources);
        window.ApplyChrome(_settingsService.Current);

        if (_settingsService.Current.WindowHeight is double savedHeight
            && savedHeight >= ResultsMinHeight)
        {
            window.Height = ClampResultsWindowHeight(savedHeight);
            _userResizedResultsHeight = true;
        }
        else
        {
            window.Height = DefaultResultsWindowHeight;
        }

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
        if (results.Count == 0)
        {
            if (string.IsNullOrWhiteSpace(SearchBox.Text))
                HideSearchResults();

            return;
        }

        var restoreSearchFocus = SearchBox.IsKeyboardFocused;
        var resultsWindow = Results;
        var firstShow = !_resultsWindowShown;

        if (!resultsWindow.UpdateResults(results) && !firstShow)
        {
            if (restoreSearchFocus)
                SearchBox.Focus();

            return;
        }

        if (firstShow)
        {
            if (!_userResizedResultsHeight)
                resultsWindow.Height = ClampResultsWindowHeight(DefaultResultsWindowHeight);
            else if (resultsWindow.Height < ResultsMinHeight)
                resultsWindow.Height = ResultsMinHeight;

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

        SyncResultsWindowLayout(show: true);
        _resultsWindow.ShowActivated = false;
        _resultsWindow.Show();
        _resultsWindowShown = true;
        SearchBox.Focus();
    }
}
