using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Text;
using System.Text.RegularExpressions;

static class Program
{
    static void Main()
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
        var iconPath = Path.Combine(root, "Assets", "MyAgileBoard.ico");
        var resxPath = Path.Combine(root, "MyAgileBoardWinV10", "Forms", "MyAgileForm.resx");

        Directory.CreateDirectory(Path.GetDirectoryName(iconPath)!);

        var sizes = new[] { 16, 32, 48, 64, 128, 256 };
        var bitmaps = sizes.Select(RenderKanbanIcon).ToArray();
        SaveMultiResolutionIcon(iconPath, bitmaps);
        UpdateResxIcon(resxPath, bitmaps[^1]);

        Console.WriteLine($"Generated: {iconPath}");
        Console.WriteLine($"Updated:   {resxPath}");
    }

    static Bitmap RenderKanbanIcon(int size)
    {
        var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.Clear(Color.Transparent);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;

        float s = size / 256f;
        int pad = Math.Max(1, (int)(18 * s));
        var bg = new Rectangle(pad, pad, size - pad * 2, size - pad * 2);
        int radius = Math.Max(2, (int)(52 * s));

        using (var path = RoundedRect(bg, radius))
        using (var brush = new LinearGradientBrush(
                   bg,
                   Color.FromArgb(255, 96, 165, 250),
                   Color.FromArgb(255, 37, 99, 235),
                   LinearGradientMode.ForwardDiagonal))
            g.FillPath(brush, path);

        if (size >= 32)
        {
            var gloss = new Rectangle(bg.X + (int)(6 * s), bg.Y + (int)(6 * s), bg.Width - (int)(12 * s), bg.Height / 2);
            using var glossPath = RoundedRect(gloss, Math.Max(2, radius - (int)(4 * s)));
            using var glossBrush = new LinearGradientBrush(
                gloss,
                Color.FromArgb(70, 255, 255, 255),
                Color.FromArgb(0, 255, 255, 255),
                LinearGradientMode.Vertical);
            g.FillPath(glossBrush, glossPath);
        }

        int cols = 3;
        int gap = Math.Max(1, (int)(10 * s));
        int colW = Math.Max(2, (bg.Width - gap * (cols + 1)) / cols);
        int colY = bg.Y + Math.Max(1, (int)(24 * s));
        int colH = bg.Height - Math.Max(2, (int)(48 * s));
        int[] cardsPerColumn = { 2, 1, 2 };

        for (int c = 0; c < cols; c++)
        {
            int x = bg.X + gap + c * (colW + gap);
            var colRect = new Rectangle(x, colY, colW, colH);

            if (size >= 24)
            {
                using var colPath = RoundedRect(colRect, Math.Max(1, (int)(8 * s)));
                using var colBrush = new SolidBrush(Color.FromArgb(45, 255, 255, 255));
                g.FillPath(colBrush, colPath);
            }

            int cardGap = Math.Max(1, (int)(7 * s));
            int count = cardsPerColumn[c];
            float cardHeight = (colH - cardGap * (count + 1)) / (float)count * 0.88f;
            cardHeight = Math.Max(cardHeight, 2 * s);

            for (int i = 0; i < count; i++)
            {
                float y = colY + cardGap + i * (cardHeight + cardGap);
                var card = new RectangleF(
                    x + 3 * s,
                    y,
                    colW - 6 * s,
                    cardHeight);
                bool accent = c == 2 && i == 0 && size >= 32;
                DrawCard(g, card, Math.Max(1, (int)(7 * s)), s, accent, size);
            }
        }

        return bmp;
    }

    static void DrawCard(Graphics g, RectangleF rect, int radius, float s, bool accent, int size)
    {
        if (rect.Width < 1 || rect.Height < 1) return;

        if (size >= 24)
        {
            var shadow = rect;
            shadow.Offset(0, Math.Max(1f, 2 * s));
            using var shadowPath = RoundedRect(shadow, radius);
            using var shadowBrush = new SolidBrush(Color.FromArgb(35, 15, 23, 42));
            g.FillPath(shadowBrush, shadowPath);
        }

        using var cardPath = RoundedRect(rect, radius);
        using (var cardBrush = new SolidBrush(Color.FromArgb(250, 255, 255, 255)))
            g.FillPath(cardBrush, cardPath);

        if (accent)
        {
            var accentRect = new RectangleF(rect.X, rect.Y + 2 * s, Math.Max(2f, 3.5f * s), rect.Height - 4 * s);
            using var accentPath = RoundedRect(accentRect, Math.Max(1, (int)(2 * s)));
            using var accentBrush = new SolidBrush(Color.FromArgb(255, 16, 185, 129));
            g.FillPath(accentBrush, accentPath);
        }
    }

    static GraphicsPath RoundedRect(RectangleF bounds, int radius)
    {
        int d = radius * 2;
        var path = new GraphicsPath();
        if (radius <= 0)
        {
            path.AddRectangle(bounds);
            return path;
        }

        path.AddArc(bounds.X, bounds.Y, d, d, 180, 90);
        path.AddArc(bounds.Right - d, bounds.Y, d, d, 270, 90);
        path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
        path.AddArc(bounds.X, bounds.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    static void SaveMultiResolutionIcon(string path, Bitmap[] bitmaps)
    {
        var ordered = bitmaps.OrderBy(b => b.Width).ToArray();
        var pngData = ordered.Select(SavePng).ToArray();

        using var fs = File.Create(path);
        using var bw = new BinaryWriter(fs);
        bw.Write((ushort)0);
        bw.Write((ushort)1);
        bw.Write((ushort)ordered.Length);

        var offset = 6 + 16 * ordered.Length;
        for (int i = 0; i < ordered.Length; i++)
        {
            int w = ordered[i].Width >= 256 ? 0 : ordered[i].Width;
            int h = ordered[i].Height >= 256 ? 0 : ordered[i].Height;
            bw.Write((byte)w);
            bw.Write((byte)h);
            bw.Write((byte)0);
            bw.Write((byte)0);
            bw.Write((ushort)1);
            bw.Write((ushort)32);
            bw.Write((uint)pngData[i].Length);
            bw.Write((uint)offset);
            offset += pngData[i].Length;
        }

        foreach (var data in pngData)
            bw.Write(data);
    }

    static byte[] SavePng(Bitmap bitmap)
    {
        using var ms = new MemoryStream();
        bitmap.Save(ms, ImageFormat.Png);
        return ms.ToArray();
    }

    static void UpdateResxIcon(string resxPath, Bitmap icon256)
    {
        using var ms = new MemoryStream();
        using var icon = Icon.FromHandle(icon256.GetHicon());
        icon.Save(ms);
        var base64 = Convert.ToBase64String(ms.ToArray());

        var lines = new List<string>();
        for (int i = 0; i < base64.Length; i += 76)
            lines.Add("        " + base64.Substring(i, Math.Min(76, base64.Length - i)));

        var valueBlock = string.Join(Environment.NewLine, lines);
        var text = File.ReadAllText(resxPath, Encoding.UTF8);
        var pattern = new Regex(
            @"<data name=""\$this\.Icon"" type=""System\.Drawing\.Icon, System\.Drawing"" mimetype=""application/x-microsoft\.net\.object\.bytearray\.base64"">\s*<value>\s*[\s\S]*?\s*</value>\s*</data>",
            RegexOptions.Singleline);
        var replacement =
            "<data name=\"$this.Icon\" type=\"System.Drawing.Icon, System.Drawing\" mimetype=\"application/x-microsoft.net.object.bytearray.base64\">" +
            Environment.NewLine +
            "    <value>" + Environment.NewLine +
            valueBlock + Environment.NewLine +
            "    </value>" + Environment.NewLine +
            "  </data>";

        if (!pattern.IsMatch(text))
            throw new InvalidOperationException("Could not find $this.Icon entry in resx.");

        File.WriteAllText(resxPath, pattern.Replace(text, replacement), new UTF8Encoding(encoderShouldEmitUTF8Identifier: true));
    }
}
