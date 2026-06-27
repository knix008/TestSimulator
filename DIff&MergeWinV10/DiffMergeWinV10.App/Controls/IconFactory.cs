using System.Drawing.Drawing2D;

namespace DiffMergeWinV10.App.Controls;

/// <summary>
/// Draws small glyph icons at runtime for menu items and toolbar buttons, so the app
/// doesn't need to ship a separate set of image assets for its UI chrome.
/// </summary>
public static class IconFactory
{
    public static Bitmap OpenFiles() => Draw(g =>
    {
        var tab = Color.FromArgb(96, 165, 250);
        var body = Color.FromArgb(191, 219, 254);
        using var pen = new Pen(Color.FromArgb(30, 64, 175), 1f) { LineJoin = LineJoin.Round };
        PointF[] folder = [new(1, 4), new(6, 4), new(7.5f, 6), new(15, 6), new(15, 13), new(1, 13)];
        using var bodyBrush = new SolidBrush(body);
        g.FillPolygon(bodyBrush, folder);
        g.DrawPolygon(pen, folder);
        using var tabBrush = new SolidBrush(tab);
        PointF[] tabShape = [new(1, 4), new(6, 4), new(7.5f, 6), new(1, 6)];
        g.FillPolygon(tabBrush, tabShape);
        g.DrawPolygon(pen, tabShape);
    });

