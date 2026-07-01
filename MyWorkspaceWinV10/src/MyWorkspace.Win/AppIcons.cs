namespace MyWorkspace.Win;

internal static class AppIcons
{
    private const int MenuIconSize = 16;
    public const int ToolbarIconSize = 28;

    public static Bitmap LoadMenuIcon(string name) => IconAssets.Load(MenuIconSize, name);

    public static ImageList CreateToolbarImageList() =>
        IconAssets.CreateImageList(
            ToolbarIconSize,
            AppTheme.IsDark,
            ("h1", "h1"),
            ("h2", "h2"),
            ("h3", "h3"),
            ("h4", "h4"),
            ("h5", "h5"),
            ("h6", "h6"),
            ("bold", "bold"),
            ("italic", "italic"),
            ("strike", "strike"),
            ("code", "code"),
            ("codeblock", "codeblock"),
            ("link", "link"),
            ("image", "image"),
            ("attach", "attach"),
            ("ul", "ul"),
            ("ol", "ol"),
            ("quote", "quote"),
            ("hr", "hr"),
            ("table", "table"),
            ("undo", "undo"),
            ("redo", "redo"),
            ("outline", "outline"),
            ("info", "info"),
            ("save", "save"),
            ("page", "page"),
            ("export", "export"),
            ("history", "history"),
            ("log", "log"));

    public static void ApplyMenuIcons(
        ToolStripMenuItem menuSavePage,
        ToolStripMenuItem menuPageHistory,
        ToolStripMenuItem menuRefreshTree,
        ToolStripMenuItem menuLogin,
        ToolStripMenuItem menuLogout,
        ToolStripMenuItem menuAbout,
        ToolStripMenuItem menuExit,
        ToolStripMenuItem menuPreferences,
        ToolStripMenuItem menuDocumentStructure,
        ToolStripMenuItem menuNewRootWorkspace,
        ToolStripMenuItem menuNewSubWorkspace,
        ToolStripMenuItem menuNewPage,
        ToolStripMenuItem menuRename,
        ToolStripMenuItem menuDelete,
        ToolStripMenuItem menuWorkspaceMembers,
        ToolStripMenuItem menuAdminUserManagement,
        ToolStripMenuItem menuAdminDatabaseSettings,
        ToolStripMenuItem menuAdminEmailSettings,
        ToolStripMenuItem menuEditProfile,
        ToolStripMenuItem menuChangePassword,
        ToolStripMenuItem menuNotificationSettings,
        ToolStripMenuItem ctxNewRootWorkspace,
        ToolStripMenuItem ctxNewSubWorkspace,
        ToolStripMenuItem ctxNewPage,
        ToolStripMenuItem ctxRename,
        ToolStripMenuItem ctxDelete,
        ToolStripMenuItem ctxToggleFavorite,
        ToolStripMenuItem ctxToggleWorkspaceLock,
        ToolStripMenuItem ctxTogglePageLock,
        ToolStripMenuItem ctxMembers)
    {
        menuSavePage.Image = LoadMenuIcon("save");
        menuPageHistory.Image = LoadMenuIcon("history");
        menuRefreshTree.Image = LoadMenuIcon("refresh");
        menuLogin.Image = LoadMenuIcon("login");
        menuLogout.Image = LoadMenuIcon("logout");
        menuAbout.Image = LoadMenuIcon("info");
        menuExit.Image = LoadMenuIcon("exit");
        menuPreferences.Image = LoadMenuIcon("preferences");
        menuDocumentStructure.Image = LoadMenuIcon("outline");
        menuNewRootWorkspace.Image = LoadMenuIcon("folder_plus_workspace");
        menuNewSubWorkspace.Image = LoadMenuIcon("folder_plus_sub");
        menuNewPage.Image = LoadMenuIcon("page_plus");
        menuRename.Image = LoadMenuIcon("rename");
        menuDelete.Image = LoadMenuIcon("delete");
        menuWorkspaceMembers.Image = LoadMenuIcon("members");
        menuAdminUserManagement.Image = LoadMenuIcon("users");
        menuAdminDatabaseSettings.Image = LoadMenuIcon("database");
        menuAdminEmailSettings.Image = LoadMenuIcon("email");
        menuEditProfile.Image = LoadMenuIcon("profile");
        menuChangePassword.Image = LoadMenuIcon("password");
        menuNotificationSettings.Image = LoadMenuIcon("bell");
        ctxNewRootWorkspace.Image = menuNewRootWorkspace.Image;
        ctxNewSubWorkspace.Image = menuNewSubWorkspace.Image;
        ctxNewPage.Image = menuNewPage.Image;
        ctxRename.Image = menuRename.Image;
        ctxDelete.Image = menuDelete.Image;
        ctxToggleFavorite.Image = LoadMenuIcon("star");
        ctxToggleWorkspaceLock.Image = LoadMenuIcon("lock");
        ctxTogglePageLock.Image = LoadMenuIcon("lock");
        ctxMembers.Image = menuWorkspaceMembers.Image;
    }
}
