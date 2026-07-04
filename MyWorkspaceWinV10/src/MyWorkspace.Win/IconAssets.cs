using System.Drawing.Imaging;
using System.Reflection;

namespace MyWorkspace.Win;

internal static class IconAssets
{
    private const string Prefix = "MyWorkspace.Win.Assets.Icons.";
    private const string AppIconResourceName = "MyWorkspace.Win.Assets.app.ico";
    private static readonly Assembly Assembly = typeof(IconAssets).Assembly;
    private static Icon? _appIcon;

    private static readonly int[] AvailableIconSizes = [16, 20, 28];

    public static Bitmap Load(int size, string name)
    {
        if (TryLoadRaw(size, name, out var exact))
            return exact;

        int? sourceSize = null;
        foreach (var candidate in AvailableIconSizes.OrderBy(candidate => Math.Abs(candidate - size)))
        {
            if (IconResourceExists(candidate, name))
            {
                sourceSize = candidate;
                break;
            }
        }

        if (!sourceSize.HasValue)
            throw new InvalidOperationException($"Icon resource not found: {Prefix}s{{size}}.{name}.png");

        using var source = LoadRaw(sourceSize.Value, name);
        return sourceSize.Value == size ? new Bitmap(source) : ScaleToSize(source, size);
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

    public static Bitmap LoadDialogButtonIcon(int size, string name, bool onPrimaryBackground) =>
        Load(size, name);

    public static Bitmap LoadTinted(int size, string name, Color tint)
    {
        using var source = Load(size, name);
        return Tint(source, tint);
    }

    private static Bitmap Tint(Bitmap source, Color tint)
    {
        var tinted = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        for (var y = 0; y < source.Height; y++)
        {
            for (var x = 0; x < source.Width; x++)
            {
                var pixel = source.GetPixel(x, y);
                if (pixel.A == 0)
                    continue;

                tinted.SetPixel(x, y, Color.FromArgb(pixel.A, tint.R, tint.G, tint.B));
            }
        }

        return tinted;
    }

    public static Icon CreateAppIcon()
    {
        _appIcon ??= LoadAppIconFromResource();
        return (Icon)_appIcon.Clone();
    }

    private static Bitmap LoadRaw(int size, string name)
    {
        if (!TryLoadRaw(size, name, out var bitmap))
            throw new InvalidOperationException($"Icon resource not found: {GetIconResourceName(size, name)}");

        return bitmap;
    }

    private static bool TryLoadRaw(int size, string name, out Bitmap bitmap)
    {
        var stream = Assembly.GetManifestResourceStream(GetIconResourceName(size, name));
        if (stream == null)
        {
            bitmap = null!;
            return false;
        }

        bitmap = new Bitmap(stream);
        return true;
    }

    private static bool IconResourceExists(int size, string name) =>
        Assembly.GetManifestResourceStream(GetIconResourceName(size, name)) != null;

    private static string GetIconResourceName(int size, string name) =>
        $"{Prefix}s{size}.{name}.png";

    private static Bitmap ScaleToSize(Bitmap source, int targetSize)
    {
        var scaled = new Bitmap(targetSize, targetSize, PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(scaled);
        graphics.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.HighQuality;
        graphics.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
        graphics.DrawImage(source, 0, 0, targetSize, targetSize);
        return scaled;
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
