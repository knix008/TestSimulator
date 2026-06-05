using System.Drawing.Drawing2D;
using MyDiagramWinV10.Models;

namespace MyDiagramWinV10.Rendering;

public static class DiagramRenderer
{
    private static readonly Dictionary<string, Image> ImageCache = new(StringComparer.OrdinalIgnoreCase);

    public static void DrawShape(Graphics g, DiagramShape shape, PointF offset, bool selected)
    {
        var rect = OffsetRect(shape.Bounds, offset);
        using var fillBrush = new SolidBrush(Color.FromArgb(shape.FillColorArgb));
        using var borderPen = CreatePen(shape.BorderColorArgb, shape.BorderWidth, shape.BorderStyle);

        var path = CreateShapePath(shape.Kind, rect);
        g.FillPath(fillBrush, path);
        g.DrawPath(borderPen, path);

        DrawShapeImage(g, shape, rect);
        DrawShapeText(g, shape, rect);

        if (selected)
            DrawSelectionHandles(g, rect);
    }

    public static PointF[] GetShapePolygonVertices(DiagramShape shape, PointF offset = default)
    {
        using var path = CreateShapePath(shape.Kind, OffsetRect(shape.Bounds, offset));
        using var flat = (GraphicsPath)path.Clone();
        flat.Flatten(new Matrix(), 0.35f);
        return flat.PathPoints;
    }

    public static PointF GetConnectionPoint(DiagramShape from, DiagramShape to, PointF offset = default)
    {
        var fromCenter = new PointF(
            from.X + from.Width / 2 + offset.X,
            from.Y + from.Height / 2 + offset.Y);
        var toCenter = new PointF(
            to.X + to.Width / 2 + offset.X,
            to.Y + to.Height / 2 + offset.Y);

        using var path = CreateShapePath(from.Kind, OffsetRect(from.Bounds, offset));
        return RayIntersectPath(path, fromCenter, toCenter)
            ?? GetBoundsEdgePoint(OffsetRect(from.Bounds, offset), fromCenter, toCenter);
    }

    public static PointF[] BuildConnectorPoints(ConnectorKind kind, PointF start, PointF end)
    {
        return kind switch
        {
            ConnectorKind.Orthogonal =>
            [
                start,
                new PointF(end.X, start.Y),
                end
            ],
            ConnectorKind.Curved =>
            [
                start,
                new PointF((start.X + end.X) / 2, start.Y),
                new PointF((start.X + end.X) / 2, end.Y),
                end
            ],
            _ => [start, end]
        };
    }

    public static void DrawConnector(Graphics g, DiagramConnector connector, DiagramShape source, DiagramShape target, PointF offset)
    {
        var start = GetConnectionPoint(source, target, offset);
        var end = GetConnectionPoint(target, source, offset);
        var points = BuildConnectorPoints(connector.Kind, start, end);

        using var pen = CreatePen(connector.LineColorArgb, connector.LineWidth, connector.LineStyle);
        if (points.Length == 2)
            g.DrawLine(pen, points[0], points[1]);
        else
            g.DrawLines(pen, points);

        if (connector.HasStartArrow && points.Length >= 2)
            DrawArrowHead(g, pen, points[1], points[0]);
        if (connector.HasEndArrow && points.Length >= 2)
            DrawArrowHead(g, pen, points[^2], points[^1]);

        if (!string.IsNullOrWhiteSpace(connector.Label))
        {
            var mid = points[points.Length / 2];
            using var font = new Font("맑은 고딕", 9f);
            using var brush = new SolidBrush(Color.FromArgb(connector.LineColorArgb));
            var size = g.MeasureString(connector.Label, font);
            g.DrawString(connector.Label, font, brush, mid.X - size.Width / 2, mid.Y - size.Height / 2);
        }
    }

    public static void DrawShapePreview(Graphics g, ShapeKind kind, RectangleF rect, Color fill, Color border)
    {
        using var fillBrush = new SolidBrush(fill);
        using var borderPen = new Pen(border, 1.6f);
        using var path = CreateShapePath(kind, rect);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.FillPath(fillBrush, path);
        g.DrawPath(borderPen, path);
    }

    public static bool HitTestShape(DiagramShape shape, PointF point)
    {
        using var path = CreateShapePath(shape.Kind, shape.Bounds);
        return path.IsVisible(point);
    }

