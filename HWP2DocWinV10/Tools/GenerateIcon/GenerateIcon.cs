using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;

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

static void FillRoundedGradient(
    Graphics graphics,
    RectangleF bounds,
    float radius,
    Color topLeft,
    Color bottomRight,
    Color accent)
{
    using var shape = RoundedRect(bounds.X, bounds.Y, bounds.Width, bounds.Height, radius);
    using var gradient = new LinearGradientBrush(bounds, topLeft, bottomRight, LinearGradientMode.ForwardDiagonal);
    var blend = new ColorBlend(3)
    {
        Colors = [topLeft, accent, bottomRight],
        Positions = [0f, 0.5f, 1f]
    };
    gradient.InterpolationColors = blend;
    graphics.FillPath(gradient, shape);
}

static void DrawGloss(Graphics graphics, RectangleF bounds, float radius)
{
    var glossBounds = new RectangleF(bounds.X + 10, bounds.Y + 10, bounds.Width - 20, bounds.Height * 0.38f);
    using var gloss = RoundedRect(glossBounds.X, glossBounds.Y, glossBounds.Width, glossBounds.Height, radius * 0.65f);
    using var brush = new LinearGradientBrush(
        glossBounds,
        Color.FromArgb(64, Color.White),
        Color.FromArgb(0, Color.White),
        LinearGradientMode.Vertical);
    graphics.FillPath(brush, gloss);
}

