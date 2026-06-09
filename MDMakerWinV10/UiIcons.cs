using System.Drawing.Drawing2D;

namespace MDMakerWinV10;

public enum UiIconKind
{
    Folder,
    Save,
    Refresh,
    MoveUp,
    MoveDown,
    Generate,
    Preview,
    Settings,
    ExportHtml,
    ExportWord,
    ExportPdf,
    Renumber,
    Document,
    List,
    Merge,
    Ok,
    Cancel,
}

/// <summary>
/// assets/icons 디렉터리의 PNG 아이콘을 로드합니다.
/// </summary>
public static class UiIcons
{
    public const int DefaultSize = 18;

    static readonly string IconsDir = Path.Combine(AppContext.BaseDirectory, "assets", "icons");

    static readonly Dictionary<UiIconKind, string> FileNames = new()
    {
        [UiIconKind.Folder]     = "folder.png",
        [UiIconKind.Save]       = "save.png",
        [UiIconKind.Refresh]    = "refresh.png",
        [UiIconKind.MoveUp]     = "move-up.png",
        [UiIconKind.MoveDown]   = "move-down.png",
        [UiIconKind.Generate]   = "generate.png",
        [UiIconKind.Preview]    = "preview.png",
        [UiIconKind.Settings]   = "settings.png",
        [UiIconKind.ExportHtml] = "export-html.png",
        [UiIconKind.ExportWord] = "export-word.png",
        [UiIconKind.ExportPdf]  = "export-pdf.png",
        [UiIconKind.Renumber]   = "renumber.png",
        [UiIconKind.Document]   = "document.png",
        [UiIconKind.List]       = "list.png",
        [UiIconKind.Merge]      = "merge.png",
        [UiIconKind.Ok]         = "ok.png",
        [UiIconKind.Cancel]     = "cancel.png",
    };

    static readonly Dictionary<(UiIconKind Kind, int Size), Image> Cache = new();

    public static Image Get(UiIconKind kind, int size = DefaultSize, bool colorful = true)
    {
        var key = (kind, size);
        if (Cache.TryGetValue(key, out var cached))
            return cached;

        var image = Load(kind, size) ?? Load(UiIconKind.Document, size) ?? Blank(size);
        Cache[key] = image;
        return image;
    }

    static Image? Load(UiIconKind kind, int size)
    {
        if (!FileNames.TryGetValue(kind, out var fileName))
            return null;

        var path = Path.Combine(IconsDir, fileName);
        if (!File.Exists(path))
            return null;

        using var src = new Bitmap(path);
        return Normalize(src, size);
    }

    // 투명 여백을 제거해 광학 중심을 맞추고, 텍스트 기준선에 맞게 살짝 위로 올립니다.
    static Bitmap Normalize(Bitmap src, int size)
    {
        var bounds = GetContentBounds(src);
        if (bounds.IsEmpty)
            return Blank(size);

        var output = new Bitmap(size, size);
        using var g = Graphics.FromImage(output);
        g.Clear(Color.Transparent);
        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;

        const float inset = 0.9f;
        float scale = Math.Min(size * inset / bounds.Width, size * inset / bounds.Height);
        int drawW = Math.Max(1, (int)Math.Round(bounds.Width * scale));
        int drawH = Math.Max(1, (int)Math.Round(bounds.Height * scale));
        int textNudge = size <= 20 ? -2 : -1;
        int x = (size - drawW) / 2;
        int y = (size - drawH) / 2 + textNudge;
        g.DrawImage(src, new Rectangle(x, y, drawW, drawH), bounds, GraphicsUnit.Pixel);
        return output;
    }

    static Rectangle GetContentBounds(Bitmap bmp)
    {
        int minX = bmp.Width, minY = bmp.Height, maxX = -1, maxY = -1;
        for (int y = 0; y < bmp.Height; y++)
        {
            for (int x = 0; x < bmp.Width; x++)
            {
                if (bmp.GetPixel(x, y).A <= 16) continue;
                minX = Math.Min(minX, x);
                minY = Math.Min(minY, y);
                maxX = Math.Max(maxX, x);
                maxY = Math.Max(maxY, y);
            }
        }

        return maxX < minX ? Rectangle.Empty : Rectangle.FromLTRB(minX, minY, maxX + 1, maxY + 1);
    }

    static Bitmap Blank(int size)
    {
        var bmp = new Bitmap(size, size);
        bmp.MakeTransparent();
        return bmp;
    }
}
