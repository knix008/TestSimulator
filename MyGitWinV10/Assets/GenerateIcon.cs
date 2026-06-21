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
    Color? accent = null)
{
    using var shape = RoundedRect(bounds.X, bounds.Y, bounds.Width, bounds.Height, radius);
    using var gradient = new LinearGradientBrush(bounds, topLeft, bottomRight, LinearGradientMode.ForwardDiagonal);
    if (accent is Color accentColor)
    {
        var blend = new ColorBlend(3)
        {
            Colors = [topLeft, accentColor, bottomRight],
            Positions = [0f, 0.45f, 1f]
        };
        gradient.InterpolationColors = blend;
    }

    graphics.FillPath(gradient, shape);
}

static void DrawGloss(Graphics graphics, RectangleF bounds, float radius)
{
    var glossBounds = new RectangleF(bounds.X + 8, bounds.Y + 8, bounds.Width - 16, bounds.Height * 0.42f);
    using var gloss = RoundedRect(glossBounds.X, glossBounds.Y, glossBounds.Width, glossBounds.Height, radius * 0.7f);
    using var brush = new LinearGradientBrush(
        glossBounds,
        Color.FromArgb(72, Color.White),
        Color.FromArgb(0, Color.White),
        LinearGradientMode.Vertical);
    graphics.FillPath(brush, gloss);
}

static void DrawNode(Graphics graphics, PointF center, float diameter, Color fill, Color ring)
{
    float r = diameter / 2f;
    var rect = new RectangleF(center.X - r, center.Y - r, diameter, diameter);
    using var glow = new SolidBrush(Color.FromArgb(48, fill));
    graphics.FillEllipse(glow, rect.X - 3, rect.Y - 3, rect.Width + 6, rect.Height + 6);
    using var core = new SolidBrush(fill);
    graphics.FillEllipse(core, rect);
    using var pen = new Pen(ring, 2.5f);
    graphics.DrawEllipse(pen, rect.X + 1.5f, rect.Y + 1.5f, rect.Width - 3, rect.Height - 3);
}