static void DrawHwpDocument(Graphics graphics)
{
    var page = new RectangleF(44, 72, 72, 96);
    using var shadow = new SolidBrush(Color.FromArgb(40, 0, 0, 0));
    graphics.FillPath(shadow, RoundedRect(page.X + 4, page.Y + 5, page.Width, page.Height, 10));

    using var pageFill = new SolidBrush(Color.FromArgb(248, 250, 252));
    using var pagePath = RoundedRect(page.X, page.Y, page.Width, page.Height, 10);
    graphics.FillPath(pageFill, pagePath);

    using var fold = new GraphicsPath();
    fold.AddLines([
        new PointF(page.Right - 22, page.Y),
        new PointF(page.Right, page.Y + 22),
        new PointF(page.Right - 22, page.Y + 22),
    ]);
    using var foldBrush = new SolidBrush(Color.FromArgb(226, 232, 240));
    graphics.FillPath(foldBrush, fold);

    using var outline = new Pen(Color.FromArgb(148, 163, 184), 2f);
    graphics.DrawPath(outline, pagePath);

    using var linePen = new Pen(Color.FromArgb(203, 213, 225), 3f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
    graphics.DrawLine(linePen, page.X + 14, page.Y + 38, page.Right - 18, page.Y + 38);
    graphics.DrawLine(linePen, page.X + 14, page.Y + 54, page.Right - 28, page.Y + 54);
    graphics.DrawLine(linePen, page.X + 14, page.Y + 70, page.Right - 22, page.Y + 70);

    using var badgeBrush = new SolidBrush(Color.FromArgb(37, 99, 235));
    using var badgePath = RoundedRect(page.X + 12, page.Y + 88, 34, 22, 6);
    graphics.FillPath(badgeBrush, badgePath);

    using var font = new Font("Segoe UI", 11f, FontStyle.Bold, GraphicsUnit.Point);
    using var textBrush = new SolidBrush(Color.White);
    var format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
    graphics.DrawString("HWP", font, textBrush, new RectangleF(page.X + 12, page.Y + 88, 34, 22), format);
}

static void DrawConversionArrow(Graphics graphics)
{
    using var arrowPen = new Pen(Color.FromArgb(224, 242, 254), 10f)
    {
        StartCap = LineCap.Round,
        EndCap = LineCap.Round,
        LineJoin = LineJoin.Round
    };
    graphics.DrawLine(arrowPen, 128, 120, 152, 120);

    using var head = new GraphicsPath();
    head.AddLines([
        new PointF(148, 108),
        new PointF(168, 120),
        new PointF(148, 132),
    ]);
    head.CloseFigure();
    using var headBrush = new SolidBrush(Color.FromArgb(224, 242, 254));
    graphics.FillPath(headBrush, head);

    using var glow = new SolidBrush(Color.FromArgb(48, 56, 189, 248));
    graphics.FillEllipse(glow, 118, 110, 20, 20);
}

static void DrawMarkdownTarget(Graphics graphics)
{
    var card = new RectangleF(176, 68, 76, 104);
    using var cardShadow = new SolidBrush(Color.FromArgb(36, 0, 0, 0));
    graphics.FillPath(cardShadow, RoundedRect(card.X + 3, card.Y + 4, card.Width, card.Height, 14));

    using var cardFill = new LinearGradientBrush(
        card,
        Color.FromArgb(16, 185, 129),
        Color.FromArgb(5, 150, 105),
        LinearGradientMode.Vertical);
    using var cardPath = RoundedRect(card.X, card.Y, card.Width, card.Height, 14);
    graphics.FillPath(cardFill, cardPath);

    using var rim = new Pen(Color.FromArgb(110, Color.White), 2f);
    graphics.DrawPath(rim, cardPath);

    using var hashPen = new Pen(Color.White, 5f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
    graphics.DrawLine(hashPen, card.X + 22, card.Y + 34, card.X + 22, card.Y + 52);
    graphics.DrawLine(hashPen, card.X + 34, card.Y + 34, card.X + 34, card.Y + 52);
    graphics.DrawLine(hashPen, card.X + 18, card.Y + 40, card.X + 38, card.Y + 40);
    graphics.DrawLine(hashPen, card.X + 18, card.Y + 48, card.X + 38, card.Y + 48);

    using var linePen = new Pen(Color.FromArgb(220, Color.White), 3.5f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
    graphics.DrawLine(linePen, card.X + 16, card.Y + 68, card.Right - 16, card.Y + 68);
    graphics.DrawLine(linePen, card.X + 16, card.Y + 80, card.Right - 24, card.Y + 80);
    graphics.DrawLine(linePen, card.X + 16, card.Y + 92, card.Right - 20, card.Y + 92);

    using var font = new Font("Segoe UI", 13f, FontStyle.Bold, GraphicsUnit.Point);
    using var textBrush = new SolidBrush(Color.White);
    var format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
    graphics.DrawString("MD", font, textBrush, new RectangleF(card.X, card.Y + 108, card.Width, 28), format);
}

static Bitmap DrawIcon(int size)
{
    var bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb);
    using var graphics = Graphics.FromImage(bitmap);
    graphics.SmoothingMode = SmoothingMode.AntiAlias;
    graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
    graphics.CompositingQuality = CompositingQuality.HighQuality;
    graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
    graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
    graphics.Clear(Color.Transparent);

    float scale = size / 256f;
    graphics.ScaleTransform(scale, scale);

    var bounds = new RectangleF(12, 12, 232, 232);
    FillRoundedGradient(
        graphics,
        bounds,
        54,
        Color.FromArgb(30, 58, 138),
        Color.FromArgb(13, 148, 136),
        Color.FromArgb(59, 130, 246));

    using (var rim = RoundedRect(bounds.X, bounds.Y, bounds.Width, bounds.Height, 54))
    using (var rimPen = new Pen(Color.FromArgb(72, Color.White), 2f))
    {
        graphics.DrawPath(rimPen, rim);
    }

    DrawGloss(graphics, bounds, 54);
    DrawHwpDocument(graphics);
    DrawConversionArrow(graphics);
    DrawMarkdownTarget(graphics);

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

string assetsDir = args.Length > 0
    ? args[0]
    : AppContext.BaseDirectory;

string icoPath = Path.Combine(assetsDir, "app.ico");
string pngPath = Path.Combine(assetsDir, "app-256.png");

SaveIcon(icoPath, [16, 32, 48, 256]);
using (Bitmap preview = DrawIcon(256))
{
    preview.Save(pngPath, ImageFormat.Png);
}

Console.WriteLine($"Created {icoPath}");
Console.WriteLine($"Created {pngPath}");

string iconsDir = Path.Combine(assetsDir, "Icons");
HWP2DocWinV10.ToolbarIcons.ExportAll(iconsDir);
Console.WriteLine($"Created toolbar icons in {iconsDir}");
