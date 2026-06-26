using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Export;

/// <summary>
/// Markdown 제목(#, ##, ###)과 번호 매기기를 정리합니다.
/// </summary>
internal static class MarkdownHeadingNormalizer
{
    private static readonly Regex MarkdownHeadingRegex = new(
        @"^(?<indent>\s*)(?<hashes>#{1,6})(?!#)\s*(?<title>.+)$",
        RegexOptions.Compiled);

    private static readonly Regex HtmlHeadingRegex = new(
        @"^(?<indent>\s*)<h(?<level>[1-6])\b[^>]*>(?<title>.*?)</h\1>\s*$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex BoldOnlyLineRegex = new(
        @"^\s*\*\*(?<title>.+?)\*\*\s*$",
        RegexOptions.Compiled);

    private static readonly Regex OutlineNumberPrefixRegex = new(
        @"^(?<prefix>(?:제\s*)?\d+(?:\.\d+)*)(?:\s*[.)])?\s+",
        RegexOptions.Compiled);

    private static readonly Regex HeadingNumberPrefixRegex = new(
        @"^(?<hashes>#{1,6}\s+)(?:(?:\d+(?:\.\d+)*)\s*[.)]?\s*)+(?<title>.+)$",
        RegexOptions.Compiled);

    private static readonly Regex OrderedListLineRegex = new(
        @"^\s*(?<num>\d+)[.)]\s+(?<text>\S)",
        RegexOptions.Compiled);

    public static string Normalize(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return string.Empty;

        string[] lines = markdown.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        var result = new List<string>(lines.Length);

        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i];
            string? nextLine = i + 1 < lines.Length ? lines[i + 1] : null;

            if (ShouldSkipHeadingProcessing(line))
            {
                result.Add(line);
                continue;
            }

            if (TryConvertHtmlHeading(line, out string htmlHeading))
            {
                result.Add(htmlHeading);
                continue;
            }

            if (TryNormalizeMarkdownHeading(line, out string mdHeading))
            {
                result.Add(mdHeading);
                continue;
            }

            if (TryConvertOutlineLineToHeading(line, nextLine, out string outlineHeading))
            {
                result.Add(outlineHeading);
                continue;
            }

            if (TryConvertBoldLineToHeading(line, out string boldHeading))
            {
                result.Add(boldHeading);
                continue;
            }

            result.Add(line);
        }

        return string.Join('\n', result);
    }

    private static bool ShouldSkipHeadingProcessing(string line)
    {
        string trimmed = line.Trim();
        if (trimmed.Length == 0)
            return true;

        if (trimmed.StartsWith("```", StringComparison.Ordinal))
            return true;

        if (trimmed.StartsWith('|') || trimmed.StartsWith("<table", StringComparison.OrdinalIgnoreCase))
            return true;

        if (trimmed.StartsWith("![", StringComparison.Ordinal))
            return true;

        if (trimmed.StartsWith("<!--", StringComparison.Ordinal))
            return true;

        return false;
    }

    private static bool TryConvertHtmlHeading(string line, out string heading)
    {
        heading = string.Empty;
        var match = HtmlHeadingRegex.Match(line);
        if (!match.Success)
            return false;

        int level = int.Parse(match.Groups["level"].Value);
        string title = CleanHeadingTitle(match.Groups["title"].Value);
        if (title.Length == 0)
            return false;

        heading = $"{match.Groups["indent"].Value}{new string('#', level)} {title}";
        return true;
    }

    private static bool TryNormalizeMarkdownHeading(string line, out string heading)
    {
        heading = string.Empty;
        var match = MarkdownHeadingRegex.Match(line);
        if (!match.Success)
            return false;

        int level = Math.Clamp(match.Groups["hashes"].Value.Length, 1, 6);
        string title = CleanHeadingTitle(match.Groups["title"].Value);
        if (title.Length == 0)
            return false;

        heading = $"{match.Groups["indent"].Value}{new string('#', level)} {title}";
        return true;
    }

    private static bool TryConvertOutlineLineToHeading(string line, string? nextLine, out string heading)
    {
        heading = string.Empty;
        string trimmed = line.Trim();
        if (trimmed.StartsWith('#') || trimmed.StartsWith("**", StringComparison.Ordinal))
            return false;

        var match = OutlineNumberPrefixRegex.Match(trimmed);
        if (!match.Success)
            return false;

        string number = match.Groups["prefix"].Value.Replace("제", string.Empty, StringComparison.Ordinal).Trim();
        string title = CleanHeadingTitle(trimmed[match.Length..]);
        if (title.Length == 0)
            return false;

        if (!IsLikelyOutlineHeading(number, title, nextLine))
            return false;

        int level = Math.Clamp(number.Split('.', StringSplitOptions.RemoveEmptyEntries).Length, 1, 6);
        heading = $"{new string('#', level)} {title}";
        return true;
    }

    private static bool IsLikelyOutlineHeading(string number, string title, string? nextLine)
    {
        if (number.Contains('.'))
            return true;

        if (title.Length <= 48 && (title.Contains('장', StringComparison.Ordinal) || title.Contains('절', StringComparison.Ordinal)))
            return true;

        if (nextLine != null && OrderedListLineRegex.IsMatch(nextLine))
        {
            var current = OrderedListLineRegex.Match($"{number}. {title}");
            var next = OrderedListLineRegex.Match(nextLine);
            if (current.Success && next.Success &&
                int.TryParse(current.Groups["num"].Value, out int currentNum) &&
                int.TryParse(next.Groups["num"].Value, out int nextNum) &&
                nextNum == currentNum + 1)
            {
                return false;
            }
        }

        return title.Length <= 64;
    }

    private static bool TryConvertBoldLineToHeading(string line, out string heading)
    {
        heading = string.Empty;
        var match = BoldOnlyLineRegex.Match(line);
        if (!match.Success)
            return false;

        string title = CleanHeadingTitle(match.Groups["title"].Value);
        if (title.Length == 0 || title.Length > 80)
            return false;

        heading = $"## {title}";
        return true;
    }

    private static string CleanHeadingTitle(string title)
    {
        string cleaned = title.Trim();
        cleaned = Regex.Replace(cleaned, @"\*\*(.+?)\*\*", "$1");
        cleaned = Regex.Replace(cleaned, @"__(.+?)__", "$1");
        cleaned = OutlineNumberPrefixRegex.Replace(cleaned, string.Empty);
        cleaned = HeadingNumberPrefixRegex.Replace(cleaned, "${title}");
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
        return cleaned;
    }
}
