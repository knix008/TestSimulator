using System.Drawing.Drawing2D;

namespace DCMViewer;

internal static class ExportFormatIcons
{
    public const int ToolbarIconSize = 24;
    public const int MenuIconSize = 16;

    public static Image Png => Create("PNG", Color.FromArgb(66, 133, 244), ToolbarIconSize);
    public static Image Jpeg => Create("JPG", Color.FromArgb(251, 140, 0), ToolbarIconSize);
    public static Image Bmp => Create("BMP", Color.FromArgb(126, 87, 194), ToolbarIconSize);
    public static Image Tiff => Create("TIF", Color.FromArgb(0, 150, 136), ToolbarIconSize);
    public static Image Gif => Create("GIF", Color.FromArgb(233, 30, 99), ToolbarIconSize);

    public static Image MenuPng => Create("PNG", Color.FromArgb(66, 133, 244), MenuIconSize);
    public static Image MenuJpeg => Create("JPG", Color.FromArgb(251, 140, 0), MenuIconSize);
    public static Image MenuBmp => Create("BMP", Color.FromArgb(126, 87, 194), MenuIconSize);
    public static Image MenuTiff => Create("TIF", Color.FromArgb(0, 150, 136), MenuIconSize);
    public static Image MenuGif => Create("GIF", Color.FromArgb(233, 30, 99), MenuIconSize);

    private static Image Create(string label, Color accent, int size)
    {
        var bmp = new Bitmap(size, size);
        using var g = Graphics.FromImage(bmp);
        g.Clear(Color.Magenta);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;

        var topMargin = Math.Max(2, size / 6);
        var bottomMargin = Math.Max(2, size / 8);
        var body = new Rectangle(1, topMargin, size - 3, size - topMargin - bottomMargin);
        using (var fill = new SolidBrush(Color.FromArgb(235, accent)))
            g.FillRectangle(fill, body);

        using (var border = new Pen(Color.FromArgb(160, accent), 1f))
            g.DrawRectangle(border, body);

        var fold = size / 5;
        var foldPoints = new Point[]
        {
            new(size - fold - 1, topMargin),
            new(size - fold - 1, topMargin + fold),
            new(size - 1, topMargin + fold),
        };
        using (var foldFill = new SolidBrush(Color.FromArgb(200, accent)))
            g.FillPolygon(foldFill, foldPoints);
        using (var foldBorder = new Pen(Color.FromArgb(120, accent), 1f))
            g.DrawPolygon(foldBorder, foldPoints);

        using var font = new Font("Segoe UI", size * 0.34f, FontStyle.Bold, GraphicsUnit.Point);
        using var textBrush = new SolidBrush(Color.FromArgb(32, 32, 36));
        var layout = new RectangleF(0, topMargin, size, size - topMargin);
        using var format = new StringFormat
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Center,
        };
        g.DrawString(label, font, textBrush, layout, format);

        return bmp;
    }
}
