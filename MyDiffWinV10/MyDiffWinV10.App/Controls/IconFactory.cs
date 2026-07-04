using System.Drawing.Drawing2D;

namespace MyDiffWinV10.App.Controls;

/// <summary>
/// Draws small glyph icons at runtime for menu items and toolbar buttons, so the app
/// doesn't need to ship a separate set of image assets for its UI chrome.
/// </summary>
public static class IconFactory
{
    public static Bitmap OpenLeft() => OpenFile(Color.FromArgb(100, 116, 139));

    public static Bitmap OpenRight() => OpenFile(Color.FromArgb(37, 99, 235));

    public static Bitmap OpenLeftFile() => OpenDocument(Color.FromArgb(100, 116, 139));

    public static Bitmap OpenRightFile() => OpenDocument(Color.FromArgb(37, 99, 235));

    public static Bitmap FontSize() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(71, 85, 105), 1.4f) { LineJoin = LineJoin.Round };
        using var accent = new SolidBrush(Color.FromArgb(37, 99, 235));
        g.DrawString("A", new Font("Segoe UI", 9f, FontStyle.Bold), accent, 1f, 0.5f);
        g.DrawLine(pen, 10, 3, 10, 13);
        g.DrawLine(pen, 10, 5, 14, 5);
        g.DrawLine(pen, 10, 8, 13, 8);
        g.DrawLine(pen, 10, 11, 14, 11);
    });

    public static Bitmap FileCompare() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(37, 99, 235), 1.2f) { LineJoin = LineJoin.Round };
        using var leftFill = new SolidBrush(Color.FromArgb(226, 232, 240));
        using var rightFill = new SolidBrush(Color.FromArgb(219, 234, 254));
        g.FillRectangle(leftFill, 1, 3, 6, 10);
        g.DrawRectangle(pen, 1, 3, 6, 10);
        g.FillRectangle(rightFill, 9, 3, 6, 10);
        g.DrawRectangle(pen, 9, 3, 6, 10);
        using var diffPen = new Pen(Color.FromArgb(234, 88, 12), 1.6f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawLine(diffPen, 4, 8, 12, 8);
    });

    public static Bitmap DirectoryCompare() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(180, 130, 60), 1f) { LineJoin = LineJoin.Round };
        using var body = new SolidBrush(Color.FromArgb(255, 200, 130));
        using var tab = new SolidBrush(Color.FromArgb(240, 175, 90));
        g.FillRectangle(body, 1, 5, 6, 9);
        g.FillRectangle(tab, 1, 3, 4, 3);
        g.DrawRectangle(pen, 1, 5, 5, 8);
        g.FillRectangle(body, 9, 5, 6, 9);
        g.FillRectangle(tab, 9, 3, 4, 3);
        g.DrawRectangle(pen, 9, 5, 5, 8);
    });

    private static Bitmap OpenFile(Color accent)
    {
        return Draw(g =>
        {
            var body = Color.FromArgb((accent.R + 255 * 3) / 4, (accent.G + 255 * 3) / 4, (accent.B + 255 * 3) / 4);
            using var pen = new Pen(accent, 1f) { LineJoin = LineJoin.Round };
            PointF[] folder = [new(1, 4), new(6, 4), new(7.5f, 6), new(15, 6), new(15, 13), new(1, 13)];
            using var bodyBrush = new SolidBrush(body);
            g.FillPolygon(bodyBrush, folder);
            g.DrawPolygon(pen, folder);
            using var tabBrush = new SolidBrush(accent);
            PointF[] tabShape = [new(1, 4), new(6, 4), new(7.5f, 6), new(1, 6)];
            g.FillPolygon(tabBrush, tabShape);
            g.DrawPolygon(pen, tabShape);
        });
    }

    private static Bitmap OpenDocument(Color accent)
    {
        return Draw(g =>
        {
            var body = Color.FromArgb((accent.R + 255 * 3) / 4, (accent.G + 255 * 3) / 4, (accent.B + 255 * 3) / 4);
            using var pen = new Pen(accent, 1f) { LineJoin = LineJoin.Round };
            using var bodyBrush = new SolidBrush(body);
            g.FillRectangle(bodyBrush, 3, 1, 10, 14);
            g.DrawRectangle(pen, 3, 1, 10, 14);
            using var foldBrush = new SolidBrush(Color.FromArgb(Math.Min(255, accent.R + 40), Math.Min(255, accent.G + 40), Math.Min(255, accent.B + 40)));
            PointF[] fold = [new(10, 1), new(13, 4), new(10, 4)];
            g.FillPolygon(foldBrush, fold);
            g.DrawLine(pen, 10, 1, 13, 4);
            g.DrawLine(pen, 10, 1, 10, 4);
            g.DrawLine(pen, 10, 4, 13, 4);
            using var linePen = new Pen(Color.FromArgb(Math.Max(0, accent.R - 20), Math.Max(0, accent.G - 20), Math.Max(0, accent.B - 20)), 1f);
            g.DrawLine(linePen, 5, 7, 11, 7);
            g.DrawLine(linePen, 5, 10, 11, 10);
        });
    }

    public static Bitmap Reload() => Draw(g =>
    {
        using var pen = new Pen(Color.FromArgb(37, 99, 235), 1.8f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
        g.DrawArc(pen, 2, 2, 12, 12, -40, 280);
        using var headBrush = new SolidBrush(Color.FromArgb(37, 99, 235));
        PointF[] arrowHead = [new(12, 1), new(15, 4), new(11, 5)];
        g.FillPolygon(headBrush, arrowHead);
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

    public static Bitmap PrevDiff() => Arrow(up: true);

    public static Bitmap NextDiff() => Arrow(up: false);

    private static Bitmap Arrow(bool up)
    {
        return Draw(g =>
        {
            using var pen = new Pen(Color.FromArgb(37, 99, 235), 2f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
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
