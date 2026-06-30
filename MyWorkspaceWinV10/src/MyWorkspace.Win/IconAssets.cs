using System.Reflection;

namespace MyWorkspace.Win;

internal static class IconAssets
{
    private const string Prefix = "MyWorkspace.Win.Assets.Icons.";
    private const string AppIconResourceName = "MyWorkspace.Win.Assets.app.ico";
    private static readonly Assembly Assembly = typeof(IconAssets).Assembly;
    private static Icon? _appIcon;

    public static Bitmap Load(int size, string name)
    {
        var resourceName = $"{Prefix}s{size}.{name}.png";
        var stream = Assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Icon resource not found: {resourceName}");

        return new Bitmap(stream);
    }

    public static Icon CreateAppIcon()
    {
        _appIcon ??= LoadAppIconFromResource();
        return (Icon)_appIcon.Clone();
    }

    public static ImageList CreateImageList(int size, params (string Key, string Name)[] icons)
    {
        var list = new ImageList
        {
            ColorDepth = ColorDepth.Depth32Bit,
            ImageSize = new Size(size, size)
        };

        foreach (var (key, name) in icons)
            list.Images.Add(key, Load(size, name));

        return list;
    }

    private static Icon LoadAppIconFromResource()
    {
        var stream = Assembly.GetManifestResourceStream(AppIconResourceName);
        if (stream != null)
            return new Icon(stream);

        var path = Path.Combine(AppContext.BaseDirectory, "Assets", "app.ico");
        if (File.Exists(path))
            return new Icon(path);

        throw new InvalidOperationException($"App icon resource not found: {AppIconResourceName}");
    }
}
