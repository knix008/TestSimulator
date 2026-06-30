namespace MyWorkspace.Win;

internal static class AppIcons
{
    private const int MenuIconSize = 16;
    private const int ToolbarIconSize = 20;

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
            ("ul", "ul"),
            ("ol", "ol"),
            ("quote", "quote"),
            ("hr", "hr"),
            ("table", "table"),
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
        ToolStripMenuItem menuAccountLogout,
        ToolStripMenuItem menuBarLogin,
        ToolStripMenuItem menuBarLogout,
        ToolStripMenuItem ctxNewSubWorkspace,
        ToolStripMenuItem ctxNewPage,
        ToolStripMenuItem ctxRename,
        ToolStripMenuItem ctxDelete,
        ToolStripMenuItem ctxToggleFavorite,
        ToolStripMenuItem ctxMembers)
    {
        menuSavePage.Image = IconAssets.Load(MenuIconSize, "save");
        menuPageHistory.Image = IconAssets.Load(MenuIconSize, "history");
        menuRefreshTree.Image = IconAssets.Load(MenuIconSize, "refresh");
        menuLogin.Image = IconAssets.Load(MenuIconSize, "login");
        menuLogout.Image = IconAssets.Load(MenuIconSize, "logout");
        menuAbout.Image = IconAssets.Load(MenuIconSize, "info");
        menuExit.Image = IconAssets.Load(MenuIconSize, "exit");
        menuPreferences.Image = IconAssets.Load(MenuIconSize, "preferences");
        menuDocumentStructure.Image = IconAssets.Load(MenuIconSize, "outline");
        menuNewRootWorkspace.Image = IconAssets.Load(MenuIconSize, "folder_plus_workspace");
        menuNewSubWorkspace.Image = IconAssets.Load(MenuIconSize, "folder_plus_sub");
        menuNewPage.Image = IconAssets.Load(MenuIconSize, "page_plus");
        menuRename.Image = IconAssets.Load(MenuIconSize, "rename");
        menuDelete.Image = IconAssets.Load(MenuIconSize, "delete");
        menuWorkspaceMembers.Image = IconAssets.Load(MenuIconSize, "members");
        menuAdminUserManagement.Image = IconAssets.Load(MenuIconSize, "users");
        menuAdminDatabaseSettings.Image = IconAssets.Load(MenuIconSize, "database");
        menuAdminEmailSettings.Image = IconAssets.Load(MenuIconSize, "email");
        menuEditProfile.Image = IconAssets.Load(MenuIconSize, "profile");
        menuChangePassword.Image = IconAssets.Load(MenuIconSize, "password");
        menuNotificationSettings.Image = IconAssets.Load(MenuIconSize, "bell");
        menuAccountLogout.Image = IconAssets.Load(MenuIconSize, "logout");
        menuBarLogin.Image = IconAssets.Load(MenuIconSize, "login");
        menuBarLogout.Image = IconAssets.Load(MenuIconSize, "logout");
        ctxNewSubWorkspace.Image = menuNewSubWorkspace.Image;
        ctxNewPage.Image = menuNewPage.Image;
        ctxRename.Image = menuRename.Image;
        ctxDelete.Image = menuDelete.Image;
        ctxToggleFavorite.Image = IconAssets.Load(MenuIconSize, "star");
        ctxMembers.Image = menuWorkspaceMembers.Image;
    }
}
