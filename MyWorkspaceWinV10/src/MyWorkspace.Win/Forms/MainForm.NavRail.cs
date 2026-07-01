namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private bool _navMenuOpen;

    private void InitializeNavRail()
    {
        navRail.MenuPopupOpening += (_, _) =>
        {
            _navMenuOpen = true;
            EnterEditorOverlay();
        };

        navRail.MenuPopupClosed += (_, _) =>
        {
            _navMenuOpen = false;
            ExitEditorOverlay();
        };

        navRail.AddMenu(menuFile, IconAssets.Load(24, "save"), K.TipMenuFile);
        navRail.AddMenu(menuWorkspace, IconAssets.Load(24, "folder_plus_workspace"), K.TipMenuWorkspace);
        navRail.AddMenu(menuView, IconAssets.Load(24, "outline"), K.TipMenuView);
        navRail.AddMenu(menuAdmin, IconAssets.Load(24, "users"), K.TipMenuAdmin);
        navRail.AddMenu(menuAccount, IconAssets.Load(24, "profile"), K.TipMenuAccount);
        navRail.AddBottomAction(menuLogout, IconAssets.Load(24, "logout"), K.TipMenuBarLogout);
        navRail.RefreshTheme();
        UpdateNavRailForLoginState(SessionContext.IsLoggedIn);
    }

    private void UpdateNavRailForLoginState(bool loggedIn)
    {
        navRail.SetEntryVisible(menuWorkspace, loggedIn);
        navRail.SetEntryVisible(menuAccount, loggedIn);
        navRail.SetEntryVisible(menuAdmin, loggedIn && SessionContext.IsAdmin);
        navRail.SetBottomActionVisible(menuLogout, loggedIn);
    }

    private void RefreshNavRailTheme()
    {
        navRail.RefreshTheme();
    }

    private void RefreshNavRailTooltips()
    {
        navRail.RefreshTooltips();
    }
}
