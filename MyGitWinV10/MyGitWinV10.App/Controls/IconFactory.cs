using System.Drawing.Drawing2D;

namespace MyGitWinV10.App.Controls;

public static class IconFactory
{
    public const int MenuIconSize = 16;
    public const int ToolbarIconSize = 40;

    private static readonly Color GlyphColor = Color.FromArgb(71, 85, 105);
    private static readonly Color AccentColor = Color.FromArgb(37, 99, 235);

    private static Bitmap Create(Action<Graphics, Pen, SolidBrush> draw, Color? color = null, int size = MenuIconSize)
    {
        var bmp = new Bitmap(size, size);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        var scale = size / (float)MenuIconSize;
        g.ScaleTransform(scale, scale);
        using var pen = new Pen(color ?? GlyphColor, 1.4f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
        using var brush = new SolidBrush(color ?? GlyphColor);
        draw(g, pen, brush);
        return bmp;
    }

    public static Image Open(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.FillPolygon(brush, new PointF[] { new(2, 4), new(6, 4), new(7.5f, 6), new(14, 6), new(14, 6.5f), new(2, 6.5f) });
        g.DrawRectangle(pen, 2, 6, 12, 7);
    });

    public static Image Clone(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawLine(pen, 8, 2, 8, 9);
        g.FillPolygon(brush, new PointF[] { new(4.5f, 7), new(11.5f, 7), new(8, 11) });
        g.DrawLine(pen, 3, 13, 13, 13);
    });

    public static Image Exit(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        // Door + arrow — kept inside 3..13 so round pen caps are not clipped.
        g.DrawLine(pen, 3.5f, 4, 3.5f, 12);
        g.DrawLine(pen, 3.5f, 4, 7, 4);
        g.DrawLine(pen, 3.5f, 12, 7, 12);
        g.DrawLine(pen, 7.5f, 8, 11.5f, 8);
        g.FillPolygon(brush, new PointF[] { new(10, 6.2f), new(12.5f, 8), new(10, 9.8f) });
    });

    public static Image Info(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawEllipse(pen, 2, 2, 12, 12);
        g.FillEllipse(brush, 7, 5, 2, 2);
        g.DrawLine(pen, 8, 7.5f, 8, 12);
    }, AccentColor);

    /// <summary>Root Info menu — help and about section.</summary>
    public static Image InfoMenu(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawEllipse(pen, 3.5f, 3.5f, 9, 9);
        g.DrawArc(pen, 6.5f, 5.5f, 4.5f, 4f, 210, 135);
        g.DrawLine(pen, 8, 9.5f, 8, 10.5f);
        g.FillEllipse(brush, 7.3f, 11.2f, 1.4f, 1.4f);
    });

    /// <summary>Toolbar Info button — loaded from Assets/Info_icon.png.</summary>
    public static Image InfoToolbar(int size = ToolbarIconSize)
    {
        string path = Path.Combine(AppContext.BaseDirectory, "Assets", "Info_icon.png");
        if (!System.IO.File.Exists(path))
        {
            return InfoMenu(size);
        }

        using var stream = System.IO.File.OpenRead(path);
        using var source = Image.FromStream(stream);
        return ResizeToSquare(source, size);
    }

    private static Bitmap ResizeToSquare(Image source, int size)
    {
        var bmp = new Bitmap(size, size);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.HighQuality;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.CompositingQuality = CompositingQuality.HighQuality;
        g.DrawImage(source, 0, 0, size, size);
        return bmp;
    }

    public static Image Refresh(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawArc(pen, 3, 3, 10, 10, -40, 270);
        g.FillPolygon(brush, new PointF[] { new(11.5f, 2.5f), new(14.5f, 4.5f), new(11, 6) });
    });

    /// <summary>Reload repository tree (branches, tags, releases).</summary>
    public static Image RefreshTree(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawEllipse(pen, 2.5f, 3, 3, 3);
        g.DrawEllipse(pen, 2.5f, 10, 3, 3);
        g.DrawLine(pen, 4, 6, 4, 10);
        g.DrawArc(pen, 7, 3.5f, 6.5f, 6.5f, -45, 255);
        g.FillPolygon(brush, new PointF[] { new(12.5f, 3.5f), new(13.5f, 6.5f), new(10.5f, 5) });
    });

    /// <summary>Reload commit history graph.</summary>
    public static Image RefreshGraph(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawLine(pen, 3, 4, 3, 12);
        g.DrawLine(pen, 6, 7, 6, 12);
        g.FillEllipse(brush, 2, 4.5f, 2, 2);
        g.FillEllipse(brush, 5, 8.5f, 2, 2);
        g.DrawLine(pen, 3, 5.5f, 6, 9.5f);
        g.DrawArc(pen, 7.5f, 3, 6, 6, 135, 255);
        g.FillPolygon(brush, new PointF[] { new(12.5f, 6.5f), new(13.5f, 9.5f), new(10.5f, 8) });
    });

    public static Image Branch(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawEllipse(pen, 2.5f, 2.5f, 3, 3);
        g.DrawEllipse(pen, 2.5f, 10.5f, 3, 3);
        g.DrawEllipse(pen, 10.5f, 6.5f, 3, 3);
        g.DrawLine(pen, 4, 5.5f, 4, 10.5f);
        g.DrawLine(pen, 4, 8, 10.5f, 8);
    });

    public static Image Tag(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawPolygon(pen, new PointF[] { new(2, 3), new(9, 3), new(14, 8), new(9, 13), new(2, 13) });
        g.FillEllipse(brush, 4.5f, 6.5f, 3, 3);
    });

    public static Image Release(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        PointF Pt(double angle, double r) => new(8 + (float)(r * Math.Sin(angle)), 8 - (float)(r * Math.Cos(angle)));
        var pts = new PointF[10];
        for (int i = 0; i < 10; i++)
        {
            double angle = i * Math.PI / 5;
            pts[i] = Pt(angle, i % 2 == 0 ? 6.5 : 2.8);
        }
        g.FillPolygon(brush, pts);
    }, Color.FromArgb(217, 119, 6));

    public static Image Checkout(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawLines(pen, new PointF[] { new(3, 8.5f), new(6.5f, 12), new(13, 4) });
    }, Color.FromArgb(5, 150, 105));

    public static Image Copy(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawRectangle(pen, 2.5f, 4.5f, 8, 9);
        g.DrawRectangle(pen, 5.5f, 2.5f, 8, 9);
        g.FillRectangle(Brushes.White, 5.5f, 2.5f, 8, 9);
        g.DrawRectangle(pen, 5.5f, 2.5f, 8, 9);
    });

    public static Image File(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawPolygon(pen, new PointF[] { new(4, 2), new(10, 2), new(13, 5), new(13, 14), new(4, 14) });
        g.DrawLines(pen, new PointF[] { new(10, 2), new(10, 5), new(13, 5) });
        g.DrawLine(pen, 6, 8, 11, 8);
        g.DrawLine(pen, 6, 10.5f, 11, 10.5f);
    });

    public static Image WordWrap(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawLine(pen, 2, 4, 14, 4);
        g.DrawLine(pen, 2, 8, 11, 8);
        g.DrawLine(pen, 11, 8, 13.5f, 10.2f);
        g.DrawLine(pen, 13.5f, 10.2f, 9.5f, 10.2f);
        g.DrawLine(pen, 2, 12, 8, 12);
    });

    public static Image Message(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawRectangle(pen, 2, 3, 12, 9);
        g.DrawLine(pen, 4, 6, 12, 6);
        g.DrawLine(pen, 4, 8.5f, 9, 8.5f);
    });

    public static Image Folder(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.FillPolygon(brush, new PointF[] { new(2, 6), new(8, 3), new(14, 6), new(14, 14), new(2, 14) });
        g.DrawPolygon(pen, new PointF[] { new(2, 6), new(8, 3), new(14, 6), new(14, 14), new(2, 14) });
    });

    public static Image History(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawEllipse(pen, 3.5f, 3.5f, 9, 9);
        g.DrawLine(pen, 8, 8, 8, 5.5f);
        g.DrawLine(pen, 8, 8, 10.5f, 9.5f);
    });

    public static Image Report(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawPolygon(pen, new PointF[] { new(4, 2), new(10, 2), new(12, 4), new(12, 13), new(4, 13), new(4, 2) });
        g.DrawLine(pen, 10, 2, 10, 4);
        g.DrawLine(pen, 10, 4, 12, 4);
        g.DrawLine(pen, 6, 6.5f, 10, 6.5f);
        g.DrawLine(pen, 6, 8.5f, 10, 8.5f);
        g.DrawLine(pen, 6, 10.5f, 8.5f, 10.5f);
    });
}
