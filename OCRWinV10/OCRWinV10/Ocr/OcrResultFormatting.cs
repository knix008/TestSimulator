namespace OCRWinV10.Ocr;

/// <summary>
/// OCR 결과를 행(줄) 단위로 표시·저장하기 위한 포맷.
/// </summary>
public static class OcrResultFormatting
{
    public static string ToDisplayText(OcrResult result)
    {
        if (result.Lines.Count > 0)
            return JoinLines(result.Lines);

        if (string.IsNullOrWhiteSpace(result.Text))
            return "";

        return result.Text
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Replace("\n", Environment.NewLine, StringComparison.Ordinal);
    }

    public static string JoinLines(IEnumerable<OcrLine> lines) =>
        string.Join(Environment.NewLine, lines.Select(l => l.Text.Trim()).Where(t => t.Length > 0));
}
