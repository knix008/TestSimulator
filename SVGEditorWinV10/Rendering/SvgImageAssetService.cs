using System.Drawing.Imaging;
using SixLabors.ImageSharp.Formats.Png;
using SVGEditorWinV10.Export;
using SVGEditorWinV10.Serialization;

namespace SVGEditorWinV10.Rendering;

public static class SvgImageAssetService
{
    public const string ImportFileFilter =
        "이미지 파일 (*.png;*.gif;*.jpg;*.jpeg;*.webp;*.avif;*.svg)|*.png;*.gif;*.jpg;*.jpeg;*.webp;*.avif;*.svg|" +
        "PNG (*.png)|*.png|GIF (*.gif)|*.gif|JPEG (*.jpg;*.jpeg)|*.jpg;*.jpeg|WebP (*.webp)|*.webp|AVIF (*.avif)|*.avif|SVG (*.svg)|*.svg";

    private const float MaxSvgRasterDimension = 2048f;

    private static readonly HashSet<string> SupportedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png", ".gif", ".jpg", ".jpeg", ".webp", ".avif", ".svg"
    };

    private static readonly Dictionary<string, Bitmap> BitmapCache = new(StringComparer.Ordinal);

    public sealed record ImportedImage(string DataUri, string SourcePath, SizeF PixelSize);

    public static bool IsSupportedPath(string path) =>
        SupportedExtensions.Contains(Path.GetExtension(path));

    public static ImportedImage LoadFromFile(string path)
    {
        if (!File.Exists(path))
            throw new FileNotFoundException("이미지 파일을 찾을 수 없습니다.", path);

        if (!IsSupportedPath(path))
            throw new NotSupportedException($"지원하지 않는 이미지 형식입니다: {Path.GetExtension(path)}");

        if (Path.GetExtension(path).Equals(".svg", StringComparison.OrdinalIgnoreCase))
            return LoadSvgAsRasterImage(path);

        var bytes = File.ReadAllBytes(path);
        var mimeType = GetMimeType(path);
        var dataUri = $"data:{mimeType};base64,{Convert.ToBase64String(bytes)}";
        var pixelSize = MeasurePixelSize(bytes);
        return new ImportedImage(dataUri, path, pixelSize);
    }

    public static ImportedImage? TryLoadFromHref(string? href, string? baseDirectory)
    {
        if (string.IsNullOrWhiteSpace(href))
            return null;

        href = href.Trim();
        if (href.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            var pixelSize = MeasurePixelSizeFromDataUri(href);
            return new ImportedImage(href, string.Empty, pixelSize);
        }

        if (Uri.TryCreate(href, UriKind.Absolute, out var absolute) && absolute.IsFile)
        {
            var path = absolute.LocalPath;
            return File.Exists(path) ? LoadFromFile(path) : null;
        }

        if (string.IsNullOrWhiteSpace(baseDirectory))
            return null;

        var resolved = Path.GetFullPath(Path.Combine(baseDirectory, href.Replace('/', Path.DirectorySeparatorChar)));
        return File.Exists(resolved) ? LoadFromFile(resolved) : null;
    }

    public static Bitmap? TryCreateBitmap(string? dataUri)
    {
        if (string.IsNullOrWhiteSpace(dataUri))
            return null;

        if (BitmapCache.TryGetValue(dataUri, out var cached))
            return cached;

        try
        {
            var bytes = DecodeDataUri(dataUri);
            if (bytes is null || bytes.Length == 0)
                return null;

            var bitmap = TryDecodeBitmap(bytes);
            if (bitmap is null)
                return null;

            BitmapCache[dataUri] = bitmap;
            return bitmap;
        }
        catch
        {
            return null;
        }
    }

    public static void ClearCache() => BitmapCache.Clear();

    public static RectangleF CreateDefaultBounds(
        PointF location,
        SizeF pixelSize,
        SizeF? canvasSize = null,
        bool centerOnLocation = false)
    {
        const float MinLongSide = 96f;
        const float MaxCanvasFraction = 0.5f;
        const float TargetCanvasFraction = 0.4f;
        const float MaxUpscale = 4f;

        var width = pixelSize.Width;
        var height = pixelSize.Height;
        if (width <= 0f || height <= 0f)
        {
            width = 128f;
            height = 128f;
        }

        var canvas = canvasSize ?? new SizeF(800f, 800f);
        var canvasMin = Math.Max(1f, Math.Min(canvas.Width, canvas.Height));
        var targetLongSide = Math.Clamp(
            canvasMin * TargetCanvasFraction,
            MinLongSide,
            canvasMin * MaxCanvasFraction);

        var longSide = Math.Max(width, height);
        var scale = targetLongSide / longSide;
        scale = Math.Clamp(scale, MinLongSide / Math.Min(width, height), MaxUpscale);
        scale = Math.Min(scale, (canvasMin * MaxCanvasFraction) / longSide);

        var displayWidth = width * scale;
        var displayHeight = height * scale;

        var x = centerOnLocation ? location.X - displayWidth / 2f : location.X;
        var y = centerOnLocation ? location.Y - displayHeight / 2f : location.Y;
        return new RectangleF(x, y, displayWidth, displayHeight);
    }

    private static SizeF MeasurePixelSize(byte[] bytes)
    {
        try
        {
            var info = SixLabors.ImageSharp.Image.Identify(bytes);
            if (info is not null)
                return new SizeF(info.Width, info.Height);
        }
        catch
        {
            // Fall back to GDI+ for formats such as AVIF on Windows.
        }

        using var bitmap = TryDecodeBitmap(bytes);
        return bitmap is null ? new SizeF(128f, 128f) : new SizeF(bitmap.Width, bitmap.Height);
    }

    private static Bitmap? TryDecodeBitmap(byte[] bytes)
    {
        try
        {
            using var input = new MemoryStream(bytes);
            using var image = SixLabors.ImageSharp.Image.Load(input);
            using var output = new MemoryStream();
            image.Save(output, new PngEncoder());
            output.Position = 0;
            return new Bitmap(output);
        }
        catch
        {
            try
            {
                using var input = new MemoryStream(bytes);
                return new Bitmap(input);
            }
            catch
            {
                return null;
            }
        }
    }

    private static SizeF MeasurePixelSizeFromDataUri(string dataUri)
    {
        var bytes = DecodeDataUri(dataUri);
        return bytes is null ? new SizeF(128f, 128f) : MeasurePixelSize(bytes);
    }

    private static byte[]? DecodeDataUri(string dataUri)
    {
        var commaIndex = dataUri.IndexOf(',');
        if (commaIndex < 0)
            return null;

        var metadata = dataUri[..commaIndex];
        var payload = dataUri[(commaIndex + 1)..];
        if (metadata.Contains(";base64", StringComparison.OrdinalIgnoreCase))
            return Convert.FromBase64String(payload);

        return System.Text.Encoding.UTF8.GetBytes(Uri.UnescapeDataString(payload));
    }

    private static string GetMimeType(string path) =>
        Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".webp" => "image/webp",
            ".avif" => "image/avif",
            ".svg" => "image/svg+xml",
            _ => "application/octet-stream"
        };

    private static ImportedImage LoadSvgAsRasterImage(string path)
    {
        var document = SvgDocumentSerializer.Load(path);
        var scale = 1f;
        var maxDim = Math.Max(document.Width, document.Height);
        if (maxDim > MaxSvgRasterDimension)
            scale = MaxSvgRasterDimension / maxDim;

        using var bitmap = SvgImageExporter.RenderDocument(document, scale);
        using var output = new MemoryStream();
        bitmap.Save(output, ImageFormat.Png);
        var bytes = output.ToArray();
        var dataUri = $"data:image/png;base64,{Convert.ToBase64String(bytes)}";
        return new ImportedImage(dataUri, path, new SizeF(bitmap.Width, bitmap.Height));
    }
}
