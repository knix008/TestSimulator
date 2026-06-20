using System.Drawing.Drawing2D;

namespace ReqTrace.Resources;

/// <summary>
/// Draws simple pictographic 16x16 icons (documents, folders, magnifiers, etc.) at runtime
/// so every menu/toolbar item has a recognizable image-style icon without requiring external
/// art assets. Swap for real .ico/.png resources later if desired.
/// </summary>
public static class IconFactory
{
    private static Bitmap Canvas(Action<Graphics> draw)
    {
        var bmp = new Bitmap(16, 16);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        draw(g);
        return bmp;
    }

    private static void DrawDocument(Graphics g, Color fill, Color border)
    {
        using var brush = new SolidBrush(fill);
        using var pen = new Pen(border, 1f);
        Point[] outline = { new(3, 1), new(10, 1), new(13, 4), new(13, 15), new(3, 15) };
        g.FillPolygon(brush, outline);
        g.DrawPolygon(pen, outline);
        g.DrawLine(pen, 10, 1, 10, 4);
        g.DrawLine(pen, 10, 4, 13, 4);
        g.DrawLine(pen, 5, 7, 11, 7);
        g.DrawLine(pen, 5, 10, 11, 10);
    }

    private static void DrawFolder(Graphics g, Color fill, Color border)
    {
        using var brush = new SolidBrush(fill);
        using var pen = new Pen(border, 1f);
        var tab = new Rectangle(2, 3, 5, 2);
        var body = new Rectangle(2, 5, 12, 9);
        g.FillRectangle(brush, tab);
        g.FillRectangle(brush, body);
        g.DrawRectangle(pen, body);
        g.DrawRectangle(pen, tab);
    }

    private static void DrawFloppy(Graphics g, Color fill, Color border)
    {
        using var brush = new SolidBrush(fill);
        using var pen = new Pen(border, 1f);
        var body = new Rectangle(2, 2, 12, 12);
        g.FillRectangle(brush, body);
        g.DrawRectangle(pen, body);
        g.FillRectangle(Brushes.White, 5, 3, 6, 3);
        g.DrawRectangle(pen, 5, 9, 6, 5);
    }

    private static void DrawGrid(Graphics g, Color fill, Color border)
    {
        using var brush = new SolidBrush(fill);
        using var pen = new Pen(border, 1f);
        var body = new Rectangle(2, 2, 12, 12);
        g.FillRectangle(brush, body);
        g.DrawRectangle(pen, body);
        using var linePen = new Pen(Color.White, 1f);
        g.DrawLine(linePen, 2, 6, 14, 6);
        g.DrawLine(linePen, 2, 10, 14, 10);
        g.DrawLine(linePen, 6, 2, 6, 14);
        g.DrawLine(linePen, 10, 2, 10, 14);
    }

    private static void DrawChecklist(Graphics g, Color accent)
    {
        using var pen = new Pen(Color.FromArgb(70, 70, 70), 1f);
        using var accentPen = new Pen(accent, 1.6f);
        var body = new Rectangle(2, 1, 12, 14);
        g.DrawRectangle(pen, body);
        for (var y = 4; y <= 11; y += 3)
        {
            g.DrawRectangle(pen, 4, y, 2, 2);
            g.DrawLine(pen, 8, y + 1, 12, y + 1);
        }
        g.DrawLine(accentPen, 4, 6, 5, 7);
        g.DrawLine(accentPen, 5, 7, 7, 4);
    }

    private static void DrawPlusBadge(Graphics g, Color color)
    {
        using var brush = new SolidBrush(color);
        g.FillEllipse(brush, 8, 8, 7, 7);
        using var pen = new Pen(Color.White, 1.4f);
        g.DrawLine(pen, 11.5f, 9.5f, 11.5f, 13.5f);
        g.DrawLine(pen, 9.5f, 11.5f, 13.5f, 11.5f);
    }

