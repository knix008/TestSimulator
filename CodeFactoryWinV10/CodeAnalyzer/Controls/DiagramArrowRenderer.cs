using System.Drawing.Drawing2D;

namespace CodeAnalyzer.Controls;

internal static class DiagramArrowRenderer
{
    public const float DefaultCapHeight = 8f;
    public const float DefaultCapWidth = 6.5f;
    public const float DefaultHeadLength = 11f;
    public const float DefaultHeadHalfWidth = 6.5f;

    public static AdjustableArrowCap CreateEndCap(
        float height = DefaultCapHeight,
        float width = DefaultCapWidth,
        bool filled = true) =>
        new(width, height, isFilled: filled);

    public static void ApplyEndCap(
        Pen pen,
        float height = DefaultCapHeight,
        float width = DefaultCapWidth,
        bool filled = true)
    {
        pen.CustomEndCap = CreateEndCap(height, width, filled);
        pen.EndCap = LineCap.Custom;
    }

    public static Point InsetToward(Point from, Point tip, float distance)
    {
        if (distance <= 0f)
        {
            return tip;
        }

        var dx = tip.X - from.X;
        var dy = tip.Y - from.Y;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < distance + 0.5f)
        {
            return tip;
        }

        var scale = (len - distance) / len;
        return new Point(
            (int)(from.X + dx * scale),
            (int)(from.Y + dy * scale));
    }

    public static void DrawFilledHead(
        Graphics graphics,
        Pen pen,
        Brush fill,
        Point from,
        Point to,
        float headLength = DefaultHeadLength,
        float halfWidth = DefaultHeadHalfWidth)
    {
        if (from.X == to.X && from.Y == to.Y)
        {
            return;
        }

        var dx = to.X - from.X;
        var dy = to.Y - from.Y;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 1f)
        {
            return;
        }

        var ux = dx / len;
        var uy = dy / len;
        var baseCenterX = to.X - ux * headLength;
        var baseCenterY = to.Y - uy * headLength;
        var perpX = -uy * halfWidth;
        var perpY = ux * halfWidth;

        var points = new[]
        {
            to,
            new Point((int)(baseCenterX + perpX), (int)(baseCenterY + perpY)),
            new Point((int)(baseCenterX - perpX), (int)(baseCenterY - perpY))
        };

        graphics.FillPolygon(fill, points);
        graphics.DrawPolygon(pen, points);
    }

    public static void DrawOpenHead(Graphics graphics, Pen pen, Point from, Point to, float headLength = 14f, float halfWidth = 6f)
    {
        var dx = to.X - from.X;
        var dy = to.Y - from.Y;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 1f)
        {
            return;
        }

        var ux = dx / len;
        var uy = dy / len;
        var left = new Point(
            (int)(to.X - ux * headLength - uy * halfWidth),
            (int)(to.Y - uy * headLength + ux * halfWidth));
        var right = new Point(
            (int)(to.X - ux * headLength + uy * halfWidth),
            (int)(to.Y - uy * headLength - ux * halfWidth));
        graphics.DrawLine(pen, to, left);
        graphics.DrawLine(pen, to, right);
    }

    public static (Point SegmentStart, Point SegmentEnd) GetLastSegment(IReadOnlyList<Point> points)
    {
        if (points.Count < 2)
        {
            var only = points.Count == 1 ? points[0] : Point.Empty;
            return (only, only);
        }

        return (points[^2], points[^1]);
    }
}