    public static ResizeHandle HitTestResizeHandle(DiagramShape shape, PointF point, float handleSize = 8f)
    {
        foreach (var (handle, rect) in GetHandleRects(shape.Bounds, handleSize))
        {
            if (rect.Contains(point))
                return handle;
        }

        return ResizeHandle.None;
    }

    public static IEnumerable<(ResizeHandle Handle, RectangleF Rect)> GetHandleRects(RectangleF bounds, float handleSize)
    {
        float hs = handleSize;
        float cx = bounds.Left + bounds.Width / 2;
        float cy = bounds.Top + bounds.Height / 2;

        yield return (ResizeHandle.TopLeft, new RectangleF(bounds.Left - hs, bounds.Top - hs, hs * 2, hs * 2));
        yield return (ResizeHandle.Top, new RectangleF(cx - hs, bounds.Top - hs, hs * 2, hs * 2));
        yield return (ResizeHandle.TopRight, new RectangleF(bounds.Right - hs, bounds.Top - hs, hs * 2, hs * 2));
        yield return (ResizeHandle.Right, new RectangleF(bounds.Right - hs, cy - hs, hs * 2, hs * 2));
        yield return (ResizeHandle.BottomRight, new RectangleF(bounds.Right - hs, bounds.Bottom - hs, hs * 2, hs * 2));
        yield return (ResizeHandle.Bottom, new RectangleF(cx - hs, bounds.Bottom - hs, hs * 2, hs * 2));
        yield return (ResizeHandle.BottomLeft, new RectangleF(bounds.Left - hs, bounds.Bottom - hs, hs * 2, hs * 2));
        yield return (ResizeHandle.Left, new RectangleF(bounds.Left - hs, cy - hs, hs * 2, hs * 2));
    }

    public static void ApplyResize(DiagramShape shape, ResizeHandle handle, PointF currentPoint, PointF startPoint)
    {
        float dx = currentPoint.X - startPoint.X;
        float dy = currentPoint.Y - startPoint.Y;
        var bounds = shape.Bounds;

        switch (handle)
        {
            case ResizeHandle.TopLeft:
                shape.X = bounds.X + dx;
                shape.Y = bounds.Y + dy;
                shape.Width = Math.Max(20, bounds.Width - dx);
                shape.Height = Math.Max(20, bounds.Height - dy);
                break;
            case ResizeHandle.Top:
                shape.Y = bounds.Y + dy;
                shape.Height = Math.Max(20, bounds.Height - dy);
                break;
            case ResizeHandle.TopRight:
                shape.Y = bounds.Y + dy;
                shape.Width = Math.Max(20, bounds.Width + dx);
                shape.Height = Math.Max(20, bounds.Height - dy);
                break;
            case ResizeHandle.Right:
                shape.Width = Math.Max(20, bounds.Width + dx);
                break;
            case ResizeHandle.BottomRight:
                shape.Width = Math.Max(20, bounds.Width + dx);
                shape.Height = Math.Max(20, bounds.Height + dy);
                break;
            case ResizeHandle.Bottom:
                shape.Height = Math.Max(20, bounds.Height + dy);
                break;
            case ResizeHandle.BottomLeft:
                shape.X = bounds.X + dx;
                shape.Width = Math.Max(20, bounds.Width - dx);
                shape.Height = Math.Max(20, bounds.Height + dy);
                break;
            case ResizeHandle.Left:
                shape.X = bounds.X + dx;
                shape.Width = Math.Max(20, bounds.Width - dx);
                break;
        }
    }

    public static Image? LoadShapeImage(DiagramShape shape)
    {
        if (!string.IsNullOrWhiteSpace(shape.ImagePath) && File.Exists(shape.ImagePath))
        {
            if (!ImageCache.TryGetValue(shape.ImagePath, out var cached))
            {
                cached = Image.FromFile(shape.ImagePath);
                ImageCache[shape.ImagePath] = cached;
            }

            return cached;
        }

        if (!string.IsNullOrWhiteSpace(shape.ImageBase64))
        {
            var key = shape.Id.ToString();
            if (!ImageCache.TryGetValue(key, out var cached))
            {
                var bytes = Convert.FromBase64String(shape.ImageBase64);
                using var ms = new MemoryStream(bytes);
                cached = Image.FromStream(ms);
                ImageCache[key] = cached;
            }

            return cached;
        }

        return null;
    }

    public static void ClearImageCache()
    {
        foreach (var image in ImageCache.Values)
            image.Dispose();
        ImageCache.Clear();
    }

