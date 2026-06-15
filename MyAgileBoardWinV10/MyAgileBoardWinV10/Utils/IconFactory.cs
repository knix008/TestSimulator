using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace MyAgileBoardWinV10.Utils;

public static class IconFactory
{
    private static readonly Dictionary<string, Bitmap> _cache = new();

    public static Bitmap Get(string name)
    {
        if (_cache.TryGetValue(name, out var cached)) return cached;
        var bmp = Create(name);
        _cache[name] = bmp;
        return bmp;
    }

    private static Bitmap Create(string name) => name switch
    {
        "new"        => DrawNew(),
        "open"       => DrawOpen(),
        "save"       => DrawSave(),
        "saveas"     => DrawSaveAs(),
        "summary"    => DrawChart(),
        "settings"   => DrawSettings(),
        "edit"       => DrawEdit(),
        "delete"     => DrawDelete(),
        "exit"       => DrawExit(),
        "add"        => DrawAdd(),
        "column"     => DrawColumn(),
        "check"      => DrawCheck(),
        "project"    => DrawProject(),
        "file"       => DrawFile(),
        "view"       => DrawView(),
        "undo"       => DrawUndo(),
        "redo"       => DrawRedo(),
        _            => DrawDefault()
    };

    // ── Individual icon drawing ──────────────────────────────────────

    private static Bitmap DrawNew()
    {
        return Draw(g =>
        {
            // White page
            g.FillRectangle(Brushes.White, 2, 1, 10, 13);
            g.DrawRectangle(Pens.Gray, 2, 1, 10, 13);
            // Corner fold
            using var pen = new Pen(Color.Gray);
            g.FillPolygon(new SolidBrush(Color.LightGray), new[] { new Point(9, 1), new Point(12, 4), new Point(9, 4) });
            g.DrawPolygon(pen, new[] { new Point(9, 1), new Point(12, 4), new Point(9, 4) });
            // Lines
            g.DrawLine(pen, 4, 6, 10, 6);
            g.DrawLine(pen, 4, 8, 10, 8);
            g.DrawLine(pen, 4, 10, 8, 10);
        });
    }

    private static Bitmap DrawOpen()
    {
        return Draw(g =>
        {
            using var b1 = new SolidBrush(Color.FromArgb(241, 196, 15));
            using var b2 = new SolidBrush(Color.FromArgb(213, 172, 12));
            // folder back
            g.FillRectangle(b2, 1, 5, 14, 9);
            // folder tab
            g.FillRectangle(b2, 1, 3, 5, 3);
            // folder front (lighter)
            g.FillRectangle(b1, 1, 6, 14, 8);
            g.DrawRectangle(new Pen(Color.DarkGoldenrod), 1, 5, 13, 9);
        });
    }

    private static Bitmap DrawSave()
    {
        return Draw(g =>
        {
            using var blue = new SolidBrush(Color.FromArgb(52, 120, 200));
            g.FillRectangle(blue, 1, 1, 14, 14);
            g.FillRectangle(Brushes.White, 3, 1, 8, 5);
            g.FillRectangle(new SolidBrush(Color.LightGray), 3, 8, 10, 6);
            g.DrawRectangle(new Pen(Color.DarkBlue), 1, 1, 14, 14);
            // Label slot
            g.FillRectangle(Brushes.Silver, 5, 2, 4, 3);
        });
    }

    private static Bitmap DrawSaveAs()
    {
        var bmp = DrawSave();
        using var g = Graphics.FromImage(bmp);
        // Add a small pencil overlay bottom-right
        using var p = new Pen(Color.FromArgb(237, 125, 49), 1.5f);
        g.DrawLine(p, 9, 11, 14, 6);
        g.DrawLine(p, 11, 13, 9, 11);
        return bmp;
    }

    private static Bitmap DrawChart()
    {
        return Draw(g =>
        {
            g.FillRectangle(new SolidBrush(Color.FromArgb(68, 114, 196)), 2, 8, 3, 6);
            g.FillRectangle(new SolidBrush(Color.FromArgb(237, 125, 49)), 6, 4, 3, 10);
            g.FillRectangle(new SolidBrush(Color.FromArgb(112, 173, 71)), 10, 2, 3, 12);
            using var axis = new Pen(Color.Gray, 1.5f);
            g.DrawLine(axis, 1, 14, 14, 14);
            g.DrawLine(axis, 1, 1, 1, 14);
        });
    }

