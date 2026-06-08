using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

internal enum BoxSide
{
    Top,
    Bottom,
    Left,
    Right
}

internal readonly record struct SideConnection(Point From, Point To, BoxSide FromSide, BoxSide ToSide);

internal static class DiagramSideAnchor
{
    public static SideConnection GetConnectionPair(Rectangle fromBounds, Rectangle toBounds) =>
        GetConnectionPairInternal(fromBounds, toBounds);

    public static SideConnection GetLayoutConnectionPair(
        Rectangle fromBounds,
        Rectangle toBounds,
        GraphLayoutDirection layoutDirection) =>
        layoutDirection == GraphLayoutDirection.TopToBottom
            ? new SideConnection(
                GetMidpoint(fromBounds, BoxSide.Bottom),
                GetMidpoint(toBounds, BoxSide.Top),
                BoxSide.Bottom,
                BoxSide.Top)
            : new SideConnection(
                GetMidpoint(fromBounds, BoxSide.Right),
                GetMidpoint(toBounds, BoxSide.Left),
                BoxSide.Right,
                BoxSide.Left);

    public static SideConnection Resolve(
        Rectangle fromBounds,
        Rectangle toBounds,
        GraphLayoutDirection layoutDirection,
        bool preferLayoutAnchors) =>
        preferLayoutAnchors
            ? GetLayoutConnectionPair(fromBounds, toBounds, layoutDirection)
            : GetConnectionPairInternal(fromBounds, toBounds);

    private static SideConnection GetConnectionPairInternal(Rectangle fromBounds, Rectangle toBounds)
    {
        var (fromSide, toSide) = ChooseSides(fromBounds, toBounds);
        return new SideConnection(
            GetMidpoint(fromBounds, fromSide),
            GetMidpoint(toBounds, toSide),
            fromSide,
            toSide);
    }

    public static Point GetMidpoint(Rectangle bounds, BoxSide side) => side switch
    {
        BoxSide.Top => new Point(HorizontalCenter(bounds), bounds.Top),
        BoxSide.Bottom => new Point(HorizontalCenter(bounds), BottomEdge(bounds)),
        BoxSide.Left => new Point(bounds.Left, VerticalCenter(bounds)),
        BoxSide.Right => new Point(RightEdge(bounds), VerticalCenter(bounds)),
        _ => new Point(HorizontalCenter(bounds), VerticalCenter(bounds))
    };

    private static (BoxSide From, BoxSide To) ChooseSides(Rectangle fromBounds, Rectangle toBounds)
    {
        var gapBelow = toBounds.Top - fromBounds.Bottom;
        var gapAbove = fromBounds.Top - toBounds.Bottom;
        var gapRight = toBounds.Left - fromBounds.Right;
        var gapLeft = fromBounds.Left - toBounds.Right;

        var overlapX = gapLeft < 0 && gapRight < 0;
        var overlapY = gapAbove < 0 && gapBelow < 0;

        if (!overlapY)
        {
            if (gapBelow >= 0 && (gapBelow >= gapAbove || gapAbove < 0))
            {
                return (BoxSide.Bottom, BoxSide.Top);
            }

            if (gapAbove >= 0)
            {
                return (BoxSide.Top, BoxSide.Bottom);
            }
        }

        if (!overlapX)
        {
            if (gapRight >= 0 && (gapRight >= gapLeft || gapLeft < 0))
            {
                return (BoxSide.Right, BoxSide.Left);
            }

            if (gapLeft >= 0)
            {
                return (BoxSide.Left, BoxSide.Right);
            }
        }

        return ChooseSidesByCenterAngle(fromBounds, toBounds);
    }

    private static (BoxSide From, BoxSide To) ChooseSidesByCenterAngle(Rectangle fromBounds, Rectangle toBounds)
    {
        var dx = HorizontalCenter(toBounds) - HorizontalCenter(fromBounds);
        var dy = VerticalCenter(toBounds) - VerticalCenter(fromBounds);

        if (Math.Abs(dx) >= Math.Abs(dy))
        {
            return dx >= 0
                ? (BoxSide.Right, BoxSide.Left)
                : (BoxSide.Left, BoxSide.Right);
        }

        return dy >= 0
            ? (BoxSide.Bottom, BoxSide.Top)
            : (BoxSide.Top, BoxSide.Bottom);
    }

    private static int HorizontalCenter(Rectangle bounds) =>
        bounds.Left + bounds.Width / 2;

    private static int VerticalCenter(Rectangle bounds) =>
        bounds.Top + bounds.Height / 2;

    private static int RightEdge(Rectangle bounds) =>
        bounds.Left + Math.Max(0, bounds.Width - 1);

    private static int BottomEdge(Rectangle bounds) =>
        bounds.Top + Math.Max(0, bounds.Height - 1);
}
