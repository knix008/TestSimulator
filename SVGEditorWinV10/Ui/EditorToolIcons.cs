using System.Drawing.Drawing2D;

namespace SVGEditorWinV10.Ui;

public static class EditorToolIcons
{
    private const int Size = 24;
    private const float Stroke = 1.35f;
    private static readonly RectangleF ShapeBounds = new(6f, 6f, 12f, 12f);

    private static readonly Color IconInk = Color.FromArgb(32, 32, 32);
    private static readonly Color IconMuted = Color.FromArgb(120, 120, 120);
    private static readonly Color PaperFill = Color.FromArgb(255, 255, 255);
    private static readonly Color FolderFill = Color.FromArgb(255, 196, 61);
    private static readonly Color FolderTabFill = Color.FromArgb(255, 224, 130);
    private static readonly Color DiskBody = Color.FromArgb(58, 142, 219);
    private static readonly Color DiskShade = Color.FromArgb(36, 108, 181);
    private static readonly Color DiskLabel = Color.FromArgb(196, 224, 255);
    private static readonly Color TrashBody = Color.FromArgb(108, 108, 108);
    private static readonly Color TrashLid = Color.FromArgb(140, 140, 140);
    private static readonly Color CheckGreen = Color.FromArgb(16, 124, 65);
    private static readonly Color SkyFill = Color.FromArgb(186, 220, 255);
    private static readonly Color HillFill = Color.FromArgb(88, 166, 92);

    public static Bitmap Select { get; } = CreateSelect();
    public static Bitmap Rectangle { get; } = CreateRectangle();
    public static Bitmap Square { get; } = CreateSquare();
    public static Bitmap RoundedRectangle { get; } = CreateRoundedRectangle();
    public static Bitmap Circle { get; } = CreateCircle();
    public static Bitmap Ellipse { get; } = CreateEllipse();
    public static Bitmap Triangle { get; } = CreateTriangle();
    public static Bitmap Diamond { get; } = CreateDiamond();
    public static Bitmap Hexagon { get; } = CreateHexagon();
    public static Bitmap Parallelogram { get; } = CreateParallelogram();
    public static Bitmap Star { get; } = CreateStar();
    public static Bitmap Line { get; } = CreateLine();
    public static Bitmap Polygon { get; } = CreatePolygon();
    public static Bitmap Polyline { get; } = CreatePolyline();
    public static Bitmap Curve { get; } = CreateCurve();
    public static Bitmap Path { get; } = CreateAdjustablePath();
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
    public static Bitmap Undo { get; } = CreateUndo();
    public static Bitmap Redo { get; } = CreateRedo();
    public static Bitmap File { get; } = CreateFile();
    public static Bitmap Edit { get; } = CreateEdit();
    public static Bitmap View { get; } = CreateView();
    public static Bitmap Tools { get; } = CreateTools();

    public const int MenuIconSize = 16;

    public static Bitmap ToMenuSize(Bitmap source)
    {
        var bmp = new Bitmap(MenuIconSize, MenuIconSize);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.DrawImage(source, new Rectangle(0, 0, MenuIconSize, MenuIconSize));
        return bmp;
    }

    private static Bitmap CreateIcon(Action<Graphics> draw)
    {
        var bmp = new Bitmap(Size, Size);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.Clear(Color.Transparent);
        draw(g);
        return bmp;
    }

    private static Pen InkPen(float width = Stroke) => new(IconInk, width)
    {
        LineJoin = LineJoin.Round,
        StartCap = LineCap.Round,
        EndCap = LineCap.Round
    };

    private static Pen AccentPen(float width = Stroke) => new(ModernTheme.Accent, width)
    {
        LineJoin = LineJoin.Round,
        StartCap = LineCap.Round,
        EndCap = LineCap.Round
    };

    private static Pen MutedPen() => new(IconMuted, Stroke)
    {
        LineJoin = LineJoin.Round,
        StartCap = LineCap.Round,
        EndCap = LineCap.Round
    };

    private static GraphicsPath CreateRoundedRectPath(RectangleF rect, float radius)
    {
        var path = new GraphicsPath();
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

    private static void DrawDocument(Graphics g, RectangleF rect, bool foldedCorner = false)
    {
        using var fill = new SolidBrush(PaperFill);
        g.FillRectangle(fill, rect);
        using var pen = InkPen();
        g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);

        if (!foldedCorner)
            return;

        var fold = new[]
        {
            new PointF(rect.Right - 4f, rect.Y),
            new PointF(rect.Right, rect.Y + 4f),
            new PointF(rect.Right - 4f, rect.Y + 4f)
        };
        using var foldBrush = new SolidBrush(Color.FromArgb(232, 232, 232));
        g.FillPolygon(foldBrush, fold);
        g.DrawPolygon(pen, fold);
    }

