using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace CodeAnalyzer.Controls;

internal static class MenuIconFactory
{
    private const int IconSize = 16;

    public static Bitmap CreateFileIcon() => Draw(g =>
    {
        using var folder = new SolidBrush(Color.FromArgb(255, 193, 7));
        using var tab = new SolidBrush(Color.FromArgb(255, 213, 79));
        g.FillRectangle(tab, 2, 4, 7, 3);
        using var path = new GraphicsPath();
        path.AddLines(new[]
        {
            new Point(2, 6),
            new Point(14, 6),
            new Point(14, 14),
            new Point(2, 14)
        });
        path.CloseFigure();
        g.FillPath(folder, path);
        g.DrawPath(Pens.DarkGoldenrod, path);
    });

    public static Bitmap CreateOpenIcon() => Draw(g =>
    {
        using var folder = new SolidBrush(Color.FromArgb(255, 193, 7));
        using var tab = new SolidBrush(Color.FromArgb(255, 213, 79));
        g.FillRectangle(tab, 2, 6, 7, 3);
        using var path = new GraphicsPath();
        path.AddLines(new[]
        {
            new Point(2, 8),
            new Point(14, 8),
            new Point(14, 14),
            new Point(2, 14)
        });
        path.CloseFigure();
        g.FillPath(folder, path);
        g.DrawLine(Pens.DodgerBlue, 8, 2, 8, 6);
        g.DrawLine(Pens.DodgerBlue, 6, 4, 8, 2);
        g.DrawLine(Pens.DodgerBlue, 10, 4, 8, 2);
    });

    public static Bitmap CreateSaveIcon() => Draw(g =>
    {
        using var body = new SolidBrush(Color.FromArgb(96, 125, 139));
        g.FillRectangle(body, 3, 2, 10, 12);
        using var label = new SolidBrush(Color.FromArgb(176, 190, 197));
        g.FillRectangle(label, 5, 2, 6, 3);
        g.FillRectangle(Brushes.White, 5, 7, 6, 5);
        g.DrawRectangle(Pens.DimGray, 3, 2, 10, 12);
    });

    public static Bitmap CreateExportMetricsIcon() => Draw(g =>
    {
        g.DrawRectangle(Pens.ForestGreen, 2, 2, 12, 12);
        g.DrawLine(Pens.ForestGreen, 2, 6, 14, 6);
        g.DrawLine(Pens.ForestGreen, 2, 10, 14, 10);
        g.DrawLine(Pens.ForestGreen, 6, 2, 6, 14);
        g.DrawLine(Pens.ForestGreen, 10, 2, 10, 14);
        using var accent = new SolidBrush(Color.FromArgb(76, 175, 80));
        g.FillRectangle(accent, 7, 7, 6, 6);
    });

    public static Bitmap CreateExportReportIcon() => Draw(g =>
    {
        using var page = new SolidBrush(Color.White);
        g.FillRectangle(page, 3, 1, 10, 14);
        g.DrawRectangle(Pens.SteelBlue, 3, 1, 10, 14);
        g.DrawLine(Pens.CornflowerBlue, 5, 5, 11, 5);
        g.DrawLine(Pens.CornflowerBlue, 5, 8, 11, 8);
        g.DrawLine(Pens.CornflowerBlue, 5, 11, 9, 11);
        using var fold = new SolidBrush(Color.FromArgb(220, 230, 240));
        g.FillPolygon(fold, new[] { new Point(10, 1), new Point(13, 4), new Point(10, 4) });
        g.DrawLine(Pens.SteelBlue, 10, 1, 13, 4);
        g.DrawLine(Pens.SteelBlue, 10, 1, 10, 4);
        g.DrawLine(Pens.SteelBlue, 10, 4, 13, 4);
    });

    public static Bitmap CreateExportImageIcon() => Draw(g =>
    {
        g.DrawRectangle(Pens.DimGray, 2, 3, 12, 10);
        using var sky = new SolidBrush(Color.FromArgb(129, 212, 250));
        g.FillRectangle(sky, 3, 4, 10, 5);
        g.FillEllipse(Brushes.Gold, 9, 5, 3, 3);
        using var hill = new SolidBrush(Color.FromArgb(102, 187, 106));
        g.FillPolygon(hill, new[] { new Point(3, 12), new Point(8, 7), new Point(13, 12) });
    });

    private static Bitmap Draw(Action<Graphics> draw)
    {
        var bitmap = new Bitmap(IconSize, IconSize, PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.Clear(Color.Transparent);
        draw(graphics);
        return bitmap;
    }
}
