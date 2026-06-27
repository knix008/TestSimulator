using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace ImageRembgWinV10.Resources;

public static class AppIconRenderer
{
    public const int MasterSize = 256;

    public static Bitmap Render(int size)
    {
        var bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
        graphics.Clear(Color.Transparent);

        var scale = size / (float)MasterSize;
        graphics.ScaleTransform(scale, scale);

        DrawIcon(graphics);
        return bitmap;
    }

    public static void SavePng(string path, int size = MasterSize)
    {
        using var bitmap = Render(size);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        bitmap.Save(path, ImageFormat.Png);
    }

    public static void SaveIco(string path, int[]? sizes = null)
    {
        sizes ??= [16, 24, 32, 48, 64, 128, 256];
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        var pngImages = new List<byte[]>();
        foreach (var size in sizes)
        {
            using var bitmap = Render(size);
            using var stream = new MemoryStream();
            bitmap.Save(stream, ImageFormat.Png);
            pngImages.Add(stream.ToArray());
        }

        using var output = File.Create(path);
        using var writer = new BinaryWriter(output);
        writer.Write((short)0);
        writer.Write((short)1);
        writer.Write((short)pngImages.Count);

        var offset = 6 + 16 * pngImages.Count;
        for (var i = 0; i < sizes.Length; i++)
        {
            var size = sizes[i];
            var data = pngImages[i];
            writer.Write(size >= 256 ? (byte)0 : (byte)size);
            writer.Write(size >= 256 ? (byte)0 : (byte)size);
            writer.Write((byte)0);
            writer.Write((byte)0);
            writer.Write((short)1);
            writer.Write((short)32);
            writer.Write(data.Length);
            writer.Write(offset);
            offset += data.Length;
        }

        foreach (var data in pngImages)
        {
            writer.Write(data);
        }
    }

    private static void DrawIcon(Graphics graphics)
    {
        using var shadowBrush = new SolidBrush(Color.FromArgb(40, 0, 0, 0));
        FillRoundedRect(graphics, shadowBrush, 30, 34, 196, 196, 44);

        using var backgroundBrush = new LinearGradientBrush(
            new Rectangle(24, 24, 208, 208),
            Color.FromArgb(255, 58, 170, 255),
            Color.FromArgb(255, 108, 72, 220),
            LinearGradientMode.ForwardDiagonal);
        FillRoundedRect(graphics, backgroundBrush, 24, 24, 208, 208, 44);

        FillRoundedRect(graphics, Brushes.White, 56, 56, 144, 144, 24);

        var innerRegion = CreateRoundedRectRegion(56, 56, 144, 144, 24);
        var previousClip = graphics.Clip;
        graphics.SetClip(innerRegion, CombineMode.Intersect);

        using var silhouetteBrush = new SolidBrush(Color.FromArgb(255, 118, 88, 210));
        graphics.FillEllipse(silhouetteBrush, 98, 82, 60, 60);
        using var bodyPath = CreateShoulderPath();
        graphics.FillPath(silhouetteBrush, bodyPath);

        using var fadeBrush = new LinearGradientBrush(
            new Rectangle(128, 56, 72, 144),
            Color.FromArgb(180, 255, 255, 255),
            Color.FromArgb(0, 255, 255, 255),
            LinearGradientMode.Horizontal);
        graphics.FillRectangle(fadeBrush, 128, 56, 72, 144);

        using var cutPen = new Pen(Color.FromArgb(255, 255, 255, 255), 5f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round
        };
        graphics.DrawLine(cutPen, 118, 188, 188, 68);

        graphics.SetClip(previousClip, CombineMode.Replace);
        innerRegion.Dispose();

        using var badgeBrush = new LinearGradientBrush(
            new Rectangle(168, 168, 64, 64),
            Color.FromArgb(255, 72, 190, 255),
            Color.FromArgb(255, 120, 80, 220),
            LinearGradientMode.ForwardDiagonal);
        graphics.FillEllipse(badgeBrush, 168, 168, 64, 64);
        using var badgeBorder = new Pen(Color.White, 4f);
        graphics.DrawEllipse(badgeBorder, 170, 170, 60, 60);

        using var toolPen = new Pen(Color.White, 4.5f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round
        };
        graphics.DrawLine(toolPen, 186, 206, 210, 206);
        graphics.DrawLine(toolPen, 210, 206, 210, 190);
        graphics.DrawEllipse(toolPen, 198, 184, 10, 10);
        graphics.DrawLine(toolPen, 204, 190, 214, 180);
        graphics.DrawLine(toolPen, 214, 180, 220, 186);
    }

    private static Region CreateRoundedRectRegion(float x, float y, float width, float height, float radius)
    {
        using var path = CreateRoundedRectPath(x, y, width, height, radius);
        return new Region(path);
    }

    private static GraphicsPath CreateRoundedRectPath(float x, float y, float width, float height, float radius)
    {
        var path = new GraphicsPath();
        if (radius <= 0)
        {
            path.AddRectangle(new RectangleF(x, y, width, height));
            return path;
        }

        var diameter = radius * 2;
        path.AddArc(x, y, diameter, diameter, 180, 90);
        path.AddArc(x + width - diameter, y, diameter, diameter, 270, 90);
        path.AddArc(x + width - diameter, y + height - diameter, diameter, diameter, 0, 90);
        path.AddArc(x, y + height - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static GraphicsPath CreateShoulderPath()
    {
        var path = new GraphicsPath();
        path.AddArc(74, 128, 108, 78, 180, 180);
        path.CloseFigure();
        return path;
    }

    private static void FillRoundedRect(Graphics graphics, Brush brush, float x, float y, float width, float height, float radius)
    {
        using var path = CreateRoundedRectPath(x, y, width, height, radius);
        graphics.FillPath(brush, path);
    }
}
