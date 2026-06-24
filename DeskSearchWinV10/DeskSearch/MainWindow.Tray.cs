using System.Windows;
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
        Show();
        WindowState = WindowState.Normal;
        Activate();
        SearchBox.Focus();
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
        Hide();
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
        SaveWindowPosition();
        _trayIconService?.Dispose();
        _watcherService.Dispose();
        _indexService.Dispose();
    }
}
