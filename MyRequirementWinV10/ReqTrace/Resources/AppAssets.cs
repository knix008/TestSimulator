namespace ReqTrace.Resources;

/// <summary>
/// Loads application and project icons from the Assets folder copied next to the executable.
/// </summary>
public static class AppAssets
{
    private static readonly Lazy<Icon> AppIconLazy = new(LoadAppIcon);
    private static readonly Lazy<Icon> ProjectIconLazy = new(LoadProjectIcon);
    private static readonly Lazy<Bitmap> ProjectIcon16Lazy = new(() => LoadSizedBitmap("project-icon.png", 16));

    public static Icon AppIcon => AppIconLazy.Value;
    public static Icon ProjectIcon => ProjectIconLazy.Value;
    public static Bitmap ProjectIcon16 => ProjectIcon16Lazy.Value;

    public static Bitmap GetProjectIcon(int size) => LoadSizedBitmap("project-icon.png", size);

    public static Bitmap GetAppIcon(int size) => LoadSizedBitmap("app-icon.png", size);

    private static string AssetPath(string fileName) =>
        Path.Combine(AppContext.BaseDirectory, "Assets", fileName);

    private static Icon LoadAppIcon() => LoadIcon("app-icon.ico", "app-icon.png");

    private static Icon LoadProjectIcon() => LoadIcon("project-icon.ico", "project-icon.png");

    private static Icon LoadIcon(string icoFile, string pngFallback)
    {
        var icoPath = AssetPath(icoFile);
        if (File.Exists(icoPath))
            return new Icon(icoPath);

        var pngPath = AssetPath(pngFallback);
        if (File.Exists(pngPath))
        {
            using var bitmap = LoadSizedBitmap(pngFallback, 32);
            return Icon.FromHandle(bitmap.GetHicon());
        }

        return SystemIcons.Application;
    }

    private static Bitmap LoadSizedBitmap(string pngFile, int size)
    {
        var pngPath = AssetPath(pngFile);
        if (!File.Exists(pngPath))
            return new Bitmap(size, size);

        using var source = Image.FromFile(pngPath);
        return Resize(source, size);
    }

    private static Bitmap Resize(Image source, int size)
    {
        var bitmap = new Bitmap(size, size);
        using var g = Graphics.FromImage(bitmap);
        g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
        g.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
        g.DrawImage(source, 0, 0, size, size);
        return bitmap;
    }
}
