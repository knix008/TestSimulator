using System.Globalization;
using System.Text;
using System.Drawing.Drawing2D;
using SVGEditorWinV10.Models;

namespace SVGEditorWinV10.Rendering;

public static class SvgShapeRenderer
{
    public static bool UsesBounds(SvgElementKind kind) =>
        kind is not SvgElementKind.Line and not SvgElementKind.Text and not SvgElementKind.Image and not SvgElementKind.Path;

    public static bool UsesBounds(EditorTool tool) =>
        tool is not EditorTool.Select
            and not EditorTool.Line
            and not EditorTool.Text
            and not EditorTool.Image
            and not EditorTool.Pen;

    public static SvgElementKind ToolToKind(EditorTool tool) => tool switch
    {
        EditorTool.Rectangle => SvgElementKind.Rectangle,
        EditorTool.RoundedRectangle => SvgElementKind.RoundedRectangle,
        EditorTool.Ellipse => SvgElementKind.Ellipse,
        EditorTool.Triangle => SvgElementKind.Triangle,
        EditorTool.Diamond => SvgElementKind.Diamond,
        EditorTool.Hexagon => SvgElementKind.Hexagon,
        EditorTool.Parallelogram => SvgElementKind.Parallelogram,
        EditorTool.Star => SvgElementKind.Star,
        EditorTool.Line => SvgElementKind.Line,
        EditorTool.Text => SvgElementKind.Text,
        EditorTool.Image => SvgElementKind.Image,
        _ => SvgElementKind.Rectangle
    };

    public static float DefaultCornerRadius(RectangleF bounds) =>
        Math.Clamp(Math.Min(bounds.Width, bounds.Height) * 0.15f, 4f, 32f);

    public static bool HitTest(SvgElement element, PointF point)
    {
        if (element.Kind == SvgElementKind.Line)
            return SvgElementHitTest.DistanceToSegment(point, element.Start, element.End)
                <= Math.Max(6f, element.StrokeWidth + 4f);

        if (element.Kind == SvgElementKind.Text)
            return SvgTextRenderer.HitTest(element, point);

        if (element.Kind == SvgElementKind.Image)
            return SvgImageRenderer.HitTest(element, point);

        if (element.Kind == SvgElementKind.Path)
            return SvgPathRenderer.HitTest(element, point);

        using var path = CreatePath(element);
        return path.IsVisible(point);
    }

    public static void Draw(Graphics graphics, SvgElement element)
    {
        if (element.Kind == SvgElementKind.Line)
        {
            SvgStrokeRenderer.DrawLine(graphics, element);
            return;
        }

        if (element.Kind == SvgElementKind.Text)
        {
            SvgTextRenderer.Draw(graphics, element);
            return;
        }

        if (element.Kind == SvgElementKind.Image)
        {
            SvgImageRenderer.Draw(graphics, element);
            return;
        }

        if (element.Kind == SvgElementKind.Path)
        {
            SvgPathRenderer.Draw(graphics, element);
            return;
        }

        using var strokePen = SvgStrokeRenderer.CreatePen(element);
        using var fillBrush = SvgFillRenderer.CreateBrush(element);
        using var path = CreatePath(element);
        graphics.FillPath(fillBrush, path);
        graphics.DrawPath(strokePen, path);
    }