    private static void DrawFloppy(Graphics g, RectangleF body)
    {
        using var bodyBrush = new SolidBrush(DiskBody);
        g.FillRectangle(bodyBrush, body);
        using var shadeBrush = new SolidBrush(DiskShade);
        g.FillRectangle(shadeBrush, body.X, body.Y, body.Width, 3.5f);

        var label = new RectangleF(body.X + 2f, body.Y + 4.5f, body.Width - 4f, 5f);
        using var labelBrush = new SolidBrush(DiskLabel);
        g.FillRectangle(labelBrush, label);

        var slot = new RectangleF(body.X + 4f, body.Bottom - 6f, body.Width - 8f, 4f);
        using var slotBrush = new SolidBrush(DiskShade);
        g.FillRectangle(slotBrush, slot);

        using var pen = InkPen(1.1f);
        g.DrawRectangle(pen, body.X, body.Y, body.Width, body.Height);
        g.DrawRectangle(pen, label.X, label.Y, label.Width, label.Height);
        g.DrawRectangle(pen, slot.X, slot.Y, slot.Width, slot.Height);
    }

    private static void DrawMagnifier(Graphics g, RectangleF lens, PointF handleEnd)
    {
        using var pen = InkPen();
        g.DrawEllipse(pen, lens);
        g.DrawLine(pen, lens.Right - 1.5f, lens.Bottom - 1.5f, handleEnd.X, handleEnd.Y);
    }

    private static void DrawShapeOutline(Graphics g, PointF[] points)
    {
        using var fill = new SolidBrush(Color.FromArgb(232, 241, 255));
        g.FillPolygon(fill, points);
        using var pen = InkPen();
        g.DrawPolygon(pen, points);
    }

    private static Bitmap CreateSelect() => CreateIcon(g =>
    {
        var pointer = new[]
        {
            new PointF(4.5f, 3f),
            new PointF(4.5f, 17.5f),
            new PointF(9f, 13f),
            new PointF(11.5f, 19.5f),
            new PointF(13.5f, 18.5f),
            new PointF(10.5f, 12f),
            new PointF(17.5f, 12f)
        };
        using var fill = new SolidBrush(PaperFill);
        g.FillPolygon(fill, pointer);
        using var pen = InkPen();
        g.DrawPolygon(pen, pointer);
    });

    private static Bitmap CreateRectangle() => CreateIcon(g =>
    {
        var rect = new RectangleF(4f, 9f, 16f, 8f);
        using var fill = new SolidBrush(Color.FromArgb(232, 241, 255));
        g.FillRectangle(fill, rect);
        using var pen = InkPen();
        g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
    });

