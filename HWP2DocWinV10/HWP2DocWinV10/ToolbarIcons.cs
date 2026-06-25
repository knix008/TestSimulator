using System.Drawing.Drawing2D;
using System.Drawing.Text;

namespace HWP2DocWinV10;

/// <summary>
/// 메뉴·툴바 명령 아이콘 (Assets/Icons PNG 또는 내장 렌더링).
/// </summary>
internal static class ToolbarIcons
{
    public const int IconSize = 20;

    private static readonly Dictionary<string, Image> Cache = new(StringComparer.OrdinalIgnoreCase);

    public static void ApplyCommandIcons(
        ToolStripMenuItem fileMenu,
        ToolStripMenuItem infoMenu,
        ToolStripMenuItem viewMenu,
        ToolStripMenuItem openMenu,
        ToolStripMenuItem convertMenu,
        ToolStripMenuItem exportMarkdownMenu,
        ToolStripMenuItem exportWordMenu,
        ToolStripMenuItem exportPdfMenu,
        ToolStripMenuItem exitMenu,
        ToolStripMenuItem programInfoMenu,
        ToolStripMenuItem structureVisibleMenu,
        ToolStripMenuItem structurePositionMenu,
        ToolStripMenuItem structureLeftMenu,
        ToolStripMenuItem structureRightMenu,
        ToolStripMenuItem fontSizeMenu,
        ToolStripButton btnOpen,
        ToolStripButton btnConvert,
        ToolStripButton btnExportMarkdown,
        ToolStripButton btnExportWord,
        ToolStripButton btnExportPdf,
        ToolStripButton btnProgramInfo)
    {
        ConfigureMenuItem(fileMenu, "file");
        ConfigureMenuItem(infoMenu, "about");
        ConfigureMenuItem(viewMenu, "view");
        ConfigureMenuItem(openMenu, "open");
        ConfigureMenuItem(convertMenu, "convert");
        ConfigureMenuItem(exportMarkdownMenu, "markdown");
        ConfigureMenuItem(exportWordMenu, "word");
        ConfigureMenuItem(exportPdfMenu, "pdf");
        ConfigureMenuItem(exitMenu, "exit");
        ConfigureMenuItem(programInfoMenu, "about");
        ConfigureMenuItem(structureVisibleMenu, "structure");
        ConfigureMenuItem(structurePositionMenu, "structure");
        ConfigureMenuItem(structureLeftMenu, "structure-left");
        ConfigureMenuItem(structureRightMenu, "structure-right");
        ConfigureMenuItem(fontSizeMenu, "fontsize");

        foreach (ToolStripItem item in fontSizeMenu.DropDownItems)
        {
            if (item is ToolStripMenuItem sizeMenuItem)
                ConfigureMenuItem(sizeMenuItem, "fontsize");
        }

        ConfigureToolbarButton(btnOpen, "open", "열기", "HWP/HWPX 파일 열기");
        ConfigureToolbarButton(btnConvert, "convert", "변환", "문서를 Markdown으로 변환");
        ConfigureToolbarButton(btnExportMarkdown, "markdown", "Markdown", "Markdown 파일로 내보내기");
        ConfigureToolbarButton(btnExportWord, "word", "Word", "Word 문서로 내보내기");
        ConfigureToolbarButton(btnExportPdf, "pdf", "PDF", "PDF 파일로 내보내기");
        ConfigureToolbarButton(btnProgramInfo, "about", "정보", "프로그램 정보");
    }

    public static void ConfigureMenuItem(ToolStripMenuItem item, string key)
    {
        item.Image = GetIcon(key);
        item.ImageScaling = ToolStripItemImageScaling.None;
    }

    public static Image GetIcon(string key)
    {
        if (Cache.TryGetValue(key, out Image? cached))
            return cached;

        Image icon = LoadIconFile(key) ?? CreateBuiltInIcon(key);
        Cache[key] = icon;
        return icon;
    }

    public static void ExportAll(string directory)
    {
        Directory.CreateDirectory(directory);
        foreach (string key in AllIconKeys)
        {
            using Bitmap bitmap = RenderIcon(key);
            bitmap.Save(Path.Combine(directory, $"{key}.png"), System.Drawing.Imaging.ImageFormat.Png);
        }
    }

    private static IEnumerable<string> AllIconKeys =>
    [
        "file", "open", "convert", "markdown", "word", "pdf", "exit", "help", "about",
        "view", "structure", "structure-left", "structure-right", "fontsize"
    ];

    private static void ConfigureToolbarButton(
        ToolStripButton button,
        string key,
        string text,
        string toolTip)
    {
        button.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        button.TextImageRelation = TextImageRelation.ImageBeforeText;
        button.Image = GetIcon(key);
        button.Text = text;
        button.ToolTipText = toolTip;
        button.ImageScaling = ToolStripItemImageScaling.None;
        button.ImageTransparentColor = Color.Magenta;
    }

