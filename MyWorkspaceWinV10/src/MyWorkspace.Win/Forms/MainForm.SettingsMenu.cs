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

        titleBar.SettingsMenu = ctxAppSettings;
        titleBar.SetMarkTooltip(Localization.Get(K.TipAppSettingsMark));

        AppTheme.StyleContextMenu(ctxAppSettings);
        ctxAppSettings.Opening += (_, _) => EnterEditorOverlay();
        ctxAppSettings.Closed += (_, _) => ExitEditorOverlay();
    }
}
