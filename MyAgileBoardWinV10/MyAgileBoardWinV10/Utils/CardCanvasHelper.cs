namespace MyAgileBoardWinV10.Utils;

public static class CardCanvasHelper
{
    public const int CanvasPadding = 8;
    public const int ResizeGripVisualSize = 24;
    public const float MinRotation = -180f;
    public const float MaxRotation = 180f;
    public const float RotationStep = 15f;

    public static bool HasCanvasPosition(int canvasX, int canvasY) => canvasX >= 0 && canvasY >= 0;

    public static Size GetRotatedBounds(int width, int height, float angleDegrees)
    {
        if (Math.Abs(angleDegrees % 360f) < 0.01f)
            return new Size(width, height);

        double rad = angleDegrees * Math.PI / 180.0;
        double cos = Math.Abs(Math.Cos(rad));
        double sin = Math.Abs(Math.Sin(rad));
        int w = (int)Math.Ceiling(width * cos + height * sin);
        int h = (int)Math.Ceiling(width * sin + height * cos);
        return new Size(Math.Max(width, w), Math.Max(height, h));
    }

    public static Point TransformDeltaToLocal(int dx, int dy, float angleDegrees)
    {
        if (Math.Abs(angleDegrees) < 0.01f)
            return new Point(dx, dy);

        double rad = -angleDegrees * Math.PI / 180.0;
        double cos = Math.Cos(rad);
        double sin = Math.Sin(rad);
        return new Point(
            (int)Math.Round(dx * cos - dy * sin),
            (int)Math.Round(dx * sin + dy * cos));
    }

    public static Point TransformLocalDeltaToParent(int localDx, int localDy, float angleDegrees)
    {
        if (Math.Abs(angleDegrees) < 0.01f)
            return new Point(localDx, localDy);

        double rad = angleDegrees * Math.PI / 180.0;
        double cos = Math.Cos(rad);
        double sin = Math.Sin(rad);
        return new Point(
            (int)Math.Round(localDx * cos - localDy * sin),
            (int)Math.Round(localDx * sin + localDy * cos));
    }

    public static Point TransformPointToLocal(Point point, int width, int height, float angleDegrees)
    {
        if (Math.Abs(angleDegrees) < 0.01f)
            return point;

        float cx = width / 2f;
        float cy = height / 2f;
        double rad = -angleDegrees * Math.PI / 180.0;
        float dx = point.X - cx;
        float dy = point.Y - cy;
        double cos = Math.Cos(rad);
        double sin = Math.Sin(rad);
        return new Point(
            (int)Math.Round(cx + dx * cos - dy * sin),
            (int)Math.Round(cy + dx * sin + dy * cos));
    }

    public static Point ClampToCanvas(Point location, Size cardSize, Size canvasClientSize)
    {
        int maxX = Math.Max(CardCanvasHelper.CanvasPadding,
            canvasClientSize.Width - cardSize.Width - CardCanvasHelper.CanvasPadding);
        int maxY = Math.Max(CardCanvasHelper.CanvasPadding,
            canvasClientSize.Height - cardSize.Height - CardCanvasHelper.CanvasPadding);
        return new Point(
            Math.Clamp(location.X, CardCanvasHelper.CanvasPadding, maxX),
            Math.Clamp(location.Y, CardCanvasHelper.CanvasPadding, maxY));
    }
}
