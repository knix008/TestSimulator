namespace RTSPCall.Core.Ui;

/// <summary>
/// Small colorful glyphs drawn with GDI+ for WinForms buttons.
/// </summary>
public static class UiButtonIcons
{
    public static Image Play(int size = 16) => Draw(size, g =>
    {
        using var brush = new SolidBrush(Color.FromArgb(46, 204, 113));
        var pts = new[]
        {
            new Point(size * 5 / 16, size * 3 / 16),
            new Point(size * 5 / 16, size * 13 / 16),
            new Point(size * 13 / 16, size / 2)
        };
        g.FillPolygon(brush, pts);
    });

    public static Image Stop(int size = 16) => Draw(size, g =>
    {
        using var brush = new SolidBrush(Color.FromArgb(231, 76, 60));
        var pad = size * 4 / 16;
        g.FillRectangle(brush, pad, pad, size - pad * 2, size - pad * 2);
    });

    public static Image Refresh(int size = 16) => Draw(size, g =>
    {
        using var pen = new Pen(Color.FromArgb(52, 152, 219), Math.Max(1.8f, size / 8f))
        {
            StartCap = System.Drawing.Drawing2D.LineCap.Round,
            EndCap = System.Drawing.Drawing2D.LineCap.Round
        };
        var pad = size * 3 / 16f;
        var rect = new RectangleF(pad, pad, size - pad * 2, size - pad * 2);
        g.DrawArc(pen, rect, 40, 250);
        using var brush = new SolidBrush(Color.FromArgb(52, 152, 219));
        var tip = new[]
        {
            new PointF(size * 0.72f, size * 0.18f),
            new PointF(size * 0.92f, size * 0.34f),
            new PointF(size * 0.62f, size * 0.42f)
        };
        g.FillPolygon(brush, tip);
    });

    public static Image Call(int size = 16) => Draw(size, g =>
    {
        using var brush = new SolidBrush(Color.FromArgb(46, 204, 113));
        // Simple video-camera body
        var body = new Rectangle(size * 2 / 16, size * 5 / 16, size * 8 / 16, size * 6 / 16);
        g.FillRoundedRectangle(brush, body, size / 8);
        var lens = new[]
        {
            new Point(size * 10 / 16, size * 6 / 16),
            new Point(size * 14 / 16, size * 4 / 16),
            new Point(size * 14 / 16, size * 12 / 16),
            new Point(size * 10 / 16, size * 10 / 16)
        };
        g.FillPolygon(brush, lens);
    });

    public static Image HangUp(int size = 16) => Draw(size, g =>
    {
        using var brush = new SolidBrush(Color.FromArgb(231, 76, 60));
        using var pen = new Pen(Color.FromArgb(231, 76, 60), Math.Max(2f, size / 7f))
        {
            StartCap = System.Drawing.Drawing2D.LineCap.Round,
            EndCap = System.Drawing.Drawing2D.LineCap.Round
        };
        // Downward phone handset silhouette
        g.DrawArc(pen, size * 3 / 16f, size * 4 / 16f, size * 10 / 16f, size * 10 / 16f, 200, 140);
        g.FillEllipse(brush, size * 2 / 16, size * 9 / 16, size * 4 / 16, size * 4 / 16);
        g.FillEllipse(brush, size * 10 / 16, size * 9 / 16, size * 4 / 16, size * 4 / 16);
    });

    public static Image LocalSim(int size = 16) => Draw(size, g =>
    {
        using var brush = new SolidBrush(Color.FromArgb(243, 156, 18));
        using var pen = new Pen(Color.FromArgb(243, 156, 18), Math.Max(1.6f, size / 9f));
        g.DrawRectangle(pen, size * 2 / 16, size * 3 / 16, size * 7 / 16, size * 6 / 16);
        g.DrawRectangle(pen, size * 7 / 16, size * 7 / 16, size * 7 / 16, size * 6 / 16);
        g.FillEllipse(brush, size * 6 / 16, size * 6 / 16, size * 4 / 16, size * 4 / 16);
    });

    public static void Apply(Button button, Image icon, string text)
    {
        button.Image?.Dispose();
        button.Image = icon;
        button.Text = " " + text;
        button.TextImageRelation = TextImageRelation.ImageBeforeText;
        button.ImageAlign = ContentAlignment.MiddleLeft;
        button.TextAlign = ContentAlignment.MiddleLeft;
        button.Padding = new Padding(6, 0, 8, 0);
    }

    private static Image Draw(int size, Action<Graphics> paint)
    {
        var bmp = new Bitmap(size, size);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;
        g.Clear(Color.Transparent);
        paint(g);
        return bmp;
    }

    private static void FillRoundedRectangle(this Graphics g, Brush brush, Rectangle rect, int radius)
    {
        radius = Math.Max(1, Math.Min(radius, Math.Min(rect.Width, rect.Height) / 2));
        using var path = new System.Drawing.Drawing2D.GraphicsPath();
        var d = radius * 2;
        path.AddArc(rect.X, rect.Y, d, d, 180, 90);
        path.AddArc(rect.Right - d, rect.Y, d, d, 270, 90);
        path.AddArc(rect.Right - d, rect.Bottom - d, d, d, 0, 90);
        path.AddArc(rect.X, rect.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        g.FillPath(brush, path);
    }
}
