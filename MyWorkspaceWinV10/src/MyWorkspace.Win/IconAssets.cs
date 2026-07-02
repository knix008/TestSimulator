using System.Drawing.Imaging;
using System.Reflection;
using System.Runtime.InteropServices;

namespace MyWorkspace.Win;

internal enum UiIconPlacement
{
    Menu,
    Toolbar,
    Tree
}

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

    public static Bitmap LoadMonochrome(int size, string name, UiIconPlacement placement = UiIconPlacement.Menu)
    {
        using var source = Load(size, name);
        return ApplyMonochromeTint(source, name, placement);
    }

    public static ImageList CreateMonochromeImageList(
        int size,
        UiIconPlacement placement,
        params (string Key, string Name)[] icons)
    {
        var list = new ImageList
        {
            ColorDepth = ColorDepth.Depth32Bit,
            ImageSize = new Size(size, size)
        };

        foreach (var (key, name) in icons)
        {
            using var source = Load(size, name);
            list.Images.Add(key, ApplyMonochromeTint(source, name, placement));
        }

        return list;
    }

    private static Bitmap ApplyMonochromeTint(Bitmap source, string name, UiIconPlacement placement)
    {
        var foreground = ResolveIconForeground(placement);
        if (!UsesDetailPreservingTint(name))
            return Tint(source, foreground);

        var background = ResolveIconBackground(placement);
        var lightTone = ResolveIconLightTone(background, foreground);
        return TintPreserveLuminance(source, foreground, lightTone);
    }

    private static bool UsesDetailPreservingTint(string name) =>
        name is "h1" or "h2" or "h3" or "h4" or "h5" or "h6" or "table"
            or "code" or "codeblock" or "image"
            or "workspace" or "workspace_fav" or "workspace_locked" or "workspace_fav_locked" or "folder_plus_workspace"
            or "users" or "profile";

    private static Color ResolveIconForeground(UiIconPlacement placement) =>
        placement switch
        {
            UiIconPlacement.Toolbar => AppTheme.ToolbarIconColor,
            UiIconPlacement.Tree => AppTheme.TreeIconColor,
            _ => AppTheme.MenuIconColor
        };

    private static Color ResolveIconBackground(UiIconPlacement placement) =>
        placement switch
        {
            UiIconPlacement.Toolbar => AppTheme.Sidebar,
            UiIconPlacement.Tree => AppTheme.Sidebar,
            _ => AppTheme.Surface
        };

    private static Color ResolveIconLightTone(Color background, Color foreground)
    {
        var light = AppTheme.IsDark ? Color.FromArgb(240, 244, 248) : Color.White;
        if (GetContrastRatio(foreground, light) >= 2.5)
            return light;

        return GetRelativeLuminance(background) > 0.5
            ? Color.White
            : Color.FromArgb(230, 237, 243);
    }

    public static Bitmap LoadDialogButtonIcon(int size, string name, bool onPrimaryBackground)
    {
        using var source = LoadRaw(size, name);
        if (onPrimaryBackground)
            return Tint(source, Color.White);

        return AppTheme.IsDark ? AdaptForDarkToolbar(source) : new Bitmap(source);
    }

    private static Bitmap Tint(Bitmap source, Color color)
    {
        var tinted = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        var rect = new Rectangle(0, 0, source.Width, source.Height);

        var sourceBits = source.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        var tintedBits = tinted.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);

        try
        {
            var sourceStride = sourceBits.Stride;
            var tintedStride = tintedBits.Stride;

            for (var y = 0; y < source.Height; y++)
            {
                for (var x = 0; x < source.Width; x++)
                {
                    var sourceOffset = y * sourceStride + x * 4;
                    var alpha = Marshal.ReadByte(sourceBits.Scan0, sourceOffset + 3);
                    if (alpha == 0)
                        continue;

                    var tintedOffset = y * tintedStride + x * 4;
                    Marshal.WriteByte(tintedBits.Scan0, tintedOffset + 0, color.B);
                    Marshal.WriteByte(tintedBits.Scan0, tintedOffset + 1, color.G);
                    Marshal.WriteByte(tintedBits.Scan0, tintedOffset + 2, color.R);
                    Marshal.WriteByte(tintedBits.Scan0, tintedOffset + 3, alpha);
                }
            }
        }
        finally
        {
            source.UnlockBits(sourceBits);
            tinted.UnlockBits(tintedBits);
        }

        return tinted;
    }

    private static Bitmap TintPreserveLuminance(Bitmap source, Color darkTone, Color lightTone)
    {
        var tinted = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        var rect = new Rectangle(0, 0, source.Width, source.Height);

        var sourceBits = source.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        var tintedBits = tinted.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);

        try
        {
            var sourceStride = sourceBits.Stride;
            var tintedStride = tintedBits.Stride;

            for (var y = 0; y < source.Height; y++)
            {
                for (var x = 0; x < source.Width; x++)
                {
                    var sourceOffset = y * sourceStride + x * 4;
                    var alpha = Marshal.ReadByte(sourceBits.Scan0, sourceOffset + 3);
                    if (alpha == 0)
                        continue;

                    var pixel = Color.FromArgb(
                        alpha,
                        Marshal.ReadByte(sourceBits.Scan0, sourceOffset + 2),
                        Marshal.ReadByte(sourceBits.Scan0, sourceOffset + 1),
                        Marshal.ReadByte(sourceBits.Scan0, sourceOffset + 0));

                    var amount = MapDetailLuminance(GetRelativeLuminance(pixel));
                    var mapped = BlendColors(darkTone, lightTone, amount);
                    var tintedOffset = y * tintedStride + x * 4;
                    Marshal.WriteByte(tintedBits.Scan0, tintedOffset + 0, mapped.B);
                    Marshal.WriteByte(tintedBits.Scan0, tintedOffset + 1, mapped.G);
                    Marshal.WriteByte(tintedBits.Scan0, tintedOffset + 2, mapped.R);
                    Marshal.WriteByte(tintedBits.Scan0, tintedOffset + 3, alpha);
                }
            }
        }
        finally
        {
            source.UnlockBits(sourceBits);
            tinted.UnlockBits(tintedBits);
        }

        return tinted;
    }

    private static double MapDetailLuminance(double luminance)
    {
        const double darkCutoff = 0.16;
        const double lightCutoff = 0.70;

        if (luminance <= darkCutoff)
            return 0;

        if (luminance >= lightCutoff)
            return 1;

        return (luminance - darkCutoff) / (lightCutoff - darkCutoff);
    }

    private static Color BlendColors(Color from, Color to, double amount)
    {
        amount = Math.Clamp(amount, 0, 1);
        var inverse = 1 - amount;
        return Color.FromArgb(
            255,
            (int)(from.R * inverse + to.R * amount),
            (int)(from.G * inverse + to.G * amount),
            (int)(from.B * inverse + to.B * amount));
    }

    private static double GetContrastRatio(Color foreground, Color background)
    {
        var l1 = GetRelativeLuminance(foreground);
        var l2 = GetRelativeLuminance(background);
        var lighter = Math.Max(l1, l2);
        var darker = Math.Min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
    }

    private static double GetRelativeLuminance(Color color)
    {
        static double Channel(int value)
        {
            var channel = value / 255d;
            return channel <= 0.03928
                ? channel / 12.92
                : Math.Pow((channel + 0.055) / 1.055, 2.4);
        }

        var r = Channel(color.R);
        var g = Channel(color.G);
        var b = Channel(color.B);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

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
            Bitmap bitmap;
            if (adaptForDarkToolbar && IsHeadingIconName(name, out var level))
                bitmap = AdaptHeadingForDarkToolbar(source, level);
            else
                bitmap = adaptForDarkToolbar ? AdaptForDarkToolbar(source) : new Bitmap(source);

            list.Images.Add(key, bitmap);
        }

        return list;
    }

    public static Bitmap LoadHeadingToolbarIcon(int size, int level)
    {
        using var source = LoadRaw(size, $"h{level}");
        return AppTheme.IsDark
            ? AdaptHeadingForDarkToolbar(source, level)
            : new Bitmap(source);
    }

    private static bool IsHeadingIconName(string name, out int level)
    {
        if (name.Length == 2 && name[0] == 'h' && name[1] is >= '1' and <= '6')
        {
            level = name[1] - '0';
            return true;
        }

        level = 0;
        return false;
    }

    private static Bitmap AdaptHeadingForDarkToolbar(Bitmap source, int level)
    {
        var baseColor = HeadingColors.Get(level);
        var accentColor = HeadingColors.GetForDarkToolbar(level);
        var adapted = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        var rect = new Rectangle(0, 0, source.Width, source.Height);

        var sourceBits = source.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        var adaptedBits = adapted.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);

        try
        {
            var sourceStride = sourceBits.Stride;
            var adaptedStride = adaptedBits.Stride;

            for (var y = 0; y < source.Height; y++)
            {
                for (var x = 0; x < source.Width; x++)
                {
                    var sourceOffset = y * sourceStride + x * 4;
                    var alpha = Marshal.ReadByte(sourceBits.Scan0, sourceOffset + 3);
                    if (alpha == 0)
                        continue;

                    var pixel = Color.FromArgb(
                        alpha,
                        Marshal.ReadByte(sourceBits.Scan0, sourceOffset + 2),
                        Marshal.ReadByte(sourceBits.Scan0, sourceOffset + 1),
                        Marshal.ReadByte(sourceBits.Scan0, sourceOffset + 0));

                    var mapped = MapHeadingPixelForDarkToolbar(pixel, baseColor, accentColor);
                    var adaptedOffset = y * adaptedStride + x * 4;
                    Marshal.WriteByte(adaptedBits.Scan0, adaptedOffset + 0, mapped.B);
                    Marshal.WriteByte(adaptedBits.Scan0, adaptedOffset + 1, mapped.G);
                    Marshal.WriteByte(adaptedBits.Scan0, adaptedOffset + 2, mapped.R);
                    Marshal.WriteByte(adaptedBits.Scan0, adaptedOffset + 3, mapped.A);
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

    private static Color MapHeadingPixelForDarkToolbar(Color pixel, Color baseColor, Color accentColor)
    {
        var max = Math.Max(pixel.R, Math.Max(pixel.G, pixel.B));

        if (max > 210)
            return Color.FromArgb(pixel.A, 245, 247, 250);

        if (max < 110)
            return Color.FromArgb(pixel.A, 203, 213, 225);

        if (IsNearColor(pixel, baseColor, 72))
            return Color.FromArgb(pixel.A, accentColor.R, accentColor.G, accentColor.B);

        return Color.FromArgb(
            pixel.A,
            Math.Min(255, pixel.R + 40),
            Math.Min(255, pixel.G + 40),
            Math.Min(255, pixel.B + 40));
    }

    private static bool IsNearColor(Color pixel, Color target, int tolerance) =>
        Math.Abs(pixel.R - target.R) <= tolerance &&
        Math.Abs(pixel.G - target.G) <= tolerance &&
        Math.Abs(pixel.B - target.B) <= tolerance;

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
