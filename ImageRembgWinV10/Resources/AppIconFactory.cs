using System.Drawing.Drawing2D;

namespace ImageRembgWinV10.Resources;

public static class AppIconFactory
{
    public const int Size = 16;

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
        list.Images.Add("preview", CreatePreviewIcon());
        list.Images.Add("remove", CreateRemoveBackgroundIcon());
        list.Images.Add("reset", CreateResetIcon());
        list.Images.Add("zoom-in", CreateZoomInIcon());
        list.Images.Add("zoom-out", CreateZoomOutIcon());
        list.Images.Add("fit", CreateFitIcon());
        list.Images.Add("select", CreateSelectRectIcon());
        list.Images.Add("foreground", CreateForegroundIcon());
        list.Images.Add("background", CreateBackgroundIcon());
        list.Images.Add("pan", CreatePanIcon());
        list.Images.Add("mask", CreateMaskIcon());
        list.Images.Add("result", CreateResultIcon());

        return list;
    }

    public static Bitmap CreateFileMenuIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(70, 110, 180));
        g.FillRectangle(Brushes.White, 2, 4, 12, 10);
        g.DrawRectangle(pen, 2, 4, 12, 10);
        g.FillRectangle(new SolidBrush(Color.FromArgb(90, 130, 200)), 2, 4, 12, 3);
    });

    public static Bitmap CreateEditMenuIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(180, 90, 40));
        g.DrawLines(pen, new[] { new Point(3, 13), new Point(8, 3), new Point(13, 5), new Point(8, 15), new Point(3, 13) });
        g.DrawLine(pen, 10, 4, 13, 5);
    });

    public static Bitmap CreateViewMenuIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(60, 130, 90));
        g.DrawEllipse(pen, 3, 4, 10, 8);
        g.FillEllipse(Brushes.White, 5, 6, 4, 3);
        g.DrawLine(pen, 9, 9, 12, 12);
    });

    public static Bitmap CreateToolsMenuIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(90, 90, 90));
        g.DrawRectangle(pen, 3, 3, 10, 10);
        g.DrawLine(pen, 8, 3, 8, 13);
        g.DrawLine(pen, 3, 8, 13, 8);
    });

    public static Bitmap CreateOpenIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(55, 105, 185));
        g.FillRectangle(new SolidBrush(Color.FromArgb(235, 242, 252)), 2, 5, 11, 9);
        g.DrawRectangle(pen, 2, 5, 11, 9);
        g.FillRectangle(new SolidBrush(Color.FromArgb(100, 145, 210)), 2, 5, 11, 3);
        g.DrawLine(pen, 8, 2, 8, 6);
        g.DrawLine(pen, 6, 2, 10, 2);
    });

    public static Bitmap CreateSaveIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(55, 105, 185));
        g.FillRectangle(new SolidBrush(Color.FromArgb(235, 242, 252)), 3, 2, 10, 12);
        g.DrawRectangle(pen, 3, 2, 10, 12);
        g.FillRectangle(new SolidBrush(Color.FromArgb(100, 145, 210)), 3, 2, 10, 3);
        g.FillRectangle(Brushes.White, 5, 6, 6, 6);
        g.DrawRectangle(pen, 5, 6, 6, 6);
    });

    public static Bitmap CreateExitIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(190, 70, 70));
        g.DrawRectangle(pen, 3, 3, 10, 10);
        g.DrawLine(pen, 5, 5, 11, 11);
        g.DrawLine(pen, 11, 5, 5, 11);
    });

    public static Bitmap CreatePreviewIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(0, 150, 90));
        g.DrawRectangle(pen, 2, 4, 12, 9);
        g.DrawPolygon(pen, new[] { new Point(4, 12), new Point(7, 8), new Point(9, 10), new Point(12, 6) });
        g.DrawEllipse(CreatePen(Color.FromArgb(0, 180, 110)), 9, 5, 4, 4);
    });

    public static Bitmap CreateRemoveBackgroundIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(170, 80, 200));
        g.DrawRectangle(CreatePen(Color.FromArgb(120, 120, 120)), 2, 3, 12, 10);
        g.FillEllipse(new SolidBrush(Color.FromArgb(170, 80, 200)), 4, 5, 8, 6);
        g.DrawLine(CreatePen(Color.White, 2), 4, 11, 12, 3);
    });

    public static Bitmap CreateResetIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(110, 110, 110));
        g.DrawArc(pen, 3, 3, 10, 10, 30, 300);
        g.DrawLines(pen, new[] { new Point(3, 6), new Point(3, 3), new Point(6, 3) });
    });

    public static Bitmap CreateZoomInIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(70, 110, 170));
        g.DrawEllipse(pen, 2, 2, 9, 9);
        g.DrawLine(pen, 9, 9, 13, 13);
        g.DrawLine(CreatePen(Color.FromArgb(70, 110, 170), 2), 6, 5, 6, 9);
        g.DrawLine(CreatePen(Color.FromArgb(70, 110, 170), 2), 4, 7, 8, 7);
    });

    public static Bitmap CreateZoomOutIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(70, 110, 170));
        g.DrawEllipse(pen, 2, 2, 9, 9);
        g.DrawLine(pen, 9, 9, 13, 13);
        g.DrawLine(CreatePen(Color.FromArgb(70, 110, 170), 2), 4, 7, 8, 7);
    });

    public static Bitmap CreateFitIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(70, 110, 170));
        g.DrawRectangle(pen, 2, 3, 12, 10);
        g.DrawLine(pen, 5, 8, 2, 8);
        g.DrawLine(pen, 11, 8, 14, 8);
        g.DrawLine(pen, 8, 5, 8, 2);
        g.DrawLine(pen, 8, 11, 8, 14);
    });

    public static Bitmap CreateSelectRectIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(220, 170, 0), 2);
        pen.DashStyle = DashStyle.Dash;
        g.DrawRectangle(pen, 3, 3, 10, 10);
    });

    public static Bitmap CreateForegroundIcon() => Draw(g =>
    {
        g.FillEllipse(new SolidBrush(Color.FromArgb(70, 200, 90)), 4, 4, 8, 8);
        g.DrawEllipse(CreatePen(Color.FromArgb(30, 120, 50)), 4, 4, 8, 8);
    });

    public static Bitmap CreateBackgroundIcon() => Draw(g =>
    {
        g.FillEllipse(new SolidBrush(Color.FromArgb(230, 80, 80)), 4, 4, 8, 8);
        g.DrawEllipse(CreatePen(Color.FromArgb(150, 30, 30)), 4, 4, 8, 8);
    });

    public static Bitmap CreatePanIcon() => Draw(g =>
    {
        using var brush = new SolidBrush(Color.FromArgb(110, 110, 110));
        g.FillEllipse(brush, 3, 3, 7, 7);
        g.FillRectangle(brush, 5, 9, 2, 4);
        g.FillRectangle(brush, 3, 12, 6, 2);
    });

    public static Bitmap CreateMaskIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(0, 160, 120));
        g.DrawRectangle(pen, 2, 4, 12, 9);
        g.FillRectangle(new SolidBrush(Color.FromArgb(90, 0, 200, 120)), 4, 6, 8, 5);
    });

    public static Bitmap CreateAlgorithmMenuIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(90, 90, 90));
        g.DrawRectangle(pen, 3, 3, 10, 10);
        g.DrawLine(pen, 5, 6, 11, 6);
        g.DrawLine(pen, 5, 9, 11, 9);
        using var knob = new SolidBrush(Color.FromArgb(70, 110, 170));
        g.FillEllipse(knob, 9, 5, 3, 3);
        g.FillEllipse(knob, 6, 8, 3, 3);
    });

    public static Bitmap CreateResultIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(70, 110, 170));
        g.DrawRectangle(pen, 2, 3, 12, 10);
        g.FillEllipse(new SolidBrush(Color.FromArgb(220, 170, 0)), 10, 4, 3, 3);
    });

    public static Bitmap CreateInfoIcon() => Draw(g =>
    {
        using var pen = CreatePen(Color.FromArgb(70, 110, 180), 1.6f);
        g.DrawEllipse(pen, 2, 2, 12, 12);
        using var font = new Font("Segoe UI", 9f, FontStyle.Bold);
        g.DrawString("i", font, new SolidBrush(Color.FromArgb(70, 110, 180)), 5.5f, 1.5f);
    });

    private static Pen CreatePen(Color color, float width = 1.5f)
    {
        return new Pen(color, width)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round
        };
    }

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
