namespace SVGEditorWinV10.Ui;



public static class EditorToolIcons

{

    private const int Size = 24;



    public static Bitmap Select { get; } = CreateSelect();

    public static Bitmap Rectangle { get; } = CreateRectangle();

    public static Bitmap RoundedRectangle { get; } = CreateRoundedRectangle();

    public static Bitmap Ellipse { get; } = CreateEllipse();

    public static Bitmap Triangle { get; } = CreateTriangle();

    public static Bitmap Diamond { get; } = CreateDiamond();

    public static Bitmap Hexagon { get; } = CreateHexagon();

    public static Bitmap Parallelogram { get; } = CreateParallelogram();

    public static Bitmap Star { get; } = CreateStar();

    public static Bitmap Line { get; } = CreateLine();

    public static Bitmap Text { get; } = CreateText();

    public static Bitmap Image { get; } = CreateImage();

    public static Bitmap ZoomIn { get; } = CreateZoomIn();

    public static Bitmap ZoomOut { get; } = CreateZoomOut();

    public static Bitmap ZoomReset { get; } = CreateZoomReset();

    public static Bitmap NewDocument { get; } = CreateNewDocument();
    public static Bitmap Open { get; } = CreateOpen();
    public static Bitmap Save { get; } = CreateSave();
    public static Bitmap SaveAs { get; } = CreateSaveAs();
    public static Bitmap ExportImage { get; } = CreateExportImage();
    public static Bitmap CanvasSize { get; } = CreateCanvasSize();
    public static Bitmap Exit { get; } = CreateExit();
    public static Bitmap Delete { get; } = CreateDelete();
    public static Bitmap Apply { get; } = CreateApply();
    public static Bitmap Copy { get; } = CreateCopy();
    public static Bitmap File { get; } = CreateFile();
    public static Bitmap Edit { get; } = CreateEdit();
    public static Bitmap View { get; } = CreateView();
    public static Bitmap Tools { get; } = CreateTools();

    public static Bitmap ToMenuSize(Bitmap source) => new(source, 16, 16);



