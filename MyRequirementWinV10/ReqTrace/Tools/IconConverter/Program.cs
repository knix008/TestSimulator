using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

return args.Length switch
{
    >= 2 when args[0] == "strip" => StripBackground(args[1], args[2], ParseTolerance(args)),
    >= 2 when args[0] == "to-ico" => WriteIco(args[1], args[2]),
    >= 1 when args[0] == "generate-app" => GenerateAppIcon(args[1]),
    >= 1 when args[0] == "generate-project" => GenerateProjectIcon(args[1]),
    _ => PrintUsage()
};

static int PrintUsage()
{
    Console.Error.WriteLine("""
        Usage:
          IconConverter strip <input.png> <output.png> [tolerance]
          IconConverter to-ico <input.png> <output.ico>
          IconConverter generate-app <output.png>
          IconConverter generate-project <output.png>
        """);
    return 1;
}

static int ParseTolerance(string[] args) =>
    args.Length > 3 && int.TryParse(args[3], out var value) ? value : 28;

static int StripBackground(string inputPath, string outputPath, int tolerance)
{
    using var source = new Bitmap(inputPath);
    using var result = RemoveEdgeConnectedBackground(source, tolerance);
    Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outputPath))!);
    result.Save(outputPath, ImageFormat.Png);
    Console.WriteLine($"Created {outputPath}");
    return 0;
}

static int WriteIco(string inputPath, string outputPath)
{
    using var source = new Bitmap(inputPath);
    var sizes = new[] { 16, 32, 48, 256 };
    Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outputPath))!);
    WritePngIco(outputPath, source, sizes);
    Console.WriteLine($"Created {outputPath}");
    return 0;
}

static int GenerateAppIcon(string outputPath)
{
    using var bitmap = new Bitmap(256, 256, PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(bitmap))
    {
        g.Clear(Color.Transparent);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;

        using var docBrush = new SolidBrush(Color.FromArgb(37, 99, 235));
        using var docPen = new Pen(Color.FromArgb(29, 78, 216), 4f);
        using var foldBrush = new SolidBrush(Color.FromArgb(59, 130, 246));
        using var linePen = new Pen(Color.White, 8f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        using var greenBrush = new SolidBrush(Color.FromArgb(22, 163, 74));
        using var greenPen = new Pen(Color.FromArgb(22, 163, 74), 8f) { StartCap = LineCap.Round, EndCap = LineCap.Round };

        var doc = new RectangleF(36, 28, 118, 150);
        g.FillRectangle(docBrush, doc);
        g.DrawRectangle(docPen, doc.X, doc.Y, doc.Width, doc.Height);
        g.FillPolygon(foldBrush, new[] { new PointF(118, 28), new PointF(154, 64), new PointF(118, 64) });
        g.DrawLine(linePen, 56, 78, 134, 78);
        g.DrawLine(linePen, 56, 104, 134, 104);
        g.DrawLine(linePen, 56, 130, 118, 130);

        g.FillEllipse(greenBrush, 118, 132, 56, 56);
        using var checkPen = new Pen(Color.White, 10f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawLine(checkPen, 132, 162, 146, 176);
        g.DrawLine(checkPen, 146, 176, 168, 148);

        using var gridPen = new Pen(Color.FromArgb(22, 163, 74), 6f);
        var grid = new RectangleF(176, 52, 56, 88);
        g.DrawRectangle(gridPen, grid.X, grid.Y, grid.Width, grid.Height);
        for (var i = 1; i < 3; i++)
        {
            g.DrawLine(gridPen, grid.Left, grid.Top + i * 29, grid.Right, grid.Top + i * 29);
            g.DrawLine(gridPen, grid.Left + 28, grid.Top, grid.Left + 28, grid.Bottom);
        }

        g.DrawLine(greenPen, 168, 160, 176, 132);
    }

    Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outputPath))!);
    bitmap.Save(outputPath, ImageFormat.Png);
    Console.WriteLine($"Created {outputPath}");
    return 0;
}

