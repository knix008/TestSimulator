namespace MemoPadV10;

internal static class RichTextFormatting
{
    /// <summary>
    /// 선택 영역(또는 삽입 위치) 또는 전체 문서에 대해 글꼴 스타일(굵게·기울임·밑줄·취소선 등)을 토글합니다.
    /// </summary>
    public static void ToggleFontStyle(RichTextBox rtb, FontStyle style, bool applyToWholeDocument)
    {
        int start = rtb.SelectionStart;
        int len = rtb.SelectionLength;

        if (applyToWholeDocument)
        {
            rtb.SelectAll();
        }

        try
        {
            if (!applyToWholeDocument && rtb.SelectionLength == 0)
            {
                ApplyStyleAtCaret(rtb, style);
                return;
            }

            Font basis = rtb.SelectionFont ?? rtb.Font;
            bool on = (basis.Style & style) != 0;
            FontStyle newStyle = on ? basis.Style & ~style : basis.Style | style;
            Font newFont = new(basis.FontFamily, basis.SizeInPoints, newStyle, GraphicsUnit.Point);
            rtb.SelectionFont = newFont;
            newFont.Dispose();
        }
        finally
        {
            if (applyToWholeDocument)
            {
                rtb.Select(start, len);
            }
        }
    }

    private static void ApplyStyleAtCaret(RichTextBox rtb, FontStyle style)
    {
        Font basis = rtb.SelectionFont ?? rtb.Font;
        bool on = (basis.Style & style) != 0;
        FontStyle newStyle = on ? basis.Style & ~style : basis.Style | style;
        Font newFont = new(basis.FontFamily, basis.SizeInPoints, newStyle, GraphicsUnit.Point);
        rtb.SelectionFont = newFont;
        newFont.Dispose();
    }
}
