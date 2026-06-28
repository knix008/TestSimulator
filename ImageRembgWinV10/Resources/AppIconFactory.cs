using System.Drawing.Drawing2D;

namespace ImageRembgWinV10.Resources;

public static class AppIconFactory
{
    public const int Size = 18;

    private static readonly Color Blue = Color.FromArgb(37, 99, 235);
    private static readonly Color BlueLight = Color.FromArgb(219, 234, 254);
    private static readonly Color Green = Color.FromArgb(22, 163, 74);
    private static readonly Color GreenLight = Color.FromArgb(220, 252, 231);
    private static readonly Color Red = Color.FromArgb(220, 38, 38);
    private static readonly Color RedLight = Color.FromArgb(254, 226, 226);
    private static readonly Color Purple = Color.FromArgb(147, 51, 234);
    private static readonly Color PurpleLight = Color.FromArgb(243, 232, 255);
    private static readonly Color Orange = Color.FromArgb(234, 88, 12);
    private static readonly Color OrangeLight = Color.FromArgb(255, 237, 213);
    private static readonly Color Amber = Color.FromArgb(245, 158, 11);
    private static readonly Color AmberLight = Color.FromArgb(254, 243, 199);
    private static readonly Color Teal = Color.FromArgb(13, 148, 136);
    private static readonly Color TealLight = Color.FromArgb(204, 251, 241);
    private static readonly Color Indigo = Color.FromArgb(79, 70, 229);
    private static readonly Color IndigoLight = Color.FromArgb(224, 231, 255);
    private static readonly Color Pink = Color.FromArgb(219, 39, 119);
    private static readonly Color PinkLight = Color.FromArgb(252, 231, 243);
    private static readonly Color Slate = Color.FromArgb(100, 116, 139);
    private static readonly Color SlateLight = Color.FromArgb(241, 245, 249);

    public static ImageList CreateImageList()
    {
        var list = new ImageList
        {
            ColorDepth = ColorDepth.Depth32Bit,
            ImageSize = new Size(Size, Size)
        };

        list.Images.Add("file", CreateFileMenuIcon());
        list.Images.Add("edit", CreateEditMenuIcon());
        list.Images.Add("view", CreateViewMenuIcon());
        list.Images.Add("tools", CreateToolsMenuIcon());
        list.Images.Add("open", CreateOpenIcon());
        list.Images.Add("save", CreateSaveIcon());
        list.Images.Add("exit", CreateExitIcon());
        list.Images.Add("undo", CreateUndoIcon());
        list.Images.Add("redo", CreateRedoIcon());
        list.Images.Add("preview", CreatePreviewIcon());
        list.Images.Add("remove", CreateRemoveBackgroundIcon());
        list.Images.Add("reset", CreateResetIcon());
        list.Images.Add("zoom-in", CreateZoomInIcon());
        list.Images.Add("zoom-out", CreateZoomOutIcon());
        list.Images.Add("fit", CreateFitIcon());
        list.Images.Add("select-freehand", CreateSelectFreehandIcon());
        list.Images.Add("select-rect", CreateSelectRectIcon());
        list.Images.Add("foreground", CreateForegroundIcon());
        list.Images.Add("background", CreateBackgroundIcon());
        list.Images.Add("pan", CreatePanIcon());
        list.Images.Add("mask", CreateMaskIcon());
        list.Images.Add("result", CreateResultIcon());
        list.Images.Add("algorithm", CreateAlgorithmMenuIcon());
        list.Images.Add("info", CreateInfoIcon());
        list.Images.Add("language", CreateLanguageIcon());
        list.Images.Add("settings", CreateSettingsIcon());

        return list;
    }

    public static Bitmap CreateFileMenuIcon() => Draw(g =>
    {
        FillBadge(g, BlueLight, Blue);
        g.FillRectangle(new SolidBrush(Blue), 4, 6, 10, 8);
        g.FillRectangle(Brushes.White, 5, 7, 8, 5);
        g.FillRectangle(new SolidBrush(Color.FromArgb(96, 165, 250)), 4, 6, 10, 3);
    });

