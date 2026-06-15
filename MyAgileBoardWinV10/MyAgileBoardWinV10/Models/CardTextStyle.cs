namespace MyAgileBoardWinV10.Models;

public class CardTextStyle
{
    public string FontFamily { get; set; } = "Segoe UI";
    public float FontSize { get; set; } = 9f;
    public string ColorHex { get; set; } = "#000000";
    public string? BackgroundColorHex { get; set; }
    public bool Bold { get; set; } = true;
    public bool Italic { get; set; }
    public bool Underline { get; set; }
    public bool Strikeout { get; set; }

    public CardTextStyle Clone() => new()
    {
        FontFamily = FontFamily,
        FontSize = FontSize,
        ColorHex = ColorHex,
        BackgroundColorHex = BackgroundColorHex,
        Bold = Bold,
        Italic = Italic,
        Underline = Underline,
        Strikeout = Strikeout
    };

    public Font CreateFont()
    {
        var style = FontStyle.Regular;
        if (Bold) style |= FontStyle.Bold;
        if (Italic) style |= FontStyle.Italic;
        if (Underline) style |= FontStyle.Underline;
        if (Strikeout) style |= FontStyle.Strikeout;

        var family = string.IsNullOrWhiteSpace(FontFamily) ? "Segoe UI" : FontFamily;
        var size = FontSize > 0 ? FontSize : 9f;
        try { return new Font(family, size, style); }
        catch (ArgumentException) { return new Font("Segoe UI", size, style); }
    }

    public Color GetTextColor()
    {
        try { return ColorTranslator.FromHtml(ColorHex); }
        catch (ArgumentException) { return Color.Black; }
    }

    public Color? GetBackgroundColor()
    {
        if (string.IsNullOrWhiteSpace(BackgroundColorHex)) return null;
        try { return ColorTranslator.FromHtml(BackgroundColorHex); }
        catch (ArgumentException) { return null; }
    }
}
