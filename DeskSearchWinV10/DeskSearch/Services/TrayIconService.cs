using System.Drawing;
using System.Windows.Forms;
using DeskSearch.Services;

namespace DeskSearch.Services;

public sealed class TrayIconService : IDisposable
{
    private readonly MainWindow _mainWindow;
    private readonly NotifyIcon _notifyIcon;
    private ToolStripMenuItem? _showWindowItem;
    private ToolStripMenuItem? _settingsItem;
    private ToolStripMenuItem? _exitItem;

    public TrayIconService(MainWindow mainWindow)
    {
        _mainWindow = mainWindow;

        _notifyIcon = new NotifyIcon
        {
            Icon = LoadAppIcon(),
            Text = LocalizationService.T("App_Title"),
            Visible = true
        };

        _notifyIcon.DoubleClick += (_, _) => ShowMainWindow();

        var menu = new ContextMenuStrip();
        _showWindowItem = new ToolStripMenuItem(
            LocalizationService.T("Tray_ShowWindow"),
            null,
            (_, _) => ShowMainWindow());
        _settingsItem = new ToolStripMenuItem(
            LocalizationService.T("Menu_Settings"),
            null,
            (_, _) => _mainWindow.Dispatcher.Invoke(_mainWindow.OpenSettings));
        _exitItem = new ToolStripMenuItem(
            LocalizationService.T("Menu_Exit"),
            null,
            (_, _) => _mainWindow.Dispatcher.Invoke(_mainWindow.RequestApplicationExit));

        menu.Items.Add(_showWindowItem);
        menu.Items.Add(_settingsItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(_exitItem);

        _notifyIcon.ContextMenuStrip = menu;
    }

    public void RefreshLocalization()
    {
        _notifyIcon.Text = LocalizationService.T("App_Title");
        if (_showWindowItem is not null)
            _showWindowItem.Text = LocalizationService.T("Tray_ShowWindow");
        if (_settingsItem is not null)
            _settingsItem.Text = LocalizationService.T("Menu_Settings");
        if (_exitItem is not null)
            _exitItem.Text = LocalizationService.T("Menu_Exit");
    }

    public void ShowMainWindow()
    {
        _mainWindow.Dispatcher.Invoke(_mainWindow.ShowFromTray);
    }

    public void Dispose()
    {
        _notifyIcon.Visible = false;
        _notifyIcon.Dispose();
    }

    private static Icon LoadAppIcon()
    {
        var assetsDir = Path.Combine(AppContext.BaseDirectory, "Assets");
        var iconPath = Path.Combine(assetsDir, "app.ico");
        var pngPath = Path.Combine(assetsDir, "app.png");

        try
        {
            if (File.Exists(iconPath))
                return new Icon(iconPath);
        }
        catch
        {
            // malformed ico — fall back below
        }

        try
        {
            if (File.Exists(pngPath))
            {
                using var bitmap = new Bitmap(pngPath);
                return Icon.FromHandle(bitmap.GetHicon());
            }
        }
        catch
        {
            // ignore
        }

        return SystemIcons.Application;
    }
}
