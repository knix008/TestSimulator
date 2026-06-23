using System.Drawing.Drawing2D;

namespace MyGitWinV10.App.Controls;

public static class IconFactory
{
    public const int MenuIconSize = 16;
    public const int RootMenuIconSize = 14;
    public const int MenuBarIconSize = 20;
    public const int ToolbarIconSize = 30;
    public const int InfoToolbarIconSize = 20;

    private static readonly Color GlyphColor = Color.FromArgb(71, 85, 105);
    private static readonly Color AccentColor = Color.FromArgb(37, 99, 235);

    /// <summary>Menu bar and dropdown accent colors.</summary>
    public static class Palette
    {
        public static readonly Color Folder = Color.FromArgb(245, 158, 11);
        public static readonly Color Branch = Color.FromArgb(37, 99, 235);
        public static readonly Color History = Color.FromArgb(124, 58, 237);
        public static readonly Color Help = Color.FromArgb(14, 165, 233);
        public static readonly Color Open = Color.FromArgb(37, 99, 235);
        public static readonly Color Clone = Color.FromArgb(5, 150, 105);
        public static readonly Color Exit = Color.FromArgb(220, 38, 38);
        public static readonly Color Settings = Color.FromArgb(99, 102, 241);
        public static readonly Color Refresh = Color.FromArgb(16, 185, 129);
        public static readonly Color Report = Color.FromArgb(234, 88, 12);
        public static readonly Color Copy = Color.FromArgb(79, 70, 229);
        public static readonly Color Message = Color.FromArgb(168, 85, 247);
        public static readonly Color File = Color.FromArgb(6, 182, 212);
        public static readonly Color WordWrap = Color.FromArgb(99, 102, 241);
        public static readonly Color GitStatus = Color.FromArgb(8, 145, 178);
    }

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

