using System.Globalization;
using System.Text;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using SVGEditorWinV10.Models;
using SVGEditorWinV10.Ui;

namespace SVGEditorWinV10.Rendering;

public static class SvgTextRenderer
{
    public const string DefaultText = "텍스트";
    public const string DefaultFontName = "Segoe UI";
    public const float DefaultFontSize = 16f;
    public static readonly Color DefaultTextColor = Color.Black;

    public static Font CreateFont(SvgElement element) =>
        CreateFont(element.FontName, element.FontSize, element.FontBold, element.FontItalic, element.FontUnderline, element.FontStrikeout);

    public static Font CreateFont(string fontName, float fontSize, bool bold, bool italic, bool underline = false, bool strikeout = false)
    {
        var style = FontStyle.Regular;
        if (bold)
            style |= FontStyle.Bold;
        if (italic)
            style |= FontStyle.Italic;
        if (underline)
            style |= FontStyle.Underline;
        if (strikeout)
            style |= FontStyle.Strikeout;
        return new Font(fontName, Math.Max(6f, fontSize), style, GraphicsUnit.Point);
    }

    public static StringFormat CreateStringFormat() =>
        new(StringFormatFlags.NoClip)
        {
            Alignment = StringAlignment.Near,
            LineAlignment = StringAlignment.Near,
            Trimming = StringTrimming.None
        };

    public static SizeF MeasureText(SvgElement element, float? maxWidth = null)
    {
        using var font = CreateFont(element);
        using var format = CreateStringFormat();
        using var bitmap = new Bitmap(1, 1);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
        var width = maxWidth ?? Math.Max(32f, element.Bounds.Width);
        return graphics.MeasureString(element.TextContent, font, (int)Math.Ceiling(width), format);
    }

    public static RectangleF GetTextBounds(SvgElement element) =>
        new(
            element.Bounds.X,
            element.Bounds.Y,
            Math.Max(8f, element.Bounds.Width),
            Math.Max(8f, element.Bounds.Height));

    public static void UpdateTextBounds(SvgElement element)
    {
        if (element.Kind != SvgElementKind.Text || element.TextBoundsManuallySized)
            return;

        var width = Math.Max(8f, element.Bounds.Width);
        var measured = MeasureText(element, width);
        element.Bounds = new RectangleF(
            element.Bounds.X,
            element.Bounds.Y,
            width,
            Math.Max(8f, Math.Max(element.Bounds.Height, measured.Height)));
    }

    public static RectangleF CreateBoundsAtPoint(PointF location, SvgElement template)
    {
        var element = template.Clone();
        element.Bounds = new RectangleF(location.X, location.Y, 1f, 1f);
        UpdateTextBounds(element);
        return element.Bounds;
    }

    public static bool HitTest(SvgElement element, PointF point)
    {
        var bounds = GetTextBounds(element);
        bounds.Inflate(4f, 4f);
        return bounds.Contains(point);
    }

    public static void Draw(Graphics graphics, SvgElement element)
    {
        using var font = CreateFont(element);
        using var brush = new SolidBrush(SvgColorHelper.WithOpacity(element.FillColorArgb, element.FillOpacity));
        using var format = CreateStringFormat();
        var bounds = GetTextBounds(element);
        graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
        graphics.SetClip(bounds);
        try
        {
            graphics.DrawString(element.TextContent, font, brush, bounds, format);
        }
        finally
        {
            graphics.ResetClip();
        }
    }

    public static void DrawPreview(
        Graphics graphics,
        RectangleF bounds,
        string text,
        string fontName,
        float fontSize,
        bool bold,
        bool italic,
        bool underline,
        bool strikeout,
        Color color,
        float opacity)
    {
        var preview = new SvgElement
        {
            Kind = SvgElementKind.Text,
            Bounds = bounds,
            TextContent = text,
            FontName = fontName,
            FontSize = fontSize,
            FontBold = bold,
            FontItalic = italic,
            FontUnderline = underline,
            FontStrikeout = strikeout,
            FillColorArgb = SvgColorHelper.ToOpaqueArgb(color),
            FillOpacity = opacity
        };
        using var pen = new Pen(Color.FromArgb(120, ModernTheme.Accent), 1f) { DashStyle = DashStyle.Dash };
        graphics.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        Draw(graphics, preview);
    }

