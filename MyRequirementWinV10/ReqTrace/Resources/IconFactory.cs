using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

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
        var bmp = new Bitmap(16, 16, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.Clear(Color.Transparent);
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

    public static Bitmap Undo() => Canvas(g =>
    {
        using var pen = new Pen(Color.FromArgb(60, 60, 60), 1.5f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.ArrowAnchor
        };
        g.DrawArc(pen, 3, 3, 9, 9, 120, 210);
    });

    public static Bitmap Redo() => Canvas(g =>
    {
        using var pen = new Pen(Color.FromArgb(60, 60, 60), 1.5f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.ArrowAnchor
        };
        g.DrawArc(pen, 4, 3, 9, 9, -30, 210);
    });

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

    private static void DrawDatabase(Graphics g, Color fill, Color border)
    {
        using var brush = new SolidBrush(fill);
        using var pen = new Pen(border, 1f);
        g.FillEllipse(brush, 3, 2, 10, 4);
        g.DrawEllipse(pen, 3, 2, 10, 4);
        var body = new Rectangle(3, 4, 10, 10);
        g.FillRectangle(brush, body);
        g.DrawRectangle(pen, body);
        g.FillEllipse(brush, 3, 12, 10, 4);
        g.DrawEllipse(pen, 3, 12, 10, 4);
        using var linePen = new Pen(Color.White, 1f);
        g.DrawLine(linePen, 3, 8, 13, 8);
        g.DrawLine(linePen, 3, 11, 13, 11);
    }

    public static Bitmap ConnectDatabase() => Canvas(g =>
        DrawDatabase(g, Color.SteelBlue, Color.FromArgb(40, 70, 110)));

    public static Bitmap SaveToDatabase() => Canvas(g =>
    {
        DrawDatabase(g, Color.SteelBlue, Color.FromArgb(40, 70, 110));
        DrawArrowBadge(g, Color.DarkOrange, pointingDown: false);
    });

    public static Bitmap LoadFromDatabase() => Canvas(g =>
    {
        DrawDatabase(g, Color.SteelBlue, Color.FromArgb(40, 70, 110));
        DrawArrowBadge(g, Color.DarkGreen, pointingDown: true);
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

    public static Bitmap About() => Canvas(g =>
    {
        using var fill = new SolidBrush(Color.SteelBlue);
        using var pen = new Pen(Color.FromArgb(40, 70, 110), 1f);
        g.FillEllipse(fill, 1, 1, 14, 14);
        g.DrawEllipse(pen, 1, 1, 14, 14);
        using var dotBrush = new SolidBrush(Color.White);
        g.FillEllipse(dotBrush, 7, 3, 2, 2);
        g.FillRectangle(dotBrush, 7, 7, 2, 6);
    });

    public static Bitmap Options() => Canvas(g =>
    {
        using var pen = new Pen(Color.SlateGray, 1.3f);
        g.DrawEllipse(pen, 4, 4, 8, 8);
        g.DrawEllipse(pen, 2, 2, 12, 12);
        for (var i = 0; i < 8; i++)
        {
            var angle = i * Math.PI / 4;
            var innerX = 8f + (float)(3.5 * Math.Cos(angle));
            var innerY = 8f + (float)(3.5 * Math.Sin(angle));
            var outerX = 8f + (float)(6.5 * Math.Cos(angle));
            var outerY = 8f + (float)(6.5 * Math.Sin(angle));
            g.DrawLine(pen, innerX, innerY, outerX, outerY);
        }
    });

    public static Bitmap Exit() => Canvas(g =>
    {
        using var pen = new Pen(Color.FromArgb(70, 70, 70), 1.2f);
        using var accentPen = new Pen(Color.Firebrick, 1.6f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawRectangle(pen, 3, 2, 10, 12);
        g.DrawLine(pen, 8, 2, 8, 7);
        g.DrawLine(accentPen, 6, 8, 10, 12);
        g.DrawLine(accentPen, 10, 8, 6, 12);
    });

    public static Bitmap Language() => Canvas(g =>
    {
        using var pen = new Pen(Color.SteelBlue, 1.2f);
        g.DrawEllipse(pen, 2, 2, 12, 12);
        g.DrawLine(pen, 8, 2, 8, 14);
        g.DrawArc(pen, 5, 2, 6, 12, 270, 180);
    });

    public static Bitmap LanguageKorean() => Canvas(g =>
    {
        using var bg = new SolidBrush(Color.White);
        using var border = new Pen(Color.FromArgb(70, 70, 70), 1f);
        g.FillRectangle(bg, 2, 3, 12, 10);
        g.DrawRectangle(border, 2, 3, 12, 10);
        using var red = new SolidBrush(Color.FromArgb(200, 45, 55));
        using var blue = new SolidBrush(Color.FromArgb(0, 70, 140));
        g.FillEllipse(red, 4, 5, 4, 4);
        g.FillEllipse(blue, 8, 5, 4, 4);
        using var font = new Font("Segoe UI", 5.5f, FontStyle.Bold);
        g.DrawString("A", font, Brushes.Black, 4.5f, 9.5f);
    });

    public static Bitmap LanguageEnglish() => Canvas(g =>
    {
        using var bg = new SolidBrush(Color.White);
        using var border = new Pen(Color.FromArgb(70, 70, 70), 1f);
        g.FillRectangle(bg, 2, 3, 12, 10);
        g.DrawRectangle(border, 2, 3, 12, 10);
        using var red = new SolidBrush(Color.FromArgb(180, 30, 40));
        using var blue = new SolidBrush(Color.FromArgb(0, 55, 130));
        g.FillRectangle(red, 2, 3, 12, 3);
        g.FillRectangle(blue, 2, 10, 12, 3);
        using var font = new Font("Segoe UI", 5.5f, FontStyle.Bold);
        g.DrawString("En", font, Brushes.Black, 4f, 6.5f);
    });

    public static Bitmap GroupByCategory() => Canvas(g =>
        DrawFolder(g, Color.FromArgb(255, 213, 110), Color.FromArgb(150, 110, 30)));

    public static Bitmap GroupByHierarchy() => Canvas(g =>
    {
        using var pen = new Pen(Color.SaddleBrown, 1.4f);
        g.DrawLine(pen, 8, 2, 8, 6);
        g.DrawLine(pen, 4, 6, 12, 6);
        g.DrawLine(pen, 4, 6, 4, 10);
        g.DrawLine(pen, 8, 6, 8, 10);
        g.DrawLine(pen, 12, 6, 12, 10);
        g.DrawLine(pen, 4, 10, 4, 14);
        g.DrawLine(pen, 8, 10, 8, 14);
        g.DrawLine(pen, 12, 10, 12, 14);
    });

    public static Bitmap RecentFiles() => Open();
}
