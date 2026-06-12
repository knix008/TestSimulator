using System.Drawing.Imaging;
using System.Drawing.Text;
using NeoSolve.ImageSharp.AVIF;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Webp;
using SVGEditorWinV10.Models;
using SVGEditorWinV10.Rendering;

namespace SVGEditorWinV10.Export;

/// <summary>
/// Renders document content only. Editor alignment grid is intentionally excluded.
/// </summary>
public static class SvgImageExporter
{
    public const string FileFilter =
        "PNG (*.png)|*.png|JPEG (*.jpg;*.jpeg)|*.jpg;*.jpeg|GIF (*.gif)|*.gif|WebP (*.webp)|*.webp|AVIF (*.avif)|*.avif";

    public static ImageExportFormat GetFormatFromExtension(string path)
    {
        return Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => ImageExportFormat.Jpeg,
            ".gif" => ImageExportFormat.Gif,
            ".webp" => ImageExportFormat.Webp,
            ".avif" => ImageExportFormat.Avif,
            _ => ImageExportFormat.Png
        };
    }

    public static void Export(SvgDocument document, string path, ImageExportFormat format, float scale = 1f)
    {
        using var bitmap = RenderDocument(document, scale);
        SaveBitmap(bitmap, path, format);
    }

    public static Bitmap RenderDocument(SvgDocument document, float scale = 1f)
    {
        var width = Math.Max(1, (int)Math.Ceiling(document.Width * scale));
        var height = Math.Max(1, (int)Math.Ceiling(document.Height * scale));
        var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb);

        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
        graphics.Clear(System.Drawing.Color.FromArgb(document.BackgroundColorArgb));

        if (Math.Abs(scale - 1f) > 0.001f)
            graphics.ScaleTransform(scale, scale);

        foreach (var element in document.Elements)
            SvgShapeRenderer.Draw(graphics, element);

        return bitmap;
    }

    private static void SaveBitmap(Bitmap bitmap, string path, ImageExportFormat format)
    {
        using var pngStream = new MemoryStream();
        bitmap.Save(pngStream, ImageFormat.Png);
        pngStream.Position = 0;

        using var image = SixLabors.ImageSharp.Image.Load(pngStream);
        switch (format)
        {
            case ImageExportFormat.Jpeg:
                image.SaveAsJpeg(path, new JpegEncoder { Quality = 92 });
                break;
            case ImageExportFormat.Gif:
                image.SaveAsGif(path);
                break;
            case ImageExportFormat.Webp:
                image.SaveAsWebp(path, new WebpEncoder { Quality = 90 });
                break;
            case ImageExportFormat.Avif:
                image.Save(path, new AVIFEncoder { CQLevel = 25 });
                break;
            default:
                image.SaveAsPng(path);
                break;
        }
    }
}