    private static Bitmap CreateSelect()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);



        using var stroke = new Pen(ModernTheme.TextPrimary, 1.6f);

        g.DrawLine(stroke, 4, 18, 10, 12);

        g.DrawLine(stroke, 10, 12, 14, 16);

        g.DrawLine(stroke, 14, 16, 20, 6);

        g.DrawLine(stroke, 10, 12, 7, 9);

        return bmp;

    }



    private static Bitmap CreateRectangle()

    {

        return CreateFilledShape(g =>

        {

            g.FillRectangle(AccentMutedBrush(), 5, 6, 14, 12);

            g.DrawRectangle(AccentPen(), 5, 6, 14, 12);

        });

    }



    private static Bitmap CreateRoundedRectangle()

    {

        return CreateFilledShape(g =>

        {

            using var path = CreateRoundedRectPath(new RectangleF(5, 6, 14, 12), 3f);

            g.FillPath(AccentMutedBrush(), path);

            g.DrawPath(AccentPen(), path);

        });

    }



    private static Bitmap CreateEllipse()

    {

        return CreateFilledShape(g =>

        {

            g.FillEllipse(AccentMutedBrush(), 5, 6, 14, 12);

            g.DrawEllipse(AccentPen(), 5, 6, 14, 12);

        });

    }



    private static Bitmap CreateTriangle()

    {

        return CreateFilledShape(g =>

        {

            var points = new[] { new PointF(12, 5), new PointF(19, 19), new PointF(5, 19) };

            g.FillPolygon(AccentMutedBrush(), points);

            g.DrawPolygon(AccentPen(), points);

        });

    }



    private static Bitmap CreateDiamond()

    {

        return CreateFilledShape(g =>

        {

            var points = new[] { new PointF(12, 5), new PointF(19, 12), new PointF(12, 19), new PointF(5, 12) };

            g.FillPolygon(AccentMutedBrush(), points);

            g.DrawPolygon(AccentPen(), points);

        });

    }



    private static Bitmap CreateHexagon()

    {

        return CreateFilledShape(g =>

        {

            var points = new[]

            {

                new PointF(8, 6), new PointF(16, 6), new PointF(20, 12),

                new PointF(16, 18), new PointF(8, 18), new PointF(4, 12)

            };

            g.FillPolygon(AccentMutedBrush(), points);

            g.DrawPolygon(AccentPen(), points);

        });

    }



    private static Bitmap CreateParallelogram()

    {

        return CreateFilledShape(g =>

        {

            var points = new[] { new PointF(8, 6), new PointF(19, 6), new PointF(16, 18), new PointF(5, 18) };

            g.FillPolygon(AccentMutedBrush(), points);

            g.DrawPolygon(AccentPen(), points);

        });

    }



    private static Bitmap CreateStar()

    {

        return CreateFilledShape(g =>

        {

            var points = new[]

            {

                new PointF(12, 4), new PointF(14.2f, 10.5f), new PointF(21, 10.5f),

                new PointF(15.6f, 14.5f), new PointF(17.8f, 21), new PointF(12, 17),

                new PointF(6.2f, 21), new PointF(8.4f, 14.5f), new PointF(3, 10.5f), new PointF(9.8f, 10.5f)

            };

            g.FillPolygon(AccentMutedBrush(), points);

            g.DrawPolygon(AccentPen(), points);

        });

    }



    private static Bitmap CreateLine()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);



        using var stroke = new Pen(ModernTheme.Accent, 2f)

        {

            StartCap = System.Drawing.Drawing2D.LineCap.Round,

            EndCap = System.Drawing.Drawing2D.LineCap.Round

        };

        g.DrawLine(stroke, 5, 18, 19, 6);

        return bmp;

    }



    private static Bitmap CreateText()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;

        g.Clear(Color.Transparent);



        using var font = new Font("Segoe UI Semibold", 14f, FontStyle.Bold, GraphicsUnit.Pixel);

        using var brush = new SolidBrush(ModernTheme.Accent);

        g.DrawString("T", font, brush, 6f, 3f);

        return bmp;

    }



    private static Bitmap CreateImage()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);



        using var frame = new Pen(ModernTheme.TextPrimary, 1.6f);

        g.DrawRectangle(frame, 4, 6, 16, 12);



        using var hill = new SolidBrush(Color.FromArgb(90, ModernTheme.Accent));

        var hillPoints = new[]

        {

            new PointF(5, 16),

            new PointF(10, 11),

            new PointF(15, 15),

            new PointF(19, 12),

            new PointF(19, 18),

            new PointF(5, 18)

        };

        g.FillPolygon(hill, hillPoints);



        using var sun = new SolidBrush(ModernTheme.Accent);

        g.FillEllipse(sun, 14, 8, 4, 4);



        return bmp;

    }



    private static Bitmap CreateZoomIn()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);



        using var glass = new Pen(ModernTheme.TextPrimary, 1.6f);

        using var handle = new Pen(ModernTheme.TextPrimary, 1.8f);

        g.DrawEllipse(glass, 4, 4, 12, 12);

        g.DrawLine(handle, 14, 14, 20, 20);

        using var plus = new Pen(ModernTheme.Accent, 1.8f);

        g.DrawLine(plus, 10, 7, 10, 13);

        g.DrawLine(plus, 7, 10, 13, 10);

        return bmp;

    }



    private static Bitmap CreateZoomOut()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);



        using var glass = new Pen(ModernTheme.TextPrimary, 1.6f);

        using var handle = new Pen(ModernTheme.TextPrimary, 1.8f);

        g.DrawEllipse(glass, 4, 4, 12, 12);

        g.DrawLine(handle, 14, 14, 20, 20);

        using var minus = new Pen(ModernTheme.Accent, 1.8f);

        g.DrawLine(minus, 7, 10, 13, 10);

        return bmp;

    }



    private static Bitmap CreateZoomReset()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);



        using var stroke = new Pen(ModernTheme.TextPrimary, 1.6f);

        g.DrawRectangle(stroke, 5, 7, 14, 10);

        using var accent = new Pen(ModernTheme.Accent, 1.6f);

        g.DrawLine(accent, 8, 19, 16, 19);

        g.DrawLine(accent, 12, 17, 12, 19);

        return bmp;

    }



    private static Bitmap CreateNewDocument()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);

        using var page = new Pen(ModernTheme.TextPrimary, 1.6f);

        g.DrawRectangle(page, 6, 5, 12, 14);

        using var accent = new Pen(ModernTheme.Accent, 1.8f);

        g.DrawLine(accent, 12, 10, 12, 15);

        g.DrawLine(accent, 9.5f, 12.5f, 14.5f, 12.5f);

        return bmp;

    }



    private static Bitmap CreateOpen()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);

        using var folder = new Pen(ModernTheme.TextPrimary, 1.6f);

        g.DrawLine(folder, 5, 10, 5, 18);

        g.DrawLine(folder, 5, 18, 19, 18);

        g.DrawLine(folder, 19, 18, 19, 12);

        g.DrawLine(folder, 19, 12, 11, 12);

        g.DrawLine(folder, 11, 12, 9, 10);

        g.DrawLine(folder, 9, 10, 5, 10);

        using var accent = AccentPen();

        g.DrawLine(accent, 10, 15, 14, 15);

        g.DrawLine(accent, 12, 13, 12, 17);

        return bmp;

    }



    private static Bitmap CreateSave()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);

        using var body = new Pen(ModernTheme.TextPrimary, 1.6f);

        g.DrawRectangle(body, 6, 5, 12, 14);

        g.DrawRectangle(body, 8, 5, 8, 4);

        g.FillRectangle(AccentMutedBrush(), 8, 11, 8, 6);

        g.DrawRectangle(body, 8, 11, 8, 6);

        return bmp;

    }



    private static Bitmap CreateSaveAs()

    {

        var bmp = CreateSave();

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        using var accent = AccentPen();

        g.DrawLine(accent, 15, 16, 20, 11);

        g.DrawLine(accent, 17, 11, 20, 11);

        g.DrawLine(accent, 20, 11, 20, 14);

        return bmp;

    }



    private static Bitmap CreateCanvasSize()
    {
        var bmp = new Bitmap(Size, Size);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);

        using var frame = new Pen(ModernTheme.TextPrimary, 1.6f);
        g.DrawRectangle(frame, 5, 7, 14, 12);

        using var accent = AccentPen();
        g.DrawLine(accent, 3, 13, 5, 13);
        g.DrawLine(accent, 19, 13, 21, 13);
        g.DrawLine(accent, 12, 4, 12, 7);
        g.DrawLine(accent, 12, 19, 12, 22);
        g.DrawLine(accent, 1, 13, 3, 11);
        g.DrawLine(accent, 1, 13, 3, 15);
        g.DrawLine(accent, 21, 13, 23, 11);
        g.DrawLine(accent, 21, 13, 23, 15);
        g.DrawLine(accent, 12, 4, 10, 6);
        g.DrawLine(accent, 12, 4, 14, 6);
        g.DrawLine(accent, 12, 22, 10, 20);
        g.DrawLine(accent, 12, 22, 14, 20);

        return bmp;
    }

    private static Bitmap CreateExportImage()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);

        using var page = new Pen(ModernTheme.TextPrimary, 1.6f);

        g.DrawRectangle(page, 5, 7, 11, 13);

        using var accent = AccentPen();

        g.DrawLine(accent, 16, 12, 21, 7);

        g.DrawLine(accent, 21, 7, 21, 12);

        g.DrawLine(accent, 16, 12, 21, 7);

        g.DrawLine(accent, 13, 18, 19, 18);

        g.DrawLine(accent, 15, 16, 17, 16);

        return bmp;

    }



    private static Bitmap CreateExit()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);

        using var frame = new Pen(ModernTheme.TextPrimary, 1.6f);

        g.DrawRectangle(frame, 5, 6, 14, 12);

        using var accent = AccentPen();

        g.DrawLine(accent, 11, 10, 17, 16);

        g.DrawLine(accent, 17, 10, 11, 16);

        return bmp;

    }



    private static Bitmap CreateDelete()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);

        using var stroke = new Pen(ModernTheme.TextPrimary, 1.6f);

        g.DrawLine(stroke, 8, 7, 16, 7);

        g.DrawLine(stroke, 10, 7, 10.5f, 19);

        g.DrawLine(stroke, 13.5f, 7, 14, 19);

        g.DrawLine(stroke, 9, 19, 15, 19);

        g.DrawRectangle(stroke, 9, 9, 6, 2);

        using var accent = AccentPen();

        g.DrawLine(accent, 11, 11, 11, 17);

        g.DrawLine(accent, 13, 11, 13, 17);

        return bmp;

    }



    private static Bitmap CreateApply()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);

        using var accent = AccentPen();

        g.DrawLines(accent, [new PointF(6, 12), new PointF(10, 16), new PointF(18, 8)]);

        return bmp;

    }



    private static Bitmap CreateCopy()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);

        using var back = new Pen(ModernTheme.TextSecondary, 1.5f);

        g.DrawRectangle(back, 8, 6, 10, 12);

        using var front = AccentPen();

        g.DrawRectangle(front, 5, 9, 10, 12);

        return bmp;

    }



    private static Bitmap CreateFile() => CreateSave();



    private static Bitmap CreateEdit()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);

        using var accent = AccentPen();

        g.DrawLines(accent, [new PointF(16, 6), new PointF(8, 18), new PointF(6, 18), new PointF(6, 16), new PointF(14, 4), new PointF(18, 4), new PointF(18, 8)]);

        return bmp;

    }



    private static Bitmap CreateView()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);

        using var outline = new Pen(ModernTheme.TextPrimary, 1.6f);

        g.DrawEllipse(outline, 5, 8, 14, 8);

        g.FillEllipse(AccentMutedBrush(), 10, 11, 4, 4);

        g.DrawEllipse(AccentPen(), 10, 11, 4, 4);

        return bmp;

    }



    private static Bitmap CreateTools()

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);

        using var stroke = new Pen(ModernTheme.TextPrimary, 1.6f);

        g.DrawLine(stroke, 8, 6, 16, 18);

        g.DrawEllipse(stroke, 6, 14, 5, 5);

        g.DrawRectangle(stroke, 14, 5, 5, 5);

        using var accent = AccentPen();

        g.DrawLine(accent, 10, 10, 13, 14);

        return bmp;

    }



    private static Bitmap CreateFilledShape(Action<Graphics> draw)

    {

        var bmp = new Bitmap(Size, Size);

        using var g = Graphics.FromImage(bmp);

        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        g.Clear(Color.Transparent);

        draw(g);

        return bmp;

    }



    private static SolidBrush AccentMutedBrush() => new(ModernTheme.AccentMuted);



    private static Pen AccentPen() => new(ModernTheme.Accent, 1.6f);



    private static System.Drawing.Drawing2D.GraphicsPath CreateRoundedRectPath(RectangleF rect, float radius)

    {

        var path = new System.Drawing.Drawing2D.GraphicsPath();

        var diameter = radius * 2f;

        var arc = new RectangleF(rect.Location, new SizeF(diameter, diameter));

        path.AddArc(arc, 180, 90);

        arc.X = rect.Right - diameter;

        path.AddArc(arc, 270, 90);

        arc.Y = rect.Bottom - diameter;

        path.AddArc(arc, 0, 90);

        arc.X = rect.X;

        path.AddArc(arc, 90, 90);

        path.CloseFigure();

        return path;

    }

}


