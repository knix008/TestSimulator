using System.Drawing.Drawing2D;

namespace DCMViewer;

internal static class MenuIcons
{
    public const int Size = 16;

    public static Image File => CreateFile();
    public static Image Open => CreateOpen();
    public static Image Exit => CreateExit();
    public static Image Help => CreateHelp();
    public static Image Info => CreateInfo();
    public static Image ZoomFit => CreateZoomFit();
    public static Image ZoomActual => CreateZoomActual();
    public static Image Export => CreateExport();
    public static Image BatchConvert => CreateBatchConvert();
    public static Image NewFolder => CreateNewFolder();
    public static Image Refresh => CreateRefresh();
    public static Image RegisterDefault => CreateRegisterDefault();

    public static void Apply(ToolStripItem item, Image icon)
    {
        item.Image = icon;
        item.ImageTransparentColor = Color.Magenta;
        item.ImageScaling = ToolStripItemImageScaling.SizeToFit;
        item.TextImageRelation = TextImageRelation.ImageBeforeText;
        item.ImageAlign = ContentAlignment.MiddleCenter;
        item.TextAlign = ContentAlignment.MiddleCenter;
    }

    private static Bitmap CreateCanvas(out Graphics graphics)
    {
        var bmp = new Bitmap(Size, Size);
        graphics = Graphics.FromImage(bmp);
        graphics.Clear(Color.Magenta);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        return bmp;
    }

    private static Image CreateFile()
    {
        var bmp = CreateCanvas(out var g);
        using (g)
        {
            var body = new Rectangle(2, 4, 11, 10);
            using (var fill = new SolidBrush(Color.FromArgb(255, 220, 120)))
                g.FillRectangle(fill, body);
            using (var border = new Pen(Color.FromArgb(180, 140, 40), 1f))
                g.DrawRectangle(border, body);
            using (var tab = new SolidBrush(Color.FromArgb(220, 180, 80)))
                g.FillPolygon(tab, new Point[] { new(2, 4), new(7, 4), new(9, 6), new(2, 6) });
        }

        return bmp;
    }

    private static Image CreateOpen()
    {
        var bmp = CreateCanvas(out var g);
        using (g)
        {
            var folder = new Rectangle(1, 5, 10, 9);
            using (var fill = new SolidBrush(Color.FromArgb(255, 210, 90)))
                g.FillRectangle(fill, folder);
            using (var border = new Pen(Color.FromArgb(170, 120, 20), 1f))
                g.DrawRectangle(border, folder);
            using var arrow = new Pen(Color.FromArgb(40, 110, 210), 2f);
            g.DrawLine(arrow, 10, 3, 14, 7);
            g.DrawLine(arrow, 10, 3, 10, 7);
            g.DrawLine(arrow, 10, 7, 14, 7);
        }

        return bmp;
    }

    private static Image CreateExit()
    {
        var bmp = CreateCanvas(out var g);
        using (g)
        {
            using var pen = new Pen(Color.FromArgb(210, 60, 60), 2f);
            g.DrawLine(pen, 4, 4, 12, 12);
            g.DrawLine(pen, 12, 4, 4, 12);
        }

        return bmp;
    }

    private static Image CreateHelp()
    {
        var bmp = CreateCanvas(out var g);
        using (g)
        {
            using (var fill = new SolidBrush(Color.FromArgb(70, 130, 220)))
                g.FillEllipse(fill, 2, 2, 12, 12);
            using var font = new Font("Segoe UI", 9f, FontStyle.Bold);
            using var format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString("?", font, Brushes.White, new RectangleF(0, 0, Size, Size), format);
        }

        return bmp;
    }

    private static Image CreateInfo()
    {
        var bmp = CreateCanvas(out var g);
        using (g)
        {
            using (var fill = new SolidBrush(Color.FromArgb(70, 130, 220)))
                g.FillEllipse(fill, 2, 2, 12, 12);
            using var font = new Font("Segoe UI", 9f, FontStyle.Bold);
            using var format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString("i", font, Brushes.White, new RectangleF(0, -1, Size, Size), format);
        }

        return bmp;
    }

    private static Image CreateZoomFit()
    {
        var bmp = CreateCanvas(out var g);
        using (g)
        {
            using var pen = new Pen(Color.FromArgb(80, 160, 90), 1.5f);
            g.DrawRectangle(pen, 3, 3, 10, 10);
            g.DrawLine(pen, 1, 8, 5, 8);
            g.DrawLine(pen, 3, 6, 3, 10);
            g.DrawLine(pen, 11, 8, 15, 8);
            g.DrawLine(pen, 13, 6, 13, 10);
            g.DrawLine(pen, 8, 1, 8, 5);
            g.DrawLine(pen, 6, 3, 10, 3);
            g.DrawLine(pen, 8, 11, 8, 15);
            g.DrawLine(pen, 6, 13, 10, 13);
        }

        return bmp;
    }

