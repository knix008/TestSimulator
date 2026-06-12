using System.Globalization;
using System.Text;
using System.Drawing.Drawing2D;
using SVGEditorWinV10.Models;

namespace SVGEditorWinV10.Rendering;

public static class SvgStrokeRenderer
{
    public static Pen CreatePen(SvgElement element)
    {
        var pen = new Pen(SvgColorHelper.WithOpacity(element.StrokeColorArgb, element.StrokeOpacity), element.StrokeWidth);
        ApplyDashStyle(pen, element.StrokeLineStyle);
        pen.StartCap = LineCap.Round;
        pen.EndCap = LineCap.Round;
        pen.LineJoin = LineJoin.Round;
        return pen;
    }

    public static Pen CreatePen(Color color, float width, StrokeLineStyle style)
    {
        var pen = new Pen(color, width);
        ApplyDashStyle(pen, style);
        pen.StartCap = LineCap.Round;
        pen.EndCap = LineCap.Round;
        pen.LineJoin = LineJoin.Round;
        return pen;
    }

    public static void DrawLine(Graphics graphics, SvgElement element)
    {
        using var pen = CreatePen(element);
        graphics.DrawLine(pen, element.Start, element.End);
        DrawMarker(graphics, pen, element.End, element.Start, element.EndMarker);
        DrawMarker(graphics, pen, element.Start, element.End, element.StartMarker);
    }

    public static void DrawLinePreview(
        Graphics graphics,
        PointF start,
        PointF end,
        Color stroke,
        float strokeOpacity,
        float strokeWidth,
        StrokeLineStyle lineStyle,
        LineMarkerStyle startMarker,
        LineMarkerStyle endMarker)
    {
        using var pen = CreatePen(SvgColorHelper.WithOpacity(stroke.ToArgb(), strokeOpacity), strokeWidth, lineStyle);
        pen.DashStyle = DashStyle.Dash;
        graphics.DrawLine(pen, start, end);
        DrawMarker(graphics, pen, end, start, endMarker);
        DrawMarker(graphics, pen, start, end, startMarker);
    }

    public static string GetStrokeAttributes(SvgElement element)
    {
        var stroke = ColorToHex(SvgColorHelper.GetRgbColor(element.StrokeColorArgb));
        var width = element.StrokeWidth.ToString("0.##", CultureInfo.InvariantCulture);
        var dash = GetDashArrayAttribute(element.StrokeLineStyle);
        var opacity = SvgColorHelper.GetOpacityAttribute("stroke-opacity", element.StrokeOpacity);
        var dataOpacity = element.StrokeOpacity < 0.999f
            ? $""" data-stroke-opacity="{element.StrokeOpacity.ToString("0.##", CultureInfo.InvariantCulture)}" """
            : string.Empty;
        return $"""stroke="{stroke}" stroke-width="{width}"{dash}{opacity}{dataOpacity}""";
    }

    public static string GetMarkerAttributes(SvgElement element)
    {
        if (element.Kind != SvgElementKind.Line)
            return string.Empty;

        var attrs = new StringBuilder();
        if (element.StartMarker != LineMarkerStyle.None)
            attrs.Append(CultureInfo.InvariantCulture, $" marker-start=\"url(#{GetMarkerId(element.StartMarker)})\"");
        if (element.EndMarker != LineMarkerStyle.None)
            attrs.Append(CultureInfo.InvariantCulture, $" marker-end=\"url(#{GetMarkerId(element.EndMarker)})\"");
        return attrs.ToString();
    }

    public static void AppendMarkerDefinitions(StringBuilder sb, IEnumerable<SvgElement> elements)
    {
        var needed = new HashSet<LineMarkerStyle>();
        foreach (var element in elements)
        {
            if (element.StartMarker != LineMarkerStyle.None)
                needed.Add(element.StartMarker);
            if (element.EndMarker != LineMarkerStyle.None)
                needed.Add(element.EndMarker);
        }

        if (needed.Count == 0)
            return;

        sb.AppendLine("  <defs>");
        foreach (var marker in needed.OrderBy(m => m.ToString()))
            AppendMarkerDefinition(sb, marker);
        sb.AppendLine("  </defs>");
    }

