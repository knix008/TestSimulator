using System.Drawing.Drawing2D;
using System.Reflection;

namespace EasyMDV10;

/// <summary>
/// 툴바·문서 구조 트리용 마크다운 태그 아이콘.
/// </summary>
internal static class ToolbarIcons
{
    public const int HeadingCount = 6;

    private static ImageList? _headingImageList;
    private static ImageList? _toolbarImageList;
    private static Dictionary<string, Image>? _iconCache;

    /// <summary>문서 구조 트리 (H1~H6)</summary>
    public static ImageList HeadingImageList => _headingImageList ??= CreateHeadingImageList();

    /// <summary>툴바 전체 버튼</summary>
    public static ImageList ToolbarImageList => _toolbarImageList ??= CreateToolbarImageList();

    public static void ConfigureButton(
        ToolStripButton button,
        string iconKey,
        string text,
        string toolTip,
        Font? font = null,
        FontStyle fontStyle = FontStyle.Regular)
    {
        button.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        button.TextImageRelation = TextImageRelation.ImageBeforeText;
        button.Image = GetIcon(iconKey);
        button.Text = text;
        button.ToolTipText = toolTip;
        button.Padding = new Padding(4, 0, 6, 0);
        button.Margin = new Padding(1, 0, 1, 0);
        button.Font = font ?? new Font("Segoe UI", 9.25f, fontStyle);
        button.ForeColor = UiTheme.TextPrimary;
    }

    public static void ConfigureHeadingButton(
        ToolStripButton button,
        int levelIndex,
        string markdownPrefix,
        string title)
    {
        ConfigureButton(
            button,
            $"h{levelIndex + 1}",
            $"H{levelIndex + 1}",
            $"{title}  ({markdownPrefix.TrimEnd()} )",
            fontStyle: FontStyle.Bold);
        button.Image = HeadingImageList.Images[levelIndex];
    }

    public static int LevelToImageIndex(int headingLevel)
        => Math.Clamp(headingLevel - 1, 0, HeadingCount - 1);

    private static Image GetIcon(string key)
    {
        _iconCache ??= new Dictionary<string, Image>(StringComparer.OrdinalIgnoreCase);
        if (_iconCache.TryGetValue(key, out var cached))
            return cached;

        var icon = LoadEmbeddedPng(key) ?? CreateBuiltInIcon(key);
        _iconCache[key] = icon;
        return icon;
    }

    private static ImageList CreateHeadingImageList()
    {
        var il = new ImageList { ImageSize = new Size(20, 20), ColorDepth = ColorDepth.Depth32Bit };
        for (int i = 1; i <= HeadingCount; i++)
            il.Images.Add(GetIcon($"h{i}"));
        return il;
    }

    private static ImageList CreateToolbarImageList()
    {
        var il = new ImageList { ImageSize = new Size(20, 20), ColorDepth = ColorDepth.Depth32Bit };
        foreach (var key in AllIconKeys)
            il.Images.Add(key, GetIcon(key));
        return il;
    }

    private static IEnumerable<string> AllIconKeys =>
    [
        "sidebar", "h1", "h2", "h3", "h4", "h5", "h6",
        "bold", "italic", "strike", "code", "codeblock",
        "link", "image", "ul", "ol", "quote", "hr", "table"
    ];

