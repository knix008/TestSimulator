namespace MyWorkspace.Win;

internal static class TreeIcons
{
    public static ImageList CreateImageList() =>
        IconAssets.CreateImageList(
            16,
            false,
            ("workspace", "workspace"),
            ("workspace_fav", "workspace_fav"),
            ("favorite", "favorite"),
            ("page", "page"));
}
