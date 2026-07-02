namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private ToolStripMenuItem? menuSettings;
    private ToolStripMenuItem? menuProfile;

    private void EnsureSettingsMenuItems()
    {
        EnsureProfileMenuItems();

        if (menuSettings != null)
            return;

        menuSettings = new ToolStripMenuItem
        {
            Name = "menuSettings",
            Image = IconAssets.Load(16, "preferences")
        };
        menuSettings.DropDownItems.Add(menuPreferences);
    }

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
        EnsureSettingsMenuItems();

        ctxAppSettings.Items.Clear();
        ctxAppSettings.Items.Add(menuAdminDatabaseSettings);
        ctxAppSettings.Items.Add(menuAdminEmailSettings);

        ctxAppSettings.ShowItemToolTips = true;
        titleBar.SettingsMenu = ctxAppSettings;
        titleBar.SetMarkTooltip(Localization.Get(K.TipAppSettingsMark));

        AppTheme.StyleContextMenu(ctxAppSettings);
        ctxAppSettings.Opening += (_, _) => EnterEditorOverlay();
        ctxAppSettings.Closed += (_, _) => ExitEditorOverlay();
    }
}