    private static Image? LoadEmbeddedPng(string name)
    {
        string resourceName = $"EasyMDV10.Resources.Icons.{name}.png";
        var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName);
        return stream != null ? new Bitmap(stream) : null;
    }

    private static Image CreateBuiltInIcon(string key) => key.ToLowerInvariant() switch
    {
        "h1" => DrawLabelIcon("H1", accent: true),
        "h2" => DrawLabelIcon("H2", accent: true),
        "h3" => DrawLabelIcon("H3", accent: true),
        "h4" => DrawLabelIcon("H4"),
        "h5" => DrawLabelIcon("H5"),
        "h6" => DrawLabelIcon("H6"),
        "sidebar" => DrawSidebarIcon(),
        "bold" => DrawLetterIcon("B", FontStyle.Bold),
        "italic" => DrawLetterIcon("I", FontStyle.Italic),
        "strike" => DrawStrikeIcon(),
        "code" => DrawCodeIcon(inline: true),
        "codeblock" => DrawCodeIcon(inline: false),
        "link" => DrawLinkIcon(),
        "image" => DrawImageIcon(),
        "ul" => DrawListIcon(ordered: false),
        "ol" => DrawListIcon(ordered: true),
        "quote" => DrawQuoteIcon(),
        "hr" => DrawHrIcon(),
        "table" => DrawTableIcon(),
        _ => DrawLabelIcon(key, small: true)
    };

    private static Bitmap DrawIcon(Action<Graphics> draw)
    {
        var bmp = new Bitmap(20, 20, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        g.Clear(Color.Transparent);
        draw(g);
        return bmp;
    }

    private static Image DrawLabelIcon(string text, bool accent = false, bool small = false)
    {
        return DrawIcon(g =>
        {
            using var bg = new SolidBrush(accent ? Color.FromArgb(9, 105, 218) : Color.FromArgb(110, 118, 129));
            g.FillEllipse(bg, 1, 1, 18, 18);
            using var font = new Font("Segoe UI", small ? 6.5f : 7.5f, FontStyle.Bold);
            using var brush = new SolidBrush(Color.White);
            var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString(text, font, brush, new RectangleF(0, 0, 20, 20), sf);
        });
    }

    private static Image DrawLetterIcon(string letter, FontStyle style)
    {
        return DrawIcon(g =>
        {
            using var font = new Font("Segoe UI", 11f, style);
            using var brush = new SolidBrush(Color.FromArgb(31, 35, 40));
            var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString(letter, font, brush, new RectangleF(0, 0, 20, 20), sf);
        });
    }

    private static Image DrawStrikeIcon()
    {
        return DrawIcon(g =>
        {
            using var font = new Font("Segoe UI", 10f, FontStyle.Regular);
            using var brush = new SolidBrush(Color.FromArgb(31, 35, 40));
            var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
            g.DrawString("S", font, brush, new RectangleF(0, 0, 20, 20), sf);
            using var pen = new Pen(Color.FromArgb(220, 53, 69), 2f);
            g.DrawLine(pen, 4, 11, 16, 9);
        });
    }

    private static Image DrawCodeIcon(bool inline)
    {
        return DrawIcon(g =>
        {
            var rect = inline ? new Rectangle(4, 5, 12, 10) : new Rectangle(3, 3, 14, 14);
            using var pen = new Pen(Color.FromArgb(9, 105, 218), 1.5f);
            g.DrawRectangle(pen, rect);
            using var font = new Font("Consolas", inline ? 6f : 5.5f, FontStyle.Bold);
            using var brush = new SolidBrush(Color.FromArgb(9, 105, 218));
            g.DrawString(inline ? "</>" : "{ }", font, brush, rect,
                new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center });
        });
    }

    private static Image DrawLinkIcon()
    {
        return DrawIcon(g =>
        {
            using var pen = new Pen(Color.FromArgb(9, 105, 218), 2f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
            g.DrawArc(pen, 3, 6, 8, 8, 90, 200);
            g.DrawArc(pen, 9, 6, 8, 8, -90, 200);
        });
    }

    private static Image DrawImageIcon()
    {
        return DrawIcon(g =>
        {
            g.DrawRectangle(Pens.LightGray, 3, 5, 14, 10);
            using var brush = new SolidBrush(Color.FromArgb(9, 105, 218));
            var pts = new[] { new Point(3, 15), new Point(8, 9), new Point(12, 12), new Point(17, 5), new Point(17, 15) };
            g.FillPolygon(brush, pts);
            g.FillEllipse(Brushes.Gold, 13, 6, 3, 3);
        });
    }

    private static Image DrawListIcon(bool ordered)
    {
        return DrawIcon(g =>
        {
            using var brush = new SolidBrush(Color.FromArgb(31, 35, 40));
            if (ordered)
            {
                using var font = new Font("Segoe UI", 6.5f, FontStyle.Bold);
                g.DrawString("1", font, brush, 2, 3);
                g.DrawString("2", font, brush, 2, 8);
                g.DrawString("3", font, brush, 2, 13);
            }
            else
            {
                g.FillEllipse(brush, 3, 5, 3, 3);
                g.FillEllipse(brush, 3, 9, 3, 3);
                g.FillEllipse(brush, 3, 13, 3, 3);
            }
            using var pen = new Pen(Color.FromArgb(110, 118, 129), 1.5f);
            g.DrawLine(pen, 9, 6, 17, 6);
            g.DrawLine(pen, 9, 10, 17, 10);
            g.DrawLine(pen, 9, 14, 17, 14);
        });
    }

    private static Image DrawQuoteIcon()
    {
        return DrawIcon(g =>
        {
            using var brush = new SolidBrush(Color.FromArgb(9, 105, 218));
            g.FillRectangle(brush, 4, 4, 3, 12);
            using var font = new Font("Georgia", 11f, FontStyle.Bold);
            g.DrawString("\u201C", font, brush, 7, 2);
        });
    }

    private static Image DrawHrIcon()
    {
        return DrawIcon(g =>
        {
            using var pen = new Pen(Color.FromArgb(110, 118, 129), 2f);
            g.DrawLine(pen, 3, 10, 17, 10);
        });
    }

    private static Image DrawTableIcon()
    {
        return DrawIcon(g =>
        {
            using var pen = new Pen(Color.FromArgb(9, 105, 218), 1.5f);
            var r = new Rectangle(3, 4, 14, 12);
            g.DrawRectangle(pen, r);
            g.DrawLine(pen, 3, 9, 17, 9);
            g.DrawLine(pen, 9, 4, 9, 16);
        });
    }

    private static Image DrawSidebarIcon()
    {
        return DrawIcon(g =>
        {
            using var pen = new Pen(Color.FromArgb(31, 35, 40), 1.8f) { StartCap = LineCap.Round };
            g.DrawLine(pen, 4, 5, 16, 5);
            g.DrawLine(pen, 4, 10, 16, 10);
            g.DrawLine(pen, 4, 15, 16, 15);
            using var brush = new SolidBrush(Color.FromArgb(9, 105, 218));
            g.FillRectangle(brush, 3, 4, 3, 12);
        });
    }
}