    public static Bitmap OpenConflicted() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(71, 85, 105), 1.3f) { LineJoin = LineJoin.Round };
        using var fill = new SolidBrush(Color.FromArgb(241, 245, 249));
        PointF[] page = [new(3, 1), new(10, 1), new(14, 5), new(14, 15), new(3, 15)];
        g.FillPolygon(fill, page);
        g.DrawPolygon(pen, page);
        using var badge = new SolidBrush(Color.FromArgb(220, 38, 38));
        g.FillEllipse(badge, 8.5f, 7.5f, 6, 6);
        using var textPen = new Pen(Color.White, 1.3f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawLine(textPen, 11.5f, 9, 11.5f, 11.2f);
        g.DrawLine(textPen, 11.5f, 12.1f, 11.5f, 12.3f);
    });

    public static Bitmap Save() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(30, 64, 175), 1f) { LineJoin = LineJoin.Round };
        using var body = new SolidBrush(Color.FromArgb(96, 165, 250));
        PointF[] disk = [new(2, 2), new(11, 2), new(14, 5), new(14, 14), new(2, 14)];
        g.FillPolygon(body, disk);
        g.DrawPolygon(pen, disk);
        using var labelBrush = new SolidBrush(Color.White);
        g.FillRectangle(labelBrush, 4, 9, 8, 5);
        g.DrawRectangle(pen, 4, 9, 8, 5);
        using var shutterBrush = new SolidBrush(Color.FromArgb(30, 64, 175));
        g.FillRectangle(shutterBrush, 5, 3, 5, 4);
    });

    public static Bitmap SaveAs() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(30, 64, 175), 1f) { LineJoin = LineJoin.Round };
        using var body = new SolidBrush(Color.FromArgb(96, 165, 250));
        PointF[] disk = [new(1, 1), new(9, 1), new(12, 4), new(12, 12), new(1, 12)];
        g.FillPolygon(body, disk);
        g.DrawPolygon(pen, disk);
        using var star = new SolidBrush(Color.FromArgb(251, 191, 36));
        g.FillEllipse(star, 9, 9, 7, 7);
        using var starPen = new Pen(Color.FromArgb(146, 64, 14), 1f);
        g.DrawEllipse(starPen, 9, 9, 7, 7);
    });

    public static Bitmap Copy() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(71, 85, 105), 1.2f) { LineJoin = LineJoin.Round };
        using var backFill = new SolidBrush(Color.FromArgb(226, 232, 240));
        g.FillRectangle(backFill, 2, 2, 9, 11);
        g.DrawRectangle(pen, 2, 2, 9, 11);
        using var frontFill = new SolidBrush(Color.White);
        g.FillRectangle(frontFill, 5, 5, 9, 11);
        g.DrawRectangle(pen, 5, 5, 9, 11);
    });

    public static Bitmap Edit() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(51, 65, 85), 1.2f) { LineJoin = LineJoin.Round };
        using var body = new SolidBrush(Color.FromArgb(251, 191, 36));
        PointF[] pencil = [new(2, 13), new(3, 9), new(10, 2), new(13, 5), new(6, 12)];
        g.FillPolygon(body, pencil);
        g.DrawPolygon(pen, pencil);
        using var tipBrush = new SolidBrush(Color.FromArgb(71, 85, 105));
        PointF[] tip = [new(2, 13), new(3, 9), new(5.5f, 10.5f)];
        g.FillPolygon(tipBrush, tip);
    });

    public static Bitmap View() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(51, 65, 85), 1.3f) { LineJoin = LineJoin.Round };
        using var fill = new SolidBrush(Color.FromArgb(191, 219, 254));
        g.FillEllipse(fill, 1, 4, 14, 8);
        g.DrawArc(pen, 1, 3, 14, 9, 200, 140);
        g.DrawArc(pen, 1, 4, 14, 9, 20, 140);
        using var iris = new SolidBrush(Color.FromArgb(37, 99, 235));
        g.FillEllipse(iris, 6, 5.5f, 4, 4);
    });

    public static Bitmap WordWrap() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(71, 85, 105), 1.6f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawLine(pen, 2, 3, 14, 3);
        g.DrawLine(pen, 2, 8, 11, 8);
        g.DrawLines(pen, new PointF[] { new(11, 5.5f), new(14, 8), new(11, 10.5f) });
        g.DrawLine(pen, 2, 13, 9, 13);
    });

    public static Bitmap Info() => Draw(g =>
    {
        using var fill = new SolidBrush(Color.FromArgb(96, 165, 250));
        using var pen = new Pen(Color.FromArgb(30, 64, 175), 1f);
        g.FillEllipse(fill, 1, 1, 14, 14);
        g.DrawEllipse(pen, 1, 1, 14, 14);
        using var textPen = new Pen(Color.White, 1.8f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawLine(textPen, 8, 7, 8, 11.5f);
        g.DrawLine(textPen, 8, 4.3f, 8, 4.6f);
    });

    public static Bitmap Preferences() => Draw(g =>
    {
        using var hubBrush = new SolidBrush(Color.FromArgb(100, 116, 139));
        using var pen = new Pen(Color.FromArgb(51, 65, 85), 1.2f) { LineJoin = LineJoin.Round };
        const int teeth = 8;
        const float cx = 8f, cy = 8f, outerR = 6.5f, innerR = 4.6f, toothR = 1f;
        for (int i = 0; i < teeth; i++)
        {
            double angle = i * (2 * Math.PI / teeth);
            float x = cx + (float)(Math.Cos(angle) * outerR) - toothR;
            float y = cy + (float)(Math.Sin(angle) * outerR) - toothR;
            g.FillEllipse(hubBrush, x, y, toothR * 2, toothR * 2);
        }
        g.FillEllipse(hubBrush, cx - innerR, cy - innerR, innerR * 2, innerR * 2);
        g.DrawEllipse(pen, cx - innerR, cy - innerR, innerR * 2, innerR * 2);
        using var holeBrush = new SolidBrush(Color.White);
        g.FillEllipse(holeBrush, cx - 2, cy - 2, 4, 4);
        g.DrawEllipse(pen, cx - 2, cy - 2, 4, 4);
    });

    public static Bitmap Exit() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(100, 116, 139), 1.5f) { LineJoin = LineJoin.Round };
        g.DrawRectangle(pen, 2, 1, 8, 14);
        using var arrowPen = new Pen(Color.FromArgb(220, 38, 38), 1.8f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawLine(arrowPen, 7, 8, 15, 8);
        g.DrawLine(arrowPen, 11.5f, 4.5f, 15, 8);
        g.DrawLine(arrowPen, 11.5f, 11.5f, 15, 8);
    });

    public static Bitmap PrevConflict() => Arrow(up: true, Color.FromArgb(37, 99, 235));

    public static Bitmap NextConflict() => Arrow(up: false, Color.FromArgb(37, 99, 235));

    public static Bitmap TakeBase() => Swatch(Color.FromArgb(148, 163, 184));

    public static Bitmap TakeLocal() => Swatch(Color.FromArgb(74, 222, 128));

    public static Bitmap TakeRemote() => Swatch(Color.FromArgb(96, 165, 250));

    public static Bitmap TakeBoth() => Draw(g =>
    {
        using var leftBrush = new SolidBrush(Color.FromArgb(74, 222, 128));
        using var rightBrush = new SolidBrush(Color.FromArgb(96, 165, 250));
        g.FillRectangle(leftBrush, 1, 3, 6, 10);
        g.FillRectangle(rightBrush, 9, 3, 6, 10);
        using var pen = new Pen(Color.FromArgb(51, 65, 85), 1f);
        g.DrawRectangle(pen, 1, 3, 6, 10);
        g.DrawRectangle(pen, 9, 3, 6, 10);
    });

    private static Bitmap Arrow(bool up, Color color)
    {
        return Draw(g =>
        {
            using var pen = new Pen(color, 2f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
            if (up)
            {
                g.DrawLines(pen, new PointF[] { new(3, 9), new(8, 3), new(13, 9) });
                g.DrawLine(pen, 8, 3, 8, 14);
            }
            else
            {
                g.DrawLines(pen, new PointF[] { new(3, 7), new(8, 13), new(13, 7) });
                g.DrawLine(pen, 8, 2, 8, 13);
            }
        });
    }

    private static Bitmap Swatch(Color color)
    {
        return Draw(g =>
        {
            using var brush = new SolidBrush(color);
            using var pen = new Pen(Color.FromArgb(51, 65, 85), 1f);
            g.FillEllipse(brush, 2, 2, 12, 12);
            g.DrawEllipse(pen, 2, 2, 12, 12);
        });
    }

    private static Bitmap Draw(Action<Graphics> paint)
    {
        var bitmap = new Bitmap(16, 16);
        using var g = Graphics.FromImage(bitmap);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);
        paint(g);
        return bitmap;
    }
}
