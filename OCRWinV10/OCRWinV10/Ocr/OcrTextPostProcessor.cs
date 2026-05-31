using System.Text;

namespace OCRWinV10.Ocr;

/// <summary>
/// 한글·영문 혼합 OCR 결과의 기본 정규화 (유니코드 정규화, 공백 정리).
/// </summary>
public static class OcrTextPostProcessor
{
    public static OcrResult Apply(OcrResult result)
    {
        if (string.IsNullOrEmpty(result.Text) && result.Lines.Count == 0)
            return result;

        var lines = result.Lines
            .Select(NormalizeLine)
            .Where(l => !string.IsNullOrWhiteSpace(l.Text))
            .ToList();

        var text = OcrResultFormatting.JoinLines(lines);
        return new OcrResult(text, lines);
    }

    /// <summary>인식 결과를 화면·저장용 행 단위 텍스트로 만듭니다.</summary>
    public static string FormatForDisplay(OcrResult result) => OcrResultFormatting.ToDisplayText(result);

    private static OcrLine NormalizeLine(OcrLine line)
    {
        var text = NormalizeText(line.Text);
        var words = line.Words
            .Select(w => new OcrWord(NormalizeText(w.Text), w.BoundingRect))
            .Where(w => !string.IsNullOrWhiteSpace(w.Text))
            .ToList();
        return new OcrLine(text, words);
    }

    private static string NormalizeText(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
            return "";

        var normalized = text.Normalize(NormalizationForm.FormC);
        normalized = normalized.Replace('\u00A0', ' ');
        normalized = string.Join(' ', normalized.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return normalized.Trim();
    }
}