    public static void DrawPreview(
        Graphics graphics,
        SvgElementKind kind,
        RectangleF bounds,
        Color fill,
        FillPattern fillPattern,
        float fillOpacity,
        Color stroke,
        float strokeOpacity,
        float strokeWidth,
        StrokeLineStyle lineStyle)
    {
        using var pen = SvgStrokeRenderer.CreatePen(
            SvgColorHelper.WithOpacity(stroke.ToArgb(), strokeOpacity),
            strokeWidth,
            lineStyle);
        pen.DashStyle = DashStyle.Dash;
        using var brush = SvgFillRenderer.CreatePreviewBrush(fill, fillPattern, fillOpacity);
        var preview = new SvgElement
        {
            Kind = kind,
            Bounds = bounds,
            CornerRadius = kind == SvgElementKind.RoundedRectangle ? DefaultCornerRadius(bounds) : 0f,
            StrokeLineStyle = lineStyle,
            FillPattern = fillPattern
        };

        using var path = CreatePath(preview);
        graphics.FillPath(brush, path);
        graphics.DrawPath(pen, path);
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
        => SvgStrokeRenderer.DrawLinePreview(
            graphics,
            start,
            end,
            stroke,
            strokeOpacity,
            strokeWidth,
            lineStyle,
            startMarker,
            endMarker);

    public static GraphicsPath CreatePath(SvgElement element)
    {
        var path = new GraphicsPath();
        var rect = element.Bounds;
        var cx = rect.X + rect.Width / 2f;
        var cy = rect.Y + rect.Height / 2f;
        var rx = rect.Width / 2f;
        var ry = rect.Height / 2f;

        switch (element.Kind)
        {
            case SvgElementKind.Rectangle:
                path.AddRectangle(rect);
                break;
            case SvgElementKind.RoundedRectangle:
                path.AddPath(CreateRoundedRect(rect, element.CornerRadius > 0f
                    ? element.CornerRadius
                    : DefaultCornerRadius(rect)), false);
                break;
            case SvgElementKind.Ellipse:
                path.AddEllipse(rect);
                break;
            case SvgElementKind.Triangle:
                path.AddPolygon(
                [
                    new PointF(cx, rect.Y),
                    new PointF(rect.Right, rect.Bottom),
                    new PointF(rect.X, rect.Bottom)
                ]);
                break;
            case SvgElementKind.Diamond:
                path.AddPolygon(
                [
                    new PointF(cx, rect.Y),
                    new PointF(rect.Right, cy),
                    new PointF(cx, rect.Bottom),
                    new PointF(rect.X, cy)
                ]);
                break;
            case SvgElementKind.Parallelogram:
            {
                var offset = rect.Width * 0.2f;
                path.AddPolygon(
                [
                    new PointF(rect.X + offset, rect.Y),
                    new PointF(rect.Right, rect.Y),
                    new PointF(rect.Right - offset, rect.Bottom),
                    new PointF(rect.X, rect.Bottom)
                ]);
                break;
            }
            case SvgElementKind.Hexagon:
                path.AddPolygon(
                [
                    new PointF(rect.X + rect.Width * 0.25f, rect.Y),
                    new PointF(rect.X + rect.Width * 0.75f, rect.Y),
                    new PointF(rect.Right, cy),
                    new PointF(rect.X + rect.Width * 0.75f, rect.Bottom),
                    new PointF(rect.X + rect.Width * 0.25f, rect.Bottom),
                    new PointF(rect.X, cy)
                ]);
                break;
            case SvgElementKind.Star:
                path.AddPolygon(CreateStar(cx, cy, rx, ry, 5));
                break;
        }

        return path;
    }

    public static PointF[] GetPoints(SvgElement element)
    {
        using var path = CreatePath(element);
        return path.PathPoints;
    }

    public static void AppendSvg(StringBuilder sb, SvgElement element)
    {
        var strokeAttrs = SvgStrokeRenderer.GetStrokeAttributes(element);
        var markerAttrs = SvgStrokeRenderer.GetMarkerAttributes(element);
        var dataStyle = element.StrokeLineStyle != StrokeLineStyle.Solid
            ? $""" data-line-style="{element.StrokeLineStyle}" """
            : string.Empty;
        var fillAttrs = SvgFillRenderer.GetFillAttribute(element);

        switch (element.Kind)
        {
            case SvgElementKind.Rectangle:
            {
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""  <rect x="{element.Bounds.X:0.##}" y="{element.Bounds.Y:0.##}" width="{element.Bounds.Width:0.##}" height="{element.Bounds.Height:0.##}" {fillAttrs}{strokeAttrs}{dataStyle} />""");
                break;
            }
            case SvgElementKind.RoundedRectangle:
            {
                var radius = element.CornerRadius > 0f ? element.CornerRadius : DefaultCornerRadius(element.Bounds);
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""  <rect x="{element.Bounds.X:0.##}" y="{element.Bounds.Y:0.##}" width="{element.Bounds.Width:0.##}" height="{element.Bounds.Height:0.##}" rx="{radius:0.##}" ry="{radius:0.##}" {fillAttrs}{strokeAttrs}{dataStyle} data-kind="RoundedRectangle" />""");
                break;
            }
            case SvgElementKind.Ellipse:
            {
                var cx = element.Bounds.X + element.Bounds.Width / 2f;
                var cy = element.Bounds.Y + element.Bounds.Height / 2f;
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""  <ellipse cx="{cx:0.##}" cy="{cy:0.##}" rx="{element.Bounds.Width / 2f:0.##}" ry="{element.Bounds.Height / 2f:0.##}" {fillAttrs}{strokeAttrs}{dataStyle} />""");
                break;
            }
            case SvgElementKind.Line:
            {
                var startData = element.StartMarker != LineMarkerStyle.None
                    ? $""" data-start-marker="{element.StartMarker}" """
                    : string.Empty;
                var endData = element.EndMarker != LineMarkerStyle.None
                    ? $""" data-end-marker="{element.EndMarker}" """
                    : string.Empty;
                sb.AppendLine(CultureInfo.InvariantCulture,
                    $"""  <line x1="{element.Start.X:0.##}" y1="{element.Start.Y:0.##}" x2="{element.End.X:0.##}" y2="{element.End.Y:0.##}" {strokeAttrs}{markerAttrs}{dataStyle}{startData}{endData} />""");
                break;
            }
            case SvgElementKind.Text:
                SvgTextRenderer.AppendSvg(sb, element);
                break;
            case SvgElementKind.Image:
                SvgImageRenderer.AppendSvg(sb, element);
                break;
            case SvgElementKind.Path:
                SvgPathRenderer.AppendSvg(sb, element);
                break;
            default:
                AppendPolygon(sb, element, strokeAttrs, dataStyle);
                break;
        }
    }

    private static void AppendPolygon(StringBuilder sb, SvgElement element, string strokeAttrs, string dataStyle)
    {
        var fillAttrs = SvgFillRenderer.GetFillAttribute(element);
        var points = string.Join(" ", GetPoints(element).Select(p => $"{p.X:0.##},{p.Y:0.##}"));
        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""  <polygon points="{points}" {fillAttrs}{strokeAttrs}{dataStyle} data-kind="{element.Kind}" />""");
    }

    private static GraphicsPath CreateRoundedRect(RectangleF rect, float radius)
    {
        var path = new GraphicsPath();
        if (radius <= 0f)
        {
            path.AddRectangle(rect);
            return path;
        }

        radius = Math.Min(radius, Math.Min(rect.Width, rect.Height) / 2f);
        var diameter = radius * 2f;
        var arc = new RectangleF(rect.Location, new SizeF(diameter, diameter));
        path.AddArc(arc, 180, 90);
        arc.X = rect.Right - diameter;
        path.AddArc(arc, 270, 90);
        arc.Y = rect.Bottom - diameter;
        path.AddArc(arc, 0, 90);
        arc.X = rect.X;
        path.AddArc(arc, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static PointF[] CreateStar(float cx, float cy, float rx, float ry, int points)
    {
        var pts = new PointF[points * 2];
        var irx = rx * 0.4f;
        var iry = ry * 0.4f;
        const float startAngle = -MathF.PI / 2f;
        for (var i = 0; i < points; i++)
        {
            var outerAngle = startAngle + 2f * MathF.PI * i / points;
            var innerAngle = outerAngle + MathF.PI / points;
            pts[i * 2] = new PointF(cx + rx * MathF.Cos(outerAngle), cy + ry * MathF.Sin(outerAngle));
            pts[i * 2 + 1] = new PointF(cx + irx * MathF.Cos(innerAngle), cy + iry * MathF.Sin(innerAngle));
        }

        return pts;
    }

    private static string ColorToHex(Color color) =>
        color.A < 255
            ? $"#{color.A:X2}{color.R:X2}{color.G:X2}{color.B:X2}"
            : $"#{color.R:X2}{color.G:X2}{color.B:X2}";
}

internal static class SvgElementHitTest
{
    public static float DistanceToSegment(PointF point, PointF a, PointF b)
    {
        var dx = b.X - a.X;
        var dy = b.Y - a.Y;
        if (Math.Abs(dx) < 0.001f && Math.Abs(dy) < 0.001f)
            return Distance(point, a);

        var t = ((point.X - a.X) * dx + (point.Y - a.Y) * dy) / (dx * dx + dy * dy);
        t = Math.Clamp(t, 0f, 1f);
        var projection = new PointF(a.X + t * dx, a.Y + t * dy);
        return Distance(point, projection);
    }

    private static float Distance(PointF a, PointF b)
    {
        var dx = a.X - b.X;
        var dy = a.Y - b.Y;
        return MathF.Sqrt(dx * dx + dy * dy);
    }
}
