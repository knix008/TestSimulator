using System.Drawing.Drawing2D;
using MyDiagramWinV10.Models;

namespace MyDiagramWinV10.Rendering;

public static class DiagramRenderer
{
    private static readonly Dictionary<string, Image> ImageCache = new(StringComparer.OrdinalIgnoreCase);

    public static void DrawShape(Graphics g, DiagramShape shape, PointF offset, bool selected)
    {
        var rect = OffsetRect(shape.EffectiveBounds, offset);
        using var fillBrush = new SolidBrush(Color.FromArgb(shape.FillColorArgb));
        using var borderPen = CreatePen(shape.BorderColorArgb, shape.BorderWidth, shape.BorderStyle);

        if (shape.IsCollapsed)
        {
            g.FillRectangle(fillBrush, rect);
            g.DrawRectangle(borderPen, rect.X, rect.Y, rect.Width, rect.Height);
            DrawShapeText(g, shape, rect, false);
            if (selected)
            {
                DrawSelectionHandles(g, rect);
                DrawCollapseButtonVisual(g, GetCollapseButtonBounds(shape, offset), shape.IsCollapsed, shape.BorderColorArgb);
            }
            else
            {
                DrawCollapseButtonVisual(g, GetCollapseButtonBounds(shape, offset), shape.IsCollapsed, shape.BorderColorArgb);
            }
            return;
        }

        if (shape.Kind == ShapeKind.Cylinder)
        {
            DrawCylinder(g, fillBrush, borderPen, rect);
        }
        else if (shape.Kind == ShapeKind.Database)
        {
            DrawDatabase(g, fillBrush, borderPen, rect);
        }
        else if (shape.Kind == ShapeKind.Note)
        {
            DrawNote(g, fillBrush, borderPen, rect);
        }
        else if (shape.Kind == ShapeKind.Delay)
        {
            DrawDelay(g, fillBrush, borderPen, rect);
        }
        else if (shape.Kind == ShapeKind.Donut)
        {
            DrawDonut(g, fillBrush, borderPen, rect);
        }
        else if (shape.Kind == ShapeKind.FlowPredefinedProcess)
        {
            DrawFlowPredefinedProcess(g, fillBrush, borderPen, rect);
        }
        else if (shape.Kind == ShapeKind.FlowSummingJunction)
        {
            DrawFlowSummingJunction(g, fillBrush, borderPen, rect);
        }
        else if (shape.Kind == ShapeKind.FlowOr)
        {
            DrawFlowOr(g, fillBrush, borderPen, rect);
        }
        else if (shape.Kind == ShapeKind.FlowSort)
        {
            DrawFlowSort(g, fillBrush, borderPen, rect);
        }
        else if (shape.Kind == ShapeKind.ArrowStriped)
        {
            DrawArrowStriped(g, fillBrush, borderPen, rect);
        }
        else if (IsNetworkShape(shape.Kind))
        {
            DispatchNetworkDraw(g, fillBrush, borderPen, rect, shape.Kind);
        }
        else if (Is3DShape(shape.Kind))
        {
            Dispatch3DDraw(g, fillBrush, borderPen, rect, shape.Kind);
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
        {
            DrawSelectionHandles(g, rect);
            DrawCollapseButtonVisual(g, GetCollapseButtonBounds(shape, offset), shape.IsCollapsed, shape.BorderColorArgb);
        }
    }

    public static RectangleF GetCollapseButtonBounds(DiagramShape shape, PointF offset = default)
    {
        var r = OffsetRect(shape.EffectiveBounds, offset);
        const float Sz = 14f;
        return new RectangleF(r.Right - Sz - 2f, r.Y + (r.Height - Sz) / 2f, Sz, Sz);
    }

    private static void DrawCollapseButtonVisual(Graphics g, RectangleF btn, bool collapsed, int borderArgb)
    {
        using var bg = new SolidBrush(Color.FromArgb(220, 240, 248, 255));
        using var pen = new Pen(Color.FromArgb(100, Color.FromArgb(borderArgb)), 1.2f);
        g.FillEllipse(bg, btn);
        g.DrawEllipse(pen, btn);

        float cx = btn.X + btn.Width / 2f;
        float cy = btn.Y + btn.Height / 2f;
        float s = btn.Width * 0.22f;
        using var cp = new Pen(Color.FromArgb(90, 110, 160), 1.6f) { LineJoin = LineJoin.Round };
        if (collapsed)
        {
            g.DrawLines(cp, [new PointF(cx - s, cy - s * 1.4f), new PointF(cx + s, cy), new PointF(cx - s, cy + s * 1.4f)]);
        }
        else
        {
            g.DrawLines(cp, [new PointF(cx - s * 1.4f, cy - s), new PointF(cx, cy + s), new PointF(cx + s * 1.4f, cy - s)]);
        }
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

        if (kind == ShapeKind.Database)
        {
            using var fb = new SolidBrush(Color.FromArgb(30, 37, 99, 235));
            DrawDatabase(g, fb, borderPen, rect);
            return;
        }

        if (kind == ShapeKind.Note)
        {
            DrawNote(g, fillBrush, borderPen, rect);
            return;
        }

        if (kind == ShapeKind.Delay)
        {
            DrawDelay(g, fillBrush, borderPen, rect);
            return;
        }

        if (kind == ShapeKind.Donut) { DrawDonut(g, fillBrush, borderPen, rect); return; }
        if (kind == ShapeKind.FlowPredefinedProcess) { DrawFlowPredefinedProcess(g, fillBrush, borderPen, rect); return; }
        if (kind == ShapeKind.FlowSummingJunction) { DrawFlowSummingJunction(g, fillBrush, borderPen, rect); return; }
        if (kind == ShapeKind.FlowOr) { DrawFlowOr(g, fillBrush, borderPen, rect); return; }
        if (kind == ShapeKind.FlowSort) { DrawFlowSort(g, fillBrush, borderPen, rect); return; }
        if (kind == ShapeKind.ArrowStriped) { DrawArrowStriped(g, fillBrush, borderPen, rect); return; }

        if (IsNetworkShape(kind))
        {
            DispatchNetworkDraw(g, fillBrush, borderPen, rect, kind);
            return;
        }

        if (Is3DShape(kind))
        {
            Dispatch3DDraw(g, fillBrush, borderPen, rect, kind);
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

    public static PointF GetConnectionPoint(DiagramShape from, DiagramShape to, float? anchorAngle, PointF offset = default)
    {
        if (anchorAngle.HasValue)
            return GetConnectionPointAtAngle(from, anchorAngle.Value, offset);
        return GetConnectionPoint(from, to, offset);
    }

    public static PointF GetConnectionPoint(DiagramShape from, DiagramShape to, PointF offset = default)
    {
        var effectiveBounds = from.EffectiveBounds;
        var fromCenter = new PointF(
            effectiveBounds.X + effectiveBounds.Width / 2 + offset.X,
            effectiveBounds.Y + effectiveBounds.Height / 2 + offset.Y);
        var toEB = to.EffectiveBounds;
        var toCenter = new PointF(
            toEB.X + toEB.Width / 2 + offset.X,
            toEB.Y + toEB.Height / 2 + offset.Y);

        var offsetBounds = OffsetRect(effectiveBounds, offset);

        if (from.IsCollapsed
            || from.Kind == ShapeKind.Cylinder || from.Kind == ShapeKind.Database
            || from.Kind == ShapeKind.Delay || IsNetworkShape(from.Kind))
            return GetBoundsEdgePoint(offsetBounds, fromCenter, toCenter);

        using var path = CreateShapePath(from.Kind, offsetBounds);
        return RayIntersectPath(path, fromCenter, toCenter)
            ?? GetBoundsEdgePoint(offsetBounds, fromCenter, toCenter);
    }

    private static PointF GetConnectionPointAtAngle(DiagramShape shape, float angleDeg, PointF offset)
    {
        var bounds = OffsetRect(shape.EffectiveBounds, offset);
        if (shape.IsCollapsed || shape.Kind == ShapeKind.Cylinder || shape.Kind == ShapeKind.Database
            || shape.Kind == ShapeKind.Delay || IsNetworkShape(shape.Kind))
            return GetRectEdgePointAtAngle(bounds, angleDeg);

        float cx = bounds.X + bounds.Width / 2;
        float cy = bounds.Y + bounds.Height / 2;
        float rad = angleDeg * MathF.PI / 180f;
        var far = new PointF(cx + MathF.Cos(rad) * 10000f, cy + MathF.Sin(rad) * 10000f);
        using var path = CreateShapePath(shape.Kind, bounds);
        return RayIntersectPath(path, new PointF(cx, cy), far)
            ?? GetRectEdgePointAtAngle(bounds, angleDeg);
    }

    private static PointF GetRectEdgePointAtAngle(RectangleF rect, float angleDeg)
    {
        float cx = rect.X + rect.Width / 2;
        float cy = rect.Y + rect.Height / 2;
        float rad = angleDeg * MathF.PI / 180f;
        float dx = MathF.Cos(rad);
        float dy = MathF.Sin(rad);
        float t = float.MaxValue;
        if (MathF.Abs(dx) > 0.001f)
        {
            float tx = dx > 0 ? (rect.Right  - cx) / dx : (rect.X      - cx) / dx;
            if (tx > 0) t = MathF.Min(t, tx);
        }
        if (MathF.Abs(dy) > 0.001f)
        {
            float ty = dy > 0 ? (rect.Bottom - cy) / dy : (rect.Y      - cy) / dy;
            if (ty > 0) t = MathF.Min(t, ty);
        }
        if (t == float.MaxValue) t = 1f;
        return new PointF(
            Math.Clamp(cx + dx * t, rect.X, rect.Right),
            Math.Clamp(cy + dy * t, rect.Y, rect.Bottom));
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

    public static float InferAnchorAngle(DiagramShape shape, PointF connectionPoint)
    {
        float cx = shape.X + shape.Width / 2f;
        float cy = shape.Y + shape.Height / 2f;
        float dx = connectionPoint.X - cx;
        float dy = connectionPoint.Y - cy;
        if (Math.Abs(dx) < 0.001f && Math.Abs(dy) < 0.001f)
            return 0f;

        return MathF.Atan2(dy, dx) * 180f / MathF.PI;
    }

    public static bool IsOrthogonalVerticalFirst(PointF start, PointF end, DiagramConnector? connector = null)
        => ShouldRouteVerticalFirst(start, end, connector);

    public static PointF GetOrthogonalBendHandle(PointF start, PointF end, DiagramConnector connector)
    {
        var points = BuildConnectorPoints(connector.Kind, start, end, connector);
        if (points.Length < 3)
            return new PointF((start.X + end.X) / 2f, (start.Y + end.Y) / 2f);

        if (ShouldRouteVerticalFirst(start, end, connector))
            return new PointF((points[1].X + points[2].X) / 2f, points[1].Y);

        return new PointF(points[1].X, (points[1].Y + points[2].Y) / 2f);
    }

    public static PointF[] BuildConnectorPoints(ConnectorKind kind, PointF start, PointF end,
        DiagramConnector? connector = null)
    {
        switch (kind)
        {
            case ConnectorKind.Orthogonal:
            case ConnectorKind.RightAngleCurved:
                return BuildOrthogonalPoints(start, end, connector);
            case ConnectorKind.Curved:
            {
                float straightMidX = (start.X + end.X) / 2f;
                float straightMidY = (start.Y + end.Y) / 2f;
                if (connector is { CurveMidOffsetX: not null } or { CurveMidOffsetY: not null })
                {
                    // User-adjusted curve: both control points at ctrl, which is derived from
                    // the visual midpoint (handle) the user dragged: ctrl = midHandle * (4/3) - midStraight*(1/3)
                    float offX = connector.CurveMidOffsetX ?? 0f;
                    float offY = connector.CurveMidOffsetY ?? 0f;
                    float ctrlX = straightMidX + offX * 4f / 3f;
                    float ctrlY = straightMidY + offY * 4f / 3f;
                    return [start, new(ctrlX, ctrlY), new(ctrlX, ctrlY), end];
                }
                // Default: S-curve with control points at mid-X, start/end Y
                return [start, new(straightMidX, start.Y), new(straightMidX, end.Y), end];
            }
            default:
                return [start, end];
        }
    }

    private static PointF[] BuildOrthogonalPoints(PointF start, PointF end, DiagramConnector? connector)
    {
        if (ShouldRouteVerticalFirst(start, end, connector))
        {
            float midY = connector?.OrthoMidY ?? (start.Y + end.Y) / 2f;
            return SimplifyOrthogonalPath([start, new(start.X, midY), new(end.X, midY), end]);
        }

        float midX = connector?.OrthoMidX ?? (start.X + end.X) / 2f;
        return SimplifyOrthogonalPath([start, new(midX, start.Y), new(midX, end.Y), end]);
    }

    private static bool ShouldRouteVerticalFirst(PointF start, PointF end, DiagramConnector? connector)
    {
        if (connector?.OrthoMidY is not null)
            return true;
        if (connector?.OrthoMidX is not null)
            return false;

        int startAxis = GetAnchorAxis(connector?.SourceAnchorAngle);
        int endAxis = GetAnchorAxis(connector?.TargetAnchorAngle);

        if (startAxis == 2 && endAxis == 2)
            return true;
        if (startAxis == 1 && endAxis == 1)
            return false;
        if (startAxis == 2 && endAxis == 1)
            return true;
        if (startAxis == 1 && endAxis == 2)
            return false;

        float dx = Math.Abs(end.X - start.X);
        float dy = Math.Abs(end.Y - start.Y);
        return dy > dx;
    }

    private static int GetAnchorAxis(float? angleDeg)
    {
        if (!angleDeg.HasValue)
            return 0;

        float a = ((angleDeg.Value % 360f) + 360f) % 360f;
        if (a <= 45f || a >= 315f || (a >= 135f && a <= 225f))
            return 1;

        return 2;
    }

    private static PointF[] SimplifyOrthogonalPath(PointF[] raw)
    {
        if (raw.Length == 0)
            return [];

        var simplified = new List<PointF> { raw[0] };
        for (int i = 1; i < raw.Length; i++)
        {
            var point = raw[i];
            var previous = simplified[^1];
            if (DistanceBetween(point, previous) < 0.5f)
                continue;

            if (simplified.Count >= 2)
            {
                var beforePrevious = simplified[^2];
                bool sameColumn = Math.Abs(beforePrevious.X - previous.X) < 0.5f
                    && Math.Abs(previous.X - point.X) < 0.5f;
                bool sameRow = Math.Abs(beforePrevious.Y - previous.Y) < 0.5f
                    && Math.Abs(previous.Y - point.Y) < 0.5f;
                if (sameColumn || sameRow)
                {
                    simplified[^1] = point;
                    continue;
                }
            }

            simplified.Add(point);
        }

        return simplified.Count >= 2 ? simplified.ToArray() : [raw[0], raw[^1]];
    }

    private static float DistanceBetween(PointF a, PointF b)
    {
        float dx = a.X - b.X;
        float dy = a.Y - b.Y;
        return MathF.Sqrt(dx * dx + dy * dy);
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
        var start = GetConnectionPoint(source, target, connector.SourceAnchorAngle, offset);
        var end   = GetConnectionPoint(target, source, connector.TargetAnchorAngle, offset);
        var points = BuildConnectorPoints(connector.Kind, start, end, connector);

        using var pen = CreatePen(connector.LineColorArgb, connector.LineWidth, connector.LineStyle);
        using var bgBrush = new SolidBrush(Color.White);

        const float bridgeRadius = 7f;

        if (connector.LineStyle == LineStyle.Double)
        {
            DrawDoubleLine(g, points, connector.LineColorArgb, connector.LineWidth);
        }
        else if (connector.Kind == ConnectorKind.Curved && points.Length == 4)
        {
            if (crossings.Count == 0)
            {
                g.DrawBezier(pen, points[0], points[1], points[2], points[3]);
            }
            else
            {
                // Flatten the Bezier to a polyline with the same step count used during crossing
                // detection so that the T values in crossings correspond to segment indices here.
                var flatBez = FlattenBezier(points[0], points[1], points[2], points[3]);
                var sortedCrossings = crossings.OrderBy(c => c.T).ToList();
                DrawPolylineWithBridges(g, pen, flatBez, sortedCrossings, bridgeRadius);
            }
        }
        else if (connector.Kind == ConnectorKind.RightAngleCurved)
        {
            if (crossings.Count == 0)
                DrawRoundedPolyline(g, pen, points);
            else
            {
                var sortedCrossings = crossings.OrderBy(c => c.T).ToList();
                DrawPolylineWithBridges(g, pen, points, sortedCrossings, bridgeRadius);
            }
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
            DrawArrowHead(g, pen, points[1], points[0], connector.StartArrowStyle);
        if (connector.HasEndArrow && points.Length >= 2)
            DrawArrowHead(g, pen, points[^2], points[^1], connector.EndArrowStyle);

        if (!string.IsNullOrWhiteSpace(connector.Label))
        {
            var mid = points[points.Length / 2];
            using var font = new Font("맑은 고딕", 9f);
            using var brush = new SolidBrush(Color.FromArgb(connector.LineColorArgb));
            var size = g.MeasureString(connector.Label, font);
            g.DrawString(connector.Label, font, brush, mid.X - size.Width / 2, mid.Y - size.Height / 2);
        }
    }

    private static void DrawRoundedPolyline(Graphics g, Pen pen, PointF[] pts, float radius = 14f)
    {
        if (pts.Length < 2) return;
        if (pts.Length == 2) { g.DrawLine(pen, pts[0], pts[1]); return; }

        PointF cur = pts[0];
        for (int i = 1; i < pts.Length - 1; i++)
        {
            PointF corner = pts[i];
            PointF next   = pts[i + 1];

            float d1x = corner.X - cur.X, d1y = corner.Y - cur.Y;
            float d2x = next.X - corner.X, d2y = next.Y - corner.Y;
            float len1 = MathF.Sqrt(d1x * d1x + d1y * d1y);
            float len2 = MathF.Sqrt(d2x * d2x + d2y * d2y);
            if (len1 < 0.001f || len2 < 0.001f) continue;
            d1x /= len1; d1y /= len1;
            d2x /= len2; d2y /= len2;

            float clamp = Math.Min(radius, Math.Min(len1 / 2f, len2 / 2f));
            var p1 = new PointF(corner.X - d1x * clamp, corner.Y - d1y * clamp);
            var p2 = new PointF(corner.X + d2x * clamp, corner.Y + d2y * clamp);

            g.DrawLine(pen, cur, p1);
            g.DrawBezier(pen, p1, corner, corner, p2);  // cubic bezier approximating arc
            cur = p2;
        }
        g.DrawLine(pen, cur, pts[^1]);
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

    // Flatten a cubic Bezier into a dense polyline for intersection detection and bridge rendering.
    public static PointF[] FlattenBezier(PointF p0, PointF p1, PointF p2, PointF p3, int steps = 32)
    {
        var pts = new PointF[steps + 1];
        for (int i = 0; i <= steps; i++)
        {
            float t = (float)i / steps;
            float u = 1f - t;
            pts[i] = new PointF(
                u*u*u * p0.X + 3*u*u*t * p1.X + 3*u*t*t * p2.X + t*t*t * p3.X,
                u*u*u * p0.Y + 3*u*u*t * p1.Y + 3*u*t*t * p2.Y + t*t*t * p3.Y);
        }
        return pts;
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

        if (kind == ShapeKind.Database)
        {
            DrawDatabase(g, fillBrush, borderPen, rect);
            return;
        }

        if (kind == ShapeKind.Note)
        {
            DrawNote(g, fillBrush, borderPen, rect);
            return;
        }

        if (kind == ShapeKind.Delay)
        {
            DrawDelay(g, fillBrush, borderPen, rect);
            return;
        }

        if (kind == ShapeKind.Donut) { DrawDonut(g, fillBrush, borderPen, rect); return; }
        if (kind == ShapeKind.FlowPredefinedProcess) { DrawFlowPredefinedProcess(g, fillBrush, borderPen, rect); return; }
        if (kind == ShapeKind.FlowSummingJunction) { DrawFlowSummingJunction(g, fillBrush, borderPen, rect); return; }
        if (kind == ShapeKind.FlowOr) { DrawFlowOr(g, fillBrush, borderPen, rect); return; }
        if (kind == ShapeKind.FlowSort) { DrawFlowSort(g, fillBrush, borderPen, rect); return; }
        if (kind == ShapeKind.ArrowStriped) { DrawArrowStriped(g, fillBrush, borderPen, rect); return; }

        if (IsNetworkShape(kind))
        {
            DispatchNetworkDraw(g, fillBrush, borderPen, rect, kind);
            return;
        }

        if (Is3DShape(kind))
        {
            Dispatch3DDraw(g, fillBrush, borderPen, rect, kind);
            return;
        }

        using var path = CreateShapePath(kind, rect);
        g.FillPath(fillBrush, path);
        g.DrawPath(borderPen, path);
    }

    public static bool HitTestShape(DiagramShape shape, PointF point)
    {
        var bounds = shape.EffectiveBounds;
        if (shape.IsCollapsed
            || shape.Kind == ShapeKind.Cylinder || shape.Kind == ShapeKind.Database
            || shape.Kind == ShapeKind.Delay || IsNetworkShape(shape.Kind))
            return bounds.Contains(point);

        using var path = CreateShapePath(shape.Kind, bounds);
        return path.IsVisible(point);
    }

    public static float GetConnectorHitTolerance(DiagramConnector connector, float zoom)
    {
        float zoomFactor = Math.Max(zoom, 0.1f);
        return Math.Max(24f / zoomFactor, (connector.LineWidth + 18f) / zoomFactor);
    }

    public static float GetDistanceToConnector(
        DiagramConnector connector,
        DiagramShape source,
        DiagramShape target,
        PointF point)
    {
        var start = GetConnectionPoint(source, target, connector.SourceAnchorAngle);
        var end = GetConnectionPoint(target, source, connector.TargetAnchorAngle);
        var points = BuildConnectorPoints(connector.Kind, start, end, connector);
        return GetDistanceToConnectorPath(connector.Kind, points, point);
    }

    public static bool HitTestConnector(
        DiagramConnector connector,
        DiagramShape source,
        DiagramShape target,
        PointF point,
        float tolerance)
        => GetDistanceToConnector(connector, source, target, point) <= tolerance;

    private static float GetDistanceToConnectorPath(ConnectorKind kind, PointF[] points, PointF point)
    {
        if (points.Length < 2)
            return float.MaxValue;

        if (kind == ConnectorKind.Curved && points.Length == 4)
            return DistanceToBezier(points[0], points[1], points[2], points[3], point);

        if (kind == ConnectorKind.RightAngleCurved)
            return DistanceToRoundedPolyline(points, point);

        float min = float.MaxValue;
        for (int i = 1; i < points.Length; i++)
            min = Math.Min(min, DistanceToSegment(point, points[i - 1], points[i]));

        return min;
    }

    private static float DistanceToRoundedPolyline(PointF[] pts, PointF point, float radius = 14f)
    {
        if (pts.Length < 2)
            return float.MaxValue;
        if (pts.Length == 2)
            return DistanceToSegment(point, pts[0], pts[1]);

        float min = float.MaxValue;
        PointF cur = pts[0];
        for (int i = 1; i < pts.Length - 1; i++)
        {
            PointF corner = pts[i];
            PointF next = pts[i + 1];

            float d1x = corner.X - cur.X, d1y = corner.Y - cur.Y;
            float d2x = next.X - corner.X, d2y = next.Y - corner.Y;
            float len1 = MathF.Sqrt(d1x * d1x + d1y * d1y);
            float len2 = MathF.Sqrt(d2x * d2x + d2y * d2y);
            if (len1 < 0.001f || len2 < 0.001f)
                continue;

            d1x /= len1; d1y /= len1;
            d2x /= len2; d2y /= len2;

            float clamp = Math.Min(radius, Math.Min(len1 / 2f, len2 / 2f));
            var p1 = new PointF(corner.X - d1x * clamp, corner.Y - d1y * clamp);
            var p2 = new PointF(corner.X + d2x * clamp, corner.Y + d2y * clamp);

            min = Math.Min(min, DistanceToSegment(point, cur, p1));
            min = Math.Min(min, DistanceToBezier(cur, p1, corner, p2, point));
            cur = p2;
        }

        min = Math.Min(min, DistanceToSegment(point, cur, pts[^1]));
        return min;
    }

    private static float DistanceToBezier(PointF p0, PointF p1, PointF p2, PointF p3, PointF point, int steps = 28)
    {
        float min = float.MaxValue;
        PointF prev = p0;
        for (int i = 1; i <= steps; i++)
        {
            float t = i / (float)steps;
            var current = CubicBezierPoint(p0, p1, p2, p3, t);
            min = Math.Min(min, DistanceToSegment(point, prev, current));
            prev = current;
        }

        return min;
    }

    private static PointF CubicBezierPoint(PointF p0, PointF p1, PointF p2, PointF p3, float t)
    {
        float u = 1f - t;
        float tt = t * t;
        float uu = u * u;
        float uuu = uu * u;
        float ttt = tt * t;

        float x = uuu * p0.X + 3f * uu * t * p1.X + 3f * u * tt * p2.X + ttt * p3.X;
        float y = uuu * p0.Y + 3f * uu * t * p1.Y + 3f * u * tt * p2.Y + ttt * p3.Y;
        return new PointF(x, y);
    }

    private static float DistanceToSegment(PointF point, PointF a, PointF b)
    {
        float dx = b.X - a.X;
        float dy = b.Y - a.Y;
        if (Math.Abs(dx) < 0.0001f && Math.Abs(dy) < 0.0001f)
            return Distance(point, a);

        float t = ((point.X - a.X) * dx + (point.Y - a.Y) * dy) / (dx * dx + dy * dy);
        t = Math.Clamp(t, 0f, 1f);
        var projection = new PointF(a.X + t * dx, a.Y + t * dy);
        return Distance(point, projection);
    }

    private static bool IsNetworkShape(ShapeKind kind) =>
        kind is ShapeKind.NetworkServer   or ShapeKind.NetworkRouter  or ShapeKind.NetworkSwitch
            or ShapeKind.NetworkPC        or ShapeKind.NetworkFirewall or ShapeKind.NetworkHub
            or ShapeKind.NetworkPrinter   or ShapeKind.NetworkWifi
            or ShapeKind.NetworkInternet  or ShapeKind.NetworkStorage  or ShapeKind.NetworkLaptop
            or ShapeKind.NetworkMobile    or ShapeKind.NetworkIPPhone  or ShapeKind.NetworkRack
            or ShapeKind.NetworkTablet    or ShapeKind.NetworkGateway;

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

    private static void DrawDatabase(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float eh = Math.Max(6f, rect.Height * 0.18f);
        var topEllipse    = new RectangleF(rect.X, rect.Y,           rect.Width, eh);
        var bottomEllipse = new RectangleF(rect.X, rect.Bottom - eh, rect.Width, eh);

        // Fill body
        g.FillRectangle(fill, new RectangleF(rect.X, rect.Y + eh / 2, rect.Width, rect.Height - eh));
        g.FillEllipse(fill, bottomEllipse);
        g.FillEllipse(fill, topEllipse);

        // Side lines and bottom arc
        g.DrawLine(border, rect.X,     rect.Y + eh / 2, rect.X,     rect.Bottom - eh / 2);
        g.DrawLine(border, rect.Right, rect.Y + eh / 2, rect.Right, rect.Bottom - eh / 2);
        g.DrawArc(border, bottomEllipse, 0, 180);
        g.DrawEllipse(border, topEllipse);

        // Layer divider arcs (front-facing only, visible semicircle)
        float bodyH = rect.Height - eh;
        for (int i = 1; i <= 2; i++)
        {
            float layerY = rect.Y + eh / 2 + bodyH * i / 3f - eh / 2;
            var layerEllipse = new RectangleF(rect.X, layerY, rect.Width, eh);
            g.DrawArc(border, layerEllipse, 0, 180);
        }
    }

    private static void DrawNote(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float fold = Math.Min(rect.Width * 0.22f, Math.Min(rect.Height * 0.22f, 20f));
        PointF[] pts = [
            new(rect.X, rect.Y),
            new(rect.Right - fold, rect.Y),
            new(rect.Right, rect.Y + fold),
            new(rect.Right, rect.Bottom),
            new(rect.X, rect.Bottom)
        ];
        using var path = new GraphicsPath();
        path.AddPolygon(pts);
        g.FillPath(fill, path);
        g.DrawPath(border, path);
        // Fold crease decoration
        g.DrawLine(border, rect.Right - fold, rect.Y, rect.Right - fold, rect.Y + fold);
        g.DrawLine(border, rect.Right - fold, rect.Y + fold, rect.Right, rect.Y + fold);
    }

    private static void DrawDelay(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float r = rect.Height / 2f;
        float bodyW = Math.Max(0, rect.Width - r);
        var arcRect = new RectangleF(rect.Right - r * 2, rect.Y, r * 2, rect.Height);

        g.FillRectangle(fill, new RectangleF(rect.X, rect.Y, bodyW + r, rect.Height));
        g.FillPie(fill, arcRect, -90, 180);

        g.DrawLine(border, rect.X, rect.Y,      rect.Right - r, rect.Y);
        g.DrawLine(border, rect.X, rect.Bottom, rect.Right - r, rect.Bottom);
        g.DrawLine(border, rect.X, rect.Y, rect.X, rect.Bottom);
        g.DrawArc(border, arcRect, -90, 180);
    }

    private static void DrawNetworkServer(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        g.FillRectangle(fill, rect);
        g.DrawRectangle(border, rect.X, rect.Y, rect.Width, rect.Height);
        int slots = 3;
        float slotH = rect.Height / slots;
        for (int i = 1; i < slots; i++)
            g.DrawLine(border, rect.X, rect.Y + slotH * i, rect.Right, rect.Y + slotH * i);
        using var ledBrush = new SolidBrush(Color.FromArgb(60, 200, 60));
        float dotR = Math.Min(slotH * 0.2f, 3.5f);
        float dotX = rect.Right - rect.Width * 0.1f;
        for (int i = 0; i < slots; i++)
            g.FillEllipse(ledBrush, dotX - dotR, rect.Y + slotH * (i + 0.5f) - dotR, dotR * 2, dotR * 2);
    }

    private static void DrawNetworkRouter(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        g.FillEllipse(fill, rect);
        g.DrawEllipse(border, rect);
        float cx = rect.X + rect.Width / 2f;
        float cy = rect.Y + rect.Height / 2f;
        float inner = Math.Min(rect.Width, rect.Height) * 0.15f;
        float outer = Math.Min(rect.Width, rect.Height) * 0.38f;
        DrawRouterArrow(g, border, cx, cy - inner, cx, cy - outer);
        DrawRouterArrow(g, border, cx, cy + inner, cx, cy + outer);
        DrawRouterArrow(g, border, cx + inner, cy, cx + outer, cy);
        DrawRouterArrow(g, border, cx - inner, cy, cx - outer, cy);
    }

    private static void DrawRouterArrow(Graphics g, Pen pen, float x1, float y1, float x2, float y2)
    {
        g.DrawLine(pen, x1, y1, x2, y2);
        float dx = x2 - x1, dy = y2 - y1;
        float len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 0.001f) return;
        dx /= len; dy /= len;
        float s = len * 0.45f;
        float cosA = MathF.Cos(MathF.PI / 5f);
        float sinA = MathF.Sin(MathF.PI / 5f);
        g.DrawLine(pen, x2, y2, x2 - s * (dx * cosA - dy * sinA), y2 - s * (dy * cosA + dx * sinA));
        g.DrawLine(pen, x2, y2, x2 - s * (dx * cosA + dy * sinA), y2 - s * (dy * cosA - dx * sinA));
    }

    private static void DrawNetworkSwitch(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        g.FillRectangle(fill, rect);
        g.DrawRectangle(border, rect.X, rect.Y, rect.Width, rect.Height);
        int portCount = Math.Max(2, Math.Min(8, (int)(rect.Width / 12f)));
        float portH = Math.Min(rect.Height * 0.3f, 10f);
        float portW = portH * 0.7f;
        float gap = (rect.Width - portCount * portW) / (portCount + 1);
        float portY = rect.Bottom - portH - rect.Height * 0.2f;
        for (int i = 0; i < portCount; i++)
            g.DrawRectangle(border, rect.X + gap + i * (portW + gap), portY, portW, portH);
    }

    private static void DrawNetworkPC(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float monH = rect.Height * 0.65f;
        float monW = rect.Width * 0.85f;
        float monX = rect.X + (rect.Width - monW) / 2f;
        var monRect = new RectangleF(monX, rect.Y, monW, monH);
        g.FillRectangle(fill, monRect);
        g.DrawRectangle(border, monRect.X, monRect.Y, monRect.Width, monRect.Height);
        float inset = monH * 0.1f;
        using var screenFill = new SolidBrush(Color.FromArgb(120, 135, 200, 235));
        g.FillRectangle(screenFill, monX + inset, rect.Y + inset, monW - inset * 2, monH - inset * 2);
        float cx = rect.X + rect.Width / 2f;
        float standH = rect.Height * 0.12f;
        g.DrawLine(border, cx, rect.Y + monH, cx, rect.Y + monH + standH);
        float baseW = rect.Width * 0.55f;
        g.DrawLine(border, cx - baseW / 2f, rect.Bottom, cx + baseW / 2f, rect.Bottom);
    }

    private static void DrawNetworkFirewall(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        g.FillRectangle(fill, rect);
        var state = g.Save();
        g.SetClip(rect);
        float step = Math.Min(rect.Width, rect.Height) / 5f;
        using var hatchPen = new Pen(Color.FromArgb(70, border.Color), border.Width * 0.6f);
        for (float d = -rect.Height; d < rect.Width; d += step)
            g.DrawLine(hatchPen, rect.X + d, rect.Y, rect.X + d + rect.Height, rect.Bottom);
        g.Restore(state);
        g.DrawRectangle(border, rect.X, rect.Y, rect.Width, rect.Height);
    }

    private static void DrawNetworkHub(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        g.FillEllipse(fill, rect);
        g.DrawEllipse(border, rect);
        float cx = rect.X + rect.Width / 2f;
        float cy = rect.Y + rect.Height / 2f;
        float innerR = Math.Min(rect.Width, rect.Height) * 0.12f;
        float outerR = Math.Min(rect.Width, rect.Height) * 0.40f;
        float dotR = Math.Min(3f, outerR * 0.15f);
        using var dotBrush = new SolidBrush(border.Color);
        for (int i = 0; i < 6; i++)
        {
            float angle = i * MathF.PI / 3f;
            float ox = cx + outerR * MathF.Cos(angle);
            float oy = cy + outerR * MathF.Sin(angle);
            g.DrawLine(border, cx + innerR * MathF.Cos(angle), cy + innerR * MathF.Sin(angle), ox, oy);
            g.FillEllipse(dotBrush, ox - dotR, oy - dotR, dotR * 2, dotR * 2);
        }
    }

    private static void DrawNetworkPrinter(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float bodyY = rect.Y + rect.Height * 0.28f;
        float bodyH = rect.Height * 0.72f;
        var bodyRect = new RectangleF(rect.X, bodyY, rect.Width, bodyH);
        g.FillRectangle(fill, bodyRect);
        g.DrawRectangle(border, bodyRect.X, bodyRect.Y, bodyRect.Width, bodyRect.Height);
        float paperW = rect.Width * 0.5f;
        float paperH = rect.Height * 0.32f;
        float paperX = rect.X + (rect.Width - paperW) / 2f;
        using var paperFill = new SolidBrush(Color.White);
        g.FillRectangle(paperFill, paperX, rect.Y, paperW, paperH);
        g.DrawRectangle(border, paperX, rect.Y, paperW, paperH);
    }

    private static void DrawNetworkWifi(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float cx = rect.X + rect.Width / 2f;
        float dotR = Math.Min(rect.Width, rect.Height) * 0.07f;
        float baseY = rect.Bottom - dotR * 3f;
        float available = baseY - rect.Y;
        using var arcPen = new Pen(border.Color, border.Width * 1.1f)
            { StartCap = LineCap.Round, EndCap = LineCap.Round };
        for (int i = 3; i >= 1; i--)
        {
            float r = available * i / 3.5f;
            g.DrawArc(arcPen, cx - r, baseY - r, r * 2, r * 2, 210, 120);
        }
        using var dotBrush = new SolidBrush(border.Color);
        g.FillEllipse(dotBrush, cx - dotR, baseY - dotR, dotR * 2, dotR * 2);
    }

    private static void DrawNetworkInternet(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        g.FillEllipse(fill, rect);
        g.DrawEllipse(border, rect);
        float cx = rect.X + rect.Width / 2f;
        float cy = rect.Y + rect.Height / 2f;
        g.DrawLine(border, cx, rect.Y, cx, rect.Bottom);
        float r = rect.Height / 2f;
        float[] latFracs = [0.28f, 0.50f, 0.72f];
        foreach (float frac in latFracs)
        {
            float ly = rect.Y + rect.Height * frac;
            float dy = ly - cy;
            float xOff = MathF.Sqrt(Math.Max(0f, r * r - dy * dy)) * rect.Width / rect.Height;
            g.DrawLine(border, cx - xOff, ly, cx + xOff, ly);
        }
        float ovalW = rect.Width * 0.52f;
        g.DrawEllipse(border, cx - ovalW / 2f, rect.Y, ovalW, rect.Height);
    }

    private static void DrawNetworkStorage(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        int disks = Math.Max(2, Math.Min(5, (int)(rect.Height / 16f)));
        float diskH = rect.Height / disks;
        g.FillRectangle(fill, rect);
        g.DrawRectangle(border, rect.X, rect.Y, rect.Width, rect.Height);
        using var diskFill = new SolidBrush(Color.FromArgb(230, 232, 238));
        using var ledBrush = new SolidBrush(Color.FromArgb(60, 190, 60));
        float pad = 1.5f;
        for (int i = 0; i < disks; i++)
        {
            var dr = new RectangleF(rect.X + 2f, rect.Y + i * diskH + pad, rect.Width - 4f, diskH - pad * 2);
            g.FillRectangle(diskFill, dr);
            g.DrawRectangle(border, dr.X, dr.Y, dr.Width, dr.Height);
            float lr = Math.Min(diskH * 0.22f, 4f);
            float lx = dr.Right - lr * 2.8f;
            float ly = dr.Y + dr.Height / 2f;
            g.FillEllipse(ledBrush, lx - lr, ly - lr, lr * 2, lr * 2);
        }
    }

    private static void DrawNetworkLaptop(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float screenH = rect.Height * 0.60f;
        float screenW = rect.Width * 0.86f;
        float screenX = rect.X + (rect.Width - screenW) / 2f;
        var screenRect = new RectangleF(screenX, rect.Y, screenW, screenH);
        g.FillRectangle(fill, screenRect);
        g.DrawRectangle(border, screenRect.X, screenRect.Y, screenRect.Width, screenRect.Height);
        float inset = screenH * 0.1f;
        using var screenFill = new SolidBrush(Color.FromArgb(120, 135, 200, 235));
        g.FillRectangle(screenFill, screenX + inset, rect.Y + inset, screenW - inset * 2, screenH - inset * 2);
        float baseH = rect.Height * 0.30f;
        float baseY = rect.Bottom - baseH;
        var baseRect = new RectangleF(rect.X, baseY, rect.Width, baseH);
        g.FillRectangle(fill, baseRect);
        g.DrawRectangle(border, baseRect.X, baseRect.Y, baseRect.Width, baseRect.Height);
        using var kbFill = new SolidBrush(Color.FromArgb(195, 198, 208));
        g.FillRectangle(kbFill, screenX + screenW * 0.08f, baseY + baseH * 0.25f, screenW * 0.84f, baseH * 0.45f);
    }

    private static void DrawNetworkMobile(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float rad = Math.Min(rect.Width, rect.Height) * 0.13f;
        using var path = CreateRoundedRect(rect, rad);
        g.FillPath(fill, path);
        g.DrawPath(border, path);
        float inset = rect.Width * 0.09f;
        float btnH = rect.Height * 0.13f;
        using var screenFill = new SolidBrush(Color.FromArgb(120, 135, 200, 235));
        g.FillRectangle(screenFill,
            rect.X + inset, rect.Y + inset,
            rect.Width - inset * 2, rect.Height - inset * 2 - btnH);
        float br = Math.Min(rect.Width * 0.11f, btnH * 0.42f);
        float bcx = rect.X + rect.Width / 2f;
        float bcy = rect.Bottom - btnH * 0.52f;
        using var btnFill = new SolidBrush(Color.FromArgb(195, 198, 208));
        g.FillEllipse(btnFill, bcx - br, bcy - br, br * 2, br * 2);
        g.DrawEllipse(border, bcx - br, bcy - br, br * 2, br * 2);
    }

    private static void DrawNetworkIPPhone(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        g.FillRectangle(fill, rect);
        g.DrawRectangle(border, rect.X, rect.Y, rect.Width, rect.Height);
        float hsW = rect.Width * 0.56f;
        float hsH = rect.Height * 0.26f;
        float hsX = rect.X + (rect.Width - hsW) / 2f;
        using var hsFill = new SolidBrush(Color.FromArgb(175, 178, 190));
        using var hsBorder = new Pen(border.Color, border.Width * 0.8f);
        using var hPath = CreateRoundedRect(new RectangleF(hsX, rect.Y + rect.Height * 0.04f, hsW, hsH), hsH * 0.44f);
        g.FillPath(hsFill, hPath);
        g.DrawPath(hsBorder, hPath);
        float kTop = rect.Y + rect.Height * 0.36f;
        float kLeft = rect.X + rect.Width * 0.14f;
        float kW = rect.Width * 0.72f;
        float kH = rect.Height * 0.54f;
        int cols = 3, rows = 4;
        float bW = kW / cols, bH = kH / rows;
        using var keyFill = new SolidBrush(Color.FromArgb(205, 210, 220));
        for (int row = 0; row < rows; row++)
            for (int col = 0; col < cols; col++)
                g.FillRectangle(keyFill, kLeft + col * bW + 1.5f, kTop + row * bH + 1.5f, bW - 3f, bH - 3f);
    }

    private static void DrawNetworkRack(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        g.FillRectangle(fill, rect);
        g.DrawRectangle(border, rect.X, rect.Y, rect.Width, rect.Height);
        float railW = Math.Min(rect.Width * 0.13f, 10f);
        using var railFill = new SolidBrush(Color.FromArgb(175, 178, 190));
        g.FillRectangle(railFill, rect.X, rect.Y, railW, rect.Height);
        g.FillRectangle(railFill, rect.Right - railW, rect.Y, railW, rect.Height);
        g.DrawLine(border, rect.X + railW, rect.Y, rect.X + railW, rect.Bottom);
        g.DrawLine(border, rect.Right - railW, rect.Y, rect.Right - railW, rect.Bottom);
        int slots = Math.Max(3, Math.Min(8, (int)(rect.Height / 14f)));
        float slotH = rect.Height / (slots + 1f);
        float slotX = rect.X + railW + 2f;
        float slotW = rect.Width - railW * 2 - 4f;
        using var slotFill = new SolidBrush(Color.FromArgb(205, 210, 220));
        using var ledBrush = new SolidBrush(Color.FromArgb(60, 200, 60));
        for (int i = 0; i < slots; i++)
        {
            float sy = rect.Y + slotH * (i + 0.65f) - slotH * 0.32f;
            var sr = new RectangleF(slotX, sy, slotW, slotH * 0.65f);
            g.FillRectangle(slotFill, sr);
            g.DrawRectangle(border, sr.X, sr.Y, sr.Width, sr.Height);
            float lr = Math.Min(slotH * 0.15f, 3.5f);
            g.FillEllipse(ledBrush, sr.Right - lr * 2.8f, sy + sr.Height / 2f - lr, lr * 2, lr * 2);
        }
    }

    private static void DrawNetworkTablet(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float rad = Math.Min(rect.Width, rect.Height) * 0.10f;
        using var path = CreateRoundedRect(rect, rad);
        g.FillPath(fill, path);
        g.DrawPath(border, path);
        float inset = rect.Height * 0.10f;
        float btnW = Math.Max(rect.Width * 0.06f, 6f);
        using var screenFill = new SolidBrush(Color.FromArgb(120, 135, 200, 235));
        g.FillRectangle(screenFill,
            rect.X + inset + btnW, rect.Y + inset,
            rect.Width - inset * 2 - btnW * 2, rect.Height - inset * 2);
        float br = Math.Min(rect.Height * 0.12f, btnW * 0.48f);
        float bcx = rect.Right - inset * 0.55f - btnW * 0.1f;
        float bcy = rect.Y + rect.Height / 2f;
        using var btnFill = new SolidBrush(Color.FromArgb(195, 198, 208));
        g.FillEllipse(btnFill, bcx - br, bcy - br, br * 2, br * 2);
        g.DrawEllipse(border, bcx - br, bcy - br, br * 2, br * 2);
    }

    private static void DrawNetworkGateway(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float bodyX = rect.X + rect.Width * 0.22f;
        float bodyW = rect.Width * 0.56f;
        var bodyRect = new RectangleF(bodyX, rect.Y, bodyW, rect.Height);
        g.FillRectangle(fill, bodyRect);
        g.DrawRectangle(border, bodyRect.X, bodyRect.Y, bodyRect.Width, bodyRect.Height);
        using var stripePen = new Pen(Color.FromArgb(50, border.Color), border.Width * 0.5f);
        float step = bodyW / 5f;
        for (int i = 1; i < 5; i++)
            g.DrawLine(stripePen, bodyX + step * i, rect.Y + 2f, bodyX + step * i, rect.Bottom - 2f);
        float cy = rect.Y + rect.Height / 2f;
        DrawRouterArrow(g, border, bodyX, cy, rect.X + rect.Width * 0.06f, cy);
        DrawRouterArrow(g, border, bodyX + bodyW, cy, rect.Right - rect.Width * 0.06f, cy);
    }

    private static bool Is3DShape(ShapeKind kind)
        => kind is ShapeKind.Shape3DCube or ShapeKind.Shape3DBox or ShapeKind.Shape3DSphere
            or ShapeKind.Shape3DPyramid or ShapeKind.Shape3DCone or ShapeKind.Shape3DCylinder
            or ShapeKind.Shape3DTriangularPrism or ShapeKind.Shape3DCapsule
            or ShapeKind.Shape3DGem or ShapeKind.Shape3DTorus;

    private readonly record struct IsoLayout(
        float OriginX, float OriginY, float FaceW, float FaceH, float SkewX, float SkewY);

    private static IsoLayout CreateIsoLayout(RectangleF rect, float faceWidthRatio, float faceHeightRatio)
    {
        float skewX = rect.Width * 0.24f;
        float skewY = rect.Height * 0.16f;
        float faceW = rect.Width * faceWidthRatio;
        float faceH = rect.Height * faceHeightRatio;
        float ox = rect.X + (rect.Width - faceW - skewX) / 2f;
        float oy = rect.Y + (rect.Height - faceH) / 2f + skewY;
        return new IsoLayout(ox, oy, faceW, faceH, skewX, skewY);
    }

    // Cube layout: faceW == faceH == side, computed so all three visible faces are square
    private static IsoLayout CreateCubeIsoLayout(RectangleF rect)
    {
        const float kx = 0.42f;
        const float ky = 0.28f;
        float side = Math.Min(rect.Width / (1f + kx), rect.Height / (1f + ky));
        float skewX = side * kx;
        float skewY = side * ky;
        float ox = rect.X + (rect.Width  - side - skewX) / 2f;
        float oy = rect.Y + (rect.Height - side + skewY) / 2f;
        return new IsoLayout(ox, oy, side, side, skewX, skewY);
    }

    private static Color GetBrushColor(Brush brush)
        => brush is SolidBrush solid ? solid.Color : Color.Gray;

    private static Color AdjustColor(Color color, float factor)
    {
        static int Scale(int channel, float scale)
            => Math.Clamp((int)(channel * scale), 0, 255);

        return Color.FromArgb(
            color.A,
            Scale(color.R, factor),
            Scale(color.G, factor),
            Scale(color.B, factor));
    }

    private static Color BlendColor(Color a, Color b, float t)
        => Color.FromArgb(
            (int)(a.A + (b.A - a.A) * t),
            (int)(a.R + (b.R - a.R) * t),
            (int)(a.G + (b.G - a.G) * t),
            (int)(a.B + (b.B - a.B) * t));

    private static void DrawIsoBoxFaces(
        Graphics g, IsoLayout iso, Brush front, Brush top, Brush right, Pen border)
    {
        var frontRect = new RectangleF(iso.OriginX, iso.OriginY, iso.FaceW, iso.FaceH);
        PointF[] topFace =
        [
            new(iso.OriginX, iso.OriginY),
            new(iso.OriginX + iso.SkewX, iso.OriginY - iso.SkewY),
            new(iso.OriginX + iso.SkewX + iso.FaceW, iso.OriginY - iso.SkewY),
            new(iso.OriginX + iso.FaceW, iso.OriginY)
        ];
        PointF[] rightFace =
        [
            new(iso.OriginX + iso.FaceW, iso.OriginY),
            new(iso.OriginX + iso.FaceW + iso.SkewX, iso.OriginY - iso.SkewY),
            new(iso.OriginX + iso.FaceW + iso.SkewX, iso.OriginY - iso.SkewY + iso.FaceH),
            new(iso.OriginX + iso.FaceW, iso.OriginY + iso.FaceH)
        ];

        g.FillPolygon(top, topFace);
        g.FillPolygon(right, rightFace);
        g.FillRectangle(front, frontRect);
        g.DrawPolygon(border, topFace);
        g.DrawPolygon(border, rightFace);
        g.DrawRectangle(border, frontRect.X, frontRect.Y, frontRect.Width, frontRect.Height);
    }

    private static PointF[] GetIsoBoxOutline(IsoLayout iso)
    {
        return
        [
            new(iso.OriginX, iso.OriginY),
            new(iso.OriginX + iso.SkewX, iso.OriginY - iso.SkewY),
            new(iso.OriginX + iso.SkewX + iso.FaceW, iso.OriginY - iso.SkewY),
            new(iso.OriginX + iso.FaceW + iso.SkewX, iso.OriginY - iso.SkewY),
            new(iso.OriginX + iso.FaceW + iso.SkewX, iso.OriginY - iso.SkewY + iso.FaceH),
            new(iso.OriginX + iso.FaceW, iso.OriginY + iso.FaceH),
            new(iso.OriginX, iso.OriginY + iso.FaceH)
        ];
    }

    private static void DrawShape3DCube(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        var iso = CreateCubeIsoLayout(rect);
        var baseColor = GetBrushColor(fill);
        using var topBrush = new SolidBrush(AdjustColor(baseColor, 1.14f));
        using var rightBrush = new SolidBrush(AdjustColor(baseColor, 0.78f));
        DrawIsoBoxFaces(g, iso, fill, topBrush, rightBrush, border);
    }

    private static void DrawShape3DBox(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        var iso = CreateIsoLayout(rect, 0.62f, 0.34f);
        var baseColor = GetBrushColor(fill);
        using var topBrush = new SolidBrush(AdjustColor(baseColor, 1.12f));
        using var rightBrush = new SolidBrush(AdjustColor(baseColor, 0.76f));
        DrawIsoBoxFaces(g, iso, fill, topBrush, rightBrush, border);
    }

    private static void DrawShape3DSphere(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        var body = InsetRect(rect, 0.08f);
        var baseColor = GetBrushColor(fill);

        using var ellipsePath = new System.Drawing.Drawing2D.GraphicsPath();
        ellipsePath.AddEllipse(body);

        using var radialBrush = new System.Drawing.Drawing2D.PathGradientBrush(ellipsePath);
        // Light source at upper-left: bright center-ish, dark at edges
        radialBrush.CenterPoint = new PointF(body.X + body.Width * 0.35f, body.Y + body.Height * 0.28f);
        radialBrush.CenterColor = BlendColor(baseColor, Color.White, 0.55f);
        radialBrush.SurroundColors = [AdjustColor(baseColor, 0.42f)];
        radialBrush.FocusScales = new PointF(0.0f, 0.0f);

        g.FillPath(radialBrush, ellipsePath);

        // Specular highlight (small bright spot upper-left)
        var highlight = new RectangleF(
            body.X + body.Width  * 0.18f,
            body.Y + body.Height * 0.10f,
            body.Width  * 0.28f,
            body.Height * 0.22f);
        using var specPath = new System.Drawing.Drawing2D.GraphicsPath();
        specPath.AddEllipse(highlight);
        using var specBrush = new System.Drawing.Drawing2D.PathGradientBrush(specPath);
        specBrush.CenterColor = Color.FromArgb(200, 255, 255, 255);
        specBrush.SurroundColors = [Color.FromArgb(0, 255, 255, 255)];
        g.FillPath(specBrush, specPath);

        g.DrawEllipse(border, body);
    }

    private static void DrawShape3DPyramid(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float cx = rect.X + rect.Width / 2f;
        var apex = new PointF(cx, rect.Y + rect.Height * 0.08f);
        PointF[] basePts =
        [
            new(rect.X + rect.Width * 0.18f, rect.Bottom - rect.Height * 0.08f),
            new(rect.X + rect.Width * 0.42f, rect.Bottom - rect.Height * 0.22f),
            new(rect.Right - rect.Width * 0.18f, rect.Bottom - rect.Height * 0.08f),
            new(rect.Right - rect.Width * 0.42f, rect.Bottom - rect.Height * 0.22f)
        ];

        var baseColor = GetBrushColor(fill);
        using var leftBrush = new SolidBrush(AdjustColor(baseColor, 0.8f));
        using var rightBrush = new SolidBrush(AdjustColor(baseColor, 0.92f));
        using var baseBrush = new SolidBrush(AdjustColor(baseColor, 0.68f));

        g.FillPolygon(leftBrush, [apex, basePts[0], basePts[1]]);
        g.FillPolygon(rightBrush, [apex, basePts[2], basePts[3]]);
        g.FillPolygon(baseBrush, basePts);
        g.DrawPolygon(border, [apex, basePts[0], basePts[1], apex]);
        g.DrawPolygon(border, [apex, basePts[2], basePts[3], apex]);
        g.DrawPolygon(border, basePts);
    }

    private static void DrawShape3DCone(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float cx = rect.X + rect.Width / 2f;
        var apex = new PointF(cx, rect.Y + rect.Height * 0.1f);
        float baseY = rect.Bottom - rect.Height * 0.1f;
        float rx = rect.Width * 0.34f;
        var baseRect = new RectangleF(cx - rx, baseY - rect.Height * 0.08f, rx * 2f, rect.Height * 0.16f);

        var baseColor = GetBrushColor(fill);
        using var sideBrush = new SolidBrush(AdjustColor(baseColor, 0.86f));
        using var baseBrush = new SolidBrush(AdjustColor(baseColor, 0.7f));

        PointF[] leftSide = [apex, new(baseRect.Left, baseRect.Top + baseRect.Height / 2f), new(cx, baseRect.Bottom)];
        PointF[] rightSide = [apex, new(baseRect.Right, baseRect.Top + baseRect.Height / 2f), new(cx, baseRect.Bottom)];
        g.FillPolygon(sideBrush, leftSide);
        g.FillPolygon(sideBrush, rightSide);
        g.FillEllipse(baseBrush, baseRect);
        g.DrawLines(border, [apex, leftSide[1], leftSide[2], rightSide[1], apex, rightSide[1]]);
        g.DrawArc(border, baseRect, 0, 180);
    }

    private static void DrawShape3DCylinder(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        var iso = CreateIsoLayout(rect, 0.42f, 0.5f);
        float eh = Math.Max(6f, iso.FaceH * 0.22f);
        var topEllipse = new RectangleF(iso.OriginX, iso.OriginY - iso.SkewY * 0.35f, iso.FaceW, eh);
        var bottomEllipse = new RectangleF(iso.OriginX, iso.OriginY + iso.FaceH - eh * 0.55f, iso.FaceW, eh);
        var body = new RectangleF(iso.OriginX, iso.OriginY + eh * 0.25f, iso.FaceW, iso.FaceH - eh * 0.35f);

        var baseColor = GetBrushColor(fill);
        using var sideBrush = new SolidBrush(AdjustColor(baseColor, 0.84f));
        using var topBrush = new SolidBrush(AdjustColor(baseColor, 1.1f));

        g.FillRectangle(sideBrush, body);
        g.FillEllipse(sideBrush, bottomEllipse);
        g.FillEllipse(topBrush, topEllipse);
        g.DrawLine(border, body.Left, body.Top, body.Left, body.Bottom);
        g.DrawLine(border, body.Right, body.Top, body.Right, body.Bottom);
        g.DrawArc(border, bottomEllipse, 0, 180);
        g.DrawEllipse(border, topEllipse);
    }

    private static void DrawShape3DTriangularPrism(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        // Front triangular face (left side), right rectangular face (parallelogram)
        float skewX = rect.Width * 0.26f;
        float skewY = rect.Height * 0.18f;
        float faceW = rect.Width * 0.52f;
        float faceH = rect.Height * 0.62f;
        float ox = rect.X + rect.Width * 0.06f;
        float oy = rect.Y + (rect.Height - faceH) / 2f + skewY;

        // Front triangle vertices
        var frontBot1 = new PointF(ox, oy + faceH);
        var frontBot2 = new PointF(ox + faceW, oy + faceH);
        var frontApex = new PointF(ox + faceW / 2f, oy);

        // Right face: each front vertex shifted by (skewX, -skewY)
        var rightBot1 = new PointF(frontBot2.X + skewX, frontBot2.Y - skewY);
        var rightApex = new PointF(frontApex.X + skewX, frontApex.Y - skewY);

        var baseColor = GetBrushColor(fill);
        using var topBrush   = new SolidBrush(AdjustColor(baseColor, 1.12f));
        using var rightBrush = new SolidBrush(AdjustColor(baseColor, 0.76f));

        // Right rectangular face (parallelogram)
        PointF[] rightFace = [frontBot2, rightBot1, rightApex, frontApex];
        // Top ridge face
        PointF[] topFace = [frontApex, rightApex, new PointF(ox + skewX, oy - skewY), new PointF(ox, oy)];

        g.FillPolygon(fill,       [frontBot1, frontBot2, frontApex]);
        g.FillPolygon(rightBrush, rightFace);
        g.FillPolygon(topBrush,   topFace);
        g.DrawPolygon(border, [frontBot1, frontBot2, frontApex]);
        g.DrawPolygon(border, rightFace);
        g.DrawPolygon(border, topFace);
    }

    private static void DrawShape3DCapsule(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float cx   = rect.X + rect.Width  / 2f;
        float cy   = rect.Y + rect.Height / 2f;
        float rx   = rect.Width  * 0.36f;
        float ry   = rect.Height * 0.48f;
        float capH = rx * 0.9f; // dome height

        var baseColor = GetBrushColor(fill);
        using var sideBrush   = new SolidBrush(AdjustColor(baseColor, 0.86f));
        using var bottomBrush = new SolidBrush(AdjustColor(baseColor, 0.72f));
        using var topBrush    = new SolidBrush(AdjustColor(baseColor, 1.08f));

        // Body rectangle between the two dome caps
        float bodyTop    = cy - ry + capH;
        float bodyBottom = cy + ry - capH;
        var bodyRect = new RectangleF(cx - rx, bodyTop, rx * 2f, bodyBottom - bodyTop);

        // Bottom dome ellipse
        var botEllipse = new RectangleF(cx - rx, bodyBottom - capH, rx * 2f, capH * 2f);
        // Top dome ellipse
        var topEllipse = new RectangleF(cx - rx, bodyTop - capH, rx * 2f, capH * 2f);

        g.FillRectangle(sideBrush, bodyRect);
        g.FillEllipse(bottomBrush, botEllipse);
        g.FillEllipse(topBrush,    topEllipse);

        // Outline: sides + bottom arc + top arc
        g.DrawLine(border, cx - rx, bodyTop, cx - rx, bodyBottom);
        g.DrawLine(border, cx + rx, bodyTop, cx + rx, bodyBottom);
        g.DrawArc(border, botEllipse, 0, 180);
        g.DrawArc(border, topEllipse, 180, 180);
    }

    private static void DrawShape3DGem(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float cx    = rect.X + rect.Width  / 2f;
        float topY  = rect.Y + rect.Height * 0.08f;
        float girY  = rect.Y + rect.Height * 0.38f; // girdle (widest)
        float botY  = rect.Bottom - rect.Height * 0.06f;
        float lx    = rect.X + rect.Width * 0.12f;
        float rx    = rect.Right - rect.Width * 0.12f;
        float mlx   = rect.X + rect.Width * 0.30f;
        float mrx   = rect.Right - rect.Width * 0.30f;

        // Crown (top half) vertices: table + upper girdle
        PointF tableL  = new(cx - rect.Width * 0.20f, topY);
        PointF tableR  = new(cx + rect.Width * 0.20f, topY);
        PointF girdleL = new(lx,  girY);
        PointF girdleML= new(mlx, girY);
        PointF girdleMR= new(mrx, girY);
        PointF girdleR = new(rx,  girY);
        PointF bot     = new(cx,  botY);

        var baseColor = GetBrushColor(fill);
        using var crownBrush  = new SolidBrush(AdjustColor(baseColor, 1.10f));
        using var leftBrush   = new SolidBrush(AdjustColor(baseColor, 0.82f));
        using var rightBrush  = new SolidBrush(AdjustColor(baseColor, 0.95f));
        using var pavBrush    = new SolidBrush(AdjustColor(baseColor, 0.68f));

        // Crown facets
        g.FillPolygon(crownBrush, [tableL, tableR, girdleMR, girdleML]);
        g.FillPolygon(leftBrush,  [tableL, girdleML, girdleL]);
        g.FillPolygon(rightBrush, [tableR, girdleR,  girdleMR]);
        // Pavilion facets
        g.FillPolygon(leftBrush,  [girdleL, bot, girdleML]);
        g.FillPolygon(pavBrush,   [girdleML, bot, girdleMR]);
        g.FillPolygon(rightBrush, [girdleMR, bot, girdleR]);

        // Outline
        PointF[] outline = [tableL, tableR, girdleR, bot, girdleL];
        g.DrawPolygon(border, outline);
        g.DrawLine(border, tableL, girdleL);
        g.DrawLine(border, tableR, girdleR);
        g.DrawLine(border, tableL, girdleML);
        g.DrawLine(border, tableR, girdleMR);
        g.DrawLine(border, girdleML, girdleMR);
        g.DrawLine(border, girdleML, bot);
        g.DrawLine(border, girdleMR, bot);
        g.DrawLine(border, girdleL,  bot);
        g.DrawLine(border, girdleR,  bot);
    }

    private static void DrawShape3DTorus(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        var outer = InsetRect(rect, 0.04f);
        float tubeRx = outer.Width  * 0.22f;
        float tubeRy = outer.Height * 0.22f;
        var inner = new RectangleF(
            outer.X + tubeRx, outer.Y + tubeRy,
            outer.Width - tubeRx * 2f, outer.Height - tubeRy * 2f);

        var baseColor = GetBrushColor(fill);
        using var ringBrush = new SolidBrush(AdjustColor(baseColor, 0.86f));

        // Draw torus as outer ellipse filled, then inner ellipse erased via clipping
        using var torusPath = new System.Drawing.Drawing2D.GraphicsPath();
        torusPath.AddEllipse(outer);
        torusPath.AddEllipse(inner);   // second sub-path creates donut hole via Alternate fill
        torusPath.FillMode = System.Drawing.Drawing2D.FillMode.Alternate;

        g.FillPath(fill, torusPath);

        // Shading band — inner shadow strip to give volume
        using var shadowBrush = new SolidBrush(Color.FromArgb(60, AdjustColor(baseColor, 0.3f)));
        float bx = outer.X + tubeRx * 0.6f;
        float by = outer.Y + tubeRy * 0.6f;
        var shadowBand = new RectangleF(bx, by, outer.Width - tubeRx * 1.2f, outer.Height - tubeRy * 1.2f);
        using var shadowPath = new System.Drawing.Drawing2D.GraphicsPath();
        shadowPath.AddEllipse(shadowBand);
        shadowPath.AddEllipse(inner);
        shadowPath.FillMode = System.Drawing.Drawing2D.FillMode.Alternate;
        g.FillPath(shadowBrush, shadowPath);

        g.DrawPath(border, torusPath);
    }

    private static RectangleF InsetRect(RectangleF rect, float ratio)
    {
        float padX = rect.Width * ratio;
        float padY = rect.Height * ratio;
        return new RectangleF(rect.X + padX, rect.Y + padY, rect.Width - padX * 2f, rect.Height - padY * 2f);
    }

    private static void Dispatch3DDraw(Graphics g, Brush fill, Pen border, RectangleF rect, ShapeKind kind)
    {
        switch (kind)
        {
            case ShapeKind.Shape3DCube:            DrawShape3DCube(g, fill, border, rect);            break;
            case ShapeKind.Shape3DBox:             DrawShape3DBox(g, fill, border, rect);             break;
            case ShapeKind.Shape3DSphere:          DrawShape3DSphere(g, fill, border, rect);          break;
            case ShapeKind.Shape3DPyramid:         DrawShape3DPyramid(g, fill, border, rect);         break;
            case ShapeKind.Shape3DCone:            DrawShape3DCone(g, fill, border, rect);            break;
            case ShapeKind.Shape3DCylinder:        DrawShape3DCylinder(g, fill, border, rect);        break;
            case ShapeKind.Shape3DTriangularPrism: DrawShape3DTriangularPrism(g, fill, border, rect); break;
            case ShapeKind.Shape3DCapsule:         DrawShape3DCapsule(g, fill, border, rect);         break;
            case ShapeKind.Shape3DGem:             DrawShape3DGem(g, fill, border, rect);             break;
            case ShapeKind.Shape3DTorus:           DrawShape3DTorus(g, fill, border, rect);           break;
        }
    }

    private static void DispatchNetworkDraw(Graphics g, Brush fill, Pen border, RectangleF rect, ShapeKind kind)
    {
        switch (kind)
        {
            case ShapeKind.NetworkServer:   DrawNetworkServer(g, fill, border, rect);   break;
            case ShapeKind.NetworkRouter:   DrawNetworkRouter(g, fill, border, rect);   break;
            case ShapeKind.NetworkSwitch:   DrawNetworkSwitch(g, fill, border, rect);   break;
            case ShapeKind.NetworkPC:       DrawNetworkPC(g, fill, border, rect);       break;
            case ShapeKind.NetworkFirewall: DrawNetworkFirewall(g, fill, border, rect); break;
            case ShapeKind.NetworkHub:      DrawNetworkHub(g, fill, border, rect);      break;
            case ShapeKind.NetworkPrinter:  DrawNetworkPrinter(g, fill, border, rect);  break;
            case ShapeKind.NetworkWifi:     DrawNetworkWifi(g, fill, border, rect);     break;
            case ShapeKind.NetworkInternet: DrawNetworkInternet(g, fill, border, rect); break;
            case ShapeKind.NetworkStorage:  DrawNetworkStorage(g, fill, border, rect);  break;
            case ShapeKind.NetworkLaptop:   DrawNetworkLaptop(g, fill, border, rect);   break;
            case ShapeKind.NetworkMobile:   DrawNetworkMobile(g, fill, border, rect);   break;
            case ShapeKind.NetworkIPPhone:  DrawNetworkIPPhone(g, fill, border, rect);  break;
            case ShapeKind.NetworkRack:     DrawNetworkRack(g, fill, border, rect);     break;
            case ShapeKind.NetworkTablet:   DrawNetworkTablet(g, fill, border, rect);   break;
            case ShapeKind.NetworkGateway:  DrawNetworkGateway(g, fill, border, rect);  break;
        }
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
                // Database is handled specially in draw methods; return bounding rect for hit test
                path.AddRectangle(rect);
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

            case ShapeKind.CallOut:
                path.AddPath(CreateCallOut(rect), false);
                break;

            case ShapeKind.Note:
                path.AddPolygon(CreateNote(rect));
                break;

            case ShapeKind.OffPageConnector:
                path.AddPolygon(CreateOffPageConnector(rect));
                break;

            case ShapeKind.DoubleArrow:
                path.AddPolygon(CreateDoubleArrow(rect));
                break;

            case ShapeKind.ManualInput:
                path.AddPolygon(CreateManualInput(rect));
                break;

            case ShapeKind.Delay:
                // Delay uses special drawing; return bounding rect for hit test
                path.AddRectangle(rect);
                break;

            // ── Basic shape extensions ─────────────────────────────────────────
            case ShapeKind.Octagon:
            {
                float cut = Math.Min(rect.Width, rect.Height) * 0.22f;
                path.AddPolygon(new PointF[] {
                    new(rect.X + cut,     rect.Y),
                    new(rect.Right - cut, rect.Y),
                    new(rect.Right,       rect.Y + cut),
                    new(rect.Right,       rect.Bottom - cut),
                    new(rect.Right - cut, rect.Bottom),
                    new(rect.X + cut,     rect.Bottom),
                    new(rect.X,           rect.Bottom - cut),
                    new(rect.X,           rect.Y + cut)
                });
                break;
            }

            case ShapeKind.RightTriangle:
                path.AddPolygon(new PointF[] {
                    new(rect.X,     rect.Y),
                    new(rect.Right, rect.Bottom),
                    new(rect.X,     rect.Bottom)
                });
                break;

            case ShapeKind.Star4:
                path.AddPolygon(CreateStar(cx, cy, rx, ry, 4));
                break;

            case ShapeKind.Star6:
                path.AddPolygon(CreateStar(cx, cy, rx, ry, 6));
                break;

            case ShapeKind.Donut:
                path.AddEllipse(rect);  // outer ellipse for hit test
                break;

            // ── Flowchart additional shapes ────────────────────────────────────
            case ShapeKind.FlowPredefinedProcess:
                path.AddRectangle(rect);  // special drawing adds inner lines
                break;

            case ShapeKind.FlowManualOperation:
            {
                float moInset = rect.Width * 0.18f;
                path.AddPolygon(new PointF[] {
                    new(rect.X,               rect.Y),
                    new(rect.Right,           rect.Y),
                    new(rect.Right - moInset, rect.Bottom),
                    new(rect.X + moInset,     rect.Bottom)
                });
                break;
            }

            case ShapeKind.FlowSummingJunction:
                path.AddEllipse(rect);  // circle; X drawn specially
                break;

            case ShapeKind.FlowOr:
                path.AddEllipse(rect);  // circle; + drawn specially
                break;

            case ShapeKind.FlowMerge:
                path.AddPolygon([
                    new PointF(rect.X,     rect.Y),
                    new PointF(rect.Right, rect.Y),
                    new PointF(cx,         rect.Bottom)
                ]);
                break;

            case ShapeKind.FlowCollate:
                // Bowtie: two triangles sharing center point
                path.AddPolygon([new PointF(rect.X, rect.Y),    new PointF(rect.Right, rect.Y),    new PointF(cx, cy)]);
                path.AddPolygon([new PointF(rect.X, rect.Bottom), new PointF(rect.Right, rect.Bottom), new PointF(cx, cy)]);
                break;

            case ShapeKind.FlowSort:
                // Diamond; horizontal divider drawn specially
                path.AddPolygon([
                    new PointF(cx, rect.Y), new PointF(rect.Right, cy),
                    new PointF(cx, rect.Bottom), new PointF(rect.X, cy)
                ]);
                break;

            case ShapeKind.FlowDisplay:
            {
                float fdNotch   = rect.Width * 0.20f;
                float fdRounded = rect.Width * 0.25f;
                path.AddPolygon(new PointF[] {
                    new(rect.X + fdNotch,       rect.Y),
                    new(rect.Right - fdRounded, rect.Y),
                    new(rect.Right,             cy),
                    new(rect.Right - fdRounded, rect.Bottom),
                    new(rect.X + fdNotch,       rect.Bottom),
                    new(rect.X,                 cy)
                });
                break;
            }

            case ShapeKind.FlowPreparation:
            {
                float fpCut = rect.Width * 0.16f;
                path.AddPolygon(new PointF[] {
                    new(rect.X + fpCut,     rect.Y),
                    new(rect.Right - fpCut, rect.Y),
                    new(rect.Right,         cy),
                    new(rect.Right - fpCut, rect.Bottom),
                    new(rect.X + fpCut,     rect.Bottom),
                    new(rect.X,             cy)
                });
                break;
            }

            case ShapeKind.FlowAnnotation:
            {
                float faArm   = rect.Width * 0.40f;
                float faThick = Math.Max(3f, Math.Min(rect.Width, rect.Height) * 0.12f);
                path.AddPolygon(new PointF[] {
                    new(rect.X + faArm,   rect.Y),
                    new(rect.X,           rect.Y),
                    new(rect.X,           rect.Bottom),
                    new(rect.X + faArm,   rect.Bottom),
                    new(rect.X + faArm,   rect.Bottom - faThick),
                    new(rect.X + faThick, rect.Bottom - faThick),
                    new(rect.X + faThick, rect.Y + faThick),
                    new(rect.X + faArm,   rect.Y + faThick)
                });
                break;
            }

            // ── Arrow shapes ───────────────────────────────────────────────────
            case ShapeKind.ArrowLeft:
            {
                float alShaftT = rect.Y + rect.Height * 0.30f;
                float alShaftB = rect.Bottom - rect.Height * 0.30f;
                float alNotch  = rect.X + rect.Width * 0.40f;
                path.AddPolygon(new PointF[] {
                    new(rect.Right, alShaftT),
                    new(alNotch,    alShaftT),
                    new(alNotch,    rect.Y),
                    new(rect.X,     cy),
                    new(alNotch,    rect.Bottom),
                    new(alNotch,    alShaftB),
                    new(rect.Right, alShaftB)
                });
                break;
            }

            case ShapeKind.ArrowUp:
            {
                float auShaftL = rect.X + rect.Width * 0.30f;
                float auShaftR = rect.Right - rect.Width * 0.30f;
                float auNotch  = rect.Y + rect.Height * 0.55f;
                path.AddPolygon(new PointF[] {
                    new(auShaftL,   rect.Bottom),
                    new(auShaftL,   auNotch),
                    new(rect.X,     auNotch),
                    new(cx,         rect.Y),
                    new(rect.Right, auNotch),
                    new(auShaftR,   auNotch),
                    new(auShaftR,   rect.Bottom)
                });
                break;
            }

            case ShapeKind.ArrowDown:
            {
                float adShaftL = rect.X + rect.Width * 0.30f;
                float adShaftR = rect.Right - rect.Width * 0.30f;
                float adNotch  = rect.Y + rect.Height * 0.45f;
                path.AddPolygon(new PointF[] {
                    new(adShaftL,   rect.Y),
                    new(adShaftL,   adNotch),
                    new(rect.X,     adNotch),
                    new(cx,         rect.Bottom),
                    new(rect.Right, adNotch),
                    new(adShaftR,   adNotch),
                    new(adShaftR,   rect.Y)
                });
                break;
            }

            case ShapeKind.ArrowUpDown:
            {
                float audSL = rect.X + rect.Width * 0.28f;
                float audSR = rect.Right - rect.Width * 0.28f;
                float audNT = rect.Y + rect.Height * 0.28f;
                float audNB = rect.Bottom - rect.Height * 0.28f;
                path.AddPolygon(new PointF[] {
                    new(cx,         rect.Y),
                    new(rect.Right, audNT),
                    new(audSR,      audNT),
                    new(audSR,      audNB),
                    new(rect.Right, audNB),
                    new(cx,         rect.Bottom),
                    new(rect.X,     audNB),
                    new(audSL,      audNB),
                    new(audSL,      audNT),
                    new(rect.X,     audNT)
                });
                break;
            }

            case ShapeKind.ArrowQuad:
            {
                float aqSW = rect.Width  * 0.18f;
                float aqSH = rect.Height * 0.18f;
                float aqAW = rect.Width  * 0.38f;
                float aqAH = rect.Height * 0.38f;
                path.AddPolygon(new PointF[] {
                    new(cx,          rect.Y),
                    new(cx + aqSW,   cy - aqAH),
                    new(cx + aqSW,   cy - aqSH),
                    new(cx + aqAW,   cy - aqSH),
                    new(rect.Right,  cy),
                    new(cx + aqAW,   cy + aqSH),
                    new(cx + aqSW,   cy + aqSH),
                    new(cx + aqSW,   cy + aqAH),
                    new(cx,          rect.Bottom),
                    new(cx - aqSW,   cy + aqAH),
                    new(cx - aqSW,   cy + aqSH),
                    new(cx - aqAW,   cy + aqSH),
                    new(rect.X,      cy),
                    new(cx - aqAW,   cy - aqSH),
                    new(cx - aqSW,   cy - aqSH),
                    new(cx - aqSW,   cy - aqAH)
                });
                break;
            }

            case ShapeKind.ArrowBent:
                path.AddPolygon(CreateArrowBent(rect));
                break;

            case ShapeKind.ArrowStriped:
                path.AddPolygon(CreateArrow(rect));  // stripe drawn specially
                break;

            // ── Callout / speech bubble ────────────────────────────────────────
            case ShapeKind.CalloutRound:
                path.AddPath(CreateCalloutRound(rect), false);
                break;

            case ShapeKind.Explosion:
                path.AddPolygon(CreateExplosion(cx, cy, rx, ry));
                break;

            case ShapeKind.NetworkServer:
            case ShapeKind.NetworkRouter:
            case ShapeKind.NetworkSwitch:
            case ShapeKind.NetworkPC:
            case ShapeKind.NetworkFirewall:
            case ShapeKind.NetworkHub:
            case ShapeKind.NetworkPrinter:
            case ShapeKind.NetworkWifi:
            case ShapeKind.NetworkInternet:
            case ShapeKind.NetworkStorage:
            case ShapeKind.NetworkLaptop:
            case ShapeKind.NetworkMobile:
            case ShapeKind.NetworkIPPhone:
            case ShapeKind.NetworkRack:
            case ShapeKind.NetworkTablet:
            case ShapeKind.NetworkGateway:
                path.AddRectangle(rect);
                break;

            case ShapeKind.Shape3DCube:
                path.AddPolygon(GetIsoBoxOutline(CreateCubeIsoLayout(rect)));
                break;

            case ShapeKind.Shape3DBox:
                path.AddPolygon(GetIsoBoxOutline(CreateIsoLayout(rect, 0.62f, 0.34f)));
                break;

            case ShapeKind.Shape3DSphere:
                path.AddEllipse(InsetRect(rect, 0.08f));
                break;

            case ShapeKind.Shape3DPyramid:
                path.AddPolygon(
                [
                    new PointF(rect.X + rect.Width / 2f, rect.Y + rect.Height * 0.08f),
                    new PointF(rect.X + rect.Width * 0.18f, rect.Bottom - rect.Height * 0.08f),
                    new PointF(rect.Right - rect.Width * 0.18f, rect.Bottom - rect.Height * 0.08f)
                ]);
                break;

            case ShapeKind.Shape3DCone:
                path.AddPolygon(
                [
                    new PointF(rect.X + rect.Width / 2f, rect.Y + rect.Height * 0.1f),
                    new PointF(rect.X + rect.Width * 0.16f, rect.Bottom - rect.Height * 0.02f),
                    new PointF(rect.Right - rect.Width * 0.16f, rect.Bottom - rect.Height * 0.02f)
                ]);
                break;

            case ShapeKind.Shape3DCylinder:
            {
                var isoCylinder = CreateIsoLayout(rect, 0.42f, 0.5f);
                path.AddRectangle(new RectangleF(isoCylinder.OriginX, isoCylinder.OriginY - isoCylinder.SkewY * 0.35f,
                    isoCylinder.FaceW + isoCylinder.SkewX, isoCylinder.FaceH + isoCylinder.SkewY * 0.35f));
                break;
            }

            case ShapeKind.Shape3DTriangularPrism:
            {
                float faceW = rect.Width * 0.52f;
                float faceH = rect.Height * 0.62f;
                float skewX = rect.Width  * 0.26f;
                float skewY = rect.Height * 0.18f;
                float ox = rect.X + rect.Width * 0.06f;
                float oy = rect.Y + (rect.Height - faceH) / 2f + skewY;
                path.AddPolygon([
                    new PointF(ox,             oy + faceH),
                    new PointF(ox + faceW,     oy + faceH),
                    new PointF(ox + faceW + skewX, oy + faceH - skewY),
                    new PointF(ox + faceW / 2f + skewX, oy - skewY),
                    new PointF(ox + faceW / 2f, oy),
                ]);
                break;
            }

            case ShapeKind.Shape3DCapsule:
            {
                float capRx = rect.Width * 0.36f;
                float capRy = rect.Height * 0.48f;
                float capCx = rect.X + rect.Width / 2f;
                float capCy = rect.Y + rect.Height / 2f;
                float capH  = capRx * 0.9f;
                path.AddRectangle(new RectangleF(capCx - capRx, capCy - capRy + capH, capRx * 2f, (capRy - capH) * 2f));
                path.AddEllipse(new RectangleF(capCx - capRx, capCy + capRy - capH * 2f, capRx * 2f, capH * 2f));
                path.AddEllipse(new RectangleF(capCx - capRx, capCy - capRy, capRx * 2f, capH * 2f));
                break;
            }

            case ShapeKind.Shape3DGem:
                path.AddPolygon([
                    new PointF(rect.X + rect.Width * 0.20f, rect.Y + rect.Height * 0.08f),
                    new PointF(rect.Right - rect.Width * 0.20f, rect.Y + rect.Height * 0.08f),
                    new PointF(rect.Right - rect.Width * 0.12f, rect.Y + rect.Height * 0.38f),
                    new PointF(rect.X + rect.Width / 2f, rect.Bottom - rect.Height * 0.06f),
                    new PointF(rect.X + rect.Width * 0.12f, rect.Y + rect.Height * 0.38f),
                ]);
                break;

            case ShapeKind.Shape3DTorus:
                path.AddEllipse(InsetRect(rect, 0.04f));
                break;
        }

        return path;
    }

    // ── New shape draw methods ────────────────────────────────────────────────

    private static void DrawDonut(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        using var path = new GraphicsPath();
        path.AddEllipse(rect);
        float hf = 0.40f;
        float hw = rect.Width * hf, hh = rect.Height * hf;
        float hx = rect.X + (rect.Width - hw) / 2f, hy = rect.Y + (rect.Height - hh) / 2f;
        path.AddEllipse(hx, hy, hw, hh);
        path.FillMode = FillMode.Alternate;
        g.FillPath(fill, path);
        g.DrawEllipse(border, rect);
        g.DrawEllipse(border, hx, hy, hw, hh);
    }

    private static void DrawFlowPredefinedProcess(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        g.FillRectangle(fill, rect);
        g.DrawRectangle(border, rect.X, rect.Y, rect.Width, rect.Height);
        float lx = rect.X + rect.Width * 0.12f;
        float rx2 = rect.Right - rect.Width * 0.12f;
        g.DrawLine(border, lx, rect.Y, lx, rect.Bottom);
        g.DrawLine(border, rx2, rect.Y, rx2, rect.Bottom);
    }

    private static void DrawFlowSummingJunction(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        g.FillEllipse(fill, rect);
        g.DrawEllipse(border, rect);
        float cx = rect.X + rect.Width / 2f, cy = rect.Y + rect.Height / 2f;
        float r = Math.Min(rect.Width, rect.Height) * 0.30f;
        g.DrawLine(border, cx - r, cy - r, cx + r, cy + r);
        g.DrawLine(border, cx + r, cy - r, cx - r, cy + r);
    }

    private static void DrawFlowOr(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        g.FillEllipse(fill, rect);
        g.DrawEllipse(border, rect);
        float cx = rect.X + rect.Width / 2f, cy = rect.Y + rect.Height / 2f;
        float rx2 = rect.Width * 0.30f, ry2 = rect.Height * 0.30f;
        g.DrawLine(border, cx - rx2, cy, cx + rx2, cy);
        g.DrawLine(border, cx, cy - ry2, cx, cy + ry2);
    }

    private static void DrawFlowSort(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        float cx = rect.X + rect.Width / 2f, cy = rect.Y + rect.Height / 2f;
        using var path = new GraphicsPath();
        path.AddPolygon([
            new PointF(cx, rect.Y), new PointF(rect.Right, cy),
            new PointF(cx, rect.Bottom), new PointF(rect.X, cy)
        ]);
        g.FillPath(fill, path);
        g.DrawPath(border, path);
        float lineHW = rect.Width * 0.25f;
        g.DrawLine(border, cx - lineHW, cy, cx + lineHW, cy);
    }

    private static void DrawArrowStriped(Graphics g, Brush fill, Pen border, RectangleF rect)
    {
        var pts = CreateArrow(rect);
        using var path = new GraphicsPath();
        path.AddPolygon(pts);
        g.FillPath(fill, path);
        g.DrawPath(border, path);
        float stripeX = rect.X + rect.Width * 0.20f;
        float shaftT  = rect.Y + rect.Height * 0.30f;
        float shaftB  = rect.Bottom - rect.Height * 0.30f;
        g.DrawLine(border, stripeX, shaftT, stripeX, shaftB);
    }

    // ── New shape path helpers ────────────────────────────────────────────────

    private static PointF[] CreateArrowBent(RectangleF rect)
    {
        float armCX   = rect.X + rect.Width  * 0.72f;
        float armHW   = rect.Width  * 0.14f;
        float headHW  = rect.Width  * 0.28f;
        float shaftT  = rect.Y + rect.Height * 0.12f;
        float shaftB  = rect.Y + rect.Height * 0.44f;
        float headTop = rect.Y + rect.Height * 0.60f;
        return [
            new(rect.X,         shaftT),
            new(armCX + armHW,  shaftT),
            new(armCX + armHW,  headTop),
            new(armCX + headHW, headTop),
            new(armCX,          rect.Bottom),
            new(armCX - headHW, headTop),
            new(armCX - armHW,  headTop),
            new(armCX - armHW,  shaftB),
            new(rect.X,         shaftB)
        ];
    }

    private static GraphicsPath CreateCalloutRound(RectangleF rect)
    {
        var path = new GraphicsPath();
        float tailH = Math.Min(rect.Height * 0.25f, 22f);
        float bodyH = rect.Height - tailH;
        float rad   = Math.Min(Math.Min(rect.Width, bodyH) * 0.22f, 18f);
        float d     = rad * 2f;
        float tailTip = rect.X + rect.Width * 0.15f;
        float tailL   = rect.X + rect.Width * 0.35f;
        float tailR   = rect.X + rect.Width * 0.60f;
        path.AddArc(rect.X, rect.Y, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Y + bodyH - d, d, d, 0, 90);
        path.AddLine(rect.Right - rad, rect.Y + bodyH, tailR, rect.Y + bodyH);
        path.AddLine(tailR, rect.Y + bodyH, tailTip, rect.Bottom);
        path.AddLine(tailTip, rect.Bottom, tailL, rect.Y + bodyH);
        path.AddArc(rect.X, rect.Y + bodyH - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static PointF[] CreateExplosion(float cx, float cy, float rx, float ry)
    {
        const int points = 12;
        var pts = new PointF[points * 2];
        float irx = rx * 0.55f, iry = ry * 0.55f;
        float startAngle = -MathF.PI / 2;
        for (int i = 0; i < points; i++)
        {
            float outer = startAngle + 2 * MathF.PI * i / points;
            float inner = outer + MathF.PI / points;
            pts[i * 2]     = new(cx + rx  * MathF.Cos(outer), cy + ry  * MathF.Sin(outer));
            pts[i * 2 + 1] = new(cx + irx * MathF.Cos(inner), cy + iry * MathF.Sin(inner));
        }
        return pts;
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
        float x = rect.X, y = rect.Y, w = rect.Width, h = rect.Height;
        var path = new GraphicsPath();

        // Helper to convert relative (0–1) coordinates to absolute points
        PointF P(float fx, float fy) => new(x + w * fx, y + h * fy);

        path.StartFigure();
        // Clockwise from bottom-left: 6 bezier bumps then flat bottom line
        // Bottom-left small bump
        path.AddBezier(P(0.12f, 0.82f), P(0.00f, 0.82f), P(0.00f, 0.52f), P(0.18f, 0.50f));
        // Left bump (medium)
        path.AddBezier(P(0.18f, 0.50f), P(0.04f, 0.38f), P(0.14f, 0.14f), P(0.30f, 0.22f));
        // Top-left bump (tallest)
        path.AddBezier(P(0.30f, 0.22f), P(0.28f, 0.01f), P(0.56f, -0.02f), P(0.55f, 0.18f));
        // Top-right bump
        path.AddBezier(P(0.55f, 0.18f), P(0.56f, -0.01f), P(0.80f, 0.02f), P(0.78f, 0.22f));
        // Right bump (medium)
        path.AddBezier(P(0.78f, 0.22f), P(0.96f, 0.18f), P(1.00f, 0.44f), P(0.84f, 0.52f));
        // Bottom-right small bump
        path.AddBezier(P(0.84f, 0.52f), P(1.02f, 0.58f), P(1.02f, 0.88f), P(0.88f, 0.82f));
        // Flat bottom
        path.AddLine(P(0.88f, 0.82f), P(0.12f, 0.82f));
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

    private static GraphicsPath CreateCallOut(RectangleF rect)
    {
        var path = new GraphicsPath();
        float tailH = Math.Min(rect.Height * 0.22f, 20f);
        float bodyH = rect.Height - tailH;
        float rad   = Math.Min(bodyH * 0.15f, 10f);
        float tlX   = rect.X + rect.Width * 0.12f;
        float trX   = rect.X + rect.Width * 0.38f;

        // Rounded rect body
        float d = rad * 2;
        path.AddArc(rect.X, rect.Y, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Y + bodyH - d, d, d, 0, 90);
        path.AddLine(rect.Right - rad, rect.Y + bodyH, trX, rect.Y + bodyH);
        path.AddLine(trX, rect.Y + bodyH, tlX, rect.Bottom);  // tail tip
        path.AddLine(tlX, rect.Bottom, rect.X + rad, rect.Y + bodyH);
        path.AddArc(rect.X, rect.Y + bodyH - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static PointF[] CreateNote(RectangleF rect)
    {
        float fold = Math.Min(rect.Width * 0.22f, Math.Min(rect.Height * 0.22f, 20f));
        return [
            new(rect.X, rect.Y),
            new(rect.Right - fold, rect.Y),
            new(rect.Right, rect.Y + fold),
            new(rect.Right, rect.Bottom),
            new(rect.X, rect.Bottom)
        ];
    }

    private static PointF[] CreateOffPageConnector(RectangleF rect)
    {
        float cy  = rect.Y + rect.Height / 2f;
        float tip = rect.Width * 0.22f;
        return [
            new(rect.X, rect.Y),
            new(rect.Right - tip, rect.Y),
            new(rect.Right, cy),
            new(rect.Right - tip, rect.Bottom),
            new(rect.X, rect.Bottom)
        ];
    }

    private static PointF[] CreateDoubleArrow(RectangleF rect)
    {
        float cy     = rect.Y + rect.Height / 2f;
        float shaftT = rect.Y + rect.Height * 0.28f;
        float shaftB = rect.Bottom - rect.Height * 0.28f;
        float tip    = rect.Width * 0.26f;
        return [
            new(rect.X, cy),
            new(rect.X + tip, rect.Y),
            new(rect.X + tip, shaftT),
            new(rect.Right - tip, shaftT),
            new(rect.Right - tip, rect.Y),
            new(rect.Right, cy),
            new(rect.Right - tip, rect.Bottom),
            new(rect.Right - tip, shaftB),
            new(rect.X + tip, shaftB),
            new(rect.X + tip, rect.Bottom),
        ];
    }

    private static PointF[] CreateManualInput(RectangleF rect)
    {
        float slant = rect.Height * 0.18f;
        return [
            new(rect.X,      rect.Y + slant),
            new(rect.Right,  rect.Y),
            new(rect.Right,  rect.Bottom),
            new(rect.X,      rect.Bottom)
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
        int subpathStart = 0;

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
            {
                // Check the closing segment from points[i] back to the subpath start
                var closeHit = RaySegmentIntersect(origin, dirX, dirY, points[i], points[subpathStart]);
                if (closeHit is PointF closePt)
                {
                    float distance = Distance(origin, closePt);
                    if (distance > 0.5f && distance > bestDistance)
                    {
                        bestDistance = distance;
                        best = closePt;
                    }
                }
                subpathStart = i + 1;
                previous = subpathStart < points.Length ? points[subpathStart] : points[0];
            }
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

    internal static void DrawArrowHead(Graphics g, Pen pen, PointF from, PointF to, ArrowHeadStyle style = ArrowHeadStyle.Open)
    {
        if (style == ArrowHeadStyle.None) return;
        float angle = MathF.Atan2(to.Y - from.Y, to.X - from.X);
        float cos = MathF.Cos(angle), sin = MathF.Sin(angle);
        const float sz = 11f;

        switch (style)
        {
            case ArrowHeadStyle.Open:
            {
                float a = MathF.PI / 6;
                g.DrawLine(pen, to, new PointF(to.X - sz * MathF.Cos(angle - a), to.Y - sz * MathF.Sin(angle - a)));
                g.DrawLine(pen, to, new PointF(to.X - sz * MathF.Cos(angle + a), to.Y - sz * MathF.Sin(angle + a)));
                break;
            }
            case ArrowHeadStyle.Filled:
            {
                float a = MathF.PI / 7;
                var pts = new PointF[] {
                    to,
                    new(to.X - sz * MathF.Cos(angle - a), to.Y - sz * MathF.Sin(angle - a)),
                    new(to.X - sz * MathF.Cos(angle + a), to.Y - sz * MathF.Sin(angle + a))
                };
                using var brush = new SolidBrush(pen.Color);
                g.FillPolygon(brush, pts);
                break;
            }
            case ArrowHeadStyle.OpenDouble:
            {
                float a = MathF.PI / 6;
                float s1 = sz, s2 = sz * 0.55f;
                g.DrawLine(pen, to, new PointF(to.X - s1 * MathF.Cos(angle - a), to.Y - s1 * MathF.Sin(angle - a)));
                g.DrawLine(pen, to, new PointF(to.X - s1 * MathF.Cos(angle + a), to.Y - s1 * MathF.Sin(angle + a)));
                var mid = new PointF(to.X - s2 * cos, to.Y - s2 * sin);
                g.DrawLine(pen, mid, new PointF(mid.X - s2 * MathF.Cos(angle - a), mid.Y - s2 * MathF.Sin(angle - a)));
                g.DrawLine(pen, mid, new PointF(mid.X - s2 * MathF.Cos(angle + a), mid.Y - s2 * MathF.Sin(angle + a)));
                break;
            }
            case ArrowHeadStyle.Diamond:
            {
                float half = sz * 0.45f;
                var pts = new PointF[] {
                    to,
                    new(to.X - half * cos + half * (-sin), to.Y - half * sin + half * cos),
                    new(to.X - sz * cos,                   to.Y - sz * sin),
                    new(to.X - half * cos - half * (-sin), to.Y - half * sin - half * cos)
                };
                using var brush = new SolidBrush(pen.Color);
                g.FillPolygon(brush, pts);
                g.DrawPolygon(pen, pts);
                break;
            }
            case ArrowHeadStyle.Circle:
            {
                float r = sz * 0.38f;
                var ctr = new PointF(to.X - r * cos, to.Y - r * sin);
                using var brush = new SolidBrush(pen.Color);
                g.FillEllipse(brush, ctr.X - r, ctr.Y - r, r * 2, r * 2);
                break;
            }
            case ArrowHeadStyle.OpenDiamond:
            {
                float half = sz * 0.45f;
                var pts = new PointF[] {
                    to,
                    new(to.X - half * cos + half * (-sin), to.Y - half * sin + half * cos),
                    new(to.X - sz * cos,                   to.Y - sz * sin),
                    new(to.X - half * cos - half * (-sin), to.Y - half * sin - half * cos)
                };
                g.DrawPolygon(pen, pts);
                break;
            }
            case ArrowHeadStyle.OpenCircle:
            {
                float r = sz * 0.38f;
                var ctr = new PointF(to.X - r * cos, to.Y - r * sin);
                g.DrawEllipse(pen, ctr.X - r, ctr.Y - r, r * 2, r * 2);
                break;
            }
            case ArrowHeadStyle.Square:
            {
                float half = sz * 0.35f;
                var pts = new PointF[] {
                    new(to.X             + half * (-sin), to.Y             + half * cos),
                    new(to.X             - half * (-sin), to.Y             - half * cos),
                    new(to.X - sz * cos  - half * (-sin), to.Y - sz * sin  - half * cos),
                    new(to.X - sz * cos  + half * (-sin), to.Y - sz * sin  + half * cos)
                };
                using var brush = new SolidBrush(pen.Color);
                g.FillPolygon(brush, pts);
                g.DrawPolygon(pen, pts);
                break;
            }
            case ArrowHeadStyle.HalfOpen:
            {
                float a = MathF.PI / 6;
                g.DrawLine(pen, to, new PointF(to.X - sz * MathF.Cos(angle - a), to.Y - sz * MathF.Sin(angle - a)));
                break;
            }
            case ArrowHeadStyle.Cross:
            {
                float half = sz * 0.5f;
                var p1 = new PointF(to.X + half * (-sin), to.Y + half * cos);
                var p2 = new PointF(to.X - half * (-sin), to.Y - half * cos);
                g.DrawLine(pen, p1, p2);
                break;
            }
        }
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
