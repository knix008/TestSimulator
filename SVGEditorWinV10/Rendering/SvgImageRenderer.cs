using System.Drawing.Imaging;
using System.Globalization;
using System.Text;
using SVGEditorWinV10.Models;

namespace SVGEditorWinV10.Rendering;

public static class SvgImageRenderer
{
    public static bool HitTest(SvgElement element, PointF point)
    {
        var bounds = element.Bounds;
        bounds.Inflate(2f, 2f);
        return bounds.Contains(point);
    }

    public static void Draw(Graphics graphics, SvgElement element)
    {
        var bitmap = SvgImageAssetService.TryCreateBitmap(element.ImageDataUri);
        if (bitmap is null)
        {
            DrawPlaceholder(graphics, element.Bounds);
            return;
        }

        var bounds = element.Bounds;
        if (bounds.Width <= 0 || bounds.Height <= 0)
            return;

        var dest = Rectangle.Round(bounds);

        if (element.FillOpacity >= 0.999f)
        {
            graphics.DrawImage(bitmap, dest);
            return;
        }

        var colorMatrix = new ColorMatrix
        {
            Matrix33 = element.FillOpacity
        };
        using var attributes = new ImageAttributes();
        attributes.SetColorMatrix(colorMatrix, ColorMatrixFlag.Default, ColorAdjustType.Bitmap);
        graphics.DrawImage(bitmap, dest, 0, 0, bitmap.Width, bitmap.Height, GraphicsUnit.Pixel, attributes);
    }

    public static void DrawPreview(Graphics graphics, RectangleF bounds, string? dataUri, float opacity)
    {
        if (string.IsNullOrWhiteSpace(dataUri))
        {
            DrawPlaceholder(graphics, bounds);
            return;
        }

        var preview = new SvgElement
        {
            Kind = SvgElementKind.Image,
            Bounds = bounds,
            ImageDataUri = dataUri,
            FillOpacity = opacity
        };
        Draw(graphics, preview);
    }

    public static void AppendSvg(StringBuilder sb, SvgElement element)
    {
        if (string.IsNullOrWhiteSpace(element.ImageDataUri))
            return;

        var bounds = element.Bounds;
        var opacity = element.FillOpacity < 0.999f
            ? $""" opacity="{element.FillOpacity.ToString("0.##", CultureInfo.InvariantCulture)}" """
            : string.Empty;
        var dataOpacity = element.FillOpacity < 0.999f
            ? $""" data-fill-opacity="{element.FillOpacity.ToString("0.##", CultureInfo.InvariantCulture)}" """
            : string.Empty;
        var sourcePath = string.IsNullOrWhiteSpace(element.ImageSourcePath)
            ? string.Empty
            : $""" data-source-path="{EscapeXml(element.ImageSourcePath)}" """;
        var escapedHref = EscapeXml(element.ImageDataUri);

        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""  <image x="{bounds.X:0.##}" y="{bounds.Y:0.##}" width="{bounds.Width:0.##}" height="{bounds.Height:0.##}" href="{escapedHref}" xlink:href="{escapedHref}" preserveAspectRatio="none"{opacity}{dataOpacity}{sourcePath} data-kind="Image" />""");
    }

    private static void DrawPlaceholder(Graphics graphics, RectangleF bounds)
    {
        using var fill = new SolidBrush(Color.FromArgb(24, 107, 114, 128));
        using var border = new Pen(Color.FromArgb(140, 107, 114, 128), 1f) { DashStyle = System.Drawing.Drawing2D.DashStyle.Dash };
        graphics.FillRectangle(fill, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        graphics.DrawRectangle(border, bounds.X, bounds.Y, bounds.Width, bounds.Height);
    }

    private static string EscapeXml(string value) =>
        value
            .Replace("&", "&amp;", StringComparison.Ordinal)
            .Replace("\"", "&quot;", StringComparison.Ordinal)
            .Replace("<", "&lt;", StringComparison.Ordinal)
            .Replace(">", "&gt;", StringComparison.Ordinal);
}
