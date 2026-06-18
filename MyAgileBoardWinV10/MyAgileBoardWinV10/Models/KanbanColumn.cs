namespace MyAgileBoardWinV10.Models;

public class KanbanColumn
{
    public const string DefaultCanvasColorHex = "#FCFCFA";

    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = string.Empty;
    public string HeaderColorHex { get; set; } = "#4472C4";
    public string CanvasColorHex { get; set; } = DefaultCanvasColorHex;
    public bool IsCompletionColumn { get; set; } = false;
    /// <summary>컬럼 간 상대 너비 비율(가중치). 실제 픽셀 너비는 보드 크기에 따라 계산됩니다.</summary>
    public int ColumnWidth { get; set; } = 250;
    public List<KanbanCard> Cards { get; set; } = new();

    public string TitleFontFamily { get; set; } = "Segoe UI";
    public float TitleFontSize { get; set; } = 9.5f;
    public bool TitleFontBold { get; set; } = true;
    public bool TitleFontItalic { get; set; } = false;
    /// <summary>비어 있으면 헤더 배경색에 맞춰 자동 선택.</summary>
    public string? TitleColorHex { get; set; }

    public Font CreateTitleFont()
    {
        var style = FontStyle.Regular;
        if (TitleFontBold) style |= FontStyle.Bold;
        if (TitleFontItalic) style |= FontStyle.Italic;

        var familyName = string.IsNullOrWhiteSpace(TitleFontFamily) ? "Segoe UI" : TitleFontFamily;
        var size = TitleFontSize > 0 ? TitleFontSize : 9.5f;

        try { return new Font(familyName, size, style); }
        catch (ArgumentException) { return new Font("Segoe UI", size, style); }
    }

    public Color ResolveTitleColor(Color headerBackground)
    {
        if (!string.IsNullOrWhiteSpace(TitleColorHex))
        {
            try { return ColorTranslator.FromHtml(TitleColorHex); }
            catch (ArgumentException) { /* auto */ }
        }

        double lum = (0.299 * headerBackground.R + 0.587 * headerBackground.G + 0.114 * headerBackground.B) / 255;
        return lum < 0.5 ? Color.White : Color.Black;
    }

    public Color GetCanvasColor()
    {
        if (string.IsNullOrWhiteSpace(CanvasColorHex))
            return Color.FromArgb(252, 252, 250);

        try { return ColorTranslator.FromHtml(CanvasColorHex); }
        catch (ArgumentException) { return Color.FromArgb(252, 252, 250); }
    }

    public string GetTitleFontDisplayName()
    {
        var style = TitleFontBold && TitleFontItalic ? "Bold Italic"
                  : TitleFontBold ? "Bold"
                  : TitleFontItalic ? "Italic"
                  : "Regular";
        return $"{TitleFontFamily}, {TitleFontSize:0.#}pt, {style}";
    }
}