    private static void DrawShapeImage(Graphics g, DiagramShape shape, RectangleF rect)
    {
        var image = LoadShapeImage(shape);
        if (image is null)
            return;

        var imageRect = rect;
        if (!string.IsNullOrWhiteSpace(shape.Text))
            imageRect.Height = rect.Height * 0.55f;

        var aspect = (float)image.Width / image.Height;
        float targetWidth = imageRect.Width - 8;
        float targetHeight = imageRect.Height - 8;
        float drawWidth = targetWidth;
        float drawHeight = drawWidth / aspect;
        if (drawHeight > targetHeight)
        {
            drawHeight = targetHeight;
            drawWidth = drawHeight * aspect;
        }

        var drawRect = new RectangleF(
            imageRect.X + (imageRect.Width - drawWidth) / 2,
            imageRect.Y + 4,
            drawWidth,
            drawHeight);

        g.DrawImage(image, drawRect);
    }

    private static void DrawShapeText(Graphics g, DiagramShape shape, RectangleF rect)
    {
        if (string.IsNullOrWhiteSpace(shape.Text))
            return;

        var style = shape.FontBold ? FontStyle.Bold : FontStyle.Regular;
        using var font = new Font(shape.FontName, shape.FontSize, style, GraphicsUnit.Point);
        using var brush = new SolidBrush(Color.FromArgb(shape.TextColorArgb));

        var textRect = rect;
        if (LoadShapeImage(shape) is not null)
        {
            textRect.Y = rect.Y + rect.Height * 0.55f;
            textRect.Height = rect.Height * 0.45f;
        }

        var format = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center,
            Trimming = StringTrimming.EllipsisWord
        };