    private static Image CreateZoomActual()
    {
        var bmp = CreateCanvas(out var g);
        using (g)
        {
            using var pen = new Pen(Color.FromArgb(90, 90, 95), 1.5f);
            g.DrawRectangle(pen, 3, 3, 10, 10);
            using var font = new Font("Segoe UI", 6f, FontStyle.Bold);
            using var text = new SolidBrush(Color.FromArgb(60, 60, 65));
            using var format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString("1:1", font, text, new RectangleF(0, 0, Size, Size), format);
        }

        return bmp;
    }

    private static Image CreateExport()
    {
        var bmp = CreateCanvas(out var g);
        using (g)
        {
            var body = new Rectangle(2, 2, 11, 12);
            using (var fill = new SolidBrush(Color.FromArgb(120, 190, 120)))
                g.FillRectangle(fill, body);
            using (var border = new Pen(Color.FromArgb(60, 130, 60), 1f))
                g.DrawRectangle(border, body);
            using (var line = new SolidBrush(Color.FromArgb(220, 220, 225)))
            {
                g.FillRectangle(line, 4, 4, 7, 2);
                g.FillRectangle(line, 4, 7, 7, 2);
            }

            using var arrow = new Pen(Color.FromArgb(40, 90, 180), 1.5f);
            g.DrawLine(arrow, 8, 10, 8, 15);
            g.DrawLine(arrow, 6, 13, 8, 15);
            g.DrawLine(arrow, 10, 13, 8, 15);
        }

        return bmp;
    }

    private static Image CreateBatchConvert()
    {
        var bmp = CreateCanvas(out var g);
        using (g)
        {
            var folder = new Rectangle(1, 5, 10, 9);
            using (var fill = new SolidBrush(Color.FromArgb(255, 210, 90)))
                g.FillRectangle(fill, folder);
            using (var border = new Pen(Color.FromArgb(170, 120, 20), 1f))
                g.DrawRectangle(border, folder);

            using var arrow = new Pen(Color.FromArgb(40, 110, 210), 1.5f);
            g.DrawLine(arrow, 11, 4, 14, 7);
            g.DrawLine(arrow, 11, 4, 11, 7);
            g.DrawLine(arrow, 11, 7, 14, 7);

            using (var doc = new SolidBrush(Color.FromArgb(120, 190, 120)))
                g.FillRectangle(doc, 3, 7, 6, 5);
            using (var docBorder = new Pen(Color.FromArgb(60, 130, 60), 1f))
                g.DrawRectangle(docBorder, 3, 7, 6, 5);
        }

        return bmp;
    }

    private static Image CreateNewFolder()
    {
        var bmp = CreateCanvas(out var g);
        using (g)
        {
            var folder = new Rectangle(1, 5, 11, 9);
            using (var fill = new SolidBrush(Color.FromArgb(255, 210, 90)))
                g.FillRectangle(fill, folder);
            using (var border = new Pen(Color.FromArgb(170, 120, 20), 1f))
                g.DrawRectangle(border, folder);

            using var plus = new Pen(Color.FromArgb(40, 150, 70), 1.8f);
            g.DrawLine(plus, 8, 2, 8, 6);
            g.DrawLine(plus, 6, 4, 10, 4);
        }

        return bmp;
    }

    private static Image CreateRefresh()
    {
        var bmp = CreateCanvas(out var g);
        using (g)
        {
            using var pen = new Pen(Color.FromArgb(70, 130, 220), 1.5f);
            g.DrawArc(pen, 3, 3, 10, 10, 45, 270);
            g.DrawLine(pen, 11, 4, 13, 2);
            g.DrawLine(pen, 11, 4, 9, 2);
        }

        return bmp;
    }

    private static Image CreateRegisterDefault()
    {
        var bmp = CreateCanvas(out var g);
        using (g)
        {
            using (var fill = new SolidBrush(Color.FromArgb(70, 130, 220)))
                g.FillEllipse(fill, 2, 2, 12, 12);
            using var pen = new Pen(Color.White, 1.5f);
            g.DrawLine(pen, 5, 8, 7, 10);
            g.DrawLine(pen, 7, 10, 11, 5);
        }

        return bmp;
    }
}
