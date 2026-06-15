using System.Text;
using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Utils;

public static class CardTextHelper
{
    public static void ApplyStyleToLabel(Label label, CardTextStyle style, Font? previousOwnedFont = null)
    {
        var font = style.CreateFont();
        if (previousOwnedFont != null && !ReferenceEquals(previousOwnedFont, label.Font))
            previousOwnedFont.Dispose();

        label.Font = font;
        label.ForeColor = style.GetTextColor();

        var bg = style.GetBackgroundColor();
        label.BackColor = bg ?? Color.Transparent;
    }

    /// <summary>캔버스 카드 — 텍스트 배경은 투명(카드 바탕색이 비침).</summary>
    public static void ApplyStyleToCanvasLabel(Label label, CardTextStyle style, Font? previousOwnedFont = null)
    {
        var font = style.CreateFont();
        if (previousOwnedFont != null && !ReferenceEquals(previousOwnedFont, label.Font))
            previousOwnedFont.Dispose();

        label.Font = font;
        label.ForeColor = style.GetTextColor();
        // Caller sets label background to card color on canvas.
    }

    public static string ExtractPlainText(string? rtf, string? plainFallback)
    {
        if (!string.IsNullOrWhiteSpace(rtf) && rtf.TrimStart().StartsWith("{\\rtf", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                using var box = new RichTextBox { Rtf = rtf };
                return box.Text;
            }
            catch (ArgumentException)
            {
                /* fall through */
            }
        }

        return plainFallback ?? string.Empty;
    }

    public static string ColorToHex(Color color) => $"#{color.R:X2}{color.G:X2}{color.B:X2}";

    public static void InsertText(Control target, string text)
    {
        switch (target)
        {
            case RichTextBox rtb:
                var start = rtb.SelectionStart;
                rtb.SelectedText = text;
                rtb.SelectionStart = start + text.Length;
                rtb.Focus();
                break;
            case TextBox tb:
                var pos = tb.SelectionStart;
                tb.Text = tb.Text.Insert(pos, text);
                tb.SelectionStart = pos + text.Length;
                tb.Focus();
                break;
        }
    }

    public static FontStyle GetFontStyle(bool bold, bool italic, bool underline, bool strikeout)
    {
        var style = FontStyle.Regular;
        if (bold) style |= FontStyle.Bold;
        if (italic) style |= FontStyle.Italic;
        if (underline) style |= FontStyle.Underline;
        if (strikeout) style |= FontStyle.Strikeout;
        return style;
    }

    public static void ApplySelectionStyle(
        RichTextBox rtb,
        string? fontFamily,
        float? fontSize,
        Color? textColor,
        Color? backColor,
        bool? bold,
        bool? italic,
        bool? underline,
        bool? strikeout)
    {
        var start = rtb.SelectionStart;
        var length = rtb.SelectionLength;

        if (length == 0)
        {
            if (fontFamily != null) rtb.SelectionFont = new Font(fontFamily, rtb.SelectionFont?.Size ?? 9f, rtb.SelectionFont?.Style ?? FontStyle.Regular);
            if (fontSize.HasValue && rtb.SelectionFont != null)
                rtb.SelectionFont = new Font(rtb.SelectionFont.FontFamily, fontSize.Value, rtb.SelectionFont.Style);
            if (textColor.HasValue) rtb.SelectionColor = textColor.Value;
            if (backColor.HasValue) rtb.SelectionBackColor = backColor.Value;
            return;
        }

        rtb.Select(start, length);
        var current = rtb.SelectionFont ?? rtb.Font;
        var family = fontFamily ?? current.FontFamily.Name;
        var size = fontSize ?? current.Size;
        var style = current.Style;
        if (bold.HasValue) style = bold.Value ? style | FontStyle.Bold : style & ~FontStyle.Bold;
        if (italic.HasValue) style = italic.Value ? style | FontStyle.Italic : style & ~FontStyle.Italic;
        if (underline.HasValue) style = underline.Value ? style | FontStyle.Underline : style & ~FontStyle.Underline;
        if (strikeout.HasValue) style = strikeout.Value ? style | FontStyle.Strikeout : style & ~FontStyle.Strikeout;

        rtb.SelectionFont = new Font(family, size, style);
        if (textColor.HasValue) rtb.SelectionColor = textColor.Value;
        if (backColor.HasValue) rtb.SelectionBackColor = backColor.Value;
        rtb.Select(start + length, 0);
    }
}