static int GenerateProjectIcon(string outputPath)
{
    using var bitmap = new Bitmap(256, 256, PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(bitmap))
    {
        g.Clear(Color.Transparent);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;

        using var tabBrush = new SolidBrush(Color.FromArgb(251, 191, 36));
        using var tabPen = new Pen(Color.FromArgb(217, 119, 6), 4f);
        using var bodyBrush = new SolidBrush(Color.White);
        using var bodyPen = new Pen(Color.FromArgb(203, 213, 225), 4f);
        using var stripeBrush = new SolidBrush(Color.FromArgb(37, 99, 235));
        using var textPen = new Pen(Color.FromArgb(148, 163, 184), 7f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        using var linkPen = new Pen(Color.FromArgb(13, 148, 136), 8f) { StartCap = LineCap.Round, EndCap = LineCap.Round, CustomEndCap = new AdjustableArrowCap(6, 6) };

        var tab = new RectangleF(48, 44, 72, 28);
        var body = new RectangleF(40, 64, 176, 148);
        g.FillRectangle(tabBrush, tab);
        g.DrawRectangle(tabPen, tab.X, tab.Y, tab.Width, tab.Height);
        g.FillRectangle(bodyBrush, body);
        g.DrawRectangle(bodyPen, body.X, body.Y, body.Width, body.Height);
        g.FillRectangle(stripeBrush, 40, 64, 18, 148);

        g.DrawLine(textPen, 72, 98, 190, 98);
        g.DrawLine(textPen, 72, 124, 190, 124);
        g.DrawLine(textPen, 72, 150, 170, 150);
        g.DrawLine(textPen, 72, 176, 150, 176);

        g.DrawLine(linkPen, 150, 176, 206, 206);
        g.FillEllipse(new SolidBrush(Color.FromArgb(13, 148, 136)), 198, 198, 18, 18);
    }

    Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outputPath))!);
    bitmap.Save(outputPath, ImageFormat.Png);
    Console.WriteLine($"Created {outputPath}");
    return 0;
}

static Bitmap RemoveEdgeConnectedBackground(Bitmap source, int tolerance)
{
    var width = source.Width;
    var height = source.Height;
    var result = new Bitmap(width, height, PixelFormat.Format32bppArgb);
    var visited = new bool[width, height];
    var queue = new Queue<Point>();

    void TryEnqueue(int x, int y)
    {
        if (x < 0 || y < 0 || x >= width || y >= height || visited[x, y])
            return;

        var pixel = source.GetPixel(x, y);
        if (pixel.A == 0 || !IsBackgroundColor(pixel, tolerance))
            return;

        visited[x, y] = true;
        queue.Enqueue(new Point(x, y));
    }

    for (var x = 0; x < width; x++)
    {
        TryEnqueue(x, 0);
        TryEnqueue(x, height - 1);
    }

    for (var y = 0; y < height; y++)
    {
        TryEnqueue(0, y);
        TryEnqueue(width - 1, y);
    }

    while (queue.Count > 0)
    {
        var point = queue.Dequeue();
        TryEnqueue(point.X - 1, point.Y);
        TryEnqueue(point.X + 1, point.Y);
        TryEnqueue(point.X, point.Y - 1);
        TryEnqueue(point.X, point.Y + 1);
    }

    for (var y = 0; y < height; y++)
    {
        for (var x = 0; x < width; x++)
        {
            var pixel = source.GetPixel(x, y);
            if (visited[x, y])
                result.SetPixel(x, y, Color.FromArgb(0, pixel));
            else
                result.SetPixel(x, y, pixel);
        }
    }

    return result;
}

static bool IsBackgroundColor(Color color, int tolerance)
{
    var reference = Color.FromArgb(255, 255, 255);
    return Math.Abs(color.R - reference.R) <= tolerance
        && Math.Abs(color.G - reference.G) <= tolerance
        && Math.Abs(color.B - reference.B) <= tolerance;
}

static void WritePngIco(string outputPath, Bitmap source, int[] sizes)
{
    var pngImages = sizes
        .Select(size => ResizeToPngBytes(source, size))
        .ToArray();

    using var stream = File.Create(outputPath);
    using var writer = new BinaryWriter(stream);

    writer.Write((short)0);
    writer.Write((short)1);
    writer.Write((short)pngImages.Length);

    var offset = 6 + 16 * pngImages.Length;
    for (var i = 0; i < pngImages.Length; i++)
    {
        var size = sizes[i];
        writer.Write((byte)(size >= 256 ? 0 : size));
        writer.Write((byte)(size >= 256 ? 0 : size));
        writer.Write((byte)0);
        writer.Write((byte)0);
        writer.Write((short)1);
        writer.Write((short)32);
        writer.Write(pngImages[i].Length);
        writer.Write(offset);
        offset += pngImages[i].Length;
    }

    foreach (var png in pngImages)
        writer.Write(png);
}

static byte[] ResizeToPngBytes(Bitmap source, int size)
{
    using var bitmap = new Bitmap(size, size, PixelFormat.Format32bppArgb);
    using (var g = Graphics.FromImage(bitmap))
    {
        g.Clear(Color.Transparent);
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.SmoothingMode = SmoothingMode.HighQuality;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;
        g.DrawImage(source, 0, 0, size, size);
    }

    using var stream = new MemoryStream();
    bitmap.Save(stream, ImageFormat.Png);
    return stream.ToArray();
}
