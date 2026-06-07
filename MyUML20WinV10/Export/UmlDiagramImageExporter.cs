using System.Drawing.Imaging;
using MyUML20WinV10.Models;
using MyUML20WinV10.Rendering;

namespace MyUML20WinV10.Export;

public static class UmlDiagramImageExporter
{
    public const string FileFilter = "PNG 이미지 (*.png)|*.png|JPEG 이미지 (*.jpg;*.jpeg)|*.jpg;*.jpeg|BMP 이미지 (*.bmp)|*.bmp";

    public static void Export(UmlProject project, UmlDiagram diagram, string path, UmlImageFormat format, UmlImageExportOptions options)
    {
        var imageFormat = ToImageFormat(format);
        var useTransparency = options.TransparentBackground && options.SupportsTransparency(format);
        using var bitmap = RenderBitmap(project, diagram, options, useTransparency);
        bitmap.Save(path, imageFormat);
    }

    public static byte[] ExportToBytes(UmlProject project, UmlDiagram diagram, UmlImageFormat format, UmlImageExportOptions options)
    {
        var useTransparency = options.TransparentBackground && options.SupportsTransparency(format);
        using var bitmap = RenderBitmap(project, diagram, options, useTransparency);
        using var stream = new MemoryStream();
        bitmap.Save(stream, ToImageFormat(format));
        return stream.ToArray();
    }

    public static Bitmap RenderBitmap(UmlProject project, UmlDiagram diagram, UmlImageExportOptions options, bool useTransparency)
    {
        var bounds = UmlDiagramLayout.CalculateBounds(project, diagram);
        if (bounds.Width <= 0 || bounds.Height <= 0)
            bounds = new RectangleF(0, 0, 800, 600);

        var width = Math.Max(1, (int)Math.Ceiling(bounds.Width + options.Padding * 2));
        var height = Math.Max(1, (int)Math.Ceiling(bounds.Height + options.Padding * 2));
        var pixelFormat = useTransparency ? PixelFormat.Format32bppArgb : PixelFormat.Format24bppRgb;
        var bitmap = new Bitmap(width, height, pixelFormat);

        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        graphics.Clear(useTransparency ? Color.Transparent : options.BackgroundColor);

        graphics.TranslateTransform(options.Padding - bounds.Left, options.Padding - bounds.Top);
        UmlDiagramRenderer.DrawDiagram(graphics, project, diagram, selectedNode: null, selectedEdge: null);
        graphics.ResetTransform();

        return bitmap;
    }

    public static UmlImageFormat ParseImageFormat(string extension) => extension.ToLowerInvariant() switch
    {
        ".jpg" or ".jpeg" => UmlImageFormat.Jpeg,
        ".bmp" => UmlImageFormat.Bmp,
        _ => UmlImageFormat.Png,
    };

    public static string GetExtension(UmlImageFormat format) => format switch
    {
        UmlImageFormat.Jpeg => ".jpg",
        UmlImageFormat.Bmp => ".bmp",
        _ => ".png",
    };

    private static ImageFormat ToImageFormat(UmlImageFormat format) => format switch
    {
        UmlImageFormat.Jpeg => ImageFormat.Jpeg,
        UmlImageFormat.Bmp => ImageFormat.Bmp,
        _ => ImageFormat.Png,
    };
}