    private static Bitmap CreateSquare() => CreateIcon(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(232, 241, 255));
        g.FillRectangle(fill, ShapeBounds);
        using var pen = InkPen();
        g.DrawRectangle(pen, ShapeBounds.X, ShapeBounds.Y, ShapeBounds.Width, ShapeBounds.Height);
    });

    private static Bitmap CreateRoundedRectangle() => CreateIcon(g =>
    {
        using var path = CreateRoundedRectPath(ShapeBounds, 2.5f);
        using var fill = new SolidBrush(Color.FromArgb(232, 241, 255));
        g.FillPath(fill, path);
        using var pen = InkPen();
        g.DrawPath(pen, path);
    });

    private static Bitmap CreateEllipse() => CreateIcon(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(232, 241, 255));
        g.FillEllipse(fill, ShapeBounds);
        using var pen = InkPen();
        g.DrawEllipse(pen, ShapeBounds);
    });

    private static Bitmap CreateTriangle() => CreateIcon(g =>
    {
        var points = new[]
        {
            new PointF(12f, 6f),
            new PointF(18f, 18f),
            new PointF(6f, 18f)
        };
        DrawShapeOutline(g, points);
    });

    private static Bitmap CreateDiamond() => CreateIcon(g =>
    {
        var points = new[]
        {
            new PointF(12f, 6f),
            new PointF(18f, 12f),
            new PointF(12f, 18f),
            new PointF(6f, 12f)
        };
        DrawShapeOutline(g, points);
    });

    private static Bitmap CreateHexagon() => CreateIcon(g =>
    {
        var points = new[]
        {
            new PointF(9f, 6f),
            new PointF(15f, 6f),
            new PointF(18f, 12f),
            new PointF(15f, 18f),
            new PointF(9f, 18f),
            new PointF(6f, 12f)
        };
        DrawShapeOutline(g, points);
    });

    private static Bitmap CreateParallelogram() => CreateIcon(g =>
    {
        var points = new[]
        {
            new PointF(8f, 6f),
            new PointF(18f, 6f),
            new PointF(16f, 18f),
            new PointF(6f, 18f)
        };
        DrawShapeOutline(g, points);
    });

    private static Bitmap CreateStar() => CreateIcon(g =>
    {
        var points = new[]
        {
            new PointF(12f, 5f),
            new PointF(14f, 10.5f),
            new PointF(19.5f, 10.5f),
            new PointF(15f, 14f),
            new PointF(16.5f, 19f),
            new PointF(12f, 16f),
            new PointF(7.5f, 19f),
            new PointF(9f, 14f),
            new PointF(4.5f, 10.5f),
            new PointF(10f, 10.5f)
        };
        DrawShapeOutline(g, points);
    });

    private static Bitmap CreateLine() => CreateIcon(g =>
    {
        using var pen = InkPen(1.75f);
        g.DrawLine(pen, 6f, 18f, 18f, 6f);
        using var cap = new SolidBrush(ModernTheme.Accent);
        g.FillEllipse(cap, 4.5f, 16.5f, 3f, 3f);
        g.FillEllipse(cap, 16.5f, 4.5f, 3f, 3f);
    });

    private static Bitmap CreateCircle() => CreateIcon(g =>
    {
        using var pen = InkPen(1.5f);
        g.DrawEllipse(pen, ShapeBounds);
    });

    private static Bitmap CreatePolyline() => CreateIcon(g =>
    {
        var points = new[]
        {
            new PointF(4f, 18f),
            new PointF(9f, 8f),
            new PointF(15f, 14f),
            new PointF(20f, 6f)
        };
        using var pen = InkPen(1.5f);
        g.DrawLines(pen, points);
        using var accent = new SolidBrush(ModernTheme.Accent);
        g.FillEllipse(accent, 3f, 16.5f, 3f, 3f);
        g.FillEllipse(accent, 19f, 4.5f, 3f, 3f);
    });

    private static Bitmap CreatePolygon() => CreateIcon(g =>
    {
        var points = new[]
        {
            new PointF(5f, 18f),
            new PointF(10f, 6f),
            new PointF(18f, 8f),
            new PointF(20f, 16f)
        };
        using var pen = InkPen(1.5f);
        g.DrawLines(pen, points);
        using var accent = new SolidBrush(ModernTheme.Accent);
        g.FillEllipse(accent, 4f, 16.5f, 3f, 3f);
        g.FillEllipse(accent, 9f, 4.5f, 3f, 3f);
    });

    private static Bitmap CreateCurve() => CreateIcon(g =>
    {
        using var curvePen = InkPen(1.5f);
        g.DrawBezier(curvePen, 4f, 17f, 8f, 4f, 16f, 20f, 20f, 8f);
        using var pen = InkPen(1.35f);
        g.DrawLine(pen, 14f, 14f, 20f, 20f);
        using var nib = new SolidBrush(IconInk);
        g.FillPolygon(nib, new[] { new PointF(20f, 20f), new PointF(17f, 17f), new PointF(19f, 15f) });
    });

    private static Bitmap CreateAdjustablePath() => CreateIcon(g =>
    {
        using var linePen = InkPen(1.5f);
        g.DrawLine(linePen, 4f, 18f, 12f, 8f);
        g.DrawLine(linePen, 12f, 8f, 20f, 16f);
        using var guidePen = new Pen(Color.FromArgb(180, 234, 88, 12), 1f)
        {
            DashStyle = DashStyle.Dot
        };
        g.DrawLine(guidePen, 4f, 18f, 8f, 13f);
        g.DrawLine(guidePen, 8f, 13f, 12f, 8f);
        using var accent = new SolidBrush(Color.FromArgb(234, 88, 12));
        g.FillEllipse(accent, 6.5f, 11.5f, 4f, 4f);
        using var anchor = new SolidBrush(ModernTheme.Accent);
        g.FillEllipse(anchor, 2.5f, 16.5f, 3f, 3f);
        g.FillEllipse(anchor, 10.5f, 6.5f, 3f, 3f);
        g.FillEllipse(anchor, 18.5f, 14.5f, 3f, 3f);
    });

    private static Bitmap CreateText() => CreateIcon(g =>
    {
        using var font = new Font("Times New Roman", 13f, FontStyle.Bold, GraphicsUnit.Pixel);
        using var brush = new SolidBrush(IconInk);
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        g.DrawString("A", font, brush, 6.5f, 3.5f);
        using var pen = AccentPen();
        g.DrawLine(pen, 17f, 6f, 17f, 18f);
    });

    private static Bitmap CreateImage() => CreateIcon(g =>
    {
        var frame = new RectangleF(5f, 6f, 14f, 12f);
        using var frameFill = new SolidBrush(PaperFill);
        g.FillRectangle(frameFill, frame);
        using var pen = InkPen();
        g.DrawRectangle(pen, frame.X, frame.Y, frame.Width, frame.Height);

        using var sky = new SolidBrush(SkyFill);
        g.FillRectangle(sky, frame.X + 1f, frame.Y + 1f, frame.Width - 2f, 5.5f);
        using var hill = new SolidBrush(HillFill);
        var hillPath = new GraphicsPath();
        hillPath.AddLines([
            new PointF(frame.X + 1f, frame.Bottom - 1f),
            new PointF(frame.X + 6f, frame.Y + 9f),
            new PointF(frame.X + 10f, frame.Y + 11f),
            new PointF(frame.Right - 1f, frame.Y + 8f),
            new PointF(frame.Right - 1f, frame.Bottom - 1f)
        ]);
        hillPath.CloseFigure();
        g.FillPath(hill, hillPath);
        using var sun = new SolidBrush(Color.FromArgb(255, 204, 64));
        g.FillEllipse(sun, frame.Right - 6f, frame.Y + 2.5f, 3f, 3f);
    });

    private static Bitmap CreateZoomIn() => CreateIcon(g =>
    {
        DrawMagnifier(g, new RectangleF(4.5f, 4.5f, 10.5f, 10.5f), new PointF(19f, 19f));
        using var accent = AccentPen();
        g.DrawLine(accent, 9.75f, 7.5f, 9.75f, 12f);
        g.DrawLine(accent, 7.5f, 9.75f, 12f, 9.75f);
    });

    private static Bitmap CreateZoomOut() => CreateIcon(g =>
    {
        DrawMagnifier(g, new RectangleF(4.5f, 4.5f, 10.5f, 10.5f), new PointF(19f, 19f));
        using var accent = AccentPen();
        g.DrawLine(accent, 7.5f, 9.75f, 12f, 9.75f);
    });

    private static Bitmap CreateZoomReset() => CreateIcon(g =>
    {
        using var pen = InkPen();
        g.DrawRectangle(pen, 6f, 6f, 12f, 9f);
        using var accent = AccentPen(1.75f);
        g.DrawLine(accent, 9f, 18f, 15f, 18f);
        g.DrawLine(accent, 12f, 16f, 12f, 18f);
    });

    private static Bitmap CreateNewDocument() => CreateIcon(g =>
    {
        DrawDocument(g, new RectangleF(7f, 4f, 10f, 15f), foldedCorner: true);
        using var accent = AccentPen(1.75f);
        g.DrawLine(accent, 10.5f, 10.5f, 13.5f, 10.5f);
        g.DrawLine(accent, 12f, 9f, 12f, 12f);
    });

    private static Bitmap CreateOpen() => CreateIcon(g =>
    {
        var tab = new RectangleF(6f, 7f, 8f, 3f);
        using (var tabBrush = new SolidBrush(FolderTabFill))
            g.FillRectangle(tabBrush, tab);

        var folder = new GraphicsPath();
        folder.AddLines([
            new PointF(5f, 9f),
            new PointF(19f, 9f),
            new PointF(19f, 18f),
            new PointF(5f, 18f),
            new PointF(5f, 9f)
        ]);
        using (var folderBrush = new SolidBrush(FolderFill))
            g.FillPath(folderBrush, folder);

        var page = new RectangleF(9f, 11f, 6f, 7f);
        DrawDocument(g, page);

        using var pen = InkPen(1.1f);
        g.DrawRectangle(pen, tab.X, tab.Y, tab.Width, tab.Height);
        g.DrawPath(pen, folder);
    });

    private static Bitmap CreateSave() => CreateIcon(g =>
    {
        DrawFloppy(g, new RectangleF(7f, 5f, 10f, 14f));
    });

    private static Bitmap CreateSaveAs() => CreateIcon(g =>
    {
        DrawFloppy(g, new RectangleF(5f, 5f, 10f, 14f));
        DrawDocument(g, new RectangleF(11f, 8f, 8f, 11f), foldedCorner: true);
        using var accent = AccentPen();
        g.DrawLine(accent, 13.5f, 12.5f, 16.5f, 12.5f);
        g.DrawLine(accent, 15f, 11f, 15f, 14f);
    });

    private static Bitmap CreateCanvasSize() => CreateIcon(g =>
    {
        DrawDocument(g, new RectangleF(7f, 7f, 10f, 11f));
        using var accent = AccentPen();
        g.DrawLine(accent, 4f, 12.5f, 7f, 12.5f);
        g.DrawLine(accent, 17f, 12.5f, 20f, 12.5f);
        g.DrawLine(accent, 12f, 4f, 12f, 7f);
        g.DrawLine(accent, 12f, 18f, 12f, 21f);
        g.DrawLine(accent, 4f, 12.5f, 5.5f, 11f);
        g.DrawLine(accent, 4f, 12.5f, 5.5f, 14f);
        g.DrawLine(accent, 20f, 12.5f, 18.5f, 11f);
        g.DrawLine(accent, 20f, 12.5f, 18.5f, 14f);
        g.DrawLine(accent, 12f, 4f, 10.5f, 5.5f);
        g.DrawLine(accent, 12f, 4f, 13.5f, 5.5f);
        g.DrawLine(accent, 12f, 21f, 10.5f, 19.5f);
        g.DrawLine(accent, 12f, 21f, 13.5f, 19.5f);
    });

    private static Bitmap CreateExportImage() => CreateIcon(g =>
    {
        var frame = new RectangleF(4f, 7f, 10f, 11f);
        using var frameFill = new SolidBrush(PaperFill);
        g.FillRectangle(frameFill, frame);
        using var sky = new SolidBrush(SkyFill);
        g.FillRectangle(sky, frame.X + 1f, frame.Y + 1f, frame.Width - 2f, 4f);
        using var hill = new SolidBrush(HillFill);
        g.FillRectangle(hill, frame.X + 1f, frame.Y + 5f, frame.Width - 2f, frame.Height - 6f);
        using var pen = InkPen();
        g.DrawRectangle(pen, frame.X, frame.Y, frame.Width, frame.Height);

        using var accent = AccentPen(1.75f);
        g.DrawLine(accent, 15f, 12f, 20f, 12f);
        g.DrawLine(accent, 18f, 10f, 20f, 12f);
        g.DrawLine(accent, 18f, 14f, 20f, 12f);
    });

    private static Bitmap CreateExit() => CreateIcon(g =>
    {
        var window = new RectangleF(5f, 6f, 11f, 12f);
        using var fill = new SolidBrush(PaperFill);
        g.FillRectangle(fill, window);
        using var pen = InkPen();
        g.DrawRectangle(pen, window.X, window.Y, window.Width, window.Height);
        g.DrawLine(pen, window.X, window.Y + 4f, window.Right, window.Y + 4f);

        using var accent = new Pen(Color.FromArgb(196, 43, 43), 1.75f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round
        };
        g.DrawLine(accent, window.Right - 1f, window.Y + 1.5f, window.Right + 5f, window.Y + 7.5f);
        g.DrawLine(accent, window.Right + 5f, window.Y + 1.5f, window.Right - 1f, window.Y + 7.5f);
        g.DrawLine(accent, window.Right + 1f, window.Y + 4.5f, window.Right + 6f, window.Y + 4.5f);
    });

    private static Bitmap CreateDelete() => CreateIcon(g =>
    {
        var lid = new RectangleF(8f, 7f, 8f, 2.5f);
        using var lidBrush = new SolidBrush(TrashLid);
        g.FillRectangle(lidBrush, lid);
        g.DrawLine(InkPen(1.1f), 10f, 7f, 14f, 7f);

        var body = new RectangleF(7.5f, 9f, 9f, 10f);
        using var bodyBrush = new SolidBrush(TrashBody);
        g.FillRectangle(bodyBrush, body);
        using var pen = InkPen(1.1f);
        g.DrawRectangle(pen, body.X, body.Y, body.Width, body.Height);
        g.DrawLine(pen, 9.5f, 11f, 9.5f, 16.5f);
        g.DrawLine(pen, 12f, 11f, 12f, 16.5f);
        g.DrawLine(pen, 14.5f, 11f, 14.5f, 16.5f);
    });

    private static Bitmap CreateApply() => CreateIcon(g =>
    {
        using var circle = new SolidBrush(CheckGreen);
        g.FillEllipse(circle, 5f, 5f, 14f, 14f);
        using var pen = new Pen(Color.White, 2f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round
        };
        g.DrawLines(pen, [new PointF(8f, 12f), new PointF(11f, 15f), new PointF(16.5f, 9f)]);
    });

    private static Bitmap CreateCopy() => CreateIcon(g =>
    {
        var back = new RectangleF(10f, 5f, 9f, 12f);
        using var backFill = new SolidBrush(Color.FromArgb(224, 224, 224));
        g.FillRectangle(backFill, back);
        using var backPen = MutedPen();
        g.DrawRectangle(backPen, back.X, back.Y, back.Width, back.Height);

        var front = new RectangleF(5f, 8f, 9f, 12f);
        DrawDocument(g, front);
    });

    private static Bitmap CreateUndo() => CreateIcon(g =>
    {
        using var pen = InkPen(1.75f);
        g.DrawArc(pen, 6f, 7f, 10f, 10f, 0f, -180f);
        g.DrawLine(pen, 16f, 12f, 16f, 16f);
        using var fill = new SolidBrush(IconInk);
        var arrow = new[] { new PointF(3f, 9f), new PointF(6f, 13f), new PointF(9f, 9f) };
        g.FillPolygon(fill, arrow);
        using var arrowPen = InkPen(1f);
        g.DrawPolygon(arrowPen, arrow);
    });

    private static Bitmap CreateRedo() => CreateIcon(g =>
    {
        using var pen = InkPen(1.75f);
        g.DrawArc(pen, 8f, 7f, 10f, 10f, 180f, 180f);
        g.DrawLine(pen, 8f, 12f, 8f, 16f);
        using var fill = new SolidBrush(IconInk);
        var arrow = new[] { new PointF(15f, 9f), new PointF(18f, 13f), new PointF(21f, 9f) };
        g.FillPolygon(fill, arrow);
        using var arrowPen = InkPen(1f);
        g.DrawPolygon(arrowPen, arrow);
    });

    private static Bitmap CreateFile() => CreateIcon(g =>
    {
        DrawDocument(g, new RectangleF(7f, 4f, 10f, 16f), foldedCorner: true);
        using var pen = AccentPen();
        g.DrawLine(pen, 9.5f, 11f, 14.5f, 11f);
        g.DrawLine(pen, 9.5f, 14f, 14.5f, 14f);
    });

    private static Bitmap CreateEdit() => CreateIcon(g =>
    {
        DrawDocument(g, new RectangleF(5f, 6f, 11f, 13f));
        using var pen = InkPen();
        var pencil = new[]
        {
            new PointF(16f, 5f),
            new PointF(18f, 7f),
            new PointF(9f, 16f),
            new PointF(7f, 16f),
            new PointF(7f, 14f),
            new PointF(16f, 5f)
        };
        using var pencilFill = new SolidBrush(Color.FromArgb(255, 204, 64));
        g.FillPolygon(pencilFill, pencil);
        g.DrawPolygon(pen, pencil);
        using var tip = new SolidBrush(IconInk);
        g.FillEllipse(tip, 15.5f, 4.5f, 2f, 2f);
    });

    private static Bitmap CreateView() => CreateIcon(g =>
    {
        using var pen = InkPen();
        g.DrawEllipse(pen, 4f, 9f, 16f, 7f);
        using var iris = new SolidBrush(IconInk);
        g.FillEllipse(iris, 10f, 11.5f, 4f, 4f);
        using var highlight = new SolidBrush(Color.White);
        g.FillEllipse(highlight, 11f, 12.5f, 1.2f, 1.2f);
    });

    private static Bitmap CreateTools() => CreateIcon(g =>
    {
        using var pen = InkPen(1.5f);
        g.DrawArc(pen, 5f, 5f, 9f, 9f, 130f, 220f);
        g.DrawLine(pen, 12f, 12.5f, 18.5f, 19f);
        using var head = new SolidBrush(IconMuted);
        g.FillEllipse(head, 16.5f, 16.5f, 4.5f, 4.5f);
        using var headPen = InkPen(1.1f);
        g.DrawEllipse(headPen, 16.5f, 16.5f, 4.5f, 4.5f);
    });
}