    public static Image Open(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        g.FillPolygon(brush, new PointF[] { new(2, 4), new(6, 4), new(7.5f, 6), new(14, 6), new(14, 6.5f), new(2, 6.5f) });
        g.DrawRectangle(pen, 2, 6, 12, 7);
    }, color, size: size);

    public static Image Clone(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        g.DrawLine(pen, 8, 2, 8, 9);
        g.FillPolygon(brush, new PointF[] { new(4.5f, 7), new(11.5f, 7), new(8, 11) });
        g.DrawLine(pen, 3, 13, 13, 13);
    }, color, size: size);

    /// <summary>Browse remote repository history without a permanent local clone.</summary>
    public static Image BrowseRemote(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        // Globe — remote repository
        g.DrawEllipse(pen, 1.5f, 3, 9, 9);
        g.DrawArc(pen, 5, 3, 2, 9, -90, 180);
        g.DrawLine(pen, 1.5f, 7.5f, 10.5f, 7.5f);

        // Log lines — history view only
        g.FillEllipse(brush, 11, 4.5f, 1.4f, 1.4f);
        g.DrawLine(pen, 12.8f, 5.2f, 14.5f, 5.2f);
        g.FillEllipse(brush, 11, 7.3f, 1.4f, 1.4f);
        g.DrawLine(pen, 12.8f, 8f, 14.5f, 8f);
        g.FillEllipse(brush, 11, 10.1f, 1.4f, 1.4f);
        g.DrawLine(pen, 12.8f, 10.8f, 13.8f, 10.8f);
    }, color ?? AccentColor, size: size);

    public static Image Settings(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        g.DrawEllipse(pen, 5.5f, 5.5f, 5, 5);
        for (int i = 0; i < 8; i++)
        {
            double angle = i * Math.PI / 4;
            float x1 = 8 + (float)(3.2 * Math.Cos(angle));
            float y1 = 8 + (float)(3.2 * Math.Sin(angle));
            float x2 = 8 + (float)(6.5 * Math.Cos(angle));
            float y2 = 8 + (float)(6.5 * Math.Sin(angle));
            g.DrawLine(pen, x1, y1, x2, y2);
        }
    }, color, size: size);

    public static Image Exit(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        // Door + arrow — kept inside 3..13 so round pen caps are not clipped.
        g.DrawLine(pen, 3.5f, 4, 3.5f, 12);
        g.DrawLine(pen, 3.5f, 4, 7, 4);
        g.DrawLine(pen, 3.5f, 12, 7, 12);
        g.DrawLine(pen, 7.5f, 8, 11.5f, 8);
        g.FillPolygon(brush, new PointF[] { new(10, 6.2f), new(12.5f, 8), new(10, 9.8f) });
    }, color, size: size);

    public static Image Info(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        g.DrawEllipse(pen, 2, 2, 12, 12);
        g.FillEllipse(brush, 7, 5, 2, 2);
        g.DrawLine(pen, 8, 7.5f, 8, 12);
    }, color ?? AccentColor, size: size);

    /// <summary>Root Info menu — help and about section.</summary>
    public static Image InfoMenu(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        g.DrawEllipse(pen, 3.5f, 3.5f, 9, 9);
        g.DrawArc(pen, 6.5f, 5.5f, 4.5f, 4f, 210, 135);
        g.DrawLine(pen, 8, 9.5f, 8, 10.5f);
        g.FillEllipse(brush, 7.3f, 11.2f, 1.4f, 1.4f);
    }, color, size: size);

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
    }, size: size);

    /// <summary>Reload repository tree (branches, tags, releases).</summary>
    public static Image RefreshTree(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        g.DrawEllipse(pen, 2.5f, 3, 3, 3);
        g.DrawEllipse(pen, 2.5f, 10, 3, 3);
        g.DrawLine(pen, 4, 6, 4, 10);
        g.DrawArc(pen, 7, 3.5f, 6.5f, 6.5f, -45, 255);
        g.FillPolygon(brush, new PointF[] { new(12.5f, 3.5f), new(13.5f, 6.5f), new(10.5f, 5) });
    }, color, size: size);

    /// <summary>Reload commit history graph — clock face with a refresh notch.</summary>
    public static Image RefreshGraph(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        g.DrawArc(pen, 2.5f, 2.5f, 11, 11, 35, 280);
        g.DrawLine(pen, 8, 5.5f, 8, 8);
        g.DrawLine(pen, 8, 8, 10.5f, 9.5f);
        g.FillPolygon(brush, new PointF[] { new(12.7f, 2.6f), new(14.6f, 4.9f), new(11.3f, 5.6f) });
    }, color ?? AccentColor, size: size);

    public static Image Branch(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        g.DrawEllipse(pen, 2.5f, 2.5f, 3, 3);
        g.DrawEllipse(pen, 2.5f, 10.5f, 3, 3);
        g.DrawEllipse(pen, 10.5f, 6.5f, 3, 3);
        g.DrawLine(pen, 4, 5.5f, 4, 10.5f);
        g.DrawLine(pen, 4, 8, 10.5f, 8);
    }, color, size: size);

    public static Image Tag(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawPolygon(pen, new PointF[] { new(2, 3), new(9, 3), new(14, 8), new(9, 13), new(2, 13) });
        g.FillEllipse(brush, 4.5f, 6.5f, 3, 3);
    }, size: size);

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
    }, Color.FromArgb(217, 119, 6), size);

    public static Image Checkout(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawLines(pen, new PointF[] { new(3, 8.5f), new(6.5f, 12), new(13, 4) });
    }, Color.FromArgb(5, 150, 105), size);

    public static Image Copy(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        g.DrawRectangle(pen, 2.5f, 4.5f, 8, 9);
        g.DrawRectangle(pen, 5.5f, 2.5f, 8, 9);
        g.FillRectangle(Brushes.White, 5.5f, 2.5f, 8, 9);
        g.DrawRectangle(pen, 5.5f, 2.5f, 8, 9);
    }, color, size: size);

    private static void DrawFileGlyph(Graphics g, Pen pen)
    {
        g.DrawPolygon(pen, new PointF[] { new(4, 2), new(10, 2), new(13, 5), new(13, 14), new(4, 14) });
        g.DrawLines(pen, new PointF[] { new(10, 2), new(10, 5), new(13, 5) });
        g.DrawLine(pen, 6, 8, 11, 8);
        g.DrawLine(pen, 6, 10.5f, 11, 10.5f);
    }

    public static Image File(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) => DrawFileGlyph(g, pen), color, size: size);

    /// <summary>Export-to-PDF document icon.</summary>
    public static Image FilePdf(int size = MenuIconSize) => Create((g, pen, brush) => DrawFileGlyph(g, pen), Color.FromArgb(220, 38, 38), size);

    /// <summary>Export-to-Word document icon.</summary>
    public static Image FileWord(int size = MenuIconSize) => Create((g, pen, brush) => DrawFileGlyph(g, pen), Color.FromArgb(37, 99, 235), size);

    /// <summary>Export-to-Markdown document icon.</summary>
    public static Image FileMarkdown(int size = MenuIconSize) => Create((g, pen, brush) => DrawFileGlyph(g, pen), Color.FromArgb(5, 150, 105), size);

    public static Image WordWrap(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        // Filled line segments + wrap chevron — no stroke frame.
        g.FillRectangle(brush, 3.5f, 4.5f, 7.5f, 1.8f);
        g.FillRectangle(brush, 3.5f, 8.2f, 5.5f, 1.8f);
        g.FillRectangle(brush, 3.5f, 11.9f, 6.5f, 1.8f);
        g.FillPolygon(brush, new PointF[] { new(9.5f, 8.8f), new(12.8f, 11.8f), new(9.5f, 11.8f) });
    }, color, size: size);

    public static Image Message(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        g.DrawRectangle(pen, 2, 3, 12, 9);
        g.DrawLine(pen, 4, 6, 12, 6);
        g.DrawLine(pen, 4, 8.5f, 9, 8.5f);
    }, color, size: size);

    public static Image Folder(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        g.FillPolygon(brush, new PointF[] { new(2, 6), new(8, 3), new(14, 6), new(14, 14), new(2, 14) });
        g.DrawPolygon(pen, new PointF[] { new(2, 6), new(8, 3), new(14, 6), new(14, 14), new(2, 14) });
    }, color, size: size);

    public static Image History(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        g.DrawEllipse(pen, 3.5f, 3.5f, 9, 9);
        g.DrawLine(pen, 8, 8, 8, 5.5f);
        g.DrawLine(pen, 8, 8, 10.5f, 9.5f);
    }, color, size: size);

    public static Image Report(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        g.DrawPolygon(pen, new PointF[] { new(4, 2), new(10, 2), new(12, 4), new(12, 13), new(4, 13), new(4, 2) });
        g.DrawLine(pen, 10, 2, 10, 4);
        g.DrawLine(pen, 10, 4, 12, 4);
        g.DrawLine(pen, 6, 6.5f, 10, 6.5f);
        g.DrawLine(pen, 6, 8.5f, 10, 8.5f);
        g.DrawLine(pen, 6, 10.5f, 8.5f, 10.5f);
    }, color, size: size);

    /// <summary>Root Diff menu — side-by-side removed/added lines.</summary>
    public static Image Diff(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        using var removed = new SolidBrush(Color.FromArgb(220, 38, 38));
        using var added = new SolidBrush(Color.FromArgb(5, 150, 105));
        g.FillRectangle(removed, 2.5f, 6.5f, 4.5f, 1.8f);
        g.FillRectangle(added, 9f, 6.5f, 4.5f, 1.8f);
        g.FillRectangle(added, 10.5f, 5.2f, 1.8f, 4.4f);
    }, size: size);

    public static Image GitIgnore(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        g.DrawLine(pen, 3.5f, 4.5f, 12.5f, 4.5f);
        g.DrawLine(pen, 3.5f, 8.5f, 9.5f, 8.5f);
        g.DrawLine(pen, 3.5f, 11.5f, 10.5f, 11.5f);
        g.DrawLine(pen, 10.5f, 6.5f, 13.5f, 10.5f);
    }, color ?? Color.FromArgb(100, 116, 139), size: size);

    public static Image GitAdd(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawLine(pen, 8, 3.5f, 8, 12.5f);
        g.DrawLine(pen, 3.5f, 8, 12.5f, 8);
    }, Color.FromArgb(5, 150, 105), size);

    public static Image GitCommit(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawRectangle(pen, 2.5f, 3, 11, 9);
        g.DrawLine(pen, 4.5f, 6, 11.5f, 6);
        g.DrawLine(pen, 4.5f, 8.5f, 9, 8.5f);
        g.DrawLine(pen, 8, 12, 10.5f, 14.5f);
        g.DrawLine(pen, 10.5f, 14.5f, 13, 12);
    }, AccentColor, size);

    public static Image GitPush(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawLine(pen, 8, 13, 8, 4);
        g.FillPolygon(brush, new PointF[] { new(5, 6.5f), new(11, 6.5f), new(8, 2.5f) });
        g.DrawLine(pen, 3, 13, 13, 13);
    }, Color.FromArgb(217, 119, 6), size);

    public static Image GitPull(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawLine(pen, 8, 3, 8, 12.5f);
        g.FillPolygon(brush, new PointF[] { new(5, 10f), new(11, 10f), new(8, 13.5f) });
        g.DrawLine(pen, 3, 3, 13, 3);
    }, Color.FromArgb(217, 119, 6), size);

    public static Image GitFetch(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawArc(pen, 3, 4, 10, 10, 130, 220);
        g.FillPolygon(brush, new PointF[] { new(11.5f, 3.5f), new(13.5f, 6.5f), new(10.5f, 7.5f) });
        g.DrawLine(pen, 3, 13, 13, 13);
    }, AccentColor, size);

    public static Image GitReset(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawArc(pen, 3.5f, 4, 9, 9, 40, 250);
        g.FillPolygon(brush, new PointF[] { new(3.5f, 7.5f), new(6.5f, 4.5f), new(6.5f, 9.5f) });
    }, Color.FromArgb(100, 116, 139), size);

    public static Image GitDiscard(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawLine(pen, 4.5f, 4.5f, 11.5f, 11.5f);
        g.DrawLine(pen, 11.5f, 4.5f, 4.5f, 11.5f);
    }, Color.FromArgb(220, 38, 38), size);

    public static Image GitStatus(int size = MenuIconSize, Color? color = null) => Create((g, pen, brush) =>
    {
        g.DrawRectangle(pen, 3, 3, 10, 10);
        g.DrawLine(pen, 5, 6, 11, 6);
        g.DrawLine(pen, 5, 8.5f, 11, 8.5f);
        g.DrawLine(pen, 5, 11, 8.5f, 11);
    }, color, size: size);

    public static Image GitStash(int size = MenuIconSize) => Create((g, pen, brush) =>
    {
        g.DrawRectangle(pen, 3, 5, 10, 8);
        g.DrawLine(pen, 3, 8, 13, 8);
        g.DrawLine(pen, 8, 5, 8, 13);
    }, Color.FromArgb(124, 58, 237), size);
}