    public static Bitmap CreateEditMenuIcon() => Draw(g =>
    {
        FillBadge(g, OrangeLight, Orange);
        using var pen = CreatePen(Orange, 2f);
        g.DrawLines(pen, [new Point(4, 14), new Point(9, 4), new Point(14, 6), new Point(9, 15), new Point(4, 14)]);
        g.DrawLine(pen, 11, 5, 14, 6);
    });

    public static Bitmap CreateViewMenuIcon() => Draw(g =>
    {
        FillBadge(g, TealLight, Teal);
        using var pen = CreatePen(Teal, 1.8f);
        g.DrawEllipse(pen, 3, 5, 12, 8);
        g.FillEllipse(new SolidBrush(Teal), 7, 8, 4, 3);
    });

    public static Bitmap CreateToolsMenuIcon() => Draw(g =>
    {
        FillBadge(g, IndigoLight, Indigo);
        using var pen = CreatePen(Indigo, 1.8f);
        g.DrawRectangle(pen, 4, 4, 10, 10);
        g.DrawLine(pen, 9, 4, 9, 14);
        g.DrawLine(pen, 4, 9, 14, 9);
        g.FillEllipse(new SolidBrush(Indigo), 7, 7, 4, 4);
    });

    public static Bitmap CreateOpenIcon() => Draw(g =>
    {
        FillBadge(g, BlueLight, Blue);
        g.FillRectangle(new SolidBrush(Blue), 3, 7, 12, 8);
        g.FillRectangle(Brushes.White, 4, 8, 10, 5);
        g.FillRectangle(new SolidBrush(Color.FromArgb(96, 165, 250)), 3, 7, 12, 3);
        g.DrawLine(CreatePen(Blue, 2f), 9, 4, 9, 8);
        g.DrawLine(CreatePen(Blue, 2f), 7, 4, 11, 4);
    });

    public static Bitmap CreateSaveIcon() => Draw(g =>
    {
        FillBadge(g, BlueLight, Blue);
        g.FillRectangle(new SolidBrush(Blue), 4, 3, 10, 13);
        g.FillRectangle(new SolidBrush(Color.FromArgb(96, 165, 250)), 4, 3, 10, 4);
        g.FillRectangle(Brushes.White, 6, 8, 6, 6);
        g.FillRectangle(new SolidBrush(Green), 7, 9, 4, 4);
    });

    public static Bitmap CreateExitIcon() => Draw(g =>
    {
        FillBadge(g, RedLight, Red);
        using var pen = CreatePen(Red, 2f);
        g.DrawRectangle(pen, 4, 4, 10, 10);
        g.DrawLine(pen, 6, 6, 12, 12);
        g.DrawLine(pen, 12, 6, 6, 12);
    });

    public static Bitmap CreateUndoIcon() => Draw(g =>
    {
        FillBadge(g, SlateLight, Slate);
        using var pen = CreatePen(Slate, 2f);
        g.DrawArc(pen, 4, 4, 10, 10, -30, -240);
        g.DrawLines(pen, [new Point(8, 3), new Point(4, 5), new Point(7, 8)]);
    });

    public static Bitmap CreateRedoIcon() => Draw(g =>
    {
        FillBadge(g, SlateLight, Slate);
        using var pen = CreatePen(Slate, 2f);
        g.DrawArc(pen, 4, 4, 10, 10, 210, 240);
        g.DrawLines(pen, [new Point(10, 3), new Point(14, 5), new Point(11, 8)]);
    });

    public static Bitmap CreatePreviewIcon() => Draw(g =>
    {
        FillBadge(g, GreenLight, Green);
        using var pen = CreatePen(Green, 1.8f);
        g.DrawRectangle(pen, 3, 5, 12, 9);
        using var accent = CreatePen(Color.FromArgb(16, 185, 129), 2f);
        g.DrawLines(accent, [new Point(5, 12), new Point(8, 9), new Point(10, 11), new Point(13, 7)]);
        g.FillEllipse(new SolidBrush(Amber), 11, 6, 4, 4);
    });

