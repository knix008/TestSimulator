using System.Text.RegularExpressions;

namespace STTWinV20.Services;

// Applies the same segment filtering rules as STTGTKV10/stt_core.cpp
public static class OutputFilter
{
    private static readonly Regex BracketOrParenStart =
        new(@"^[\[（\(［]", RegexOptions.Compiled);

    private static readonly Regex DashStart =
        new(@"^[-–—]", RegexOptions.Compiled);

    private static readonly Regex HasKoreanOrAsciiAlnum =
        new(@"[가-힣a-zA-Z0-9]", RegexOptions.Compiled);

    private static readonly string[] HallucinationPatterns =
    [
        "MBC 뉴스", "KBS 뉴스", "SBS 뉴스", "YTN 뉴스",
        "구독과 좋아요", "좋아요와 구독", "구독하기",
        "시청해 주셔서", "다음 영상에서", "like and subscribe",
        "Thank you for watching",
    ];

    // Duplicate suppression: compare first 10 chars of last accepted result
    private static string _lastPrefix = string.Empty;

    public static bool Accept(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return false;

        var text = raw.Trim();

        if (BracketOrParenStart.IsMatch(text)) return false;
        if (DashStart.IsMatch(text)) return false;
        if (!HasKoreanOrAsciiAlnum.IsMatch(text)) return false;

        foreach (var pattern in HallucinationPatterns)
            if (text.Contains(pattern, StringComparison.OrdinalIgnoreCase))
                return false;

        var prefix = text.Length >= 10 ? text[..10] : text;
        if (_lastPrefix == prefix) return false;

        _lastPrefix = prefix;
        return true;
    }

    public static void Reset() => _lastPrefix = string.Empty;
}
