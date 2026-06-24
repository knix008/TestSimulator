using System.Windows;
using DeskSearch.Helpers;
using DeskSearch.Services;

namespace DeskSearch;

public partial class MainWindow
{
    private TrayIconService? _trayIconService;
    private bool _isApplicationExit;

    private void InitializeTrayIcon()
    {
        _trayIconService = new TrayIconService(this);
    }

    public void ShowFromTray()
    {
        ReloadAndApplySettings();
        WindowTaskbarHelper.ExcludeFromTaskbar(this);

        if (Visibility != Visibility.Visible)
            Show();

        WindowState = WindowState.Normal;
        Activate();
        SearchBox.Focus();
        ShowResultsIfNeeded();
    }

    public void HideToTray()
    {
        PersistSettings();
        HideResultsWithMain();
        Hide();
    }

    public void OpenSettings() => MenuSettings_Click(this, new RoutedEventArgs());

    public void RequestApplicationExit()
    {
        if (_isApplicationExit)
            return;

        _isApplicationExit = true;

        foreach (Window window in System.Windows.Application.Current.Windows)
        {
            if (window != this)
                window.Close();
        }

        Close();
    }

    private void Window_Closing(object sender, System.ComponentModel.CancelEventArgs e)
    {
        if (_isApplicationExit)
            return;

        e.Cancel = true;
        HideToTray();
    }

    private void Window_Closed(object? sender, EventArgs e)
    {
        if (!_isApplicationExit)
            return;

        DisposeApplicationResources();
        System.Windows.Application.Current.Shutdown();
    }

    private void DisposeApplicationResources()
    {
        UnregisterSessionEndingHandler();
        PersistSettings();
        _trayIconService?.Dispose();
        _watcherService.Dispose();
        _indexService.Dispose();
    }
}