    public static Bitmap CreateRemoveBackgroundIcon() => Draw(g =>
    {
        FillBadge(g, PurpleLight, Purple);
        g.FillRectangle(new SolidBrush(SlateLight), 3, 4, 12, 11);
        g.FillEllipse(new SolidBrush(Purple), 5, 7, 8, 6);
        g.DrawLine(CreatePen(Red, 2.2f), 5, 13, 14, 4);
    });

    public static Bitmap CreateResetIcon() => Draw(g =>
    {
        FillBadge(g, OrangeLight, Orange);
        using var pen = CreatePen(Orange, 2f);
        g.DrawArc(pen, 4, 4, 10, 10, 45, 270);
        g.DrawLines(pen, [new Point(4, 7), new Point(4, 4), new Point(7, 4)]);
    });

    public static Bitmap CreateZoomInIcon() => Draw(g =>
    {
        FillBadge(g, IndigoLight, Indigo);
        using var pen = CreatePen(Indigo, 1.8f);
        g.DrawEllipse(pen, 3, 3, 10, 10);
        g.DrawLine(pen, 11, 11, 15, 15);
        using var plus = CreatePen(Indigo, 2f);
        g.DrawLine(plus, 8, 6, 8, 11);
        g.DrawLine(plus, 5, 8, 11, 8);
    });

    public static Bitmap CreateZoomOutIcon() => Draw(g =>
    {
        FillBadge(g, IndigoLight, Indigo);
        using var pen = CreatePen(Indigo, 1.8f);
        g.DrawEllipse(pen, 3, 3, 10, 10);
        g.DrawLine(pen, 11, 11, 15, 15);
        g.DrawLine(CreatePen(Indigo, 2f), 5, 8, 11, 8);
    });

    public static Bitmap CreateFitIcon() => Draw(g =>
    {
        FillBadge(g, TealLight, Teal);
        using var pen = CreatePen(Teal, 1.8f);
        g.DrawRectangle(pen, 3, 4, 12, 10);
        g.DrawLine(pen, 6, 9, 3, 9);
        g.DrawLine(pen, 12, 9, 15, 9);
        g.DrawLine(pen, 9, 6, 9, 3);
        g.DrawLine(pen, 9, 12, 9, 15);
    });

    public static Bitmap CreateSelectFreehandIcon() => Draw(g =>
    {
        FillBadge(g, AmberLight, Amber);
        using var pen = CreatePen(Amber, 2f);
        pen.DashStyle = DashStyle.Dash;
        g.DrawLines(pen, [new Point(4, 12), new Point(6, 5), new Point(10, 4), new Point(13, 8), new Point(11, 13), new Point(4, 12)]);
    });

    public static Bitmap CreateSelectRectIcon() => Draw(g =>
    {
        FillBadge(g, AmberLight, Amber);
        using var pen = CreatePen(Orange, 2f);
        pen.DashStyle = DashStyle.Dash;
        g.DrawRectangle(pen, 4, 4, 10, 10);
    });

    public static Bitmap CreateForegroundIcon() => Draw(g =>
    {
        FillBadge(g, GreenLight, Green);
        g.FillEllipse(new SolidBrush(Green), 5, 5, 8, 8);
        g.FillEllipse(Brushes.White, 7, 7, 4, 4);
    });

    public static Bitmap CreateBackgroundIcon() => Draw(g =>
    {
        FillBadge(g, RedLight, Red);
        g.FillEllipse(new SolidBrush(Red), 5, 5, 8, 8);
        g.DrawLine(CreatePen(Brushes.White, 2f), 6, 6, 12, 12);
        g.DrawLine(CreatePen(Brushes.White, 2f), 12, 6, 6, 12);
    });

    public static Bitmap CreatePanIcon() => Draw(g =>
    {
        FillBadge(g, BlueLight, Blue);
        using var brush = new SolidBrush(Blue);
        g.FillEllipse(brush, 4, 3, 8, 8);
        g.FillRectangle(brush, 7, 10, 3, 5);
        g.FillRectangle(brush, 5, 14, 7, 2);
    });

