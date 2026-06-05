using System.Globalization;
using System.Text;
using MyDiagramWinV10.Models;
using MyDiagramWinV10.Rendering;

namespace MyDiagramWinV10.Export;

public static class DiagramSvgExporter
{
    public const string FileFilter = "SVG 이미지 (*.svg)|*.svg";

    public static void Export(DiagramProject project, string path)
    {
        var bounds = DiagramExporter.CalculateBounds(project);
        if (bounds.Width <= 0 || bounds.Height <= 0)
            bounds = new RectangleF(0, 0, 800, 600);

        const float padding = 40f;
        var width = bounds.Width + padding * 2;
        var height = bounds.Height + padding * 2;
        var offset = new PointF(padding - bounds.Left, padding - bounds.Top);
        var backColor = ColorToHex(Color.FromArgb(project.CanvasBackColorArgb));

        var sb = new StringBuilder();
        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""<svg xmlns="http://www.w3.org/2000/svg" width="{width:0.##}" height="{height:0.##}" viewBox="0 0 {width:0.##} {height:0.##}">""");
        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""  <rect x="0" y="0" width="{width:0.##}" height="{height:0.##}" fill="{backColor}" />""");

        foreach (var connector in project.Connectors)
        {
            var source = project.Shapes.FirstOrDefault(s => s.Id == connector.SourceShapeId);
            var target = project.Shapes.FirstOrDefault(s => s.Id == connector.TargetShapeId);
            if (source is null || target is null)
                continue;

            AppendConnector(sb, connector, source, target, offset);
        }

        foreach (var shape in project.Shapes)
            AppendShape(sb, shape, offset);

