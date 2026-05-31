namespace OCRWinV10;

/// <summary>
/// 여러 OCR 후보 중 한글·손글씨 결과에 유리한 항목을 고릅니다.
/// Windows OCR은 신뢰도 점수를 제공하지 않아 휴리스틱으로 비교합니다.
/// </summary>
public static class OcrResultScorer
{
    public static OcrResult PickBest(IReadOnlyList<OcrResult> candidates)
    {
        if (candidates.Count == 0)
            return new OcrResult("", []);

        OcrResult? best = null;
        double bestScore = double.MinValue;

        foreach (var candidate in candidates)
        {
            var score = Score(candidate);
            if (score > bestScore)
            {
                bestScore = score;
                best = candidate;
            }
        }

        return best ?? candidates[0];
    }

    public static double Score(OcrResult result)
    {
        var text = result.Text ?? "";
        if (text.Length == 0)
            return 0;

        int hangul = 0;
        int jamo = 0;
        int letters = 0;
        int junk = 0;

        foreach (var c in text)
        {
            if (c >= '\uAC00' && c <= '\uD7A3')
                hangul++;
            else if (c >= '\u1100' && c <= '\u11FF')
                jamo++;
            else if (char.IsLetterOrDigit(c) || char.IsPunctuation(c) || char.IsWhiteSpace(c))
                letters++;
            else if (c == '?' || c == '□' || c == '\uFFFD')
                junk++;
        }

        int lineBonus = result.Lines.Count * 2;
        int wordBonus = result.Lines.Sum(l => l.Words.Count);

        return hangul * 4.0
               + jamo * 2.0
               + letters
               + lineBonus
               + wordBonus * 0.5
               + text.Length * 0.15
               - junk * 8.0;
    }
}