    private static void DrawPencilBadge(Graphics g, Color color)
    {
        using var pen = new Pen(color, 2.2f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawLine(pen, 8, 14, 14, 8);
        using var tipBrush = new SolidBrush(Color.FromArgb(90, 60, 20));
        g.FillPolygon(tipBrush, new[] { new PointF(13.5f, 7.5f), new PointF(14.5f, 8.5f), new PointF(14, 9) });
    }

    private static void DrawXBadge(Graphics g, Color color)
    {
        using var brush = new SolidBrush(color);
        g.FillEllipse(brush, 8, 8, 7, 7);
        using var pen = new Pen(Color.White, 1.4f);
        g.DrawLine(pen, 9.5f, 9.5f, 13.5f, 13.5f);
        g.DrawLine(pen, 13.5f, 9.5f, 9.5f, 13.5f);
    }

    private static void DrawArrowBadge(Graphics g, Color color, bool pointingDown)
    {
        using var pen = new Pen(color, 1.8f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        var x = 11.5f;
        var top = pointingDown ? 8f : 13f;
        var bottom = pointingDown ? 13f : 8f;
        g.DrawLine(pen, x, top, x, bottom);
        using var headBrush = new SolidBrush(color);
        var headY = pointingDown ? bottom : top;
        var dir = pointingDown ? 1 : -1;
        g.FillPolygon(headBrush, new[]
        {
            new PointF(x - 2.2f, headY - dir * 2.2f),
            new PointF(x + 2.2f, headY - dir * 2.2f),
            new PointF(x, headY)
        });
    }

    public static Bitmap New() => Canvas(g =>
    {
        DrawDocument(g, Color.White, Color.FromArgb(70, 70, 70));
        DrawPlusBadge(g, Color.SeaGreen);
    });

    public static Bitmap Open() => Canvas(g => DrawFolder(g, Color.FromArgb(255, 213, 110), Color.FromArgb(150, 110, 30)));

    public static Bitmap Save() => Canvas(g => DrawFloppy(g, Color.SteelBlue, Color.FromArgb(40, 70, 110)));

    public static Bitmap SaveAs() => Canvas(g =>
    {
        DrawFloppy(g, Color.SteelBlue, Color.FromArgb(40, 70, 110));
        DrawPencilBadge(g, Color.DarkOrange);
    });

    public static Bitmap ImportExcel() => Canvas(g =>
    {
        DrawGrid(g, Color.ForestGreen, Color.FromArgb(20, 70, 30));
        DrawArrowBadge(g, Color.DarkGreen, pointingDown: true);
    });

    public static Bitmap ExportReport() => Canvas(g =>
    {
        DrawDocument(g, Color.White, Color.FromArgb(70, 70, 70));
        DrawArrowBadge(g, Color.DarkOrange, pointingDown: false);
    });

    public static Bitmap AddRequirement() => Canvas(g =>
    {
        DrawDocument(g, Color.Lavender, Color.DarkSlateBlue);
        DrawPlusBadge(g, Color.DarkSlateBlue);
    });

    public static Bitmap EditRequirement() => Canvas(g =>
    {
        DrawDocument(g, Color.Lavender, Color.DarkSlateBlue);
        DrawPencilBadge(g, Color.DarkSlateBlue);
    });

    public static Bitmap DeleteRequirement() => Canvas(g =>
    {
        DrawDocument(g, Color.Lavender, Color.DarkSlateBlue);
        DrawXBadge(g, Color.Firebrick);
    });

    public static Bitmap AddTestCase() => Canvas(g =>
    {
        DrawChecklist(g, Color.Teal);
        DrawPlusBadge(g, Color.Teal);
    });

    public static Bitmap EditTestCase() => Canvas(g =>
    {
        DrawChecklist(g, Color.Teal);
        DrawPencilBadge(g, Color.Teal);
    });

    public static Bitmap DeleteTestCase() => Canvas(g =>
    {
        DrawChecklist(g, Color.Teal);
        DrawXBadge(g, Color.Firebrick);
    });

    public static Bitmap RecordRun() => Canvas(g =>
    {
        using var circleBrush = new SolidBrush(Color.MediumPurple);
        g.FillEllipse(circleBrush, 1, 1, 14, 14);
        using var triangleBrush = new SolidBrush(Color.White);
        g.FillPolygon(triangleBrush, new[] { new PointF(6, 4.5f), new PointF(6, 11.5f), new PointF(12, 8) });
    });

    public static Bitmap Refresh() => Canvas(g =>
    {
        using var pen = new Pen(Color.SlateGray, 2f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawArc(pen, 2, 2, 12, 12, -30, 270);
        using var headBrush = new SolidBrush(Color.SlateGray);
        g.FillPolygon(headBrush, new[] { new PointF(12, 1.5f), new PointF(15, 3f), new PointF(11.5f, 4.5f) });
    });

    public static Bitmap Search() => Canvas(g =>
    {
        using var pen = new Pen(Color.SlateGray, 2f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawEllipse(pen, 2, 2, 8, 8);
        g.DrawLine(pen, 9, 9, 14, 14);
    });

    public static Bitmap Summary() => Canvas(g =>
    {
        using var pen = new Pen(Color.FromArgb(70, 70, 70), 1f);
        g.DrawLine(pen, 2, 14, 14, 14);
        g.DrawLine(pen, 2, 14, 2, 2);
        using var bar1 = new SolidBrush(Color.DarkCyan);
        using var bar2 = new SolidBrush(Color.SteelBlue);
        using var bar3 = new SolidBrush(Color.MediumSeaGreen);
        g.FillRectangle(bar1, 4, 10, 2, 4);
        g.FillRectangle(bar2, 7, 6, 2, 8);
        g.FillRectangle(bar3, 10, 3, 2, 11);
    });

    public static Bitmap StatusDot(Color color) => Canvas(g =>
    {
        using var brush = new SolidBrush(color);
        g.FillEllipse(brush, 3, 3, 10, 10);
    });
}
