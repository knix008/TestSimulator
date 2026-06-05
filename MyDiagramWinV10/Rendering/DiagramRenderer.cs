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

        if (shape.Kind == ShapeKind.Cylinder)
        {
            DrawCylinder(g, fillBrush, borderPen, rect);
        }
        else
        {
            using var path = CreateShapePath(shape.Kind, rect);
            g.FillPath(fillBrush, path);
            g.DrawPath(borderPen, path);

            if (shape.BorderStyle == LineStyle.Double)
            {
                var inset = shape.BorderWidth + 3f;
                var innerRect = new RectangleF(rect.X + inset, rect.Y + inset, rect.Width - inset * 2, rect.Height - inset * 2);
                if (innerRect.Width > 4 && innerRect.Height > 4)
                {
                    using var innerPen = CreatePen(shape.BorderColorArgb, shape.BorderWidth * 0.7f, LineStyle.Solid);
                    using var innerPath = CreateShapePath(shape.Kind, innerRect);
                    g.DrawPath(innerPen, innerPath);
                }
            }
        }

        var image = LoadShapeImage(shape);
        DrawShapeImage(g, shape, rect, image);
        DrawShapeText(g, shape, rect, image is not null);

        if (selected)
            DrawSelectionHandles(g, rect);
    }

    public static void DrawGhostShape(Graphics g, ShapeKind kind, RectangleF rect)
    {
        using var fillBrush = new SolidBrush(Color.FromArgb(30, 37, 99, 235));
        using var borderPen = new Pen(Color.FromArgb(170, 37, 99, 235), 1.5f);
        borderPen.DashStyle = DashStyle.Dash;

        if (kind == ShapeKind.Cylinder)
        {
            using var fb = new SolidBrush(Color.FromArgb(30, 37, 99, 235));
            DrawCylinder(g, fb, borderPen, rect);
            return;
        }

        using var path = CreateShapePath(kind, rect);
        g.FillPath(fillBrush, path);
        g.DrawPath(borderPen, path);
    }

    public static PointF[] GetShapePolygonVertices(DiagramShape shape, PointF offset = default)
    {
        using var path = CreateShapePath(shape.Kind, OffsetRect(shape.Bounds, offset));
        using var flat = (GraphicsPath)path.Clone();
        using var identity = new Matrix();
        flat.Flatten(identity, 0.35f);
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

        // Ellipse uses smooth ray intersection; all angled shapes snap to cardinal anchors.
        if (from.Kind == ShapeKind.Ellipse)
        {
            using var path = CreateShapePath(from.Kind, OffsetRect(from.Bounds, offset));
            return RayIntersectPath(path, fromCenter, toCenter)
                ?? GetBoundsEdgePoint(OffsetRect(from.Bounds, offset), fromCenter, toCenter);
        }

        return GetCardinalAnchor(from, toCenter, offset);
    }

    private static PointF GetCardinalAnchor(DiagramShape shape, PointF target, PointF offset)
    {
        float cx = shape.X + shape.Width / 2 + offset.X;
        float cy = shape.Y + shape.Height / 2 + offset.Y;
        float left = shape.X + offset.X;
        float right = shape.X + shape.Width + offset.X;
        float top = shape.Y + offset.Y;
        float bottom = shape.Y + shape.Height + offset.Y;

        PointF[] anchors = shape.Kind switch
        {
            ShapeKind.Triangle =>
            [
                new PointF(cx, top),            // apex
                new PointF(left, bottom),        // bottom-left vertex
                new PointF(right, bottom),       // bottom-right vertex
                new PointF(cx, bottom)           // bottom edge center
            ],
            ShapeKind.Star =>
            [
                new PointF(cx, top),
                new PointF(right, (cy + bottom) / 2),
                new PointF(right * 0.85f + left * 0.15f, bottom),
                new PointF(left * 0.85f + right * 0.15f, bottom),
                new PointF(left, (cy + bottom) / 2)
            ],
            _ =>
            [
                new PointF(cx, top),
                new PointF(right, cy),
                new PointF(cx, bottom),
                new PointF(left, cy)
            ]
        };

        float dx = target.X - cx;
        float dy = target.Y - cy;
        float len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 0.001f)
            return anchors[0];

        PointF best = anchors[0];
        float bestDot = float.NegativeInfinity;
        foreach (var anchor in anchors)
        {
            float ax = anchor.X - cx;
            float ay = anchor.Y - cy;
            float dot = ax * dx + ay * dy;
            if (dot > bestDot)
            {
                bestDot = dot;
                best = anchor;
            }
        }
        return best;
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
        DrawConnectorWithBridges(g, connector, source, target, [], offset);
    }

    public static void DrawConnectorWithBridges(
        Graphics g,
        DiagramConnector connector,
        DiagramShape source,
        DiagramShape target,
        IReadOnlyList<(float T, PointF Pt)> crossings,
        PointF offset = default)
    {
        var start = GetConnectionPoint(source, target, offset);
        var end = GetConnectionPoint(target, source, offset);
        var points = BuildConnectorPoints(connector.Kind, start, end);

        using var pen = CreatePen(connector.LineColorArgb, connector.LineWidth, connector.LineStyle);
        using var bgBrush = new SolidBrush(Color.White);

        const float bridgeRadius = 7f;

        if (connector.LineStyle == LineStyle.Double)
        {
            DrawDoubleLine(g, points, connector.LineColorArgb, connector.LineWidth);
        }
        else if (connector.Kind == ConnectorKind.Curved && points.Length == 4 && crossings.Count == 0)
        {
            g.DrawBezier(pen, points[0], points[1], points[2], points[3]);
        }
        else if (connector.Kind == ConnectorKind.Curved && points.Length == 4)
        {
            // Bezier with bridge arcs — approximate as polyline for bridge segments
            var sortedCrossings = crossings.OrderBy(c => c.T).ToList();
            g.DrawBezier(pen, points[0], points[1], points[2], points[3]);
        }
        else if (crossings.Count == 0)
        {
            DrawPolyline(g, pen, points);
        }
        else
        {
            var sortedCrossings = crossings.OrderBy(c => c.T).ToList();
            DrawPolylineWithBridges(g, pen, points, sortedCrossings, bridgeRadius);
        }

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

    private static void DrawPolyline(Graphics g, Pen pen, PointF[] points)
    {
        if (points.Length == 2)
            g.DrawLine(pen, points[0], points[1]);
        else
            g.DrawLines(pen, points);
    }

    private static void DrawPolylineWithBridges(
        Graphics g, Pen pen,
        PointF[] points, List<(float T, PointF Pt)> crossings, float bridgeRadius)
    {
        int crossIdx = 0;
        for (int si = 1; si < points.Length; si++)
        {
            var segStart = points[si - 1];
            var segEnd   = points[si];

            var segCrossings = new List<PointF>();
            while (crossIdx < crossings.Count && crossings[crossIdx].T <= si)
            {
                if (crossings[crossIdx].T >= si - 1)
                    segCrossings.Add(crossings[crossIdx].Pt);
                crossIdx++;
            }

            if (segCrossings.Count == 0)
            {
                g.DrawLine(pen, segStart, segEnd);
                continue;
            }

            float dx = segEnd.X - segStart.X;
            float dy = segEnd.Y - segStart.Y;
            float segLen = MathF.Sqrt(dx * dx + dy * dy);
            segCrossings.Sort((a, b) =>
            {
                float da = (a.X - segStart.X) * dx + (a.Y - segStart.Y) * dy;
                float db = (b.X - segStart.X) * dx + (b.Y - segStart.Y) * dy;
                return da.CompareTo(db);
            });

            var current = segStart;
            float ndx = segLen > 0.001f ? dx / segLen : 0;
            float ndy = segLen > 0.001f ? dy / segLen : 0;
            float angle = MathF.Atan2(ndy, ndx) * 180f / MathF.PI;

            foreach (var crossPt in segCrossings)
            {
                var beforePt = new PointF(crossPt.X - ndx * bridgeRadius, crossPt.Y - ndy * bridgeRadius);
                var afterPt  = new PointF(crossPt.X + ndx * bridgeRadius, crossPt.Y + ndy * bridgeRadius);

                if (Distance(current, beforePt) > 0.5f)
                    g.DrawLine(pen, current, beforePt);

                // Arc bump over the crossing — no white gap so lower connector stays intact
                var arcRect = new RectangleF(
                    crossPt.X - bridgeRadius, crossPt.Y - bridgeRadius,
                    bridgeRadius * 2, bridgeRadius * 2);
                g.DrawArc(pen, arcRect, angle + 180f, -180f);

                current = afterPt;
            }

            if (Distance(current, segEnd) > 0.5f)
                g.DrawLine(pen, current, segEnd);
        }
    }

    public static PointF? SegmentIntersection(PointF a1, PointF a2, PointF b1, PointF b2)
    {
        float adx = a2.X - a1.X, ady = a2.Y - a1.Y;
        float bdx = b2.X - b1.X, bdy = b2.Y - b1.Y;
        float denom = adx * bdy - ady * bdx;
        if (MathF.Abs(denom) < 0.0001f)
            return null;

        float t = ((b1.X - a1.X) * bdy - (b1.Y - a1.Y) * bdx) / denom;
        float u = ((b1.X - a1.X) * ady - (b1.Y - a1.Y) * adx) / denom;
        if (t < 0.05f || t > 0.95f || u < 0.05f || u > 0.95f)
            return null;

        return new PointF(a1.X + t * adx, a1.Y + t * ady);
    }

    private static void DrawDoubleLine(Graphics g, PointF[] points, int colorArgb, float width)
    {
        float gap = Math.Max(2f, width * 0.8f);
        using var pen1 = new Pen(Color.FromArgb(colorArgb), width * 0.6f);
        using var pen2 = new Pen(Color.FromArgb(colorArgb), width * 0.6f);

        for (int i = 1; i < points.Length; i++)
        {
            float dx = points[i].X - points[i - 1].X;
            float dy = points[i].Y - points[i - 1].Y;
            float len = MathF.Sqrt(dx * dx + dy * dy);
            if (len < 0.001f) continue;
            float nx = -dy / len * gap / 2;
            float ny = dx / len * gap / 2;

            g.DrawLine(pen1,
                points[i - 1].X + nx, points[i - 1].Y + ny,
                points[i].X + nx, points[i].Y + ny);
            g.DrawLine(pen2,
                points[i - 1].X - nx, points[i - 1].Y - ny,
                points[i].X - nx, points[i].Y - ny);
        }
    }

    public static void DrawShapePreview(Graphics g, ShapeKind kind, RectangleF rect, Color fill, Color border)
    {
        if (rect.Width <= 0 || rect.Height <= 0)
            return;

        using var fillBrush = new SolidBrush(fill);
        using var borderPen = new Pen(border, 1.6f);
        g.SmoothingMode = SmoothingMode.AntiAlias;

        if (kind == ShapeKind.Cylinder)
        {
            DrawCylinder(g, fillBrush, borderPen, rect);
            return;
        }

        using var path = CreateShapePath(kind, rect);
        g.FillPath(fillBrush, path);
        g.DrawPath(borderPen, path);
    }

    public static bool HitTestShape(DiagramShape shape, PointF point)
    {
        if (shape.Kind == ShapeKind.Cylinder)
        {
            return shape.Bounds.Contains(point);
        }

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
                // Copy pixels so the original file is not kept locked.
                using var temp = new Bitmap(shape.ImagePath);
                cached = new Bitmap(temp);
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

    private static void DrawCylinder(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float eh = Math.Max(8f, rect.Height * 0.22f);
        var topEllipse    = new RectangleF(rect.X, rect.Y,              rect.Width, eh);
        var bottomEllipse = new RectangleF(rect.X, rect.Bottom - eh,    rect.Width, eh);

        // Fill: body rectangle + both end ellipses
        g.FillRectangle(fill, new RectangleF(rect.X, rect.Y + eh / 2, rect.Width, rect.Height - eh));
        g.FillEllipse(fill, bottomEllipse);
        g.FillEllipse(fill, topEllipse);

        // Border: left/right sides, visible bottom arc, full top ellipse
        g.DrawLine(border, rect.X,     rect.Y + eh / 2, rect.X,     rect.Bottom - eh / 2);
        g.DrawLine(border, rect.Right, rect.Y + eh / 2, rect.Right, rect.Bottom - eh / 2);
        g.DrawArc(border, bottomEllipse, 0, 180);   // only the visible lower arc
        g.DrawEllipse(border, topEllipse);
    }

    private static void DrawShapeImage(Graphics g, DiagramShape shape, RectangleF rect, Image? image)
    {
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

    private static void DrawShapeText(Graphics g, DiagramShape shape, RectangleF rect, bool hasImage)
    {
        if (string.IsNullOrWhiteSpace(shape.Text))
            return;

        var style = shape.FontBold ? FontStyle.Bold : FontStyle.Regular;
        using var font = new Font(shape.FontName, shape.FontSize, style, GraphicsUnit.Point);
        using var brush = new SolidBrush(Color.FromArgb(shape.TextColorArgb));
        using var format = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center,
            Trimming = StringTrimming.EllipsisWord
        };

        var textRect = rect;
        if (hasImage)
        {
            textRect.Y = rect.Y + rect.Height * 0.55f;
            textRect.Height = rect.Height * 0.45f;
        }

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

    public static GraphicsPath CreateShapePath(ShapeKind kind, RectangleF rect)
    {
        var path = new GraphicsPath();
        float cx = rect.X + rect.Width / 2;
        float cy = rect.Y + rect.Height / 2;
        float rx = rect.Width / 2;
        float ry = rect.Height / 2;

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
                    new PointF(cx, rect.Y),
                    new PointF(rect.Right, cy),
                    new PointF(cx, rect.Bottom),
                    new PointF(rect.X, cy)
                ]);
                break;

            case ShapeKind.Triangle:
                path.AddPolygon(
                [
                    new PointF(cx, rect.Y),
                    new PointF(rect.Right, rect.Bottom),
                    new PointF(rect.X, rect.Bottom)
                ]);
                break;

            case ShapeKind.Parallelogram:
                var pOffset = rect.Width * 0.2f;
                path.AddPolygon(
                [
                    new PointF(rect.X + pOffset, rect.Y),
                    new PointF(rect.Right, rect.Y),
                    new PointF(rect.Right - pOffset, rect.Bottom),
                    new PointF(rect.X, rect.Bottom)
                ]);
                break;

            case ShapeKind.Hexagon:
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

            case ShapeKind.Pentagon:
                path.AddPolygon(CreateRegularPolygon(cx, cy, rx, ry, 5, -MathF.PI / 2));
                break;

            case ShapeKind.Star:
                path.AddPolygon(CreateStar(cx, cy, rx, ry, 5));
                break;

            case ShapeKind.Cross:
                path.AddPolygon(CreateCross(rect));
                break;

            case ShapeKind.Cylinder:
                // Cylinder is handled specially in draw methods; return bounding rect for hit test
                path.AddRectangle(rect);
                break;

            case ShapeKind.Cloud:
                path.AddPath(CreateCloud(rect), false);
                break;

            case ShapeKind.Document:
                path.AddPath(CreateDocument(rect), false);
                break;

            case ShapeKind.Database:
                path.AddPath(CreateDatabase(rect), false);
                break;

            case ShapeKind.Arrow:
                path.AddPolygon(CreateArrow(rect));
                break;

            case ShapeKind.Trapezoid:
                path.AddPolygon(CreateTrapezoid(rect));
                break;

            case ShapeKind.Chevron:
                path.AddPolygon(CreateChevron(rect));
                break;
        }

        return path;
    }

    private static PointF[] CreateRegularPolygon(float cx, float cy, float rx, float ry, int sides, float startAngle)
    {
        var pts = new PointF[sides];
        for (int i = 0; i < sides; i++)
        {
            float angle = startAngle + 2 * MathF.PI * i / sides;
            pts[i] = new PointF(cx + rx * MathF.Cos(angle), cy + ry * MathF.Sin(angle));
        }
        return pts;
    }

    private static PointF[] CreateStar(float cx, float cy, float rx, float ry, int points)
    {
        var pts = new PointF[points * 2];
        float irx = rx * 0.4f;
        float iry = ry * 0.4f;
        float startAngle = -MathF.PI / 2;
        for (int i = 0; i < points; i++)
        {
            float outerAngle = startAngle + 2 * MathF.PI * i / points;
            float innerAngle = outerAngle + MathF.PI / points;
            pts[i * 2] = new PointF(cx + rx * MathF.Cos(outerAngle), cy + ry * MathF.Sin(outerAngle));
            pts[i * 2 + 1] = new PointF(cx + irx * MathF.Cos(innerAngle), cy + iry * MathF.Sin(innerAngle));
        }
        return pts;
    }

    private static PointF[] CreateCross(RectangleF rect)
    {
        float arm = Math.Min(rect.Width, rect.Height) / 3f;
        float cx = rect.X + rect.Width / 2;
        float cy = rect.Y + rect.Height / 2;
        float l = rect.X, r = rect.Right, t = rect.Y, b = rect.Bottom;
        return
        [
            new PointF(cx - arm / 2, t),
            new PointF(cx + arm / 2, t),
            new PointF(cx + arm / 2, cy - arm / 2),
            new PointF(r, cy - arm / 2),
            new PointF(r, cy + arm / 2),
            new PointF(cx + arm / 2, cy + arm / 2),
            new PointF(cx + arm / 2, b),
            new PointF(cx - arm / 2, b),
            new PointF(cx - arm / 2, cy + arm / 2),
            new PointF(l, cy + arm / 2),
            new PointF(l, cy - arm / 2),
            new PointF(cx - arm / 2, cy - arm / 2)
        ];
    }

    private static GraphicsPath CreateCloud(RectangleF rect)
    {
        // Build cloud outline left→right using arcs over 4 bumps, then flat bottom arc
        var path = new GraphicsPath();
        float w = rect.Width, h = rect.Height;
        float x = rect.X, y = rect.Y;

        // Each bump: arc from 180° sweeping -180° (counterclockwise over top)
        path.AddArc(x,             y + h * 0.38f, w * 0.30f, h * 0.42f, 180, -180); // left (small)
        path.AddArc(x + w * 0.14f, y + h * 0.08f, w * 0.34f, h * 0.52f, 180, -180); // center-left
        path.AddArc(x + w * 0.40f, y,             w * 0.36f, h * 0.56f, 180, -180); // center (tallest)
        path.AddArc(x + w * 0.62f, y + h * 0.12f, w * 0.32f, h * 0.46f, 180, -180); // right
        // Bottom flat arc (lower half of a wide ellipse, left to right)
        path.AddArc(x + w * 0.02f, y + h * 0.55f, w * 0.96f, h * 0.45f, 0, 180);
        path.CloseFigure();
        return path;
    }

    private static GraphicsPath CreateDocument(RectangleF rect)
    {
        var path = new GraphicsPath();
        float w = rect.Width, h = rect.Height;
        float x = rect.X, y = rect.Y;
        float wave = h * 0.14f;   // more prominent wave
        path.AddLine(x, y, x + w, y);
        path.AddLine(x + w, y, x + w, y + h - wave);
        // Bottom wavy edge
        path.AddBezier(
            x + w, y + h - wave,
            x + w * 0.75f, y + h - wave * 2,
            x + w * 0.50f, y + h,
            x + w * 0.25f, y + h - wave * 2);
        path.AddBezier(
            x + w * 0.25f, y + h - wave * 2,
            x + w * 0.05f, y + h,
            x, y + h - wave,
            x, y + h - wave);
        path.AddLine(x, y + h - wave, x, y);
        path.CloseFigure();
        return path;
    }

    private static GraphicsPath CreateDatabase(RectangleF rect)
    {
        var path = new GraphicsPath();
        float w = rect.Width, h = rect.Height;
        float x = rect.X, y = rect.Y;
        float eh = h * 0.2f;

        path.AddArc(x, y, w, eh, 0, 180);
        path.AddArc(x, y, w, eh, 180, 180);
        path.AddLine(x, y + eh / 2, x, y + h - eh / 2);
        path.AddArc(x, y + h - eh, w, eh, 0, 180);
        path.AddArc(x, y + h - eh, w, eh, 180, 180);
        path.AddLine(x + w, y + h - eh / 2, x + w, y + eh / 2);
        path.CloseFigure();
        return path;
    }

    private static PointF[] CreateArrow(RectangleF rect)
    {
        float cy = rect.Y + rect.Height / 2;
        float shaftT = rect.Y + rect.Height * 0.30f;
        float shaftB = rect.Bottom - rect.Height * 0.30f;
        float notch = rect.X + rect.Width * 0.60f;
        return
        [
            new PointF(rect.X,   shaftT),
            new PointF(notch,    shaftT),
            new PointF(notch,    rect.Y),
            new PointF(rect.Right, cy),
            new PointF(notch,    rect.Bottom),
            new PointF(notch,    shaftB),
            new PointF(rect.X,   shaftB)
        ];
    }

    private static PointF[] CreateTrapezoid(RectangleF rect)
    {
        float inset = rect.Width * 0.15f;
        return
        [
            new PointF(rect.X + inset,    rect.Y),
            new PointF(rect.Right - inset, rect.Y),
            new PointF(rect.Right,         rect.Bottom),
            new PointF(rect.X,             rect.Bottom)
        ];
    }

    private static PointF[] CreateChevron(RectangleF rect)
    {
        float cy    = rect.Y + rect.Height / 2;
        float notch = rect.Width * 0.28f;
        return
        [
            new PointF(rect.X,              rect.Y),
            new PointF(rect.Right - notch,  rect.Y),
            new PointF(rect.Right,          cy),
            new PointF(rect.Right - notch,  rect.Bottom),
            new PointF(rect.X,              rect.Bottom),
            new PointF(rect.X + notch,      cy)
        ];
    }

    private static GraphicsPath CreateRoundedRect(RectangleF rect, float radius)
    {
        var path = new GraphicsPath();
        float d = radius * 2;
        float maxR = Math.Min(rect.Width, rect.Height) / 2f;
        d = Math.Min(d, maxR * 2);
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
            LineStyle.DashDotDot => DashStyle.DashDotDot,
            LineStyle.LongDash => DashStyle.Custom,
            LineStyle.ShortDash => DashStyle.Custom,
            _ => DashStyle.Solid
        };

        if (style == LineStyle.LongDash)
            pen.DashPattern = [12f, 4f];
        else if (style == LineStyle.ShortDash)
            pen.DashPattern = [3f, 3f];

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
        using var identity = new Matrix();
        flat.Flatten(identity, 0.25f);
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