    private static Image? LoadIconFile(string key)
    {
        string path = Path.Combine(AppContext.BaseDirectory, "Assets", "Icons", $"{key}.png");
        if (!File.Exists(path))
            return null;

        using var stream = File.OpenRead(path);
        return new Bitmap(stream);
    }

    private static Bitmap CreateBuiltInIcon(string key)
    {
        return RenderIcon(key);
    }

    internal static Bitmap RenderIcon(string key)
    {
        return key.ToLowerInvariant() switch
        {
            "file" => DrawFileIcon(),
            "open" => DrawOpenIcon(),
            "convert" => DrawConvertIcon(),
            "markdown" => DrawMarkdownIcon(),
            "word" => DrawWordIcon(),
            "pdf" => DrawPdfIcon(),
            "exit" => DrawExitIcon(),
            "help" => DrawHelpIcon(),
            "about" => DrawAboutIcon(),
            "view" => DrawViewIcon(),
            "structure" => DrawStructureIcon(),
            "structure-left" => DrawStructureLeftIcon(),
            "structure-right" => DrawStructureRightIcon(),
            "fontsize" => DrawFontSizeIcon(),
            _ => DrawAboutIcon()
        };
    }

    private static Bitmap DrawIcon(Action<Graphics> draw)
    {
        var bitmap = new Bitmap(IconSize, IconSize, System.Drawing.Imaging.PixelFormat.Format32bppArgb);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        graphics.Clear(Color.Transparent);
        draw(graphics);
        return bitmap;
    }

    private static Bitmap DrawFileIcon() => DrawIcon(g =>
    {
        using var body = new SolidBrush(Color.FromArgb(37, 99, 235));
        using var tab = new SolidBrush(Color.FromArgb(29, 78, 216));
        using var pen = new Pen(Color.FromArgb(30, 64, 175), 1.2f);
        PointF[] folder =
        [
            new(2, 6), new(8, 6), new(10, 8), new(18, 8),
            new(18, 17), new(2, 17)
        ];
        g.FillPolygon(body, folder);
        g.FillPolygon(tab, [new(2, 6), new(8, 6), new(10, 8), new(2, 8)]);
        g.DrawPolygon(pen, folder);
    });

    private static Bitmap DrawOpenIcon() => DrawIcon(g =>
    {
        using var page = new SolidBrush(Color.FromArgb(248, 250, 252));
        using var pen = new Pen(Color.FromArgb(71, 85, 105), 1.2f);
        g.FillRectangle(page, 4, 3, 11, 14);
        g.DrawRectangle(pen, 4, 3, 11, 14);
        g.DrawLines(pen, [new Point(11, 3), new Point(15, 3), new Point(15, 7)]);

        using var arrow = new Pen(Color.FromArgb(37, 99, 235), 2f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawLine(arrow, 2, 12, 6, 12);
        g.DrawLine(arrow, 4, 10, 2, 12);
        g.DrawLine(arrow, 4, 14, 2, 12);
    });

    private static Bitmap DrawConvertIcon() => DrawIcon(g =>
    {
        using var pen = new Pen(Color.FromArgb(13, 148, 136), 2f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round
        };
        g.DrawArc(pen, 3, 3, 8, 8, 135, 200);
        g.DrawArc(pen, 9, 9, 8, 8, -45, 200);

        using var head = new SolidBrush(Color.FromArgb(13, 148, 136));
        g.FillPolygon(head, [new Point(10, 3), new Point(13, 6), new Point(7, 6)]);
        g.FillPolygon(head, [new Point(10, 17), new Point(13, 14), new Point(7, 14)]);
    });

    private static Bitmap DrawMarkdownIcon() => DrawIcon(g =>
    {
        using var card = new SolidBrush(Color.FromArgb(16, 185, 129));
        using var path = CreateRoundedRect(3, 2, 14, 16, 3);
        g.FillPath(card, path);
        using var hashPen = new Pen(Color.White, 1.8f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawLine(hashPen, 7, 6, 7, 10);
        g.DrawLine(hashPen, 10, 6, 10, 10);
        g.DrawLine(hashPen, 6, 7, 11, 7);
        g.DrawLine(hashPen, 6, 9, 11, 9);
        using var font = new Font("Segoe UI", 5.5f, FontStyle.Bold);
        using var text = new SolidBrush(Color.White);
        g.DrawString("MD", font, text, new RectangleF(3, 11, 14, 6),
            new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center });
    });

    private static Bitmap DrawWordIcon() => DrawIcon(g =>
    {
        using var page = new SolidBrush(Color.FromArgb(239, 246, 255));
        using var pen = new Pen(Color.FromArgb(37, 99, 235), 1.2f);
        g.FillRectangle(page, 4, 2, 12, 16);
        g.DrawRectangle(pen, 4, 2, 12, 16);
        using var font = new Font("Segoe UI", 9f, FontStyle.Bold);
        using var brush = new SolidBrush(Color.FromArgb(37, 99, 235));
        g.DrawString("W", font, brush, new RectangleF(4, 1, 12, 16),
            new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center });
    });

