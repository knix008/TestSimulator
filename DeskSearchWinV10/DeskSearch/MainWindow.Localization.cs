using System.Windows;
using System.Windows.Controls;
using DeskSearch.Services;

namespace DeskSearch;

public partial class MainWindow
{
    private MenuItem? _menuClearSearch;
    private MenuItem? _menuRefreshIndex;
    private MenuItem? _menuOpenDesktop;
    private MenuItem? _menuResetPosition;
    private MenuItem? _menuSettings;
    private MenuItem? _menuExit;

    private void InitializeLocalization()
    {
        Title = LocalizationService.T("App_Title");
        DragHandle.ToolTip = LocalizationService.T("Drag_Tooltip");
        LocalizationService.LanguageChanged += (_, _) => Dispatcher.Invoke(RefreshLocalization);
    }

    public void RefreshLocalization()
    {
        Title = LocalizationService.T("App_Title");
        DragHandle.ToolTip = LocalizationService.T("Drag_Tooltip");

        UpdateMenuHeader(_menuClearSearch, "Menu_ClearSearch");
        UpdateMenuHeader(_menuRefreshIndex, "Menu_RefreshIndex");
        UpdateMenuHeader(_menuOpenDesktop, "Menu_OpenDesktop");
        UpdateMenuHeader(_menuResetPosition, "Menu_ResetPosition");
        UpdateMenuHeader(_menuSettings, "Menu_Settings");
        UpdateMenuHeader(_menuExit, "Menu_Exit");
        UpdateMenuHeader(_menuAlwaysOnTop, "Menu_AboveOthers");
        UpdateMenuHeader(_menuOpenFile, "Menu_Open");
        UpdateMenuHeader(_menuShowInFolder, "Menu_ShowInFolder");
        UpdateMenuHeader(_menuCopyPath, "Menu_CopyPath");
        UpdateMenuHeader(_menuCopyFileName, "Menu_CopyFileName");

        RefreshContextMenuItems(_mainContextMenu);
        RefreshContextMenuItems(_resultItemContextMenu);

        UpdateIndexUi();
        _trayIconService?.RefreshLocalization();
    }

    private static void RefreshContextMenuItems(ContextMenu menu)
    {
        foreach (var item in menu.Items)
        {
            if (item is MenuItem menuItem && menuItem.Tag is string key)
                menuItem.Header = LocalizationService.T(key);
        }
    }

    private static void UpdateMenuHeader(MenuItem? item, string key)
    {
        if (item is not null)
            item.Header = LocalizationService.T(key);
    }

    private MenuItem CreateLocalizedMenuItem(string key, RoutedEventHandler handler)
    {
        var item = new MenuItem
        {
            Header = LocalizationService.T(key),
            Tag = key
        };
        item.Click += handler;
        return item;
    }
}
