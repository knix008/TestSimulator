using System.Drawing.Drawing2D;

namespace EaxyMDV10;

static class GraphicsExtensions
{
    public static void FillRoundedRectangle(this Graphics g, Brush brush, float x, float y, float w, float h, float r)
    {
        using var path = RoundedPath(x, y, w, h, r);
        g.FillPath(brush, path);
    }

    public static void DrawRoundedRectangle(this Graphics g, Pen pen, float x, float y, float w, float h, float r)
    {
        using var path = RoundedPath(x, y, w, h, r);
        g.DrawPath(pen, path);
    }

    private static GraphicsPath RoundedPath(float x, float y, float w, float h, float r)
    {
        var path = new GraphicsPath();
        path.AddArc(x,         y,         r * 2, r * 2, 180, 90);
        path.AddArc(x + w - r * 2, y,         r * 2, r * 2,  270, 90);
        path.AddArc(x + w - r * 2, y + h - r * 2, r * 2, r * 2,    0, 90);
        path.AddArc(x,         y + h - r * 2, r * 2, r * 2,   90, 90);
        path.CloseFigure();
        return path;
    }
}
