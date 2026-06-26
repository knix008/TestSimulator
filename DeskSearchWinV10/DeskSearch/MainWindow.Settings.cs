using System.Windows;
using System.Windows.Media;
using DeskSearch.Helpers;
using DeskSearch.Models;
using DeskSearch.Services;

namespace DeskSearch;

public partial class MainWindow
{
    private readonly SettingsService _settingsService;
    private DebounceDispatcher? _positionSaveDebounce;
    private bool _isApplyingWindowLayout;
    private bool _sessionEndingHandlerRegistered;

    private DebounceDispatcher LayoutSaveDebounce =>
        _positionSaveDebounce ??= new DebounceDispatcher(Dispatcher, delayMs: 400);

    private void ApplySettings(AppSettings settings)
    {
        LocalizationService.Apply(settings.Language);

        var bgColor = ColorHelper.ParseColor(settings.BackgroundColor);
        var bgWithAlpha = ColorHelper.WithOpacity(bgColor, settings.BackgroundOpacity);
        var display = ColorHelper.ResolveDisplayColors(settings);

        RootBorder.Background = new SolidColorBrush(bgWithAlpha);
        RootBorder.BorderBrush = ColorHelper.ToBrush(display.BorderColor);

        Resources["PrimaryTextBrush"] = ColorHelper.ToBrush(display.TextColor);
        Resources["SubTextBrush"] = ColorHelper.ToBrush(display.SubTextColor);
        SearchBox.Foreground = ColorHelper.ToBrush(display.TextColor);
        SearchBox.CaretBrush = ColorHelper.ToBrush(display.TextColor);
        ApplyIconBrushes(settings);

        Topmost = settings.AlwaysOnTop;
        _menuAlwaysOnTop.IsChecked = settings.AlwaysOnTop;
        Opacity = Math.Clamp(settings.WindowOpacity, 50, 100) / 100.0;

        ApplyThemeToResultsWindow();

        if (!StartupService.Sync(settings.RunAtStartup) && settings.RunAtStartup)
            ErrorDialogService.Show(LocalizationService.T("Error_StartupRegistration"));
    }

    private void ApplyIconBrushes(AppSettings settings)
    {
        var isDark = ColorHelper.IsDark(ColorHelper.ParseColor(settings.BackgroundColor));

        Resources["IconPrimaryBrush"] = ColorHelper.ToBrush(isDark ? "#F5F5F5" : "#141414");
        Resources["IconMutedBrush"] = ColorHelper.ToBrush(isDark ? "#B0BEC5" : "#555555");
        Resources["IconAccentBrush"] = ColorHelper.ToBrush(isDark ? "#90CAF9" : "#004578");
        Resources["ListItemHoverBrush"] = ColorHelper.ToBrush(isDark ? "#22FFFFFF" : "#15000000");
        Resources["ListItemSelectedBrush"] = ColorHelper.ToBrush(isDark ? "#3390CAF9" : "#220078D4");
    }

    private void RestoreWindowLayout()
    {
        _isApplyingWindowLayout = true;
        try
        {
            var settings = _settingsService.Current;
            ApplySavedWindowWidth(settings.WindowWidth);

            Height = 48;

            if (settings.WindowLeft is double left
                && settings.WindowTop is double top
                && IsLayoutOnScreen(left, top, Width, Height))
            {
                Left = left;
                Top = top;
            }
            else
            {
                PlaceDefaultPosition();
            }

            SyncResultsWindowLayout(show: false);
        }
        finally
        {
            _isApplyingWindowLayout = false;
        }
    }

    private void ApplySavedWindowWidth(double? width)
    {
        if (width is not double savedWidth)
            return;

        Width = ClampWindowWidth(savedWidth);
    }

    private void PlaceDefaultPosition()
    {
        var workArea = SystemParameters.WorkArea;
        Left = workArea.Left + (workArea.Width - Width) / 2;
        Top = workArea.Top + 24;
    }

    private void ResetWindowPosition()
    {
        var settings = _settingsService.Current.Clone();
        settings.WindowLeft = null;
        settings.WindowTop = null;
        _settingsService.Save(settings);

        _isApplyingWindowLayout = true;
        try
        {
            PlaceDefaultPosition();
            SyncResultsWindowLayout(show: _resultsWindow?.IsVisible == true);
        }
        finally
        {
            _isApplyingWindowLayout = false;
        }
    }

    private void Window_LocationChanged(object sender, EventArgs e)
    {
        if (_isApplyingWindowLayout || !IsLoaded)
            return;

        SyncResultsWindowLayout(show: _resultsWindow?.IsVisible == true);
        LayoutSaveDebounce.Debounce(PersistSettings);
    }

