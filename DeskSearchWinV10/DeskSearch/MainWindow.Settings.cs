using System.Windows;
using System.Windows.Media;
using DeskSearch.Helpers;
using DeskSearch.Models;
using DeskSearch.Services;

namespace DeskSearch;

public partial class MainWindow
{
    private const double CompactWindowHeight = 48;
    private const double ResultsAreaTopChrome = 54;
    private const double DefaultResultsAreaHeight = 168;
    private const double ApproxResultItemHeight = 40;

    private readonly SettingsService _settingsService = new();
    private DebounceDispatcher? _positionSaveDebounce;
    private bool _isApplyingWindowLayout;
    private bool _userResizedHeight;

    private DebounceDispatcher LayoutSaveDebounce =>
        _positionSaveDebounce ??= new DebounceDispatcher(Dispatcher, delayMs: 400);

    private void ApplySettings(AppSettings settings)
    {
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
            ApplySavedWindowHeight(settings.WindowHeight);

            if (settings.WindowHeight is null)
            {
                SizeToContent = SizeToContent.Manual;
                Height = ClampWindowHeight(CompactWindowHeight);
                _userResizedHeight = false;
            }

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

            UpdateResultsListMaxHeight();
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

    private void ApplySavedWindowHeight(double? height)
    {
        if (height is not double savedHeight)
            return;

        SizeToContent = SizeToContent.Manual;
        Height = ClampWindowHeight(savedHeight);
        _userResizedHeight = true;
    }

    private void AdjustWindowHeightForContent()
    {
        if (_isApplyingWindowLayout)
            return;

        _isApplyingWindowLayout = true;
        try
        {
            var resultsVisible = ResultsList.Visibility == Visibility.Visible;
            if (_userResizedHeight)
            {
                UpdateResultsListMaxHeight();
                return;
            }

            SizeToContent = SizeToContent.Manual;

            if (!resultsVisible)
            {
                Height = ClampWindowHeight(CompactWindowHeight);
                _userResizedHeight = false;
                return;
            }

            var itemCount = ResultsList.Items.Count;
            var resultsArea = Math.Min(
                DefaultResultsAreaHeight,
                Math.Max(80, itemCount * ApproxResultItemHeight));
            Height = ClampWindowHeight(ResultsAreaTopChrome + resultsArea);
            UpdateResultsListMaxHeight();
        }
        finally
        {
            _isApplyingWindowLayout = false;
        }
    }

    private void UpdateResultsListMaxHeight()
    {
        if (ResultsList.Visibility != Visibility.Visible)
            return;

        ResultsList.MaxHeight = Math.Max(80, Height - ResultsAreaTopChrome);
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

        LayoutSaveDebounce.Debounce(SaveWindowLayout);
    }

    private void Window_SizeChanged(object sender, SizeChangedEventArgs e)
    {
        if ((!e.WidthChanged && !e.HeightChanged) || _isApplyingWindowLayout || !IsLoaded)
            return;

        LayoutSaveDebounce.Debounce(SaveWindowLayout);
    }

    private void SaveWindowLayout()
    {
        if (_isApplyingWindowLayout)
            return;

        var settings = _settingsService.Current.Clone();
        ApplyCurrentWindowLayout(settings);
        _settingsService.Save(settings);
    }

    private void ApplyCurrentWindowLayout(AppSettings settings)
    {
        settings.WindowLeft = Left;
        settings.WindowTop = Top;
        settings.WindowWidth = Width;
        settings.WindowHeight = ActualHeight > 0 ? ActualHeight : Height;
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

    private double ClampWindowHeight(double height) =>
        Math.Clamp(height, MinHeight, MaxHeight);

    private void MenuSettings_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new SettingsWindow(
            _settingsService.Current,
            GetSettingsProgress,
            RequestReSearchFromSettings)
        {
            Owner = this
        };

        if (dialog.ShowDialog() != true)
            return;

        var previousExclusions = IndexExclusionPolicy.FromSettings(_settingsService.Current);

        ApplyCurrentWindowLayout(dialog.Settings);
        _settingsService.Save(dialog.Settings);
        LocalizationService.Apply(_settingsService.Current.Language);
        ApplySettings(_settingsService.Current);

        var exclusionsChanged = !previousExclusions.Equals(
            IndexExclusionPolicy.FromSettings(_settingsService.Current));

        if (exclusionsChanged)
        {
            _indexService.ConfigureExclusions(_settingsService.Current);
            _watcherService.Start();
            RequestReSearchFromSettings();
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
    }
}
