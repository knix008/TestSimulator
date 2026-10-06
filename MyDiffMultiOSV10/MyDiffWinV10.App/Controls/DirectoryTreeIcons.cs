using System.Drawing.Drawing2D;

using MyDiffWinV10.App.Core;

namespace MyDiffWinV10.App.Controls;

/// <summary>
/// Status icons for synchronized directory comparison trees.
/// </summary>
public static class DirectoryTreeIcons
{
    public static void Populate(ImageList icons)
    {
        icons.Images.Clear();
        icons.Images.Add("folder", DrawIcon(DrawFolder));
        icons.Images.Add("same", DrawIcon(DrawSame));
        icons.Images.Add("different", DrawIcon(DrawDifferent));
        icons.Images.Add("left", DrawIcon(DrawLeftOnly));
        icons.Images.Add("right", DrawIcon(DrawRightOnly));
        icons.Images.Add("ghost", DrawIcon(DrawGhost));
    }

    public static string StatusToIconKey(FileCompareStatus? status) => status switch
    {
        FileCompareStatus.Same => "same",
        FileCompareStatus.Different => "different",
        FileCompareStatus.LeftOnly => "left",
        FileCompareStatus.RightOnly => "right",
        _ => "ghost",
    };

    public static Color StatusToForeColor(FileCompareStatus? status) => status switch
    {
        FileCompareStatus.Same => Color.FromArgb(22, 101, 52),
        FileCompareStatus.Different => Color.FromArgb(194, 65, 12),
        FileCompareStatus.LeftOnly => Color.FromArgb(185, 28, 28),
        FileCompareStatus.RightOnly => Color.FromArgb(29, 78, 216),
        _ => Color.Silver,
    };

    private static void DrawFolder(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var body = new SolidBrush(Color.FromArgb(255, 200, 130));
        using var tab = new SolidBrush(Color.FromArgb(240, 175, 90));
        g.FillRectangle(body, 1, 5, 14, 9);
        g.FillRectangle(tab, 1, 3, 6, 3);
        using var border = new Pen(Color.FromArgb(180, 130, 60), 1f);
        g.DrawRectangle(border, 1, 5, 13, 8);
        g.DrawRectangle(border, 1, 3, 5, 2);
    }

    private static void DrawSame(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(Color.SeaGreen, 2.5f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round,
        };
        g.DrawLines(pen, [new PointF(2f, 8f), new PointF(6f, 12f), new PointF(14f, 4f)]);
    }

    private static void DrawDifferent(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var brush = new SolidBrush(Color.DarkOrange);
        g.FillPolygon(brush, [new PointF(8f, 2f), new PointF(14f, 8f), new PointF(8f, 14f), new PointF(2f, 8f)]);
    }

    private static void DrawLeftOnly(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var brush = new SolidBrush(Color.Crimson);
        g.FillPolygon(brush, [new PointF(13f, 3f), new PointF(3f, 8f), new PointF(13f, 13f)]);
    }

    private static void DrawRightOnly(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var brush = new SolidBrush(Color.DodgerBlue);
        g.FillPolygon(brush, [new PointF(3f, 3f), new PointF(13f, 8f), new PointF(3f, 13f)]);
    }

    private static void DrawGhost(Graphics g)
    {
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(Color.Silver, 2f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawLine(pen, 3f, 8f, 13f, 8f);
    }

    private static Bitmap DrawIcon(Action<Graphics> draw)
    {
        var bitmap = new Bitmap(16, 16, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.Clear(Color.Transparent);
        draw(graphics);
        return bitmap;
    }
}
