using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

static GraphicsPath RoundedRect(float x, float y, float w, float h, float radius)
{
    var path = new GraphicsPath();
    float d = radius * 2;
    path.AddArc(x, y, d, d, 180, 90);
    path.AddArc(x + w - d, y, d, d, 270, 90);
    path.AddArc(x + w - d, y + h - d, d, d, 0, 90);
    path.AddArc(x, y + h - d, d, d, 90, 90);
    path.CloseFigure();
    return path;
}

static GraphicsPath RoundedBar(float x, float y, float w, float h, float radius)
{
    var path = new GraphicsPath();
    float d = Math.Min(radius * 2, Math.Min(w, h));
    path.AddArc(x, y, d, d, 180, 90);
    path.AddArc(x + w - d, y, d, d, 270, 90);
    path.AddArc(x + w - d, y + h - d, d, d, 0, 90);
    path.AddArc(x, y + h - d, d, d, 90, 90);
    path.CloseFigure();
    return path;
}

static Bitmap DrawIcon(int size)
{
    var bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb);
    using var graphics = Graphics.FromImage(bitmap);
    graphics.SmoothingMode = SmoothingMode.AntiAlias;
    graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
    graphics.CompositingQuality = CompositingQuality.HighQuality;
    graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
    graphics.Clear(Color.Transparent);

    float scale = size / 256f;
    graphics.ScaleTransform(scale, scale);

    var bounds = new RectangleF(14, 14, 228, 228);
    using (var background = RoundedRect(bounds.X, bounds.Y, bounds.Width, bounds.Height, 52))
    using (var bgGradient = new LinearGradientBrush(bounds, Color.FromArgb(45, 55, 72), Color.FromArgb(17, 24, 39), LinearGradientMode.ForwardDiagonal))
    {
        graphics.FillPath(bgGradient, background);
    }

    using (var rim = RoundedRect(bounds.X, bounds.Y, bounds.Width, bounds.Height, 52))
    using (var rimPen = new Pen(Color.FromArgb(70, Color.White), 2f))
    {
        graphics.DrawPath(rimPen, rim);
    }

    var glossBounds = new RectangleF(bounds.X + 8, bounds.Y + 8, bounds.Width - 16, bounds.Height * 0.38f);
    using (var gloss = RoundedRect(glossBounds.X, glossBounds.Y, glossBounds.Width, glossBounds.Height, 36))
    using (var glossBrush = new LinearGradientBrush(glossBounds, Color.FromArgb(60, Color.White), Color.FromArgb(0, Color.White), LinearGradientMode.Vertical))
    {
        graphics.FillPath(glossBrush, gloss);
    }

    // Two columns (left/right file) joined by colored diff ticks — visualizes the
    // app's 2-way line diff purpose.
    var leftColor = Color.FromArgb(148, 163, 184);   // slate: left pane
    var rightColor = Color.FromArgb(96, 165, 250);   // blue: right pane
    var removedColor = Color.FromArgb(248, 113, 113);
    var modifiedColor = Color.FromArgb(251, 191, 36);
    var addedColor = Color.FromArgb(74, 222, 128);

    const float barWidth = 34f;
    const float top = 50f;
    const float bottom = 206f;
    const float leftX = 78f;
    const float rightX = 178f;

    using (var leftBar = RoundedBar(leftX - barWidth / 2, top, barWidth, bottom - top, 14))
    using (var leftBrush = new SolidBrush(leftColor))
    {
        graphics.FillPath(leftBrush, leftBar);
    }

    using (var rightBar = RoundedBar(rightX - barWidth / 2, top, barWidth, bottom - top, 14))
    using (var rightBrush = new SolidBrush(rightColor))
    {
        graphics.FillPath(rightBrush, rightBar);
    }

    float tickLeft = leftX + barWidth / 2 - 2;
    float tickRight = rightX - barWidth / 2 + 2;
    float tickWidth = tickRight - tickLeft;
    (float Y, Color Color)[] ticks =
    [
        (84f, removedColor),
        (128f, modifiedColor),
        (172f, addedColor),
    ];

    foreach (var (y, color) in ticks)
    {
        using var tickPath = RoundedBar(tickLeft, y - 8, tickWidth, 16, 8);
        using var tickBrush = new SolidBrush(color);
        graphics.FillPath(tickBrush, tickPath);
    }

    using (var dividerPen = new Pen(Color.FromArgb(90, Color.White), 3f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
    {
        for (float y = top + 14; y < bottom - 10; y += 22)
        {
            graphics.DrawLine(dividerPen, leftX - 8, y, leftX + 8, y);
            graphics.DrawLine(dividerPen, rightX - 8, y, rightX + 8, y);
        }
    }

    return bitmap;
}

static void SaveIcon(string path, int[] sizes)
{
    var pngImages = new List<byte[]>(sizes.Length);
    foreach (int size in sizes)
    {
        using Bitmap bitmap = DrawIcon(size);
        using var stream = new MemoryStream();
        bitmap.Save(stream, ImageFormat.Png);
        pngImages.Add(stream.ToArray());
    }

    using var output = new MemoryStream();
    using var writer = new BinaryWriter(output);
    writer.Write((short)0);
    writer.Write((short)1);
    writer.Write((short)pngImages.Count);

    int offset = 6 + 16 * pngImages.Count;
    foreach ((int size, byte[] data) in sizes.Zip(pngImages))
    {
        writer.Write((byte)(size >= 256 ? 0 : size));
        writer.Write((byte)(size >= 256 ? 0 : size));
        writer.Write((byte)0);
        writer.Write((byte)0);
        writer.Write((short)1);
        writer.Write((short)32);
        writer.Write(data.Length);
        writer.Write(offset);
        offset += data.Length;
    }

    foreach (byte[] data in pngImages)
    {
        writer.Write(data);
    }

    Directory.CreateDirectory(Path.GetDirectoryName(path)!);
    File.WriteAllBytes(path, output.ToArray());
}

string outputPath = args.Length > 0
    ? args[0]
    : Path.Combine(AppContext.BaseDirectory, "MyDiffWinV10.ico");

SaveIcon(outputPath, [16, 32, 48, 256]);
Console.WriteLine($"Created {outputPath}");
