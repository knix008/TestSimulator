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
    private const int OutwardStub = 22;

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

    public static SideConnection ResolveConnection(
        DiagramBoxNode from,
        DiagramBoxNode to,
        GraphLayoutDirection layoutDirection,
        bool preferLayoutAnchors) =>
        DiagramSideAnchor.Resolve(from.Bounds, to.Bounds, layoutDirection, preferLayoutAnchors);

    public static IReadOnlyList<Point> BuildRoutePoints(
        SideConnection connection,
        ConnectionLineStyle lineStyle,
        GraphLayoutDirection layoutDirection)
    {
        if (connection.From.X == connection.To.X && connection.From.Y == connection.To.Y)
        {
            return [connection.From];
        }

        return lineStyle switch
        {
            ConnectionLineStyle.Orthogonal => BuildSideAwareOrthogonalPath(
                connection.From,
                connection.To,
                connection.FromSide,
                connection.ToSide),
            _ => [connection.From, connection.To]
        };
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
        var fromSide = layoutDirection == GraphLayoutDirection.TopToBottom ? BoxSide.Bottom : BoxSide.Right;
        var toSide = layoutDirection == GraphLayoutDirection.TopToBottom ? BoxSide.Top : BoxSide.Left;
        var arrowTail = DrawRoutedBody(graphics, pen, start, end, fromSide, toSide, lineStyle, layoutDirection);
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
        GraphLayoutDirection layoutDirection = GraphLayoutDirection.LeftToRight,
        bool preferLayoutAnchors = true)
    {
        using var pen = CreateBodyPen(color, width, dashStyle);
        var connection = ResolveConnection(from, to, layoutDirection, preferLayoutAnchors);
        var arrowTail = DrawRoutedBody(
            graphics,
            pen,
            connection.From,
            connection.To,
            connection.FromSide,
            connection.ToSide,
            lineStyle,
            layoutDirection);
        return arrowTail is null
            ? null
            : new DiagramEdgeArrow(arrowTail.Value, connection.To, color, width, dashStyle);
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
        BoxSide fromSide,
        BoxSide toSide,
        ConnectionLineStyle lineStyle,
        GraphLayoutDirection layoutDirection)
    {
        if (start.X == end.X && start.Y == end.Y)
        {
            return null;
        }

        switch (lineStyle)
        {
            case ConnectionLineStyle.Bezier:
            {
                var arrowTail = DiagramArrowRenderer.InsetToward(start, end, DiagramArrowRenderer.DefaultHeadLength + 2f);
                DrawBezierBody(graphics, pen, start, arrowTail, fromSide, toSide);
                return arrowTail;
            }
            case ConnectionLineStyle.Orthogonal:
                return DrawOrthogonalBody(graphics, pen, start, end, fromSide, toSide);
            default:
            {
                var arrowTail = DiagramArrowRenderer.InsetToward(start, end, DiagramArrowRenderer.DefaultHeadLength + 2f);
                graphics.DrawLine(pen, start, arrowTail);
                return arrowTail;
            }
        }
    }

    private static Point? DrawOrthogonalBody(
        Graphics graphics,
        Pen pen,
        Point start,
        Point end,
        BoxSide fromSide,
        BoxSide toSide)
    {
        var path = BuildSideAwareOrthogonalPath(start, end, fromSide, toSide);
        if (path.Length < 2)
        {
            return null;
        }

        var tip = path[^1];
        var segmentStart = path[^2];
        var arrowTail = DiagramArrowRenderer.InsetToward(
            segmentStart,
            tip,
            DiagramArrowRenderer.DefaultHeadLength + 2f);

        if (path.Length == 2)
        {
            graphics.DrawLine(pen, path[0], arrowTail);
            return arrowTail;
        }

        var drawPath = new Point[path.Length];
        for (var i = 0; i < path.Length - 1; i++)
        {
            drawPath[i] = path[i];
        }

        drawPath[^1] = arrowTail;
        graphics.DrawLines(pen, drawPath);
        return arrowTail;
    }

    private static Point[] BuildSideAwareOrthogonalPath(
        Point start,
        Point end,
        BoxSide fromSide,
        BoxSide toSide)
    {
        var fromOuter = OffsetOutward(start, fromSide, OutwardStub);
        var toOuter = OffsetOutward(end, toSide, OutwardStub);

        if (IsHorizontalSide(fromSide) && IsHorizontalSide(toSide))
        {
            if (Math.Abs(fromOuter.Y - toOuter.Y) <= 1)
            {
                return [start, fromOuter, toOuter, end];
            }

            return [start, fromOuter, new Point(fromOuter.X, toOuter.Y), toOuter, end];
        }

        if (IsVerticalSide(fromSide) && IsVerticalSide(toSide))
        {
            if (Math.Abs(fromOuter.X - toOuter.X) <= 1)
            {
                return [start, fromOuter, toOuter, end];
            }

            return [start, fromOuter, new Point(toOuter.X, fromOuter.Y), toOuter, end];
        }

        return [start, fromOuter, new Point(toOuter.X, fromOuter.Y), toOuter, end];
    }

    private static Point OffsetOutward(Point anchor, BoxSide side, int distance) => side switch
    {
        BoxSide.Right => new Point(anchor.X + distance, anchor.Y),
        BoxSide.Left => new Point(anchor.X - distance, anchor.Y),
        BoxSide.Bottom => new Point(anchor.X, anchor.Y + distance),
        BoxSide.Top => new Point(anchor.X, anchor.Y - distance),
        _ => anchor
    };

    private static bool IsHorizontalSide(BoxSide side) => side is BoxSide.Left or BoxSide.Right;

    private static bool IsVerticalSide(BoxSide side) => side is BoxSide.Top or BoxSide.Bottom;

    private static void DrawBezierBody(
        Graphics graphics,
        Pen pen,
        Point start,
        Point end,
        BoxSide fromSide,
        BoxSide toSide)
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

        var rawOff = Math.Max(OutwardStub, distance / 2f);
        float c1x;
        float c1y;
        float c2x;
        float c2y;

        if (IsHorizontalSide(fromSide) && IsHorizontalSide(toSide))
        {
            var off = Math.Clamp(rawOff, OutwardStub, Math.Max(OutwardStub, dx / 2f));
            var fromSign = fromSide == BoxSide.Right ? 1f : -1f;
            var toSign = toSide == BoxSide.Left ? -1f : 1f;
            c1x = sx + fromSign * off;
            c1y = sy;
            c2x = ex + toSign * off;
            c2y = ey;
        }
        else if (IsVerticalSide(fromSide) && IsVerticalSide(toSide))
        {
            var off = Math.Clamp(rawOff, OutwardStub, Math.Max(OutwardStub, dy / 2f));
            var fromSign = fromSide == BoxSide.Bottom ? 1f : -1f;
            var toSign = toSide == BoxSide.Top ? -1f : 1f;
            c1x = sx;
            c1y = sy + fromSign * off;
            c2x = ex;
            c2y = ey + toSign * off;
        }
        else if (dx >= dy)
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
}