    public static void AppendSvg(StringBuilder sb, SvgElement element)
    {
        var bounds = element.Bounds;
        var fill = SvgColorHelper.GetRgbColor(element.FillColorArgb);
        var fillHex = ColorToHex(fill);
        var opacity = SvgColorHelper.GetOpacityAttribute("fill-opacity", element.FillOpacity);
        var dataOpacity = element.FillOpacity < 0.999f
            ? $""" data-fill-opacity="{element.FillOpacity.ToString("0.##", CultureInfo.InvariantCulture)}" """
            : string.Empty;
        var weight = element.FontBold ? " font-weight=\"bold\"" : string.Empty;
        var style = element.FontItalic ? " font-style=\"italic\"" : string.Empty;
        var decoration = GetTextDecoration(element);
        var dataBold = element.FontBold ? " data-font-bold=\"true\"" : string.Empty;
        var dataItalic = element.FontItalic ? " data-font-italic=\"true\"" : string.Empty;
        var dataUnderline = element.FontUnderline ? " data-font-underline=\"true\"" : string.Empty;
        var dataStrikeout = element.FontStrikeout ? " data-font-strikeout=\"true\"" : string.Empty;
        var dataManualBounds = element.TextBoundsManuallySized ? " data-bounds-manual=\"true\"" : string.Empty;
        var escaped = EscapeXml(element.TextContent);

        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""  <text x="{bounds.X:0.##}" y="{bounds.Y:0.##}" dominant-baseline="text-before-edge" font-family="{EscapeXml(element.FontName)}" font-size="{element.FontSize:0.##}"{weight}{style}{decoration}{dataBold}{dataItalic}{dataUnderline}{dataStrikeout} fill="{fillHex}"{opacity}{dataOpacity} data-kind="Text" data-bounds-width="{bounds.Width:0.##}" data-bounds-height="{bounds.Height:0.##}"{dataManualBounds}>{escaped}</text>""");
    }

    public static void ApplyParsedAttributes(SvgElement element, string? textContent, string? fontFamily, string? fontSize, string? fontWeight, string? fontStyle, string? textDecoration, string? dataFontBold, string? dataFontItalic, string? dataFontUnderline, string? dataFontStrikeout, string? x, string? y, string? boundsWidth, string? boundsHeight, string? dataBoundsManual)
    {
        element.TextContent = string.IsNullOrEmpty(textContent) ? DefaultText : textContent;
        element.FontName = string.IsNullOrWhiteSpace(fontFamily) ? DefaultFontName : fontFamily;
        element.FontSize = ParseLength(fontSize, DefaultFontSize);
        element.FontBold = string.Equals(fontWeight, "bold", StringComparison.OrdinalIgnoreCase)
            || string.Equals(dataFontBold, "true", StringComparison.OrdinalIgnoreCase);
        element.FontItalic = string.Equals(fontStyle, "italic", StringComparison.OrdinalIgnoreCase)
            || string.Equals(dataFontItalic, "true", StringComparison.OrdinalIgnoreCase);
        element.FontUnderline = HasDecoration(textDecoration, "underline")
            || string.Equals(dataFontUnderline, "true", StringComparison.OrdinalIgnoreCase);
        element.FontStrikeout = HasDecoration(textDecoration, "line-through")
            || string.Equals(dataFontStrikeout, "true", StringComparison.OrdinalIgnoreCase);

        var px = ParseLength(x, 0f);
        var py = ParseLength(y, 0f);
        var width = ParseLength(boundsWidth, 0f);
        var height = ParseLength(boundsHeight, 0f);
        var hasExplicitBounds = width > 0f && height > 0f;
        element.Bounds = hasExplicitBounds
            ? new RectangleF(px, py, width, height)
            : new RectangleF(px, py, 1f, 1f);
        element.TextBoundsManuallySized = string.Equals(dataBoundsManual, "true", StringComparison.OrdinalIgnoreCase)
            || hasExplicitBounds;

        if (!element.TextBoundsManuallySized)
            UpdateTextBounds(element);
    }

    private static float ParseLength(string? value, float fallback)
    {
        if (string.IsNullOrWhiteSpace(value))
            return fallback;

        value = value.Trim().TrimEnd('p', 'x', 't', 'c', 'm');
        return float.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : fallback;
    }

    private static string GetTextDecoration(SvgElement element)
    {
        if (!element.FontUnderline && !element.FontStrikeout)
            return string.Empty;

        var values = new List<string>();
        if (element.FontUnderline)
            values.Add("underline");
        if (element.FontStrikeout)
            values.Add("line-through");

        return $""" text-decoration="{string.Join(" ", values)}" """;
    }

    private static bool HasDecoration(string? value, string decoration) =>
        !string.IsNullOrWhiteSpace(value)
        && value.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(part => string.Equals(part, decoration, StringComparison.OrdinalIgnoreCase));

    private static string EscapeXml(string value) =>
        value
            .Replace("&", "&amp;", StringComparison.Ordinal)
            .Replace("<", "&lt;", StringComparison.Ordinal)
            .Replace(">", "&gt;", StringComparison.Ordinal);

    private static string ColorToHex(Color color) =>
        color.A < 255
            ? $"#{color.A:X2}{color.R:X2}{color.G:X2}{color.B:X2}"
            : $"#{color.R:X2}{color.G:X2}{color.B:X2}";
}
