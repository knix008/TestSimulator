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

    public static Bitmap CreateProjectOpenIcon() => Draw(g =>
    {
        using var folder = new SolidBrush(Color.FromArgb(46, 125, 50));
        using var tab = new SolidBrush(Color.FromArgb(102, 187, 106));
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
        g.DrawPath(new Pen(Color.DarkGreen), path);
        g.DrawLine(new Pen(Color.White, 2), 5, 10, 11, 10);
        g.DrawLine(new Pen(Color.White, 1.5f), 8, 7, 11, 10);
        g.DrawLine(new Pen(Color.White, 1.5f), 8, 13, 11, 10);
    });

    public static Bitmap CreateProjectSaveIcon() => Draw(g =>
    {
        using var folder = new SolidBrush(Color.FromArgb(21, 101, 192));
        using var tab = new SolidBrush(Color.FromArgb(66, 165, 245));
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
        g.DrawPath(new Pen(Color.DarkBlue), path);
        using var p = new Pen(Color.White, 1.5f);
        g.DrawLine(p, 5, 11, 7, 13);
        g.DrawLine(p, 7, 13, 12, 7);
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

    /// <summary>메뉴 「설정」 상위 항목 — 일반 설정(톱니) 아이콘.</summary>
    public static Bitmap CreateSettingsMenuIcon(int size = 16) => DrawSized(size, g =>
    {
        var center = size / 2f;
        var outerR = size / 2f - 1f;
        const int toothCount = 8;
        var toothDepth = outerR * 0.22f;
        var innerHole = outerR * 0.38f;

        using var path = new GraphicsPath();
        var points = new PointF[toothCount * 2];
        for (var i = 0; i < toothCount * 2; i++)
        {
            var angle = Math.PI * 2 * i / (toothCount * 2) - Math.PI / 2;
            var radius = i % 2 == 0 ? outerR : outerR - toothDepth;
            points[i] = new PointF(
                center + (float)(radius * Math.Cos(angle)),
                center + (float)(radius * Math.Sin(angle)));
        }

        path.AddPolygon(points);
        using var gear = new SolidBrush(Color.FromArgb(84, 96, 118));
        using var outline = new Pen(Color.FromArgb(62, 72, 90), 1f);
        g.FillPath(gear, path);
        g.DrawPath(outline, path);
        g.FillEllipse(
            Brushes.White,
            center - innerHole,
            center - innerHole,
            innerHole * 2,
            innerHole * 2);
        g.DrawEllipse(outline, center - innerHole, center - innerHole, innerHole * 2, innerHole * 2);
    });

    public static Bitmap CreateAnalysisSettingsIcon(int size = 16) => DrawSized(size, g =>
    {
        var stroke = Math.Max(1.4f, size / 11f);
        using var outline = new Pen(Color.FromArgb(55, 90, 140), stroke)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round
        };
        using var glass = new SolidBrush(Color.FromArgb(210, 228, 248));

        var margin = size * 0.14f;
        var lensSize = size * 0.56f;
        g.FillEllipse(glass, margin, margin, lensSize, lensSize);
        g.DrawEllipse(outline, margin, margin, lensSize, lensSize);

        var handleStartX = margin + lensSize * 0.68f;
        var handleStartY = margin + lensSize * 0.68f;
        var handleEndX = size - margin * 0.45f;
        var handleEndY = size - margin * 0.45f;
        g.DrawLine(outline, handleStartX, handleStartY, handleEndX, handleEndY);
    });

    public static Bitmap CreateDatabaseSettingsIcon(int size = 16) => DrawSized(size, g =>
    {
        using var body = new SolidBrush(Color.FromArgb(55, 90, 140));
        using var cap = new SolidBrush(Color.FromArgb(76, 175, 80));
        g.FillEllipse(body, 2, 5, size - 4, 4);
        g.FillRectangle(body, 2, 7, size - 4, size - 9);
        g.FillEllipse(body, 2, size - 6, size - 4, 4);
        g.FillEllipse(cap, 2, 3, size - 4, 4);
    });

    public static Bitmap CreateSelectAllIcon() => Draw(g =>
    {
        using var box = new Pen(Color.FromArgb(55, 90, 140), 1.5f);
        g.DrawRectangle(box, 2, 2, 12, 12);
        using var check = new Pen(Color.FromArgb(46, 125, 50), 2f);
        g.DrawLines(check, new[] { new Point(4, 8), new Point(7, 11), new Point(12, 4) });
    });

    public static Bitmap CreateClearAllIcon() => Draw(g =>
    {
        using var box = new Pen(Color.FromArgb(120, 130, 145), 1.5f);
        g.DrawRectangle(box, 2, 2, 12, 12);
        using var cross = new Pen(Color.FromArgb(198, 40, 40), 1.8f);
        g.DrawLine(cross, 5, 5, 11, 11);
        g.DrawLine(cross, 11, 5, 5, 11);
    });

    public static Bitmap CreateExpandAllIcon() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(46, 125, 50), 2f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round
        };
        g.DrawLine(pen, 4, 6, 8, 10);
        g.DrawLine(pen, 8, 10, 12, 6);
    });

    public static Bitmap CreateCollapseAllIcon() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(198, 40, 40), 2f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round
        };
        g.DrawLine(pen, 4, 10, 8, 6);
        g.DrawLine(pen, 8, 6, 12, 10);
    });

    public static Bitmap CreateResetViewIcon() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(55, 90, 140), 1.6f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round
        };
        g.DrawArc(pen, 3, 3, 10, 10, 45, 270);
        g.DrawLine(pen, 10, 3, 12, 1);
        g.DrawLine(pen, 10, 3, 8, 5);
    });

    private static Bitmap DrawSized(int size, Action<Graphics> draw)
    {
        var bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.Clear(Color.Transparent);
        draw(graphics);
        return bitmap;
    }

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
