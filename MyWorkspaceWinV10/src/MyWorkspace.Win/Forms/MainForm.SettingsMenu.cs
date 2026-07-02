namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private void InitializeAppSettingsMenu()
    {
        ctxAppSettings.Items.Clear();
        ctxAppSettings.Items.Add(menuPreferences);
        ctxAppSettings.Items.Add(menuSepAccount1);
        ctxAppSettings.Items.Add(menuEditProfile);
        ctxAppSettings.Items.Add(menuChangePassword);
        ctxAppSettings.Items.Add(menuNotificationSettings);
        ctxAppSettings.Items.Add(menuSepAccount2);
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
