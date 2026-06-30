using System.Drawing.Imaging;
using System.Reflection;
using System.Runtime.InteropServices;

namespace MyWorkspace.Win;

internal static class IconAssets
{
    private const string Prefix = "MyWorkspace.Win.Assets.Icons.";
    private const string AppIconResourceName = "MyWorkspace.Win.Assets.app.ico";
    private static readonly Assembly Assembly = typeof(IconAssets).Assembly;
    private static Icon? _appIcon;

    public static Bitmap Load(int size, string name) => LoadRaw(size, name);

    public static Icon CreateAppIcon()
    {
        _appIcon ??= LoadAppIconFromResource();
        return (Icon)_appIcon.Clone();
    }

    public static ImageList CreateImageList(int size, bool adaptForDarkToolbar, params (string Key, string Name)[] icons)
    {
        var list = new ImageList
        {
            ColorDepth = ColorDepth.Depth32Bit,
            ImageSize = new Size(size, size)
        };

        foreach (var (key, name) in icons)
        {
            using var source = LoadRaw(size, name);
            list.Images.Add(key, adaptForDarkToolbar ? AdaptForDarkToolbar(source) : new Bitmap(source));
        }

        return list;
    }

    public static Bitmap AdaptForDarkToolbar(Bitmap source)
    {
        var adapted = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        var rect = new Rectangle(0, 0, source.Width, source.Height);

        var sourceBits = source.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        var adaptedBits = adapted.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);

        try
        {
            var sourceStride = sourceBits.Stride;
            var adaptedStride = adaptedBits.Stride;
            var bytes = new byte[4];

            for (var y = 0; y < source.Height; y++)
            {
                for (var x = 0; x < source.Width; x++)
                {
                    var sourceOffset = y * sourceStride + x * 4;
                    bytes[0] = Marshal.ReadByte(sourceBits.Scan0, sourceOffset + 0);
                    bytes[1] = Marshal.ReadByte(sourceBits.Scan0, sourceOffset + 1);
                    bytes[2] = Marshal.ReadByte(sourceBits.Scan0, sourceOffset + 2);
                    bytes[3] = Marshal.ReadByte(sourceBits.Scan0, sourceOffset + 3);

                    if (bytes[3] == 0)
                        continue;

                    var adaptedColor = AdaptPixelForDarkToolbar(Color.FromArgb(bytes[3], bytes[2], bytes[1], bytes[0]));
                    var adaptedOffset = y * adaptedStride + x * 4;
                    Marshal.WriteByte(adaptedBits.Scan0, adaptedOffset + 0, adaptedColor.B);
                    Marshal.WriteByte(adaptedBits.Scan0, adaptedOffset + 1, adaptedColor.G);
                    Marshal.WriteByte(adaptedBits.Scan0, adaptedOffset + 2, adaptedColor.R);
                    Marshal.WriteByte(adaptedBits.Scan0, adaptedOffset + 3, adaptedColor.A);
                }
            }
        }
        finally
        {
            source.UnlockBits(sourceBits);
            adapted.UnlockBits(adaptedBits);
        }

        return adapted;
    }

    private static Color AdaptPixelForDarkToolbar(Color color)
    {
        var max = Math.Max(color.R, Math.Max(color.G, color.B));
        var min = Math.Min(color.R, Math.Min(color.G, color.B));
        var delta = max - min;

        if (max < 95 && delta < 45)
            return Color.FromArgb(color.A, 230, 237, 243);

        if (max < 145 && delta < 40)
            return Color.FromArgb(color.A, 176, 186, 196);

        // Dark saturated strokes (legacy purple italic, etc.) — use light neutral for contrast.
        if (max < 200 && delta >= 25)
            return Color.FromArgb(color.A, 230, 237, 243);

        if (max < 90)
        {
            return Color.FromArgb(
                color.A,
                Math.Min(255, color.R + 90),
                Math.Min(255, color.G + 90),
                Math.Min(255, color.B + 90));
        }

        if (max < 130 && color.B >= color.R && color.B >= color.G)
        {
            return Color.FromArgb(
                color.A,
                Math.Min(255, color.R + 50),
                Math.Min(255, color.G + 50),
                Math.Min(255, color.B + 70));
        }

        if (max < 160)
        {
            return Color.FromArgb(
                color.A,
                Math.Min(255, color.R + 35),
                Math.Min(255, color.G + 35),
                Math.Min(255, color.B + 35));
        }

        return color;
    }

    private static Bitmap LoadRaw(int size, string name)
    {
        var resourceName = $"{Prefix}s{size}.{name}.png";
        var stream = Assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Icon resource not found: {resourceName}");

        return new Bitmap(stream);
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
