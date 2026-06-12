using System.Drawing.Drawing2D;

namespace SVGEditorWinV10.Rendering;

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

public static class SvgResizeHandles
{
    public const float MinBoundsSize = 8f;

    public static IEnumerable<(ResizeHandle Handle, RectangleF Rect)> GetHandleRects(RectangleF bounds, float handleSize)
    {
        var half = handleSize;
        var centerX = bounds.Left + bounds.Width / 2f;
        var centerY = bounds.Top + bounds.Height / 2f;

        yield return (ResizeHandle.TopLeft, new RectangleF(bounds.Left - half, bounds.Top - half, half * 2, half * 2));
        yield return (ResizeHandle.Top, new RectangleF(centerX - half, bounds.Top - half, half * 2, half * 2));
        yield return (ResizeHandle.TopRight, new RectangleF(bounds.Right - half, bounds.Top - half, half * 2, half * 2));
        yield return (ResizeHandle.Right, new RectangleF(bounds.Right - half, centerY - half, half * 2, half * 2));
        yield return (ResizeHandle.BottomRight, new RectangleF(bounds.Right - half, bounds.Bottom - half, half * 2, half * 2));
        yield return (ResizeHandle.Bottom, new RectangleF(centerX - half, bounds.Bottom - half, half * 2, half * 2));
        yield return (ResizeHandle.BottomLeft, new RectangleF(bounds.Left - half, bounds.Bottom - half, half * 2, half * 2));
        yield return (ResizeHandle.Left, new RectangleF(bounds.Left - half, centerY - half, half * 2, half * 2));
    }

    public static ResizeHandle HitTest(RectangleF bounds, PointF point, float handleSize)
        => HitTest(bounds, point, handleSize, cornersOnly: false);

    public static ResizeHandle HitTest(RectangleF bounds, PointF point, float handleSize, bool cornersOnly)
    {
        foreach (var (handle, rect) in GetHandleRects(bounds, handleSize))
        {
            if (cornersOnly && !IsCornerHandle(handle))
                continue;

            if (rect.Contains(point))
                return handle;
        }

        return ResizeHandle.None;
    }

    public static Cursor GetCursor(ResizeHandle handle) => handle switch
    {
        ResizeHandle.TopLeft or ResizeHandle.BottomRight => Cursors.SizeNWSE,
        ResizeHandle.TopRight or ResizeHandle.BottomLeft => Cursors.SizeNESW,
        ResizeHandle.Top or ResizeHandle.Bottom => Cursors.SizeNS,
        ResizeHandle.Left or ResizeHandle.Right => Cursors.SizeWE,
        _ => Cursors.Default
    };

    public static void ApplyResize(ref RectangleF bounds, ResizeHandle handle, PointF currentPoint, PointF previousPoint)
    {
        var dx = currentPoint.X - previousPoint.X;
        var dy = currentPoint.Y - previousPoint.Y;

        switch (handle)
        {
            case ResizeHandle.TopLeft:
                bounds = ResizeFromTopLeft(bounds, dx, dy);
                break;
            case ResizeHandle.Top:
                bounds = ResizeFromTop(bounds, dy);
                break;
            case ResizeHandle.TopRight:
                bounds = ResizeFromTopRight(bounds, dx, dy);
                break;
            case ResizeHandle.Right:
                bounds = ResizeFromRight(bounds, dx);
                break;
            case ResizeHandle.BottomRight:
                bounds = ResizeFromBottomRight(bounds, dx, dy);
                break;
            case ResizeHandle.Bottom:
                bounds = ResizeFromBottom(bounds, dy);
                break;
            case ResizeHandle.BottomLeft:
                bounds = ResizeFromBottomLeft(bounds, dx, dy);
                break;
            case ResizeHandle.Left:
                bounds = ResizeFromLeft(bounds, dx);
                break;
        }
    }

    public static void Draw(Graphics graphics, RectangleF bounds, float handleSize)
        => Draw(graphics, bounds, handleSize, cornersOnly: false);

    public static void Draw(Graphics graphics, RectangleF bounds, float handleSize, bool cornersOnly)
    {
        using var fill = new SolidBrush(Color.White);
        using var border = new Pen(Color.FromArgb(37, 99, 235), 1f);

        foreach (var (handle, rect) in GetHandleRects(bounds, handleSize))
        {
            if (cornersOnly && !IsCornerHandle(handle))
                continue;

            graphics.FillRectangle(fill, rect.X, rect.Y, rect.Width, rect.Height);
            graphics.DrawRectangle(border, rect.X, rect.Y, rect.Width, rect.Height);
        }
    }

    public static bool IsCornerHandle(ResizeHandle handle) =>
        handle is ResizeHandle.TopLeft
            or ResizeHandle.TopRight
            or ResizeHandle.BottomRight
            or ResizeHandle.BottomLeft;

    private static RectangleF ResizeFromTopLeft(RectangleF bounds, float dx, float dy)
    {
        var right = bounds.Right;
        var bottom = bounds.Bottom;
        var x = bounds.X + dx;
        var y = bounds.Y + dy;
        var width = Math.Max(MinBoundsSize, right - x);
        var height = Math.Max(MinBoundsSize, bottom - y);
        x = right - width;
        y = bottom - height;
        return new RectangleF(x, y, width, height);
    }

    private static RectangleF ResizeFromTop(RectangleF bounds, float dy)
    {
        var bottom = bounds.Bottom;
        var y = bounds.Y + dy;
        var height = Math.Max(MinBoundsSize, bottom - y);
        y = bottom - height;
        return new RectangleF(bounds.X, y, bounds.Width, height);
    }

    private static RectangleF ResizeFromTopRight(RectangleF bounds, float dx, float dy)
    {
        var bottom = bounds.Bottom;
        var y = bounds.Y + dy;
        var height = Math.Max(MinBoundsSize, bottom - y);
        y = bottom - height;
        var width = Math.Max(MinBoundsSize, bounds.Width + dx);
        return new RectangleF(bounds.X, y, width, height);
    }

    private static RectangleF ResizeFromRight(RectangleF bounds, float dx) =>
        new(bounds.X, bounds.Y, Math.Max(MinBoundsSize, bounds.Width + dx), bounds.Height);

    private static RectangleF ResizeFromBottomRight(RectangleF bounds, float dx, float dy) =>
        new(bounds.X, bounds.Y, Math.Max(MinBoundsSize, bounds.Width + dx), Math.Max(MinBoundsSize, bounds.Height + dy));

    private static RectangleF ResizeFromBottom(RectangleF bounds, float dy) =>
        new(bounds.X, bounds.Y, bounds.Width, Math.Max(MinBoundsSize, bounds.Height + dy));

    private static RectangleF ResizeFromBottomLeft(RectangleF bounds, float dx, float dy)
    {
        var right = bounds.Right;
        var x = bounds.X + dx;
        var width = Math.Max(MinBoundsSize, right - x);
        x = right - width;
        var height = Math.Max(MinBoundsSize, bounds.Height + dy);
        return new RectangleF(x, bounds.Y, width, height);
    }

    private static RectangleF ResizeFromLeft(RectangleF bounds, float dx)
    {
        var right = bounds.Right;
        var x = bounds.X + dx;
        var width = Math.Max(MinBoundsSize, right - x);
        x = right - width;
        return new RectangleF(x, bounds.Y, width, bounds.Height);
    }
}
