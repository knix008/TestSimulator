using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Globalization;
using System.Text;
using SVGEditorWinV10.Models;
using SVGEditorWinV10.Ui;

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

    public static void DrawPreview(Graphics graphics, RectangleF bounds, string? dataUri, float opacity) =>
        DrawSilhouettePreview(graphics, bounds, dataUri, opacity);

    public static void DrawSilhouettePreview(Graphics graphics, RectangleF bounds, string? dataUri, float opacity)
    {
        if (bounds.Width <= 0f && bounds.Height <= 0f)
            return;

        var drawBounds = bounds;
        if (drawBounds.Width <= 0f)
            drawBounds.Width = 1f;
        if (drawBounds.Height <= 0f)
            drawBounds.Height = 1f;

        var bitmap = SvgImageAssetService.TryCreateBitmap(dataUri);
        if (bitmap is not null)
        {
            var previewOpacity = Math.Clamp(opacity * 0.55f, 0.15f, 0.85f);
            var colorMatrix = new ColorMatrix { Matrix33 = previewOpacity };
            using var attributes = new ImageAttributes();
            attributes.SetColorMatrix(colorMatrix, ColorMatrixFlag.Default, ColorAdjustType.Bitmap);
            var dest = Rectangle.Round(drawBounds);
            graphics.DrawImage(bitmap, dest, 0, 0, bitmap.Width, bitmap.Height, GraphicsUnit.Pixel, attributes);
        }
        else
        {
            using var fill = new SolidBrush(Color.FromArgb(36, 107, 114, 128));
            graphics.FillRectangle(fill, drawBounds);
        }

        using var pen = new Pen(Color.FromArgb(140, ModernTheme.Accent), 1f)
        {
            DashStyle = DashStyle.Dash
        };
        graphics.DrawRectangle(pen, drawBounds.X, drawBounds.Y, drawBounds.Width, drawBounds.Height);
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
            $"""  <image x="{bounds.X:0.##}" y="{bounds.Y:0.##}" width="{bounds.Width:0.##}" height="{bounds.Height:0.##}" href="{escapedHref}" preserveAspectRatio="none"{opacity}{dataOpacity}{sourcePath} />""");
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
