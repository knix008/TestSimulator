namespace MyWorkspace.Win;

internal sealed class OutlineTarget(string headingId)
{
    public string HeadingId { get; } = headingId;
}

internal static class OutlineIcons
{
    public static ImageList CreateImageList() =>
        IconAssets.CreateImageList(
            16,
            ("h1", "h1"),
            ("h2", "h2"),
            ("h3", "h3"),
            ("h4", "h4"),
            ("h5", "h5"),
            ("h6", "h6"));

    public static string LevelToKey(int level) => level switch
    {
        1 => "h1",
        2 => "h2",
        3 => "h3",
        4 => "h4",
        5 => "h5",
        6 => "h6",
        _ => "h6"
    };
}
