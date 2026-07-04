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
        navRail.AddMenu(menuView, "workspace", K.TipMenuWorkspacePanel);
        if (_menuOutlineNavRoot != null)
            navRail.AddMenu(_menuOutlineNavRoot, "document_structure", K.TipMenuOutline);
        if (_menuCommentsNavRoot != null)
            navRail.AddMenu(_menuCommentsNavRoot, "comments", K.TipMenuComments);
        navRail.AddMenu(menuAdmin, "users", K.TipMenuAdmin);
        navRail.AddBottomAction(menuLogout, "logout", K.TipMenuBarLogout);
        navRail.AddBottomMenu(menuProfile!, "profile", K.TipMenuProfile);
        navRail.RefreshTheme();
        UpdateNavRailForLoginState(SessionContext.IsLoggedIn);
    }

    private void UpdateNavRailForLoginState(bool loggedIn)
    {
        navRail.SetEntryVisible(menuWorkspace, loggedIn);
        navRail.SetEntryVisible(menuView, loggedIn);
        navRail.SetEntryVisible(menuAdmin, loggedIn && SessionContext.IsAdmin);
        if (_menuOutlineNavRoot != null)
            navRail.SetEntryVisible(_menuOutlineNavRoot, loggedIn);
        if (_menuCommentsNavRoot != null)
            navRail.SetEntryVisible(_menuCommentsNavRoot, loggedIn);
        navRail.SetBottomActionVisible(menuLogout, loggedIn);
        navRail.SetBottomMenuVisible(menuProfile!, loggedIn);
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
