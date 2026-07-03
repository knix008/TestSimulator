namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private ToolStripMenuItem? menuProfile;
    private ToolStripMenuItem? menuTitleBarPageSearch;
    private ToolStripSeparator? menuSepAppSettingsAdmin;

    private void EnsureProfileMenuItems()
    {
        if (menuProfile != null)
            return;

        menuProfile = new ToolStripMenuItem
        {
            Name = "menuProfile",
            Image = IconAssets.Load(16, "profile")
        };
        menuProfile.DropDownItems.Add(menuEditProfile);
        menuProfile.DropDownItems.Add(menuChangePassword);
        menuProfile.DropDownItems.Add(menuNotificationSettings);
    }

    private void InitializeAppSettingsMenu()
    {
        EnsureProfileMenuItems();

        if (menuTitleBarPageSearch == null)
        {
            menuTitleBarPageSearch = new ToolStripMenuItem
            {
                Name = "menuTitleBarPageSearch",
                CheckOnClick = true,
                Image = AppIcons.LoadMenuIcon("search")
            };
            menuTitleBarPageSearch.Click += menuTitleBarPageSearch_Click;
        }

        ctxAppSettings.Items.Clear();
        ctxAppSettings.Items.Add(menuPreferences);
        ctxAppSettings.Items.Add(menuTitleBarPageSearch);
        menuSepAppSettingsAdmin = new ToolStripSeparator { Name = "menuSepAppSettingsAdmin" };
        ctxAppSettings.Items.Add(menuSepAppSettingsAdmin);
        ctxAppSettings.Items.Add(menuAdminDatabaseSettings);
        ctxAppSettings.Items.Add(menuAdminEmailSettings);

        ctxAppSettings.ShowItemToolTips = true;
        titleBar.SettingsMenu = ctxAppSettings;
        titleBar.SetMarkTooltip(Localization.Get(K.TipAppSettingsMark));

        AppTheme.StyleContextMenu(ctxAppSettings);
        ctxAppSettings.Opening += OnAppSettingsMenuOpening;
        ctxAppSettings.Closed += (_, _) => ExitEditorOverlay();
    }

    private void OnAppSettingsMenuOpening(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        EnterEditorOverlay();
        RefreshTitleBarPageSearchMenuState();
    }

    private void RefreshTitleBarPageSearchMenuState()
    {
        if (menuTitleBarPageSearch == null)
            return;

        var canUseSearch = SessionContext.IsLoggedIn && AppConfig.IsDatabaseConnected;
        menuTitleBarPageSearch.Visible = SessionContext.IsLoggedIn;
        menuTitleBarPageSearch.Enabled = canUseSearch;
        menuTitleBarPageSearch.Checked = canUseSearch && AppConfig.UiSettings.ShowTitleBarPageSearch;
        menuTitleBarPageSearch.Text = Localization.Get(K.MenuTitleBarPageSearch);
    }

    private void menuTitleBarPageSearch_Click(object? sender, EventArgs e)
    {
        if (menuTitleBarPageSearch == null || !SessionContext.IsLoggedIn || !AppConfig.IsDatabaseConnected)
            return;

        AppConfig.SetTitleBarPageSearchVisible(menuTitleBarPageSearch.Checked);
        ConfigureTitleBarPageSearch();
    }
}