    public static Bitmap CreateMaskIcon() => Draw(g =>
    {
        FillBadge(g, TealLight, Teal);
        using var pen = CreatePen(Teal, 1.8f);
        g.DrawRectangle(pen, 3, 5, 12, 9);
        g.FillRectangle(new SolidBrush(Color.FromArgb(160, 20, 184, 166)), 5, 7, 8, 5);
    });

    public static Bitmap CreateAlgorithmMenuIcon() => Draw(g =>
    {
        FillBadge(g, PurpleLight, Purple);
        using var pen = CreatePen(Purple, 1.8f);
        g.DrawRectangle(pen, 4, 4, 10, 10);
        g.DrawLine(pen, 6, 7, 12, 7);
        g.DrawLine(pen, 6, 11, 12, 11);
        g.FillEllipse(new SolidBrush(Blue), 10, 6, 3, 3);
        g.FillEllipse(new SolidBrush(Green), 7, 10, 3, 3);
    });

    public static Bitmap CreateResultIcon() => Draw(g =>
    {
        FillBadge(g, PinkLight, Pink);
        using var pen = CreatePen(Pink, 1.8f);
        g.DrawRectangle(pen, 3, 4, 12, 10);
        g.FillEllipse(new SolidBrush(Amber), 11, 5, 4, 4);
        g.FillEllipse(new SolidBrush(Green), 5, 8, 4, 4);
    });

    public static Bitmap CreateInfoIcon() => Draw(g =>
    {
        FillBadge(g, BlueLight, Blue);
        g.FillEllipse(new SolidBrush(Blue), 3, 3, 12, 12);
        using var font = new Font("Segoe UI", 10f, FontStyle.Bold);
        g.DrawString("i", font, Brushes.White, 6.5f, 2f);
    });

    public static Bitmap CreateLanguageIcon() => Draw(g =>
    {
        FillBadge(g, IndigoLight, Indigo);
        using var pen = CreatePen(Indigo, 1.8f);
        g.DrawEllipse(pen, 3, 4, 12, 10);
        g.DrawLine(pen, 3, 9, 15, 9);
        g.DrawArc(pen, 6, 4, 6, 10, 270, 180);
    });

    public static Bitmap CreateSettingsIcon() => Draw(g =>
    {
        FillBadge(g, SlateLight, Slate);
        using var pen = CreatePen(Slate, 1.8f);
        g.DrawEllipse(pen, 6, 6, 6, 6);
        for (var angle = 0; angle < 360; angle += 45)
        {
            var radians = angle * Math.PI / 180.0;
            var x1 = 9f + (float)(Math.Cos(radians) * 4);
            var y1 = 9f + (float)(Math.Sin(radians) * 4);
            var x2 = 9f + (float)(Math.Cos(radians) * 7);
            var y2 = 9f + (float)(Math.Sin(radians) * 7);
            g.DrawLine(pen, x1, y1, x2, y2);
        }
    });

    private static void FillBadge(Graphics g, Color fill, Color border)
    {
        using var path = RoundedRect(1.5f, 1.5f, Size - 3, Size - 3, 3f);
        using var brush = new SolidBrush(fill);
        using var pen = CreatePen(border, 1f);
        g.FillPath(brush, path);
        g.DrawPath(pen, path);
    }

    private static GraphicsPath RoundedRect(float x, float y, float width, float height, float radius)
    {
        var path = new GraphicsPath();
        var diameter = radius * 2;
        path.AddArc(x, y, diameter, diameter, 180, 90);
        path.AddArc(x + width - diameter, y, diameter, diameter, 270, 90);
        path.AddArc(x + width - diameter, y + height - diameter, diameter, diameter, 0, 90);
        path.AddArc(x, y + height - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static Pen CreatePen(Color color, float width = 1.5f) => CreatePen(new SolidBrush(color), width);

    private static Pen CreatePen(Brush brush, float width = 1.5f) =>
        new(brush, width)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round
        };

    private static Bitmap Draw(Action<Graphics> draw)
    {
        var bitmap = new Bitmap(Size, Size, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.Clear(Color.Transparent);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        draw(graphics);
        return bitmap;
    }
}