    private static Bitmap DrawPdfIcon() => DrawIcon(g =>
    {
        using var page = new SolidBrush(Color.FromArgb(254, 242, 242));
        using var pen = new Pen(Color.FromArgb(220, 38, 38), 1.2f);
        g.FillRectangle(page, 4, 2, 12, 16);
        g.DrawRectangle(pen, 4, 2, 12, 16);
        using var font = new Font("Segoe UI", 5.5f, FontStyle.Bold);
        using var brush = new SolidBrush(Color.FromArgb(220, 38, 38));
        g.DrawString("PDF", font, brush, new RectangleF(4, 2, 12, 16),
            new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center });
    });

    private static Bitmap DrawExitIcon() => DrawIcon(g =>
    {
        using var pen = new Pen(Color.FromArgb(239, 68, 68), 2f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawRectangle(pen, 4, 4, 12, 12);
        g.DrawLine(pen, 8, 7, 8, 13);
        g.DrawLine(pen, 6, 9, 8, 7);
        g.DrawLine(pen, 10, 9, 8, 7);
    });

    private static Bitmap DrawHelpIcon() => DrawIcon(g =>
    {
        using var circle = new SolidBrush(Color.FromArgb(59, 130, 246));
        g.FillEllipse(circle, 2, 2, 16, 16);
        using var font = new Font("Segoe UI", 10f, FontStyle.Bold);
        using var brush = new SolidBrush(Color.White);
        g.DrawString("?", font, brush, new RectangleF(0, -1, 20, 20),
            new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center });
    });

    private static Bitmap DrawAboutIcon() => DrawIcon(g =>
    {
        using var circle = new SolidBrush(Color.FromArgb(99, 102, 241));
        g.FillEllipse(circle, 2, 2, 16, 16);
        using var font = new Font("Segoe UI", 10f, FontStyle.Bold);
        using var brush = new SolidBrush(Color.White);
        g.DrawString("i", font, brush, new RectangleF(0, -1, 20, 20),
            new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center });
    });

    private static Bitmap DrawViewIcon() => DrawIcon(g =>
    {
        using var pen = new Pen(Color.FromArgb(37, 99, 235), 1.6f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawEllipse(pen, 4, 5, 12, 8);
        g.FillEllipse(new SolidBrush(Color.FromArgb(37, 99, 235)), 9, 8, 3, 3);
    });

    private static Bitmap DrawStructureIcon() => DrawIcon(g =>
    {
        using var pen = new Pen(Color.FromArgb(71, 85, 105), 1.4f) { StartCap = LineCap.Round, EndCap = LineCap.Round };
        g.DrawLine(pen, 5, 4, 5, 16);
        g.DrawLine(pen, 5, 6, 14, 6);
        g.DrawLine(pen, 5, 10, 12, 10);
        g.DrawLine(pen, 5, 14, 13, 14);
        using var node = new SolidBrush(Color.FromArgb(13, 148, 136));
        g.FillEllipse(node, 3, 5, 4, 4);
        g.FillEllipse(node, 3, 9, 4, 4);
        g.FillEllipse(node, 3, 13, 4, 4);
    });

    private static Bitmap DrawStructureLeftIcon() => DrawIcon(g =>
    {
        using var left = new SolidBrush(Color.FromArgb(13, 148, 136));
        using var right = new SolidBrush(Color.FromArgb(226, 232, 240));
        using var pen = new Pen(Color.FromArgb(71, 85, 105), 1.2f);
        g.FillRectangle(left, 3, 4, 6, 12);
        g.FillRectangle(right, 9, 4, 8, 12);
        g.DrawRectangle(pen, 3, 4, 14, 12);
        g.DrawLine(pen, 9, 4, 9, 16);
    });

    private static Bitmap DrawStructureRightIcon() => DrawIcon(g =>
    {
        using var left = new SolidBrush(Color.FromArgb(226, 232, 240));
        using var right = new SolidBrush(Color.FromArgb(13, 148, 136));
        using var pen = new Pen(Color.FromArgb(71, 85, 105), 1.2f);
        g.FillRectangle(left, 3, 4, 8, 12);
        g.FillRectangle(right, 11, 4, 6, 12);
        g.DrawRectangle(pen, 3, 4, 14, 12);
        g.DrawLine(pen, 11, 4, 11, 16);
    });

    private static Bitmap DrawFontSizeIcon() => DrawIcon(g =>
    {
        using var largeFont = new Font("Segoe UI", 9f, FontStyle.Bold);
        using var smallFont = new Font("Segoe UI", 6f, FontStyle.Bold);
        using var brush = new SolidBrush(Color.FromArgb(37, 99, 235));
        g.DrawString("A", largeFont, brush, new PointF(3, 2));
        g.DrawString("a", smallFont, brush, new PointF(11, 9));
    });

    private static GraphicsPath CreateRoundedRect(float x, float y, float w, float h, float radius)
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
}
