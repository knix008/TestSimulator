using System.Windows;
using System.Windows.Media;
using DeskSearch.Helpers;
using DeskSearch.Models;
using DeskSearch.Services;

namespace DeskSearch;

public partial class MainWindow
{
    private readonly SettingsService _settingsService = new();
    private DebounceDispatcher? _positionSaveDebounce;
    private bool _isApplyingWindowPosition;

    private DebounceDispatcher PositionSaveDebounce =>
        _positionSaveDebounce ??= new DebounceDispatcher(Dispatcher, delayMs: 400);

    private void ApplySettings(AppSettings settings)
    {
        var bgColor = ColorHelper.ParseColor(settings.BackgroundColor);
        var bgWithAlpha = ColorHelper.WithOpacity(bgColor, settings.BackgroundOpacity);
        RootBorder.Background = new SolidColorBrush(bgWithAlpha);
        RootBorder.BorderBrush = ColorHelper.ToBrush(settings.BorderColor);

        Resources["PrimaryTextBrush"] = ColorHelper.ToBrush(settings.TextColor);
        Resources["SubTextBrush"] = ColorHelper.ToBrush(settings.SubTextColor);
        SearchBox.Foreground = ColorHelper.ToBrush(settings.TextColor);

        Topmost = settings.AlwaysOnTop;
        _menuAlwaysOnTop.IsChecked = settings.AlwaysOnTop;
        Opacity = Math.Clamp(settings.WindowOpacity, 50, 100) / 100.0;
    }

    private void RestoreWindowPosition()
    {
        _isApplyingWindowPosition = true;
        try
        {
            var settings = _settingsService.Current;
            if (settings.WindowLeft is double left
                && settings.WindowTop is double top
                && IsPositionOnScreen(left, top))
            {
                Left = left;
                Top = top;
                return;
            }

            PlaceDefaultPosition();
        }
        finally
        {
            _isApplyingWindowPosition = false;
        }
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

        _isApplyingWindowPosition = true;
        try
        {
            PlaceDefaultPosition();
        }
        finally
        {
            _isApplyingWindowPosition = false;
        }
    }

    private void Window_LocationChanged(object sender, EventArgs e)
    {
        if (_isApplyingWindowPosition || !IsLoaded)
            return;

        PositionSaveDebounce.Debounce(SaveWindowPosition);
    }

    private void SaveWindowPosition()
    {
        if (_isApplyingWindowPosition)
            return;

        var settings = _settingsService.Current.Clone();
        settings.WindowLeft = Left;
        settings.WindowTop = Top;
        _settingsService.Save(settings);
    }

    private bool IsPositionOnScreen(double left, double top)
    {
        var height = ActualHeight > 0 ? ActualHeight : Height;
        var windowRect = new Rect(left, top, Width, height);
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
        var dialog = new SettingsWindow(_settingsService.Current)
        {
            Owner = this
        };

        if (dialog.ShowDialog() != true)
            return;

        _settingsService.Save(dialog.Settings);
        LocalizationService.Apply(_settingsService.Current.Language);
        ApplySettings(_settingsService.Current);
        RefreshLocalization();
    }

    private void SaveAlwaysOnTopSetting()
    {
        var settings = _settingsService.Current.Clone();
        settings.AlwaysOnTop = Topmost;
        _settingsService.Save(settings);
    }
}
