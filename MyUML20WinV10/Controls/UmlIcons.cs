using MyUML20WinV10.Models;
using MyUML20WinV10.Rendering;

namespace MyUML20WinV10.Controls;

internal static class UmlIcons
{
    private const int S = 16;

    public static Bitmap ForToolMode(UmlToolMode mode) => Draw(g =>
        UmlToolModeHelper.DrawPreview(g, mode, new RectangleF(1, 1, S - 2, S - 2),
            Color.FromArgb(237, 233, 254), Color.FromArgb(79, 70, 229)));

    public static Bitmap New() => Draw(g =>
    {
        using var pageFill = new SolidBrush(Color.White);
        using var pageBorder = new Pen(Color.FromArgb(100, 130, 200), 1.2f);
        using var foldFill = new SolidBrush(Color.FromArgb(200, 215, 240));
        g.FillPolygon(pageFill, (Point[])[new(2, 1), new(10, 1), new(14, 5), new(14, 15), new(2, 15)]);
        g.DrawPolygon(pageBorder, (Point[])[new(2, 1), new(10, 1), new(14, 5), new(14, 15), new(2, 15)]);
        g.FillPolygon(foldFill, (Point[])[new(10, 1), new(14, 5), new(10, 5)]);
        g.DrawPolygon(pageBorder, (Point[])[new(10, 1), new(14, 5), new(10, 5)]);
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
        g.FillPolygon(bodyFill, (Point[])[new(1, 7), new(15, 7), new(13, 14), new(1, 14)]);
        g.DrawPolygon(bodyBorder, (Point[])[new(1, 7), new(15, 7), new(13, 14), new(1, 14)]);
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

    public static Bitmap SaveAs() => Draw(g =>
    {
        // 플로피 디스크(작게) + 오른쪽 하단 방향 화살표
        using var outerFill = new SolidBrush(Color.FromArgb(79, 70, 229));
        using var innerFill = new SolidBrush(Color.White);
        using var diskPen = new Pen(Color.FromArgb(50, 42, 180), 1f);
        g.FillRectangle(outerFill, 1, 1, 11, 11);
        g.DrawRectangle(diskPen, 1, 1, 11, 11);
        g.FillRectangle(innerFill, 2, 7, 8, 4);
        g.DrawRectangle(diskPen, 2, 7, 8, 4);
        g.FillRectangle(innerFill, 3, 1, 5, 3);
        g.DrawRectangle(diskPen, 3, 1, 5, 3);
        using var slotFill = new SolidBrush(Color.FromArgb(79, 70, 229));
        g.FillRectangle(slotFill, 7, 1, 1, 3);
        // 오른쪽 하단 화살표 (다른 이름으로 저장 표시)
        using var arrowFill = new SolidBrush(Color.FromArgb(220, 60, 60));
        g.FillPolygon(arrowFill, (Point[])[new(15, 15), new(10, 15), new(15, 10)]);
        using var arrowPen = new Pen(Color.FromArgb(180, 30, 30), 1f);
        g.DrawPolygon(arrowPen, (Point[])[new(15, 15), new(10, 15), new(15, 10)]);
    });

    public static Bitmap Delete() => Draw(g =>
    {
        using var lidFill = new SolidBrush(Color.FromArgb(220, 50, 50));
        using var canFill = new SolidBrush(Color.FromArgb(240, 80, 80));
        using var pen = new Pen(Color.FromArgb(180, 30, 30), 1.2f);
        g.FillRectangle(lidFill, 2, 3, 12, 2);
        g.DrawRectangle(pen, 2, 3, 12, 2);
        g.FillPolygon(canFill, (Point[])[new(3, 5), new(13, 5), new(12, 14), new(4, 14)]);
        g.DrawPolygon(pen, (Point[])[new(3, 5), new(13, 5), new(12, 14), new(4, 14)]);
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
        g.FillRectangle(boxFill, 1, 2, 14, 10);
        g.DrawRectangle(boxPen, 1, 2, 14, 10);
        using var arrowFill = new SolidBrush(Color.FromArgb(79, 70, 229));
        g.FillPolygon(arrowFill, (Point[])[new(8, 13), new(5, 16), new(11, 16)]);
        using var arrowPen = new Pen(Color.FromArgb(79, 70, 229), 1.5f);
        g.DrawLine(arrowPen, 8, 8, 8, 13);
    });

    public static Bitmap ExportVector() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(220, 250, 230));
        using var pen = new Pen(Color.FromArgb(20, 160, 80), 1.2f);
        g.FillRectangle(fill, 1, 2, 14, 10);
        g.DrawRectangle(pen, 1, 2, 14, 10);
        using var textBrush = new SolidBrush(Color.FromArgb(20, 140, 60));
        using var font = new Font("Segoe UI", 5f, FontStyle.Bold);
        g.DrawString("SVG", font, textBrush, 2f, 4.5f);
        using var arrowFill = new SolidBrush(Color.FromArgb(20, 160, 80));
        g.FillPolygon(arrowFill, (Point[])[new(8, 13), new(5, 16), new(11, 16)]);
        using var arrowPen = new Pen(Color.FromArgb(20, 160, 80), 1.5f);
        g.DrawLine(arrowPen, 8, 9, 8, 13);
    });

    public static Bitmap ExportPdf() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(255, 225, 220));
        using var pen = new Pen(Color.FromArgb(200, 60, 50), 1.2f);
        g.FillRectangle(fill, 1, 2, 14, 10);
        g.DrawRectangle(pen, 1, 2, 14, 10);
        using var textBrush = new SolidBrush(Color.FromArgb(180, 40, 30));
        using var font = new Font("Segoe UI", 5f, FontStyle.Bold);
        g.DrawString("PDF", font, textBrush, 2f, 4.5f);
        using var arrowFill = new SolidBrush(Color.FromArgb(200, 60, 50));
        g.FillPolygon(arrowFill, (Point[])[new(8, 13), new(5, 16), new(11, 16)]);
        using var arrowPen = new Pen(Color.FromArgb(200, 60, 50), 1.5f);
        g.DrawLine(arrowPen, 8, 9, 8, 13);
    });

    public static Bitmap ExportHtml() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(255, 235, 200));
        using var pen = new Pen(Color.FromArgb(200, 120, 20), 1.2f);
        g.FillRectangle(fill, 1, 2, 14, 10);
        g.DrawRectangle(pen, 1, 2, 14, 10);
        using var textBrush = new SolidBrush(Color.FromArgb(180, 100, 10));
        using var font = new Font("Segoe UI", 4.5f, FontStyle.Bold);
        g.DrawString("HTML", font, textBrush, 1.5f, 4.5f);
        using var arrowFill = new SolidBrush(Color.FromArgb(200, 120, 20));
        g.FillPolygon(arrowFill, (Point[])[new(8, 13), new(5, 16), new(11, 16)]);
        using var arrowPen = new Pen(Color.FromArgb(200, 120, 20), 1.5f);
        g.DrawLine(arrowPen, 8, 9, 8, 13);
    });

    public static Bitmap ExportMarkdown() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(230, 225, 255));
        using var pen = new Pen(Color.FromArgb(90, 70, 200), 1.2f);
        g.FillRectangle(fill, 1, 2, 14, 10);
        g.DrawRectangle(pen, 1, 2, 14, 10);
        using var textBrush = new SolidBrush(Color.FromArgb(70, 50, 180));
        using var font = new Font("Segoe UI", 4.5f, FontStyle.Bold);
        g.DrawString("MD", font, textBrush, 2.5f, 4.5f);
        using var arrowFill = new SolidBrush(Color.FromArgb(90, 70, 200));
        g.FillPolygon(arrowFill, (Point[])[new(8, 13), new(5, 16), new(11, 16)]);
        using var arrowPen = new Pen(Color.FromArgb(90, 70, 200), 1.5f);
        g.DrawLine(arrowPen, 8, 9, 8, 13);
    });

    public static Bitmap Sample() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(255, 245, 200));
        using var pen = new Pen(Color.FromArgb(180, 140, 20), 1.2f);
        var pts = (Point[])[new(8, 1), new(10, 6), new(15, 6), new(11, 9), new(13, 15), new(8, 11), new(3, 15), new(5, 9), new(1, 6), new(6, 6)];
        g.FillPolygon(fill, pts);
        g.DrawPolygon(pen, pts);
    });

    public static Bitmap Exit() => Draw(g =>
    {
        using var doorFill = new SolidBrush(Color.FromArgb(245, 230, 215));
        using var doorPen = new Pen(Color.FromArgb(160, 100, 60), 1.2f);
        g.FillRectangle(doorFill, 2, 2, 8, 13);
        g.DrawRectangle(doorPen, 2, 2, 8, 13);
        using var knobFill = new SolidBrush(Color.FromArgb(200, 150, 80));
        g.FillEllipse(knobFill, 7, 8, 2, 2);
        using var arrowFill = new SolidBrush(Color.FromArgb(200, 50, 50));
        g.FillPolygon(arrowFill, (Point[])[new(15, 8), new(11, 5), new(11, 7), new(8, 7), new(8, 9), new(11, 9), new(11, 11)]);
    });

    public static Bitmap Duplicate() => Draw(g =>
    {
        using var fill1 = new SolidBrush(Color.FromArgb(220, 230, 255));
        using var pen1 = new Pen(Color.FromArgb(79, 70, 229), 1.2f);
        g.FillRectangle(fill1, 1, 4, 9, 9);
        g.DrawRectangle(pen1, 1, 4, 9, 9);
        using var fill2 = new SolidBrush(Color.White);
        using var pen2 = new Pen(Color.FromArgb(79, 70, 229), 1.2f);
        g.FillRectangle(fill2, 6, 2, 9, 9);
        g.DrawRectangle(pen2, 6, 2, 9, 9);
        g.DrawLine(pen2, 6, 5, 14, 5);
    });

    public static Bitmap CopyClipboard() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(235, 248, 235));
        using var pen = new Pen(Color.FromArgb(30, 140, 60), 1.2f);
        g.FillRectangle(fill, 3, 4, 10, 11);
        g.DrawRectangle(pen, 3, 4, 10, 11);
        using var clipFill = new SolidBrush(Color.FromArgb(180, 220, 185));
        g.FillRectangle(clipFill, 5, 2, 6, 4);
        g.DrawRectangle(pen, 5, 2, 6, 4);
        using var linePen = new Pen(Color.FromArgb(30, 140, 60), 1f);
        g.DrawLine(linePen, 5, 8, 11, 8);
        g.DrawLine(linePen, 5, 10, 11, 10);
        g.DrawLine(linePen, 5, 12, 9, 12);
    });

    public static Bitmap Export() => Draw(g =>
    {
        using var boxFill = new SolidBrush(Color.FromArgb(240, 245, 255));
        using var boxPen = new Pen(Color.FromArgb(79, 70, 229), 1.2f);
        g.FillRectangle(boxFill, 1, 5, 14, 9);
        g.DrawRectangle(boxPen, 1, 5, 14, 9);
        using var arrowFill = new SolidBrush(Color.FromArgb(79, 70, 229));
        g.FillPolygon(arrowFill, (Point[])[new(8, 1), new(5, 5), new(11, 5)]);
        using var arrowPen = new Pen(Color.FromArgb(79, 70, 229), 1.5f);
        g.DrawLine(arrowPen, 8, 1, 8, 5);
    });

    public static Icon CreateAppIcon()
    {
        using var bmp = new Bitmap(32, 32, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);

        // Background rounded square
        var accent = Color.FromArgb(79, 70, 229);
        var accentLight = Color.FromArgb(167, 159, 250);
        using var bgBrush = new SolidBrush(accent);
        using var path = new System.Drawing.Drawing2D.GraphicsPath();
        path.AddArc(0, 0, 8, 8, 180, 90);
        path.AddArc(24, 0, 8, 8, 270, 90);
        path.AddArc(24, 24, 8, 8, 0, 90);
        path.AddArc(0, 24, 8, 8, 90, 90);
        path.CloseFigure();
        g.FillPath(bgBrush, path);

        // Class box 1 (top-left)
        using var boxFill = new SolidBrush(Color.White);
        using var boxPen = new Pen(accentLight, 1.2f);
        g.FillRectangle(boxFill, 5, 5, 10, 7);
        g.DrawRectangle(boxPen, 5, 5, 10, 7);
        g.DrawLine(boxPen, 5, 8, 15, 8);

        // Class box 2 (bottom-right)
        g.FillRectangle(boxFill, 17, 18, 10, 7);
        g.DrawRectangle(boxPen, 17, 18, 10, 7);
        g.DrawLine(boxPen, 17, 21, 27, 21);

        // Arrow connecting them
        using var arrowPen = new Pen(accentLight, 1.5f);
        g.DrawLine(arrowPen, 10, 12, 10, 16);
        g.DrawLine(arrowPen, 10, 16, 22, 16);
        g.DrawLine(arrowPen, 22, 16, 22, 18);
        using var arrowFill = new SolidBrush(accentLight);
        g.FillPolygon(arrowFill, (Point[])[new(10, 11), new(8, 15), new(12, 15)]);

        var handle = bmp.GetHicon();
        return Icon.FromHandle(handle);
    }

    public static Bitmap Edit() => Draw(g =>
    {
        using var bodyFill = new SolidBrush(Color.FromArgb(255, 230, 100));
        using var pen = new Pen(Color.FromArgb(140, 100, 20), 1.2f);
        g.FillPolygon(bodyFill, (Point[])[new(3, 11), new(11, 3), new(13, 5), new(5, 13)]);
        g.DrawPolygon(pen, (Point[])[new(3, 11), new(11, 3), new(13, 5), new(5, 13)]);
        using var tipFill = new SolidBrush(Color.FromArgb(200, 180, 140));
        g.FillPolygon(tipFill, (Point[])[new(3, 11), new(5, 13), new(2, 14), new(2, 14)]);
        g.DrawPolygon(pen, (Point[])[new(3, 11), new(5, 13), new(2, 14)]);
        using var eraserFill = new SolidBrush(Color.FromArgb(240, 160, 160));
        g.FillRectangle(eraserFill, 11, 2, 3, 2);
        g.DrawRectangle(pen, 11, 2, 3, 2);
    });

    public static Bitmap AddItem() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(30, 140, 60), 1.5f);
        using var fill = new SolidBrush(Color.FromArgb(220, 248, 230));
        g.FillEllipse(fill, 2, 2, 12, 12);
        g.DrawEllipse(pen, 2, 2, 12, 12);
        using var plusPen = new Pen(Color.FromArgb(30, 140, 60), 2f);
        g.DrawLine(plusPen, 8, 5, 8, 11);
        g.DrawLine(plusPen, 5, 8, 11, 8);
    });

    public static Bitmap ToggleAbstract() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(225, 220, 255));
        using var pen = new Pen(Color.FromArgb(79, 70, 229), 1.2f);
        g.FillRectangle(fill, 1, 1, 14, 14);
        g.DrawRectangle(pen, 1, 1, 14, 14);
        using var font = new Font("Segoe UI", 8f, FontStyle.Italic | FontStyle.Bold);
        using var brush = new SolidBrush(Color.FromArgb(79, 70, 229));
        using var fmt = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        g.DrawString("A", font, brush, new RectangleF(1, 1, 14, 14), fmt);
    });

    public static Bitmap Compartments() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(235, 240, 255));
        using var pen = new Pen(Color.FromArgb(90, 90, 180), 1.2f);
        g.FillRectangle(fill, 1, 1, 14, 14);
        g.DrawRectangle(pen, 1, 1, 14, 14);
        g.DrawLine(pen, 1, 5, 15, 5);
        g.DrawLine(pen, 1, 9, 15, 9);
        using var linePen = new Pen(Color.FromArgb(130, 130, 190), 1f);
        g.DrawLine(linePen, 3, 3, 13, 3);
        g.DrawLine(linePen, 3, 7, 13, 7);
        g.DrawLine(linePen, 3, 11, 10, 11);
    });

    public static Bitmap Multiplicity() => Draw(g =>
    {
        using var brush = new SolidBrush(Color.FromArgb(50, 90, 180));
        using var font = new Font("Segoe UI", 6.5f, FontStyle.Bold);
        g.DrawString("1..*", font, brush, 0f, 2f);
        using var pen = new Pen(Color.FromArgb(50, 90, 180), 1.2f);
        g.DrawLine(pen, 1, 13, 15, 13);
    });

    public static Bitmap NodeClass() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(225, 230, 255));
        using var pen = new Pen(Color.FromArgb(79, 70, 229), 1.2f);
        g.FillRectangle(fill, 1, 1, 14, 14);
        g.DrawRectangle(pen, 1, 1, 14, 14);
        g.DrawLine(pen, 1, 5, 15, 5);
        g.DrawLine(pen, 1, 9, 15, 9);
    });

    public static Bitmap NodeInterface() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(220, 248, 235));
        using var pen = new Pen(Color.FromArgb(20, 150, 80), 1.2f);
        g.FillRectangle(fill, 1, 1, 14, 14);
        g.DrawRectangle(pen, 1, 1, 14, 14);
        g.DrawLine(pen, 1, 5, 15, 5);
        using var brush = new SolidBrush(Color.FromArgb(20, 150, 80));
        using var font = new Font("Segoe UI", 4.5f, FontStyle.Italic);
        using var fmt = new StringFormat { Alignment = StringAlignment.Center };
        g.DrawString("«I»", font, brush, new RectangleF(1, 1, 14, 4), fmt);
    });

    public static Bitmap NodeEnumeration() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(255, 244, 218));
        using var pen = new Pen(Color.FromArgb(170, 110, 20), 1.2f);
        g.FillRectangle(fill, 1, 1, 14, 14);
        g.DrawRectangle(pen, 1, 1, 14, 14);
        g.DrawLine(pen, 1, 5, 15, 5);
        using var brush = new SolidBrush(Color.FromArgb(170, 110, 20));
        using var font = new Font("Segoe UI", 4.5f, FontStyle.Italic);
        using var fmt = new StringFormat { Alignment = StringAlignment.Center };
        g.DrawString("«E»", font, brush, new RectangleF(1, 1, 14, 4), fmt);
    });

    public static Bitmap NodePackage() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(255, 244, 200));
        using var pen = new Pen(Color.FromArgb(140, 100, 20), 1.2f);
        g.FillRectangle(fill, 1, 4, 5, 3);
        g.DrawPolygon(pen, (Point[])[new(1, 4), new(6, 4), new(6, 7), new(1, 7)]);
        g.FillRectangle(fill, 1, 6, 14, 9);
        g.DrawRectangle(pen, 1, 6, 14, 9);
    });

    public static Bitmap NodeActor() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(40, 80, 180), 1.3f);
        var bounds = UmlActorGeometry.GetUniformBounds(new RectangleF(0, 0, 16, 16));
        UmlActorGeometry.DrawStickFigure(g, pen, bounds);
    });

    public static Bitmap NodeUseCase() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(210, 240, 255));
        using var pen = new Pen(Color.FromArgb(20, 100, 180), 1.3f);
        g.FillEllipse(fill, 1, 4, 14, 8);
        g.DrawEllipse(pen, 1, 4, 14, 8);
    });

    public static Bitmap NodeSystemBoundary() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(230, 240, 255));
        using var pen = new Pen(Color.FromArgb(40, 90, 170), 1.3f);
        g.FillRectangle(fill, 1, 2, 14, 12);
        g.DrawRectangle(pen, 1, 2, 14, 12);
        using var font = new Font("Segoe UI", 5f, FontStyle.Bold);
        using var brush = new SolidBrush(pen.Color);
        g.DrawString("Sys", font, brush, 3f, 3f);
    });

    public static Bitmap NodeNote() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(255, 255, 210));
        using var pen = new Pen(Color.FromArgb(140, 130, 30), 1.2f);
        g.FillPolygon(fill, (Point[])[new(1, 1), new(11, 1), new(15, 5), new(15, 15), new(1, 15)]);
        g.DrawPolygon(pen, (Point[])[new(1, 1), new(11, 1), new(15, 5), new(15, 15), new(1, 15)]);
        using var foldFill = new SolidBrush(Color.FromArgb(220, 215, 155));
        g.FillPolygon(foldFill, (Point[])[new(11, 1), new(15, 5), new(11, 5)]);
        g.DrawPolygon(pen, (Point[])[new(11, 1), new(15, 5), new(11, 5)]);
        using var linePen = new Pen(Color.FromArgb(140, 130, 30), 1f);
        g.DrawLine(linePen, 3, 7, 9, 7);
        g.DrawLine(linePen, 3, 9, 9, 9);
        g.DrawLine(linePen, 3, 11, 8, 11);
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
