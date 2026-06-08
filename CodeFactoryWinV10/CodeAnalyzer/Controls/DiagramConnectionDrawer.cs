using System.Drawing.Drawing2D;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

internal readonly record struct DiagramEdgeArrow(
    Point Tail,
    Point Tip,
    Color Color,
    float Width,
    DashStyle DashStyle);

internal static class DiagramConnectionDrawer
{
    public static Point GetSourceAnchor(DiagramBoxNode node, GraphLayoutDirection layoutDirection, bool towardChild)
    {
        var bounds = node.Bounds;

        if (layoutDirection == GraphLayoutDirection.LeftToRight)
        {
            return towardChild
                ? new Point(bounds.Right, bounds.Top + bounds.Height / 2)
                : new Point(bounds.Left, bounds.Top + bounds.Height / 2);
        }

        return towardChild
            ? new Point(bounds.Left + bounds.Width / 2, bounds.Bottom)
            : new Point(bounds.Left + bounds.Width / 2, bounds.Top);
    }

    public static Point GetSideAnchor(Rectangle fromBounds, Rectangle toBounds, bool fromSide)
    {
        var connection = DiagramSideAnchor.GetConnectionPair(fromBounds, toBounds);
        return fromSide ? connection.From : connection.To;
    }

    public static DiagramEdgeArrow? DrawTreeEdge(
        Graphics graphics,
        DiagramBoxNode from,
        DiagramBoxNode to,
        GraphLayoutDirection layoutDirection,
        ConnectionLineStyle lineStyle,
        Color color,
        float width = 1.6f,
        DashStyle dashStyle = DashStyle.Solid)
    {
        using var pen = CreateBodyPen(color, width, dashStyle);
        var start = GetSourceAnchor(from, layoutDirection, towardChild: true);
        var end = GetSourceAnchor(to, layoutDirection, towardChild: false);
        var arrowTail = DrawRoutedBody(graphics, pen, start, end, lineStyle, layoutDirection);
        return arrowTail is null
            ? null
            : new DiagramEdgeArrow(arrowTail.Value, end, color, width, dashStyle);
    }

    public static DiagramEdgeArrow? DrawSideEdge(
        Graphics graphics,
        DiagramBoxNode from,
        DiagramBoxNode to,
        ConnectionLineStyle lineStyle,
        Color color,
        float width = 1.6f,
        DashStyle dashStyle = DashStyle.Solid,
        GraphLayoutDirection? layoutDirection = null)
    {
        using var pen = CreateBodyPen(color, width, dashStyle);
        var start = GetSideAnchor(from.Bounds, to.Bounds, fromSide: true);
        var end = GetSideAnchor(from.Bounds, to.Bounds, fromSide: false);
        var arrowTail = DrawRoutedBody(
            graphics,
            pen,
            start,
            end,
            lineStyle,
            layoutDirection ?? GraphLayoutDirection.LeftToRight);
        return arrowTail is null
            ? null
            : new DiagramEdgeArrow(arrowTail.Value, end, color, width, dashStyle);
    }

    public static void DrawArrowHeads(Graphics graphics, IEnumerable<DiagramEdgeArrow> arrows)
    {
        foreach (var arrow in arrows)
        {
            using var pen = new Pen(arrow.Color, arrow.Width)
            {
                DashStyle = arrow.DashStyle
            };
            using var fill = new SolidBrush(arrow.Color);
            DiagramArrowRenderer.DrawFilledHead(graphics, pen, fill, arrow.Tail, arrow.Tip);
        }
    }

    private static Pen CreateBodyPen(Color color, float width, DashStyle dashStyle)
    {
        return new Pen(color, width)
        {
            DashStyle = dashStyle,
            EndCap = LineCap.Flat,
            StartCap = LineCap.Flat
        };
    }

    private static Point? DrawRoutedBody(
        Graphics graphics,
        Pen pen,
        Point start,
        Point end,
        ConnectionLineStyle lineStyle,
        GraphLayoutDirection layoutDirection)
    {
        if (start.X == end.X && start.Y == end.Y)
        {
            return null;
        }

        var arrowTail = DiagramArrowRenderer.InsetToward(start, end, DiagramArrowRenderer.DefaultHeadLength + 2f);

        switch (lineStyle)
        {
            case ConnectionLineStyle.Bezier:
                DrawBezierBody(graphics, pen, start, arrowTail);
                break;
            case ConnectionLineStyle.Orthogonal:
                DrawOrthogonalBody(graphics, pen, start, arrowTail, layoutDirection);
                break;
            default:
                graphics.DrawLine(pen, start, arrowTail);
                break;
        }

        return arrowTail;
    }

