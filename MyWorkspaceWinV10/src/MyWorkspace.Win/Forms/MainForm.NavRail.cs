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

        navRail.AddMenu(menuFile, "file", K.TipMenuFile);
        navRail.AddMenu(menuWorkspace, "folder_plus_workspace", K.TipMenuWorkspace);
        navRail.AddMenu(menuView, "outline", K.TipMenuView);
        navRail.AddMenu(menuAdmin, "users", K.TipMenuAdmin);
        navRail.AddBottomAction(menuLogout, "logout", K.TipMenuBarLogout);
        navRail.RefreshTheme();
        UpdateNavRailForLoginState(SessionContext.IsLoggedIn);
    }

    private void UpdateNavRailForLoginState(bool loggedIn)
    {
        navRail.SetEntryVisible(menuWorkspace, loggedIn);
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