        g.DrawString(shape.Text, font, brush, textRect, format);
    }

    private static void DrawSelectionHandles(Graphics g, RectangleF rect)
    {
        using var brush = new SolidBrush(Color.White);
        using var pen = new Pen(Color.DodgerBlue, 1.5f);

        foreach (var (_, handleRect) in GetHandleRects(rect, 6f))
        {
            g.FillRectangle(brush, handleRect);
            g.DrawRectangle(pen, handleRect.X, handleRect.Y, handleRect.Width, handleRect.Height);
        }

        using var selectPen = new Pen(Color.DodgerBlue, 1f) { DashStyle = DashStyle.Dot };
        g.DrawRectangle(selectPen, rect.X, rect.Y, rect.Width, rect.Height);
    }

    private static GraphicsPath CreateShapePath(ShapeKind kind, RectangleF rect)
    {
        var path = new GraphicsPath();

        switch (kind)
        {
            case ShapeKind.Rectangle:
                path.AddRectangle(rect);
                break;
            case ShapeKind.RoundedRectangle:
                path.AddPath(CreateRoundedRect(rect, 12), false);
                break;
            case ShapeKind.Ellipse:
                path.AddEllipse(rect);
                break;
            case ShapeKind.Diamond:
                path.AddPolygon(
                [
                    new PointF(rect.X + rect.Width / 2, rect.Y),
                    new PointF(rect.Right, rect.Y + rect.Height / 2),
                    new PointF(rect.X + rect.Width / 2, rect.Bottom),
                    new PointF(rect.X, rect.Y + rect.Height / 2)
                ]);
                break;
            case ShapeKind.Triangle:
                path.AddPolygon(
                [
                    new PointF(rect.X + rect.Width / 2, rect.Y),
                    new PointF(rect.Right, rect.Bottom),
                    new PointF(rect.X, rect.Bottom)
                ]);
                break;
            case ShapeKind.Parallelogram:
                var offset = rect.Width * 0.2f;
                path.AddPolygon(
                [
                    new PointF(rect.X + offset, rect.Y),
                    new PointF(rect.Right, rect.Y),
                    new PointF(rect.Right - offset, rect.Bottom),
                    new PointF(rect.X, rect.Bottom)
                ]);
                break;
            case ShapeKind.Hexagon:
                var w = rect.Width;
                var h = rect.Height;
                path.AddPolygon(
                [
                    new PointF(rect.X + w * 0.25f, rect.Y),
                    new PointF(rect.X + w * 0.75f, rect.Y),
                    new PointF(rect.Right, rect.Y + h / 2),
                    new PointF(rect.X + w * 0.75f, rect.Bottom),
                    new PointF(rect.X + w * 0.25f, rect.Bottom),
                    new PointF(rect.X, rect.Y + h / 2)
                ]);
                break;
        }

        return path;
    }

    private static GraphicsPath CreateRoundedRect(RectangleF rect, float radius)
    {
        var path = new GraphicsPath();
        float d = radius * 2;
        path.AddArc(rect.X, rect.Y, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
        path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static Pen CreatePen(int colorArgb, float width, LineStyle style)
    {
        var pen = new Pen(Color.FromArgb(colorArgb), width);
        pen.DashStyle = style switch
        {
            LineStyle.Dash => DashStyle.Dash,
            LineStyle.Dot => DashStyle.Dot,
            LineStyle.DashDot => DashStyle.DashDot,
            _ => DashStyle.Solid
        };
        pen.StartCap = LineCap.Round;
        pen.EndCap = LineCap.Round;
        return pen;
    }

    private static PointF? RayIntersectPath(GraphicsPath path, PointF origin, PointF target)
    {
        float dirX = target.X - origin.X;
        float dirY = target.Y - origin.Y;
        float length = (float)Math.Sqrt(dirX * dirX + dirY * dirY);
        if (length < 0.001f)
            return null;

        dirX /= length;
        dirY /= length;

        using var flat = (GraphicsPath)path.Clone();
        flat.Flatten(new Matrix(), 0.25f);
        var points = flat.PathPoints;
        var types = flat.PathTypes;
        if (points.Length < 2)
            return null;

        PointF? best = null;
        float bestDistance = -1f;
        PointF previous = points[0];

        for (int i = 1; i < points.Length; i++)
        {
            bool isLine = (types[i] & (byte)PathPointType.PathTypeMask) == (byte)PathPointType.Line
                || (types[i] & (byte)PathPointType.PathTypeMask) == (byte)PathPointType.Bezier;
            if (isLine)
            {
                var hit = RaySegmentIntersect(origin, dirX, dirY, previous, points[i]);
                if (hit is PointF point)
                {
                    float distance = Distance(origin, point);
                    if (distance > 0.5f && distance > bestDistance)
                    {
                        bestDistance = distance;
                        best = point;
                    }
                }
            }

            previous = points[i];
            if ((types[i] & (byte)PathPointType.CloseSubpath) != 0)
                previous = points[0];
        }

        return best;
    }

    private static PointF? RaySegmentIntersect(PointF origin, float dirX, float dirY, PointF a, PointF b)
    {
        float segX = b.X - a.X;
        float segY = b.Y - a.Y;
        float denominator = dirX * segY - dirY * segX;
        if (Math.Abs(denominator) < 0.0001f)
            return null;

        float t = ((a.X - origin.X) * segY - (a.Y - origin.Y) * segX) / denominator;
        float u = ((a.X - origin.X) * dirY - (a.Y - origin.Y) * dirX) / denominator;
        if (t < 0 || u < 0 || u > 1)
            return null;

        return new PointF(origin.X + dirX * t, origin.Y + dirY * t);
    }

    private static PointF GetBoundsEdgePoint(RectangleF rect, PointF origin, PointF target)
    {
        float dx = target.X - origin.X;
        float dy = target.Y - origin.Y;
        if (Math.Abs(dx) > Math.Abs(dy))
            return dx >= 0
                ? new PointF(rect.Right, origin.Y)
                : new PointF(rect.Left, origin.Y);

        return dy >= 0
            ? new PointF(origin.X, rect.Bottom)
            : new PointF(origin.X, rect.Top);
    }

    private static float Distance(PointF a, PointF b)
    {
        float dx = a.X - b.X;
        float dy = a.Y - b.Y;
        return (float)Math.Sqrt(dx * dx + dy * dy);
    }

    private static void DrawArrowHead(Graphics g, Pen pen, PointF from, PointF to)
    {
        const float size = 10f;
        float angle = (float)Math.Atan2(to.Y - from.Y, to.X - from.X);
        var p1 = new PointF(
            to.X - size * (float)Math.Cos(angle - Math.PI / 6),
            to.Y - size * (float)Math.Sin(angle - Math.PI / 6));
        var p2 = new PointF(
            to.X - size * (float)Math.Cos(angle + Math.PI / 6),
            to.Y - size * (float)Math.Sin(angle + Math.PI / 6));

        g.DrawLine(pen, to, p1);
        g.DrawLine(pen, to, p2);
    }

    private static RectangleF OffsetRect(RectangleF rect, PointF offset)
        => new(rect.X + offset.X, rect.Y + offset.Y, rect.Width, rect.Height);
}

public enum ResizeHandle
{
    None,
    TopLeft,
    Top,
    TopRight,
    Right,
    BottomRight,
    Bottom,
    BottomLeft,
    Left
}