    private static void DrawBezierBody(Graphics graphics, Pen pen, Point start, Point end)
    {
        var sx = (float)start.X;
        var sy = (float)start.Y;
        var ex = (float)end.X;
        var ey = (float)end.Y;
        var signedDx = ex - sx;
        var signedDy = ey - sy;
        var dx = Math.Abs(signedDx);
        var dy = Math.Abs(signedDy);
        var distance = MathF.Sqrt(dx * dx + dy * dy);

        if (distance < 4f)
        {
            graphics.DrawLine(pen, start, end);
            return;
        }

        var rawOff = Math.Max(24f, distance / 2f);
        float c1x;
        float c1y;
        float c2x;
        float c2y;
        if (dx >= dy)
        {
            var off = Math.Clamp(rawOff, 1f, Math.Max(1f, dx / 2f));
            var sign = signedDx >= 0f ? 1f : -1f;
            c1x = sx + sign * off;
            c1y = sy;
            c2x = ex - sign * off;
            c2y = ey;
        }
        else
        {
            var off = Math.Clamp(rawOff, 1f, Math.Max(1f, dy / 2f));
            var sign = signedDy >= 0f ? 1f : -1f;
            c1x = sx;
            c1y = sy + sign * off;
            c2x = ex;
            c2y = ey - sign * off;
        }

        if (!AreBezierPointsSafe(sx, sy, c1x, c1y, c2x, c2y, ex, ey)
            || !TryDrawBezier(graphics, pen, sx, sy, c1x, c1y, c2x, c2y, ex, ey))
        {
            graphics.DrawLine(pen, start, end);
        }
    }

    private static bool AreBezierPointsSafe(
        float x1, float y1, float x2, float y2, float x3, float y3, float x4, float y4)
    {
        const float limit = 500_000f;
        foreach (var value in new[] { x1, y1, x2, y2, x3, y3, x4, y4 })
        {
            if (float.IsNaN(value) || float.IsInfinity(value) || Math.Abs(value) > limit)
            {
                return false;
            }
        }

        return true;
    }

    private static bool TryDrawBezier(
        Graphics graphics,
        Pen pen,
        float x1, float y1, float x2, float y2, float x3, float y3, float x4, float y4)
    {
        try
        {
            graphics.DrawBezier(pen, x1, y1, x2, y2, x3, y3, x4, y4);
            return true;
        }
        catch (OverflowException)
        {
            return false;
        }
    }

    private static void DrawOrthogonalBody(
        Graphics graphics,
        Pen pen,
        Point start,
        Point end,
        GraphLayoutDirection layoutDirection)
    {
        if (Math.Abs(end.X - start.X) < 8 && Math.Abs(end.Y - start.Y) < 8)
        {
            graphics.DrawLine(pen, start, end);
            return;
        }

        var path = BuildOrthogonalPath(start, end, layoutDirection);
        var tip = path[^1];
        var segmentStart = path[^2];
        var arrowTail = DiagramArrowRenderer.InsetToward(
            segmentStart,
            tip,
            DiagramArrowRenderer.DefaultHeadLength + 2f);

        if (path.Length == 2)
        {
            graphics.DrawLine(pen, path[0], arrowTail);
            return;
        }

        var drawPath = new Point[path.Length];
        Array.Copy(path, drawPath, path.Length - 1);
        drawPath[^1] = arrowTail;
        graphics.DrawLines(pen, drawPath);
    }

    private static Point[] BuildOrthogonalPath(Point start, Point end, GraphLayoutDirection layoutDirection)
    {
        if (layoutDirection == GraphLayoutDirection.TopToBottom)
        {
            return
            [
                start,
                new Point(start.X, (start.Y + end.Y) / 2),
                new Point(end.X, (start.Y + end.Y) / 2),
                end
            ];
        }

        var midX = (start.X + end.X) / 2;
        var midY = (start.Y + end.Y) / 2;
        var dx = Math.Abs(end.X - start.X);
        var dy = Math.Abs(end.Y - start.Y);
        return dy >= dx
            ?
            [
                start,
                new Point(start.X, midY),
                new Point(end.X, midY),
                end
            ]
            :
            [
                start,
                new Point(midX, start.Y),
                new Point(midX, end.Y),
                end
            ];
    }
}