    public static StrokeLineStyle ParseDashArray(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return StrokeLineStyle.Solid;

        var normalized = value.Replace(" ", ",");
        return normalized switch
        {
            "5,5" => StrokeLineStyle.Dash,
            "2,2" => StrokeLineStyle.Dot,
            "8,4,2,4" => StrokeLineStyle.DashDot,
            "12,4" => StrokeLineStyle.LongDash,
            "3,3" => StrokeLineStyle.ShortDash,
            _ => StrokeLineStyle.Dash
        };
    }

    public static LineMarkerStyle ParseMarkerUrl(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return LineMarkerStyle.None;

        var id = value.Trim();
        if (id.StartsWith("url(#", StringComparison.OrdinalIgnoreCase) && id.EndsWith(')'))
            id = id[5..^1];

        if (id.StartsWith("marker-", StringComparison.OrdinalIgnoreCase))
            id = id["marker-".Length..];

        return id.ToLowerInvariant() switch
        {
            "arrow-open" => LineMarkerStyle.ArrowOpen,
            "arrow-filled" => LineMarkerStyle.ArrowFilled,
            "circle" => LineMarkerStyle.Circle,
            "diamond" => LineMarkerStyle.Diamond,
            "square" => LineMarkerStyle.Square,
            "cross" => LineMarkerStyle.Cross,
            _ => Enum.TryParse(id, true, out LineMarkerStyle parsed) ? parsed : LineMarkerStyle.None
        };
    }

    public static string GetMarkerId(LineMarkerStyle marker) => marker switch
    {
        LineMarkerStyle.ArrowOpen => "marker-arrow-open",
        LineMarkerStyle.ArrowFilled => "marker-arrow-filled",
        LineMarkerStyle.Circle => "marker-circle",
        LineMarkerStyle.Diamond => "marker-diamond",
        LineMarkerStyle.Square => "marker-square",
        LineMarkerStyle.Cross => "marker-cross",
        _ => "marker-none"
    };

    private static void ApplyDashStyle(Pen pen, StrokeLineStyle style)
    {
        pen.DashStyle = style switch
        {
            StrokeLineStyle.Dash => DashStyle.Dash,
            StrokeLineStyle.Dot => DashStyle.Dot,
            StrokeLineStyle.DashDot => DashStyle.DashDot,
            StrokeLineStyle.LongDash or StrokeLineStyle.ShortDash => DashStyle.Custom,
            _ => DashStyle.Solid
        };

        if (style == StrokeLineStyle.LongDash)
            pen.DashPattern = [12f, 4f];
        else if (style == StrokeLineStyle.ShortDash)
            pen.DashPattern = [3f, 3f];
    }

    private static string GetDashArrayAttribute(StrokeLineStyle style)
    {
        var dash = style switch
        {
            StrokeLineStyle.Dash => "5,5",
            StrokeLineStyle.Dot => "2,2",
            StrokeLineStyle.DashDot => "8,4,2,4",
            StrokeLineStyle.LongDash => "12,4",
            StrokeLineStyle.ShortDash => "3,3",
            _ => null
        };

        return dash is null ? string.Empty : $""" stroke-dasharray="{dash}" """;
    }

