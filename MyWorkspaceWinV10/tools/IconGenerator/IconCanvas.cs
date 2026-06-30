using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace IconGenerator;

internal static class IconCanvas
{
    private const float Grid = 12f;

    public static Bitmap Create(int size, Action<Graphics, RectangleF> draw) =>
        Create(size, 0.1f, draw);

    public static Bitmap Create(int size, float insetRatio, Action<Graphics, RectangleF> draw)
    {
        var bitmap = new Bitmap(size, size);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.Clear(Color.Transparent);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
        graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;

        var inset = size * insetRatio;
        var content = new RectangleF(inset, inset, size - inset * 2f, size - inset * 2f);
        draw(graphics, content);
        return bitmap;
    }

    public static RectangleF Box(RectangleF content, float x, float y, float width, float height) =>
        new(
            content.X + content.Width * (x / Grid),
            content.Y + content.Height * (y / Grid),
            content.Width * (width / Grid),
            content.Height * (height / Grid));

    public static PointF Point(RectangleF content, float x, float y) =>
        new(
            content.X + content.Width * (x / Grid),
            content.Y + content.Height * (y / Grid));

    public static void FillEllipse(Graphics graphics, RectangleF content, float x, float y, float width, float height, Color color)
    {
        using var brush = new SolidBrush(color);
        graphics.FillEllipse(brush, Box(content, x, y, width, height));
    }

    public static void FillRectangle(Graphics graphics, RectangleF content, float x, float y, float width, float height, Color color)
    {
        using var brush = new SolidBrush(color);
        graphics.FillRectangle(brush, Box(content, x, y, width, height));
    }

    public static void DrawRectangle(Graphics graphics, RectangleF content, float x, float y, float width, float height, Color color, float thickness = 1f)
    {
        using var pen = new Pen(color, thickness);
        graphics.DrawRectangle(pen, Box(content, x, y, width, height).X, Box(content, x, y, width, height).Y, Box(content, x, y, width, height).Width, Box(content, x, y, width, height).Height);
    }

    public static void DrawLine(Graphics graphics, RectangleF content, float x1, float y1, float x2, float y2, Color color, float thickness = 1f)
    {
        using var pen = new Pen(color, thickness) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        graphics.DrawLine(pen, Point(content, x1, y1), Point(content, x2, y2));
    }

    public static void DrawArc(Graphics graphics, RectangleF content, float x, float y, float width, float height, float startAngle, float sweepAngle, Color color, float thickness = 1f)
    {
        using var pen = new Pen(color, thickness) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        graphics.DrawArc(pen, Box(content, x, y, width, height), startAngle, sweepAngle);
    }

    public static void DrawStringCentered(Graphics graphics, RectangleF content, string text, float fontSize, Color color, FontStyle style = FontStyle.Regular)
    {
        using var font = new Font("Segoe UI", fontSize, style, GraphicsUnit.Pixel);
        using var brush = new SolidBrush(color);
        using var format = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center,
            Trimming = StringTrimming.None
        };
        graphics.DrawString(text, font, brush, content, format);
    }

    public static void FillPolygon(Graphics graphics, RectangleF content, Color color, params (float x, float y)[] points)
    {
        using var brush = new SolidBrush(color);
        graphics.FillPolygon(brush, points.Select(p => Point(content, p.x, p.y)).ToArray());
    }

    public static void FillRoundedRectangle(Graphics graphics, RectangleF content, float x, float y, float width, float height, float cornerRadius, Color color)
    {
        var rect = Box(content, x, y, width, height);
        using var path = RoundedRect(rect, cornerRadius * content.Width / Grid);
        using var brush = new SolidBrush(color);
        graphics.FillPath(brush, path);
    }

    public static void DrawRoundedRectangle(Graphics graphics, RectangleF content, float x, float y, float width, float height, float cornerRadius, Color color, float thickness)
    {
        var rect = Box(content, x, y, width, height);
        using var path = RoundedRect(rect, cornerRadius * content.Width / Grid);
        using var pen = new Pen(color, thickness) { LineJoin = LineJoin.Round };
        graphics.DrawPath(pen, path);
    }

    public static void FillRoundedRectangleGradient(
        Graphics graphics,
        RectangleF content,
        float x,
        float y,
        float width,
        float height,
        float cornerRadius,
        Color startColor,
        Color endColor,
        float angleDegrees = 45f)
    {
        var rect = Box(content, x, y, width, height);
        using var path = RoundedRect(rect, cornerRadius * content.Width / Grid);
        using var brush = new LinearGradientBrush(rect, startColor, endColor, angleDegrees);
        graphics.FillPath(brush, path);
    }

    public static void FillEllipseGradient(
        Graphics graphics,
        RectangleF content,
        float x,
        float y,
        float width,
        float height,
        Color innerColor,
        Color outerColor)
    {
        var rect = Box(content, x, y, width, height);
        using var path = new GraphicsPath();
        path.AddEllipse(rect);
        using var brush = new PathGradientBrush(path)
        {
            CenterColor = innerColor,
            SurroundColors = [outerColor]
        };
        graphics.FillPath(brush, path);
    }

    private static GraphicsPath RoundedRect(RectangleF rect, float radius)
    {
        var path = new GraphicsPath();
        var diameter = Math.Min(radius * 2f, Math.Min(rect.Width, rect.Height));
        path.AddArc(rect.X, rect.Y, diameter, diameter, 180f, 90f);
        path.AddArc(rect.Right - diameter, rect.Y, diameter, diameter, 270f, 90f);
        path.AddArc(rect.Right - diameter, rect.Bottom - diameter, diameter, diameter, 0f, 90f);
        path.AddArc(rect.X, rect.Bottom - diameter, diameter, diameter, 90f, 90f);
        path.CloseFigure();
        return path;
    }
}
