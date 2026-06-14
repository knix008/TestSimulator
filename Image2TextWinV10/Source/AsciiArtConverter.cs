using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace Image2TextWin;

public class ConversionOptions
{
    public int Width { get; set; } = 120;
    public int Height { get; set; } = 60;
    public bool AutoHeight { get; set; } = true;
    public double AspectRatio { get; set; } = 0.45;
    public string CharSet { get; set; } = "Standard";
    public string CustomChars { get; set; } = "@#*+:. ";
    public bool Invert { get; set; } = false;
    public bool EdgeDetect { get; set; } = false;
    public int Contrast { get; set; } = 0;
    public int Brightness { get; set; } = 0;
    public bool ColorOutput { get; set; } = false;
}

public class AsciiArtResult
{
    public string Text { get; set; } = "";
    public List<(int Row, int Col, Color Color)>? ColorData { get; set; }
    public int Rows { get; set; }
    public int Cols { get; set; }
}

public static class AsciiArtConverter
{
    private static readonly string DetailedChars =
        "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,\"^`'. ";
    private static readonly string StandardChars = "@#S%?*+;:,. ";
    private static readonly string SimpleChars = "@#*. ";
    private static readonly string BlockChars = "█▓▒░ ";

    public static AsciiArtResult Convert(Bitmap source, ConversionOptions options, IProgress<int>? progress = null)
    {
        string chars = GetCharSet(options);

        int cols = Math.Max(10, options.Width);
        int rows;
        if (options.AutoHeight)
        {
            double ratio = (double)source.Height / source.Width;
            rows = Math.Max(5, (int)(cols * ratio * options.AspectRatio));
        }
        else
        {
            rows = Math.Max(5, options.Height);
        }

        // 이미지를 목표 크기로 리샘플링
        using var resized = new Bitmap(source, new Size(cols, rows));
        ApplyAdjustments(resized, options.Contrast, options.Brightness);

        var sb = new System.Text.StringBuilder();
        List<(int, int, Color)>? colorData = options.ColorOutput ? new() : null;

        for (int r = 0; r < rows; r++)
        {
            for (int c = 0; c < cols; c++)
            {
                var pixel = resized.GetPixel(c, r);
                double gray = 0.299 * pixel.R + 0.587 * pixel.G + 0.114 * pixel.B;

                if (options.EdgeDetect)
                    gray = ApplyEdge(resized, c, r, gray);

                double normalized = gray / 255.0;
                if (options.Invert) normalized = 1.0 - normalized;

                int idx = (int)(normalized * (chars.Length - 1));
                idx = Math.Clamp(idx, 0, chars.Length - 1);

                char ch = chars[idx];
                sb.Append(ch);

                if (colorData != null)
                    colorData.Add((r, c, pixel));
            }
            if (r < rows - 1) sb.AppendLine();
            progress?.Report((r + 1) * 100 / rows);
        }

        return new AsciiArtResult
        {
            Text = sb.ToString(),
            ColorData = colorData,
            Rows = rows,
            Cols = cols
        };
    }

    private static string GetCharSet(ConversionOptions options) => options.CharSet switch
    {
        "Detailed" => DetailedChars,
        "Standard" => StandardChars,
        "Simple" => SimpleChars,
        "Block" => BlockChars,
        "Custom" => string.IsNullOrEmpty(options.CustomChars) ? StandardChars : options.CustomChars,
        _ => StandardChars
    };

    private static void ApplyAdjustments(Bitmap bmp, int contrast, int brightness)
    {
        if (contrast == 0 && brightness == 0) return;

        float c = 1.0f + contrast / 100.0f;
        float b = brightness / 255.0f;

        var cm = new ColorMatrix(new float[][]
        {
            new float[] { c, 0, 0, 0, 0 },
            new float[] { 0, c, 0, 0, 0 },
            new float[] { 0, 0, c, 0, 0 },
            new float[] { 0, 0, 0, 1, 0 },
            new float[] { b, b, b, 0, 1 }
        });

        using var g = Graphics.FromImage(bmp);
        using var attrs = new ImageAttributes();
        attrs.SetColorMatrix(cm);
        g.DrawImage(bmp, new Rectangle(0, 0, bmp.Width, bmp.Height),
            0, 0, bmp.Width, bmp.Height, GraphicsUnit.Pixel, attrs);
    }

    private static double ApplyEdge(Bitmap bmp, int x, int y, double center)
    {
        double sum = 0;
        int count = 0;
        for (int dy = -1; dy <= 1; dy++)
        {
            for (int dx = -1; dx <= 1; dx++)
            {
                int nx = Math.Clamp(x + dx, 0, bmp.Width - 1);
                int ny = Math.Clamp(y + dy, 0, bmp.Height - 1);
                var p = bmp.GetPixel(nx, ny);
                sum += 0.299 * p.R + 0.587 * p.G + 0.114 * p.B;
                count++;
            }
        }
        double avg = sum / count;
        double edge = Math.Abs(center - avg) * 3;
        return Math.Clamp(center + edge, 0, 255);
    }

    public static Bitmap RenderToImage(string asciiText, Font font, Color foreColor, Color backColor)
    {
        var lines = asciiText.Split('\n')
            .Select(l => l.TrimEnd('\r'))
            .ToArray();
        if (lines.Length == 0) return new Bitmap(1, 1);

        using var tmp = new Bitmap(1, 1);
        using var gtmp = Graphics.FromImage(tmp);
        var lineSize = gtmp.MeasureString("W", font);
        float charW = lineSize.Width;
        float charH = lineSize.Height;

        int maxCols = lines.Max(l => l.Length);
        int imgW = (int)(charW * maxCols) + 4;
        int imgH = (int)(charH * lines.Length) + 4;

        var bmp = new Bitmap(imgW, imgH);
        using var g = Graphics.FromImage(bmp);
        g.Clear(backColor);
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.SingleBitPerPixelGridFit;

        using var brush = new SolidBrush(foreColor);
        using var sf = new StringFormat(StringFormat.GenericTypographic)
        {
            Alignment = StringAlignment.Center,
            LineAlignment = StringAlignment.Near,
            FormatFlags = StringFormatFlags.MeasureTrailingSpaces
        };

        float startY = (imgH - charH * lines.Length) / 2f;
        for (int i = 0; i < lines.Length; i++)
        {
            if (lines[i].Length == 0) continue;
            var rect = new RectangleF(0, startY + i * charH, imgW, charH);
            g.DrawString(lines[i], font, brush, rect, sf);
        }

        return bmp;
    }
}
