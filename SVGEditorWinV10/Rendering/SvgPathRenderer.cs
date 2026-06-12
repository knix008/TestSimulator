using System.Drawing.Drawing2D;
using System.Globalization;
using System.Text;
using SVGEditorWinV10.Models;
using SVGEditorWinV10.Serialization;

namespace SVGEditorWinV10.Rendering;

public static class SvgPathRenderer
{
    public static RectangleF GetBounds(SvgElement element)
    {
        if (string.IsNullOrWhiteSpace(element.PathData))
            return element.Bounds;

        return SvgPathParser.GetBounds(element.PathData);
    }

    public static bool HitTest(SvgElement element, PointF point)
    {
        if (string.IsNullOrWhiteSpace(element.PathData))
            return element.Bounds.Contains(point);

        using var path = CreatePath(element);
        if (element.FillOpacity > 0.001f && path.IsVisible(point))
            return true;

        using var pen = new Pen(Color.Black, Math.Max(6f, element.StrokeWidth + 4f));
        return path.IsOutlineVisible(point, pen);
    }

    public static void DrawPreview(
        Graphics graphics,
        SvgElement element,
        bool showClosedFill = false)
    {
        if (string.IsNullOrWhiteSpace(element.PathData))
            return;

        using var path = CreatePath(element);
        if (showClosedFill && element.FillOpacity > 0.001f)
        {
            using var fillBrush = SvgFillRenderer.CreatePreviewBrush(element.FillColor, element.FillPattern, element.FillOpacity);
            graphics.FillPath(fillBrush, path);
        }

        using var strokePen = SvgStrokeRenderer.CreatePen(
            SvgColorHelper.WithOpacity(element.StrokeColorArgb, element.StrokeOpacity),
            element.StrokeWidth,
            element.StrokeLineStyle);
        strokePen.DashStyle = DashStyle.Dash;
        graphics.DrawPath(strokePen, path);
    }

    public static void Draw(Graphics graphics, SvgElement element)
    {
        if (string.IsNullOrWhiteSpace(element.PathData))
            return;

        using var strokePen = SvgStrokeRenderer.CreatePen(element);
        using var fillBrush = SvgFillRenderer.CreateBrush(element);
        using var path = CreatePath(element);
        if (element.FillOpacity > 0.001f)
            graphics.FillPath(fillBrush, path);
        graphics.DrawPath(strokePen, path);
    }

    private static GraphicsPath CreatePath(SvgElement element) =>
        SvgPathParser.CreatePath(element.PathData, ToFillMode(element.FillRule));

    private static FillMode ToFillMode(SvgFillRule fillRule) =>
        fillRule == SvgFillRule.EvenOdd ? FillMode.Alternate : FillMode.Winding;

    public static void AppendSvg(StringBuilder sb, SvgElement element)
    {
        if (string.IsNullOrWhiteSpace(element.PathData))
            return;

        var strokeAttrs = SvgStrokeRenderer.GetStrokeAttributes(element);
        var fillAttrs = SvgFillRenderer.GetFillAttribute(element);
        var dataStyle = element.StrokeLineStyle != StrokeLineStyle.Solid
            ? $""" data-line-style="{element.StrokeLineStyle}" """
            : string.Empty;
        var fillRuleAttr = element.FillRule == SvgFillRule.EvenOdd
            ? """ fill-rule="evenodd" """
            : string.Empty;
        var escaped = EscapeXml(element.PathData);

        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""  <path d="{escaped}" {fillAttrs}{strokeAttrs}{fillRuleAttr}{dataStyle} data-kind="Path" />""");
    }

    private static string EscapeXml(string value) =>
        value
            .Replace("&", "&amp;", StringComparison.Ordinal)
            .Replace("\"", "&quot;", StringComparison.Ordinal)
            .Replace("<", "&lt;", StringComparison.Ordinal)
            .Replace(">", "&gt;", StringComparison.Ordinal);
}
