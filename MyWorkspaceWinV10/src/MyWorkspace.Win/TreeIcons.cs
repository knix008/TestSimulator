namespace MyWorkspace.Win;

internal static class TreeIcons
{
    public static ImageList CreateImageList() =>
        IconAssets.CreateImageList(
            16,
            ("workspace", "workspace"),
            ("workspace_locked", "workspace_locked"),
            ("workspace_fav", "workspace_fav"),
            ("workspace_fav_locked", "workspace_fav_locked"),
            ("favorite", "favorite"),
            ("page", "page"),
            ("page_locked", "page_locked"));

    public static string ResolveWorkspaceIconKey(bool isFavorite, bool isLocked) =>
        isFavorite
            ? isLocked ? "workspace_fav_locked" : "workspace_fav"
            : isLocked ? "workspace_locked" : "workspace";

    public static string ResolvePageIconKey(bool isLocked) =>
        isLocked ? "page_locked" : "page";
}