    private static void DrawMarker(Graphics graphics, Pen pen, PointF tip, PointF from, LineMarkerStyle style)
    {
        if (style == LineMarkerStyle.None)
            return;

        var angle = MathF.Atan2(tip.Y - from.Y, tip.X - from.X);
        var cos = MathF.Cos(angle);
        var sin = MathF.Sin(angle);
        const float size = 11f;

        switch (style)
        {
            case LineMarkerStyle.ArrowOpen:
            {
                var spread = MathF.PI / 6f;
                graphics.DrawLine(pen, tip, new PointF(tip.X - size * MathF.Cos(angle - spread), tip.Y - size * MathF.Sin(angle - spread)));
                graphics.DrawLine(pen, tip, new PointF(tip.X - size * MathF.Cos(angle + spread), tip.Y - size * MathF.Sin(angle + spread)));
                break;
            }
            case LineMarkerStyle.ArrowFilled:
            {
                var spread = MathF.PI / 7f;
                var points = new[]
                {
                    tip,
                    new PointF(tip.X - size * MathF.Cos(angle - spread), tip.Y - size * MathF.Sin(angle - spread)),
                    new PointF(tip.X - size * MathF.Cos(angle + spread), tip.Y - size * MathF.Sin(angle + spread))
                };
                using var brush = new SolidBrush(pen.Color);
                graphics.FillPolygon(brush, points);
                break;
            }
            case LineMarkerStyle.Diamond:
            {
                var half = size * 0.45f;
                var points = new[]
                {
                    tip,
                    new PointF(tip.X - half * cos + half * (-sin), tip.Y - half * sin + half * cos),
                    new PointF(tip.X - size * cos, tip.Y - size * sin),
                    new PointF(tip.X - half * cos - half * (-sin), tip.Y - half * sin - half * cos)
                };
                using var brush = new SolidBrush(pen.Color);
                graphics.FillPolygon(brush, points);
                graphics.DrawPolygon(pen, points);
                break;
            }
            case LineMarkerStyle.Circle:
            {
                var radius = size * 0.38f;
                var center = new PointF(tip.X - radius * cos, tip.Y - radius * sin);
                using var brush = new SolidBrush(pen.Color);
                graphics.FillEllipse(brush, center.X - radius, center.Y - radius, radius * 2f, radius * 2f);
                break;
            }
            case LineMarkerStyle.Square:
            {
                var half = size * 0.35f;
                var points = new[]
                {
                    new PointF(tip.X + half * (-sin), tip.Y + half * cos),
                    new PointF(tip.X - half * (-sin), tip.Y - half * cos),
                    new PointF(tip.X - size * cos - half * (-sin), tip.Y - size * sin - half * cos),
                    new PointF(tip.X - size * cos + half * (-sin), tip.Y - size * sin + half * cos)
                };
                using var brush = new SolidBrush(pen.Color);
                graphics.FillPolygon(brush, points);
                graphics.DrawPolygon(pen, points);
                break;
            }
            case LineMarkerStyle.Cross:
            {
                var half = size * 0.5f;
                graphics.DrawLine(
                    pen,
                    new PointF(tip.X + half * (-sin), tip.Y + half * cos),
                    new PointF(tip.X - half * (-sin), tip.Y - half * cos));
                break;
            }
        }
    }

    private static void AppendMarkerDefinition(StringBuilder sb, LineMarkerStyle marker)
    {
        var id = GetMarkerId(marker);
        var path = marker switch
        {
            LineMarkerStyle.ArrowOpen => "M0,0 L10,3 L0,6",
            LineMarkerStyle.ArrowFilled => "M0,0 L10,3 L0,6 Z",
            LineMarkerStyle.Circle => "M0,3 m-3,0 a3,3 0 1,0 6,0 a3,3 0 1,0 -6,0",
            LineMarkerStyle.Diamond => "M0,0 L3,3 L0,6 L-3,3 Z",
            LineMarkerStyle.Square => "M-3,-3 L3,-3 L3,3 L-3,3 Z",
            LineMarkerStyle.Cross => "M-3,0 L3,0 M0,-3 L0,3",
            _ => string.Empty
        };

        if (string.IsNullOrEmpty(path))
            return;

        var fill = marker is LineMarkerStyle.ArrowOpen or LineMarkerStyle.Cross ? "none" : "context-stroke";
        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""  <marker id="{id}" viewBox="0 0 10 6" refX="9" refY="3" markerWidth="8" markerHeight="6" orient="auto" markerUnits="strokeWidth">""");
        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""    <path d="{path}" fill="{fill}" stroke="context-stroke" stroke-width="1" />""");
        sb.AppendLine("  </marker>");
    }

    private static string ColorToHex(Color color) =>
        color.A < 255
            ? $"#{color.A:X2}{color.R:X2}{color.G:X2}{color.B:X2}"
            : $"#{color.R:X2}{color.G:X2}{color.B:X2}";
}
