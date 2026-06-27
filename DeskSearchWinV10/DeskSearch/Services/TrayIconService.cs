using System.Drawing;
using System.Windows.Forms;
using DeskSearch.Helpers;
using DeskSearch.Services;

namespace DeskSearch.Services;

public sealed class TrayIconService : IDisposable
{
    private readonly MainWindow _mainWindow;
    private readonly NotifyIcon _notifyIcon;
    private readonly List<Bitmap> _menuImages = [];
    private ToolStripMenuItem? _showWindowItem;
    private ToolStripMenuItem? _hideWindowItem;
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
        _showWindowItem = CreateTrayMenuItem(
            LocalizationService.T("Tray_ShowWindow"),
            MenuGlyphIcons.ShowWindow,
            (_, _) => ShowMainWindow());
        _hideWindowItem = CreateTrayMenuItem(
            LocalizationService.T("Menu_Hide"),
            MenuGlyphIcons.Hide,
            (_, _) => _mainWindow.Dispatcher.Invoke(_mainWindow.HideToTray));
        _settingsItem = CreateTrayMenuItem(
            LocalizationService.T("Menu_Settings"),
            MenuGlyphIcons.Settings,
            (_, _) => _mainWindow.Dispatcher.Invoke(_mainWindow.OpenSettings));
        _exitItem = CreateTrayMenuItem(
            LocalizationService.T("Menu_Exit"),
            MenuGlyphIcons.Exit,
            (_, _) => _mainWindow.Dispatcher.Invoke(_mainWindow.RequestApplicationExit));

        menu.Items.Add(_showWindowItem);
        menu.Items.Add(_hideWindowItem);
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
        if (_hideWindowItem is not null)
            _hideWindowItem.Text = LocalizationService.T("Menu_Hide");
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

        foreach (var image in _menuImages)
            image.Dispose();

        _menuImages.Clear();
    }

    private ToolStripMenuItem CreateTrayMenuItem(string text, string glyph, EventHandler onClick)
    {
        var image = MenuGlyphIcons.CreateWinFormsIcon(glyph);
        _menuImages.Add(image);
        return new ToolStripMenuItem(text, image, onClick);
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