static void DrawBranch(Graphics graphics, PointF from, PointF to, float width, Color color)
{
    using var pen = new Pen(color, width)
    {
        StartCap = LineCap.Round,
        EndCap = LineCap.Round,
        LineJoin = LineJoin.Round
    };
    graphics.DrawLine(pen, from, to);
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
    FillRoundedGradient(
        graphics,
        bounds,
        52,
        Color.FromArgb(99, 102, 241),
        Color.FromArgb(30, 64, 175),
        Color.FromArgb(59, 130, 246));

    using (var rim = RoundedRect(bounds.X, bounds.Y, bounds.Width, bounds.Height, 52))
    using (var rimPen = new Pen(Color.FromArgb(90, Color.White), 2f))
    {
        graphics.DrawPath(rimPen, rim);
    }

    DrawGloss(graphics, bounds, 52);

    var merge = new PointF(178, 126);
    var head = new PointF(128, 62);
    var baseLeft = new PointF(78, 194);
    var baseRight = new PointF(178, 194);

    float lineWidth = 15f;
    var mainLine = Color.FromArgb(245, 248, 255);
    var branchLine = Color.FromArgb(251, 191, 36);

    DrawBranch(graphics, head, baseLeft, lineWidth, mainLine);
    DrawBranch(graphics, head, merge, lineWidth, branchLine);
    DrawBranch(graphics, merge, baseRight, lineWidth, branchLine);

    float nodeSize = 30f;
    DrawNode(graphics, head, nodeSize, Color.White, Color.FromArgb(191, 219, 254));
    DrawNode(graphics, merge, nodeSize, Color.FromArgb(254, 243, 199), Color.FromArgb(251, 191, 36));
    DrawNode(graphics, baseLeft, nodeSize, Color.White, Color.FromArgb(191, 219, 254));
    DrawNode(graphics, baseRight, nodeSize, Color.FromArgb(254, 243, 199), Color.FromArgb(251, 191, 36));

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
    : Path.Combine(AppContext.BaseDirectory, "MyGit.ico");

SaveIcon(outputPath, [16, 32, 48, 256]);
Console.WriteLine($"Created {outputPath}");

GenerateFileStatusIcons(Path.Combine(Path.GetDirectoryName(outputPath)!, "FileStatusIcons"));

// File-tree status icons: a plain file/folder glyph (same shape as IconFactory.File/Folder)
// with an optional colored badge in the bottom-right corner, baked into static PNGs so the
// tree view loads pre-rendered images instead of drawing badges on every app start.
static void GenerateFileStatusIcons(string directory)
{
    Directory.CreateDirectory(directory);

    var plain = (Color?)null;
    var entries = new (string Name, bool IsDirectory, Color? Badge, string? Letter)[]
    {
        ("Folder", true, null, null),
        ("FolderChanged", true, Color.FromArgb(37, 99, 235), null),
        ("File", false, plain, null),
        ("FileUntracked", false, Color.FromArgb(5, 150, 105), "?"),
        ("FileModified", false, Color.FromArgb(37, 99, 235), "M"),
        ("FileDeleted", false, Color.FromArgb(220, 38, 38), "D"),
        ("FileAdded", false, Color.FromArgb(5, 150, 105), "A"),
        ("FileStaged", false, Color.FromArgb(124, 58, 237), "+"),
        ("FileRenamed", false, Color.FromArgb(37, 99, 235), "R"),
        ("FileMixed", false, Color.FromArgb(217, 119, 6), "~"),
        ("FileConflicted", false, Color.FromArgb(220, 38, 38), "!"),
    };

    foreach (var entry in entries)
    {
        using Bitmap bitmap = DrawFileStatusIcon(64, entry.IsDirectory, entry.Badge, entry.Letter);
        string path = Path.Combine(directory, $"{entry.Name}.png");
        bitmap.Save(path, ImageFormat.Png);
        Console.WriteLine($"Created {path}");
    }
}

static Bitmap DrawFileStatusIcon(int size, bool isDirectory, Color? badgeColor, string? badgeLetter)
{
    var bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb);
    using var graphics = Graphics.FromImage(bitmap);
    graphics.SmoothingMode = SmoothingMode.AntiAlias;
    graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
    graphics.CompositingQuality = CompositingQuality.HighQuality;
    graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;

    float scale = size / 16f;
    graphics.ScaleTransform(scale, scale);

    var outlineColor = Color.FromArgb(51, 65, 85);

    if (isDirectory)
    {
        var bodyColor = Color.FromArgb(96, 165, 250);
        var tabColor = Color.FromArgb(59, 130, 246);
        using var pen = new Pen(outlineColor, 1f) { LineJoin = LineJoin.Round };

        // Classic folder silhouette: a tab sticking up from the left of a wider body.
        PointF[] folder =
        [
            new(1.5f, 4.5f), new(6.5f, 4.5f), new(8f, 6.5f), new(14.5f, 6.5f),
            new(14.5f, 13.5f), new(1.5f, 13.5f),
        ];
        using var bodyBrush = new SolidBrush(bodyColor);
        graphics.FillPolygon(bodyBrush, folder);
        graphics.DrawPolygon(pen, folder);

        using var tabBrush = new SolidBrush(tabColor);
        PointF[] tab = [new(1.5f, 4.5f), new(6.5f, 4.5f), new(8f, 6.5f), new(1.5f, 6.5f)];
        graphics.FillPolygon(tabBrush, tab);
        graphics.DrawPolygon(pen, tab);
    }
    else
    {
        var glyphColor = Color.FromArgb(71, 85, 105);
        using var pen = new Pen(glyphColor, 1.3f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
        using var fillBrush = new SolidBrush(Color.FromArgb(241, 245, 249));
        PointF[] page = [new(4, 2), new(10, 2), new(13, 5), new(13, 14), new(4, 14)];
        graphics.FillPolygon(fillBrush, page);
        graphics.DrawPolygon(pen, page);
        graphics.DrawLines(pen, new PointF[] { new(10, 2), new(10, 5), new(13, 5) });
        graphics.DrawLine(pen, 6, 8, 11, 8);
        graphics.DrawLine(pen, 6, 10.5f, 11, 10.5f);
    }

    if (badgeColor is Color color)
    {
        var badgeCenter = new PointF(12f, 12f);
        const float badgeRadius = 3.6f;
        var badgeRect = new RectangleF(badgeCenter.X - badgeRadius, badgeCenter.Y - badgeRadius, badgeRadius * 2, badgeRadius * 2);

        using var ring = new Pen(Color.FromArgb(250, 250, 251), 1.2f);
        using var badgeBrush = new SolidBrush(color);
        graphics.FillEllipse(badgeBrush, badgeRect);
        graphics.DrawEllipse(ring, Inflate(badgeRect, -0.4f));

        if (!string.IsNullOrEmpty(badgeLetter))
        {
            var clipState = graphics.Save();
            graphics.SetClip(new RectangleF(badgeRect.X - 0.5f, badgeRect.Y - 0.5f, badgeRect.Width + 1f, badgeRect.Height + 1f));
            using var textBrush = new SolidBrush(Color.White);
            using var font = new Font("Segoe UI", 4.5f, FontStyle.Bold, GraphicsUnit.Point);
            var format = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            graphics.DrawString(badgeLetter, font, textBrush, badgeRect, format);
            graphics.Restore(clipState);
        }
    }

    return bitmap;
}

static RectangleF Inflate(RectangleF rect, float amount)
{
    rect.Inflate(amount, amount);
    return rect;
}
