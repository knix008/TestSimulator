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

    // Three panes (base / local / remote) converging into one merged result —
    // visualizes the app's 3-way merge purpose.
    var localColor = Color.FromArgb(74, 222, 128);   // green: local/ours
    var remoteColor = Color.FromArgb(96, 165, 250);  // blue: remote/theirs
    var baseColor = Color.FromArgb(148, 163, 184);   // gray: common base

    float barWidth = 28f;
    float topY = 56f;
    float midY = 150f;

    using (var leftBar = RoundedBar(60 - barWidth / 2, topY, barWidth, midY - topY, 10))
    using (var leftBrush = new SolidBrush(localColor))
    {
        graphics.FillPath(leftBrush, leftBar);
    }

    using (var midBar = RoundedBar(128 - barWidth / 2, topY - 10, barWidth, midY - topY + 10, 10))
    using (var midBrush = new SolidBrush(baseColor))
    {
        graphics.FillPath(midBrush, midBar);
    }

    using (var rightBar = RoundedBar(196 - barWidth / 2, topY, barWidth, midY - topY, 10))
    using (var rightBrush = new SolidBrush(remoteColor))
    {
        graphics.FillPath(rightBrush, rightBar);
    }

    using (var joinPen = new Pen(Color.FromArgb(226, 232, 240), 14f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round })
    {
        graphics.DrawLine(joinPen, 60, midY, 128, 188);
        graphics.DrawLine(joinPen, 196, midY, 128, 188);
        graphics.DrawLine(joinPen, 128, midY - 4, 128, 188);
    }

    float r = 34f;
    var resultCenter = new PointF(128, 196);
    var resultRect = new RectangleF(resultCenter.X - r, resultCenter.Y - r, r * 2, r * 2);
    using (var glow = new SolidBrush(Color.FromArgb(70, Color.White)))
    {
        graphics.FillEllipse(glow, resultRect.X - 4, resultRect.Y - 4, resultRect.Width + 8, resultRect.Height + 8);
    }
    using (var resultBrush = new SolidBrush(Color.White))
    {
        graphics.FillEllipse(resultBrush, resultRect);
    }
    using (var ring = new Pen(Color.FromArgb(34, 197, 94), 5f))
    {
        graphics.DrawEllipse(ring, resultRect.X + 2.5f, resultRect.Y + 2.5f, resultRect.Width - 5, resultRect.Height - 5);
    }

    using (var checkPen = new Pen(Color.FromArgb(34, 197, 94), 9f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round })
    {
        graphics.DrawLines(checkPen, new PointF[]
        {
            new(resultCenter.X - 14, resultCenter.Y),
            new(resultCenter.X - 4, resultCenter.Y + 11),
            new(resultCenter.X + 17, resultCenter.Y - 14),
        });
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
    : Path.Combine(AppContext.BaseDirectory, "DiffMergeWinV10.ico");

SaveIcon(outputPath, [16, 32, 48, 256]);
Console.WriteLine($"Created {outputPath}");