    private void Window_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        if (!e.WidthChanged || _isApplyingWindowLayout || !IsLoaded)
            return;

        SyncResultsWindowLayout(show: _resultsWindow?.IsVisible == true);
        LayoutSaveDebounce.Debounce(PersistSettings);
    }

    internal void PersistSettings()
    {
        if (_isApplyingWindowLayout)
            return;

        var settings = _settingsService.Current.Clone();
        ApplyCurrentWindowLayout(settings);
        _settingsService.Save(settings);
    }

    private void ReloadAndApplySettings()
    {
        _settingsService.Load();
        ApplySettings(_settingsService.Current);
        RestoreWindowLayout();
        ApplySavedResultsWindowLayout();
        _indexService.ConfigureExclusions(_settingsService.Current);
        _watcherService.ConfigurePeriodicResync(_settingsService.Current.PeriodicResyncHours);
        RefreshLocalization();
    }

    private void ApplySavedResultsWindowLayout()
    {
        if (_resultsWindow is null)
            return;

        if (_resultsWindow.ResultCount > 0)
            ApplyResultsWindowHeight(_resultsWindow, _resultsWindow.ResultCount);
        else if (_settingsService.Current.WindowHeight is double savedHeight
                 && savedHeight >= ResultsMinHeight)
            _resultsWindow.Height = ClampResultsWindowHeight(savedHeight);

        _resultsWindow.ApplyChrome(_settingsService.Current);
        SyncResultsWindowLayout(show: _resultsWindow.IsVisible);
    }

    private void RegisterSessionEndingHandler()
    {
        if (_sessionEndingHandlerRegistered)
            return;

        _sessionEndingHandlerRegistered = true;
        Microsoft.Win32.SystemEvents.SessionEnding += OnSessionEnding;
    }

    private void UnregisterSessionEndingHandler()
    {
        if (!_sessionEndingHandlerRegistered)
            return;

        _sessionEndingHandlerRegistered = false;
        Microsoft.Win32.SystemEvents.SessionEnding -= OnSessionEnding;
    }

    private void OnSessionEnding(object sender, Microsoft.Win32.SessionEndingEventArgs e)
    {
        PersistSettings();
        _indexService.AbortIndexingForShutdown();
    }

    private void ApplyCurrentWindowLayout(AppSettings settings)
    {
        settings.WindowLeft = Left;
        settings.WindowTop = Top;
        settings.WindowWidth = Width;

        if (_resultsWindow is null)
            return;

        var height = _resultsWindow.ActualHeight > 0
            ? _resultsWindow.ActualHeight
            : _resultsWindow.Height;

        if (height >= ResultsMinHeight)
            settings.WindowHeight = height;
    }

    private bool IsLayoutOnScreen(double left, double top, double width, double height)
    {
        var windowRect = new Rect(left, top, width, height);
        var virtualScreen = new Rect(
            SystemParameters.VirtualScreenLeft,
            SystemParameters.VirtualScreenTop,
            SystemParameters.VirtualScreenWidth,
            SystemParameters.VirtualScreenHeight);

        if (!windowRect.IntersectsWith(virtualScreen))
            return false;

        var visible = Rect.Intersect(windowRect, virtualScreen);
        return visible.Width >= 80 && visible.Height >= 30;
    }

    private void MenuSettings_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SettingsWindow(
            _settingsService.Current,
            GetSettingsProgress,
            RequestStartIndexingFromSettings,
            RequestStopIndexingFromSettings,
            RequestResetIndexFromSettings)
        {
            Owner = this
        };

        if (dialog.ShowDialog() != true)
            return;

        var previousExclusions = IndexExclusionPolicy.FromSettings(_settingsService.Current);

        ApplyCurrentWindowLayout(dialog.Settings);
        _settingsService.Save(dialog.Settings);
        ApplySettings(_settingsService.Current);

        _watcherService.ConfigurePeriodicResync(_settingsService.Current.PeriodicResyncHours);

        var exclusionsChanged = !previousExclusions.Equals(
            IndexExclusionPolicy.FromSettings(_settingsService.Current));

        if (exclusionsChanged)
        {
            _indexService.ConfigureExclusions(_settingsService.Current);
            _watcherService.Start();
            RequestStartIndexingFromSettings();
        }

        RefreshLocalization();
        RefreshSearchIfNeeded();
    }

    private void SaveAlwaysOnTopSetting()
    {
        var settings = _settingsService.Current.Clone();
        settings.AlwaysOnTop = Topmost;
        ApplyCurrentWindowLayout(settings);
        _settingsService.Save(settings);
        ApplyThemeToResultsWindow();
    }
}