    private static Bitmap DrawSettings()
    {
        return Draw(g =>
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var b = new SolidBrush(Color.FromArgb(80, 80, 80));
            // Outer gear circle
            g.FillEllipse(b, 3, 3, 10, 10);
            g.FillEllipse(Brushes.White, 5, 5, 6, 6);
            // Teeth (simplified as 4 rectangles)
            g.FillRectangle(b, 6, 1, 4, 3);   // top
            g.FillRectangle(b, 6, 12, 4, 3);  // bottom
            g.FillRectangle(b, 1, 6, 3, 4);   // left
            g.FillRectangle(b, 12, 6, 3, 4);  // right
        });
    }

    private static Bitmap DrawEdit()
    {
        return Draw(g =>
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var pen = new Pen(Color.FromArgb(237, 125, 49), 2f);
            // Pencil body
            g.DrawLine(pen, 3, 13, 12, 3);
            // Tip
            using var tipPen = new Pen(Color.Gray, 1f);
            g.DrawLine(tipPen, 3, 13, 1, 15);
            g.DrawLine(tipPen, 1, 15, 4, 14);
        });
    }

    private static Bitmap DrawDelete()
    {
        return Draw(g =>
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var b = new SolidBrush(Color.FromArgb(200, 50, 50));
            // Trash can
            g.FillRectangle(b, 4, 5, 8, 9);
            using var lidPen = new Pen(b, 1.5f);
            g.DrawLine(lidPen, 2, 4, 14, 4);  // lid top
            g.DrawRectangle(lidPen, 5, 2, 6, 2); // handle
            // Lines
            using var lp = new Pen(Color.White, 1f);
            g.DrawLine(lp, 6, 7, 6, 12);
            g.DrawLine(lp, 8, 7, 8, 12);
            g.DrawLine(lp, 10, 7, 10, 12);
        });
    }

    private static Bitmap DrawExit()
    {
        return Draw(g =>
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var b = new SolidBrush(Color.FromArgb(80, 80, 80));
            // Door outline
            g.DrawRectangle(new Pen(b, 1.5f), 2, 2, 8, 12);
            // Arrow pointing right (exit)
            using var arrowPen = new Pen(Color.FromArgb(237, 125, 49), 2f);
            g.DrawLine(arrowPen, 8, 8, 14, 8);
            g.DrawLine(arrowPen, 11, 5, 14, 8);
            g.DrawLine(arrowPen, 11, 11, 14, 8);
        });
    }

    private static Bitmap DrawAdd()
    {
        return Draw(g =>
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var pen = new Pen(Color.FromArgb(112, 173, 71), 2.5f);
            g.DrawLine(pen, 8, 2, 8, 14);
            g.DrawLine(pen, 2, 8, 14, 8);
        });
    }

    private static Bitmap DrawColumn()
    {
        return Draw(g =>
        {
            using var b = new SolidBrush(Color.FromArgb(68, 114, 196));
            g.FillRectangle(b, 1, 1, 5, 14);
            g.FillRectangle(b, 8, 1, 5, 14);
            // Plus sign
            using var pen = new Pen(Color.FromArgb(112, 173, 71), 2f);
            g.DrawLine(pen, 12, 6, 12, 12);
            g.DrawLine(pen, 9, 9, 15, 9);
        });
    }

    private static Bitmap DrawCheck()
    {
        return Draw(g =>
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var pen = new Pen(Color.FromArgb(112, 173, 71), 2.5f);
            g.DrawLines(pen, new[] { new Point(2, 8), new Point(6, 13), new Point(14, 3) });
        });
    }

    private static Bitmap DrawProject()
    {
        return Draw(g =>
        {
            using var b = new SolidBrush(Color.FromArgb(68, 114, 196));
            g.FillRectangle(b, 1, 3, 14, 11);
            g.FillRectangle(Brushes.White, 3, 5, 10, 7);
            // Rows
            using var lp = new Pen(Color.LightGray);
            g.DrawLine(lp, 3, 7, 13, 7);
            g.DrawLine(lp, 3, 9, 13, 9);
        });
    }

    private static Bitmap DrawFile()
    {
        return Draw(g =>
        {
            // Stack of documents
            g.FillRectangle(Brushes.LightSteelBlue, 4, 3, 9, 11);
            g.DrawRectangle(new Pen(Color.SteelBlue), 4, 3, 9, 11);
            g.FillRectangle(Brushes.White, 2, 1, 9, 11);
            g.DrawRectangle(new Pen(Color.Gray), 2, 1, 9, 11);
            // Corner fold
            g.FillPolygon(new SolidBrush(Color.LightGray), new[] { new Point(8, 1), new Point(11, 4), new Point(8, 4) });
            // Lines
            using var lp = new Pen(Color.Gray, 0.8f);
            g.DrawLine(lp, 4, 6, 9, 6);
            g.DrawLine(lp, 4, 8, 9, 8);
        });
    }

    private static Bitmap DrawView()
    {
        return Draw(g =>
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            // Eye shape
            using var eyePen = new Pen(Color.FromArgb(68, 114, 196), 1.5f);
            // Upper arc
            var pts = new PointF[]
            {
                new(1, 8), new(4, 4), new(8, 2), new(12, 4), new(15, 8),
                new(12, 12), new(8, 14), new(4, 12), new(1, 8)
            };
            g.DrawCurve(eyePen, pts);
            // Pupil
            g.FillEllipse(new SolidBrush(Color.FromArgb(68, 114, 196)), 5, 5, 6, 6);
            g.FillEllipse(Brushes.White, 6, 6, 4, 4);
            g.FillEllipse(new SolidBrush(Color.FromArgb(68, 114, 196)), 7, 7, 2, 2);
        });
    }

    private static Bitmap DrawUndo()
    {
        return Draw(g =>
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var pen = new Pen(Color.FromArgb(68, 114, 196), 2f);
            // Counter-clockwise arc
            g.DrawArc(pen, 2, 3, 11, 10, 150, 240);
            // Arrowhead at start of arc
            g.FillPolygon(new SolidBrush(Color.FromArgb(68, 114, 196)),
                new[] { new Point(2, 3), new Point(6, 1), new Point(5, 5) });
        });
    }

    private static Bitmap DrawRedo()
    {
        return Draw(g =>
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            using var pen = new Pen(Color.FromArgb(68, 114, 196), 2f);
            // Clockwise arc
            g.DrawArc(pen, 3, 3, 11, 10, -30, 240);
            // Arrowhead at end of arc
            g.FillPolygon(new SolidBrush(Color.FromArgb(68, 114, 196)),
                new[] { new Point(14, 3), new Point(10, 1), new Point(11, 5) });
        });
    }

    private static Bitmap DrawDefault()
    {
        return Draw(g =>
        {
            g.FillEllipse(Brushes.LightGray, 2, 2, 12, 12);
        });
    }

    // ── Helper ──────────────────────────────────────────────────────

    private static Bitmap Draw(Action<Graphics> draw)
    {
        const int S = 16;
        var bmp = new Bitmap(S, S, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.Clear(Color.Transparent);
        draw(g);
        return bmp;
    }
}
