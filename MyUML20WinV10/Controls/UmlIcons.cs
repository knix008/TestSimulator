namespace MyUML20WinV10.Controls;

internal static class UmlIcons
{
    private const int S = 16;

    public static Bitmap New() => Draw(g =>
    {
        using var pageFill = new SolidBrush(Color.White);
        using var pageBorder = new Pen(Color.FromArgb(100, 130, 200), 1.2f);
        using var foldFill = new SolidBrush(Color.FromArgb(200, 215, 240));
        var pts = new Point[] { new(2, 1), new(10, 1), new(14, 5), new(14, 15), new(2, 15) };
        g.FillPolygon(pageFill, pts);
        g.DrawPolygon(pageBorder, pts);
        g.FillPolygon(foldFill, [new Point(10, 1), new Point(14, 5), new Point(10, 5)]);
        g.DrawPolygon(pageBorder, [new Point(10, 1), new Point(14, 5), new Point(10, 5)]);
        using var linePen = new Pen(Color.FromArgb(79, 70, 229), 1f);
        g.DrawLine(linePen, 4, 7, 12, 7);
        g.DrawLine(linePen, 4, 9, 12, 9);
        g.DrawLine(linePen, 4, 11, 10, 11);
    });

    public static Bitmap Open() => Draw(g =>
    {
        using var bodyFill = new SolidBrush(Color.FromArgb(255, 215, 80));
        using var bodyBorder = new Pen(Color.FromArgb(180, 140, 20), 1.2f);
        using var tabFill = new SolidBrush(Color.FromArgb(240, 195, 60));
        g.FillRectangle(tabFill, 1, 6, 5, 2);
        g.FillPolygon(bodyFill, [new Point(1, 7), new Point(15, 7), new Point(13, 14), new Point(1, 14)]);
        g.DrawPolygon(bodyBorder, [new Point(1, 7), new Point(15, 7), new Point(13, 14), new Point(1, 14)]);
        g.DrawRectangle(bodyBorder, 1, 4, 6, 3);
    });

    public static Bitmap Save() => Draw(g =>
    {
        using var outerFill = new SolidBrush(Color.FromArgb(79, 70, 229));
        using var innerFill = new SolidBrush(Color.White);
        using var diskPen = new Pen(Color.FromArgb(50, 42, 180), 1f);
        g.FillRectangle(outerFill, 1, 1, 14, 14);
        g.DrawRectangle(diskPen, 1, 1, 14, 14);
        g.FillRectangle(innerFill, 3, 9, 10, 5);
        g.DrawRectangle(diskPen, 3, 9, 10, 5);
        g.FillRectangle(innerFill, 4, 2, 7, 4);
        g.DrawRectangle(diskPen, 4, 2, 7, 4);
        using var slotFill = new SolidBrush(Color.FromArgb(79, 70, 229));
        g.FillRectangle(slotFill, 9, 2, 1, 4);
    });

    public static Bitmap Delete() => Draw(g =>
    {
        using var lidFill = new SolidBrush(Color.FromArgb(220, 50, 50));
        using var canFill = new SolidBrush(Color.FromArgb(240, 80, 80));
        using var pen = new Pen(Color.FromArgb(180, 30, 30), 1.2f);
        g.FillRectangle(lidFill, 2, 3, 12, 2);
        g.DrawRectangle(pen, 2, 3, 12, 2);
        g.FillPolygon(canFill, [new Point(3, 5), new Point(13, 5), new Point(12, 14), new Point(4, 14)]);
        g.DrawPolygon(pen, [new Point(3, 5), new Point(13, 5), new Point(12, 14), new Point(4, 14)]);
        g.DrawLine(pen, 6, 1, 10, 1);
        g.DrawLine(pen, 6, 7, 6, 12);
        g.DrawLine(pen, 8, 7, 8, 12);
        g.DrawLine(pen, 10, 7, 10, 12);
    });

    public static Bitmap ZoomIn() => Draw(g =>
    {
        DrawMagnifier(g);
        using var pen = new Pen(Color.FromArgb(50, 110, 50), 1.8f);
        g.DrawLine(pen, 6, 5, 6, 9);
        g.DrawLine(pen, 4, 7, 8, 7);
    });

    public static Bitmap ZoomOut() => Draw(g =>
    {
        DrawMagnifier(g);
        using var pen = new Pen(Color.FromArgb(50, 110, 50), 1.8f);
        g.DrawLine(pen, 4, 7, 8, 7);
    });

    public static Bitmap ZoomReset() => Draw(g =>
    {
        using var circlePen = new Pen(Color.FromArgb(60, 90, 180), 1.5f);
        using var arrowFill = new SolidBrush(Color.FromArgb(60, 90, 180));
        g.DrawEllipse(circlePen, 2, 2, 9, 9);
        g.DrawLine(circlePen, 10, 10, 14, 14);
        using var numFont = new Font("Segoe UI", 5.5f, FontStyle.Bold);
        using var numBrush = new SolidBrush(Color.FromArgb(60, 90, 180));
        g.DrawString("1:1", numFont, numBrush, 2.5f, 4f);
    });

    public static Bitmap ExportImage() => Draw(g =>
    {
        using var boxFill = new SolidBrush(Color.FromArgb(220, 235, 255));
        using var boxPen = new Pen(Color.FromArgb(79, 70, 229), 1.2f);
        g.FillRectangle(boxFill, 1, 3, 14, 9);
        g.DrawRectangle(boxPen, 1, 3, 14, 9);
        using var arrowFill = new SolidBrush(Color.FromArgb(79, 70, 229));
        g.FillPolygon(arrowFill, [new Point(8, 12), new Point(5, 15), new Point(11, 15)]);
        using var arrowPen = new Pen(Color.FromArgb(79, 70, 229), 1.5f);
        g.DrawLine(arrowPen, 8, 7, 8, 12);
    });

    public static Bitmap DiagramTab() => Draw(g =>
    {
        using var boxFill = new SolidBrush(Color.FromArgb(237, 233, 254));
        using var boxPen = new Pen(Color.FromArgb(79, 70, 229), 1.2f);
        g.FillRectangle(boxFill, 1, 5, 14, 10);
        g.DrawRectangle(boxPen, 1, 5, 14, 10);
        using var tabFill = new SolidBrush(Color.FromArgb(79, 70, 229));
        g.FillRectangle(tabFill, 1, 2, 5, 3);
        using var linePen = new Pen(Color.FromArgb(100, 80, 200), 1f);
        g.DrawLine(linePen, 3, 8, 12, 8);
        g.DrawLine(linePen, 3, 10, 12, 10);
        g.DrawLine(linePen, 3, 12, 9, 12);
    });

    private static void DrawMagnifier(Graphics g)
    {
        using var glassFill = new SolidBrush(Color.FromArgb(220, 240, 255));
        using var glassPen = new Pen(Color.FromArgb(40, 100, 180), 1.5f);
        using var handlePen = new Pen(Color.FromArgb(40, 100, 180), 2f);
        g.FillEllipse(glassFill, 1, 1, 10, 10);
        g.DrawEllipse(glassPen, 1, 1, 10, 10);
        g.DrawLine(handlePen, 10, 10, 14, 14);
    }

    private static Bitmap Draw(Action<Graphics> paint)
    {
        var bmp = new Bitmap(S, S, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);
        paint(g);
        return bmp;
    }
}
