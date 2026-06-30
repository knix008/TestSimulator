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
            ("h3", "h3"));

    public static string LevelToKey(int level) => level switch
    {
        1 => "h1",
        2 => "h2",
        _ => "h3"
    };
}