        sb.AppendLine("</svg>");
        File.WriteAllText(path, sb.ToString(), Encoding.UTF8);
    }

    private static void AppendShape(StringBuilder sb, DiagramShape shape, PointF offset)
    {
        var rect = OffsetRect(shape.Bounds, offset);
        var fill = ColorToHex(Color.FromArgb(shape.FillColorArgb));
        var stroke = ColorToHex(Color.FromArgb(shape.BorderColorArgb));
        var dash = DashArray(shape.BorderStyle);
        var path = ShapePathData(shape.Kind, rect);

        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""  <path d="{path}" fill="{fill}" stroke="{stroke}" stroke-width="{shape.BorderWidth:0.##}"{dash} />""");

        var image = DiagramRenderer.LoadShapeImage(shape);
        if (image is not null)
        {
            var imageRect = rect;
            if (!string.IsNullOrWhiteSpace(shape.Text))
                imageRect.Height = rect.Height * 0.55f;

            var drawRect = FitImageRect(image, imageRect);
            var href = ImageToDataUri(shape, image);
            sb.AppendLine(CultureInfo.InvariantCulture,
                $"""  <image href="{href}" x="{drawRect.X:0.##}" y="{drawRect.Y:0.##}" width="{drawRect.Width:0.##}" height="{drawRect.Height:0.##}" preserveAspectRatio="xMidYMid meet" />""");
        }

        if (!string.IsNullOrWhiteSpace(shape.Text))
        {
            var textRect = rect;
            if (image is not null)
            {
                textRect.Y = rect.Y + rect.Height * 0.55f;
                textRect.Height = rect.Height * 0.45f;
            }

            var textColor = ColorToHex(Color.FromArgb(shape.TextColorArgb));
            var weight = shape.FontBold ? "bold" : "normal";
            var text = EscapeXml(shape.Text);
            sb.AppendLine(CultureInfo.InvariantCulture,
                $"""  <text x="{textRect.X + textRect.Width / 2:0.##}" y="{textRect.Y + textRect.Height / 2:0.##}" fill="{textColor}" font-family="{EscapeXml(shape.FontName)}" font-size="{shape.FontSize:0.##}" font-weight="{weight}" text-anchor="middle" dominant-baseline="middle">{text}</text>""");
        }
    }

    private static void AppendConnector(StringBuilder sb, DiagramConnector connector, DiagramShape source, DiagramShape target, PointF offset)
    {
        var start = DiagramRenderer.GetConnectionPoint(source, target, offset);
        var end = DiagramRenderer.GetConnectionPoint(target, source, offset);
        var points = DiagramRenderer.BuildConnectorPoints(connector.Kind, start, end);
        var stroke = ColorToHex(Color.FromArgb(connector.LineColorArgb));
        var dash = DashArray(connector.LineStyle);

        var pointText = string.Join(" ", points.Select(p => $"{p.X:0.##},{p.Y:0.##}"));
        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""  <polyline points="{pointText}" fill="none" stroke="{stroke}" stroke-width="{connector.LineWidth:0.##}"{dash} />""");

        if (connector.HasStartArrow && points.Length >= 2)
            AppendArrow(sb, points[1], points[0], stroke, connector.LineWidth);
        if (connector.HasEndArrow && points.Length >= 2)
            AppendArrow(sb, points[^2], points[^1], stroke, connector.LineWidth);

        if (!string.IsNullOrWhiteSpace(connector.Label))
        {
            var mid = points[points.Length / 2];
            sb.AppendLine(CultureInfo.InvariantCulture,
                $"""  <text x="{mid.X:0.##}" y="{mid.Y:0.##}" fill="{stroke}" font-family="맑은 고딕" font-size="9" text-anchor="middle" dominant-baseline="middle">{EscapeXml(connector.Label)}</text>""");
        }
    }

    private static void AppendArrow(StringBuilder sb, PointF from, PointF to, string stroke, float width)
    {
        const float size = 10f;
        float angle = (float)Math.Atan2(to.Y - from.Y, to.X - from.X);
        var p1 = new PointF(
            to.X - size * (float)Math.Cos(angle - Math.PI / 6),
            to.Y - size * (float)Math.Sin(angle - Math.PI / 6));
        var p2 = new PointF(
            to.X - size * (float)Math.Cos(angle + Math.PI / 6),
            to.Y - size * (float)Math.Sin(angle + Math.PI / 6));

        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""  <line x1="{to.X:0.##}" y1="{to.Y:0.##}" x2="{p1.X:0.##}" y2="{p1.Y:0.##}" stroke="{stroke}" stroke-width="{width:0.##}" />""");
        sb.AppendLine(CultureInfo.InvariantCulture,
            $"""  <line x1="{to.X:0.##}" y1="{to.Y:0.##}" x2="{p2.X:0.##}" y2="{p2.Y:0.##}" stroke="{stroke}" stroke-width="{width:0.##}" />""");
    }

    private static string ShapePathData(ShapeKind kind, RectangleF rect)
    {
        return kind switch
        {
            ShapeKind.Rectangle => $"M {rect.Left:0.##},{rect.Top:0.##} H {rect.Right:0.##} V {rect.Bottom:0.##} H {rect.Left:0.##} Z",
            ShapeKind.RoundedRectangle => RoundedRectPath(rect, 12),
            ShapeKind.Ellipse => $"M {rect.X + rect.Width / 2:0.##},{rect.Y:0.##} A {rect.Width / 2:0.##},{rect.Height / 2:0.##} 0 1 0 {rect.X + rect.Width / 2:0.##},{rect.Bottom:0.##} A {rect.Width / 2:0.##},{rect.Height / 2:0.##} 0 1 0 {rect.X + rect.Width / 2:0.##},{rect.Y:0.##} Z",
            ShapeKind.Diamond => $"M {rect.X + rect.Width / 2:0.##},{rect.Y:0.##} L {rect.Right:0.##},{rect.Y + rect.Height / 2:0.##} L {rect.X + rect.Width / 2:0.##},{rect.Bottom:0.##} L {rect.Left:0.##},{rect.Y + rect.Height / 2:0.##} Z",
            ShapeKind.Triangle => $"M {rect.X + rect.Width / 2:0.##},{rect.Y:0.##} L {rect.Right:0.##},{rect.Bottom:0.##} L {rect.Left:0.##},{rect.Bottom:0.##} Z",
            ShapeKind.Parallelogram =>
                $"M {rect.X + rect.Width * 0.2f:0.##},{rect.Y:0.##} L {rect.Right:0.##},{rect.Y:0.##} L {rect.Right - rect.Width * 0.2f:0.##},{rect.Bottom:0.##} L {rect.Left:0.##},{rect.Bottom:0.##} Z",
            ShapeKind.Hexagon =>
                $"M {rect.X + rect.Width * 0.25f:0.##},{rect.Y:0.##} L {rect.X + rect.Width * 0.75f:0.##},{rect.Y:0.##} L {rect.Right:0.##},{rect.Y + rect.Height / 2:0.##} L {rect.X + rect.Width * 0.75f:0.##},{rect.Bottom:0.##} L {rect.X + rect.Width * 0.25f:0.##},{rect.Bottom:0.##} L {rect.Left:0.##},{rect.Y + rect.Height / 2:0.##} Z",
            _ => $"M {rect.Left:0.##},{rect.Top:0.##} H {rect.Right:0.##} V {rect.Bottom:0.##} H {rect.Left:0.##} Z"
        };
    }

    private static string RoundedRectPath(RectangleF rect, float radius)
    {
        float r = Math.Min(radius, Math.Min(rect.Width, rect.Height) / 2f);
        return FormattableString.Invariant(
            $"""M {rect.Left + r:0.##},{rect.Top:0.##} H {rect.Right - r:0.##} Q {rect.Right:0.##},{rect.Top:0.##} {rect.Right:0.##},{rect.Top + r:0.##} V {rect.Bottom - r:0.##} Q {rect.Right:0.##},{rect.Bottom:0.##} {rect.Right - r:0.##},{rect.Bottom:0.##} H {rect.Left + r:0.##} Q {rect.Left:0.##},{rect.Bottom:0.##} {rect.Left:0.##},{rect.Bottom - r:0.##} V {rect.Top + r:0.##} Q {rect.Left:0.##},{rect.Top:0.##} {rect.Left + r:0.##},{rect.Top:0.##} Z""");
    }

    private static RectangleF FitImageRect(Image image, RectangleF area)
    {
        var aspect = (float)image.Width / image.Height;
        float targetWidth = area.Width - 8;
        float targetHeight = area.Height - 8;
        float drawWidth = targetWidth;
        float drawHeight = drawWidth / aspect;
        if (drawHeight > targetHeight)
        {
            drawHeight = targetHeight;
            drawWidth = drawHeight * aspect;
        }

        return new RectangleF(
            area.X + (area.Width - drawWidth) / 2,
            area.Y + 4,
            drawWidth,
            drawHeight);
    }

    private static string ImageToDataUri(DiagramShape shape, Image image)
    {
        if (!string.IsNullOrWhiteSpace(shape.ImagePath) && File.Exists(shape.ImagePath))
        {
            var bytes = File.ReadAllBytes(shape.ImagePath);
            var mime = Path.GetExtension(shape.ImagePath).ToLowerInvariant() switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".gif" => "image/gif",
                ".bmp" => "image/bmp",
                ".webp" => "image/webp",
                _ => "image/png"
            };
            return $"data:{mime};base64,{Convert.ToBase64String(bytes)}";
        }

        using var ms = new MemoryStream();
        image.Save(ms, System.Drawing.Imaging.ImageFormat.Png);
        return $"data:image/png;base64,{Convert.ToBase64String(ms.ToArray())}";
    }

    private static string DashArray(LineStyle style)
        => style switch
        {
            LineStyle.Dash => " stroke-dasharray=\"8 4\"",
            LineStyle.Dot => " stroke-dasharray=\"2 3\"",
            LineStyle.DashDot => " stroke-dasharray=\"8 4 2 4\"",
            _ => string.Empty
        };

    private static string ColorToHex(Color color)
        => $"#{color.R:X2}{color.G:X2}{color.B:X2}";

    private static string EscapeXml(string text)
        => text.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;");

    private static RectangleF OffsetRect(RectangleF rect, PointF offset)
        => new(rect.X + offset.X, rect.Y + offset.Y, rect.Width, rect.Height);
}
