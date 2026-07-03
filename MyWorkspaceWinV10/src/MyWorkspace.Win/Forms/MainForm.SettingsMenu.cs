namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private ToolStripMenuItem? menuProfile;
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

        ctxAppSettings.Items.Clear();
        ctxAppSettings.Items.Add(menuPreferences);
        menuSepAppSettingsAdmin = new ToolStripSeparator { Name = "menuSepAppSettingsAdmin" };
        ctxAppSettings.Items.Add(menuSepAppSettingsAdmin);
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
