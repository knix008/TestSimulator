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

    public static string Normalize(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return string.Empty;

        string[] lines = markdown.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        var result = new List<string>(lines.Length);

        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i];

            if (TryConvertTableHeadingRow(lines, i, out string tableHeading))
            {
                result.Add(tableHeading);
                continue;
            }

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

            if (TryPromotePlainHeading(lines, i, out string plainHeading))
            {
                result.Add(plainHeading);
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

    private static bool TryConvertTableHeadingRow(string[] lines, int index, out string heading)
    {
        heading = string.Empty;
        string line = lines[index];
        string trimmed = line.Trim();
        if (!trimmed.StartsWith('|') || trimmed.StartsWith("<table", StringComparison.OrdinalIgnoreCase))
            return false;

        if (IsAdjacentToPipeTableRow(lines, index))
            return false;

        if (MarkdownPipeTableNormalizer.IsPipeTableSeparator(trimmed))
            return false;

        string[] cells = trimmed.Trim('|').Split('|');
        string? onlyCellText = null;
        int nonEmptyCount = 0;
        foreach (string cell in cells)
        {
            string cellText = cell.Trim();
            if (cellText.Length == 0)
                continue;

            nonEmptyCount++;
            if (nonEmptyCount > 1)
                return false;

            onlyCellText = cellText;
        }

        if (nonEmptyCount != 1 || onlyCellText == null)
            return false;

        var boldMatch = BoldOnlyLineRegex.Match(onlyCellText);
        string unwrapped = boldMatch.Success ? boldMatch.Groups["title"].Value.Trim() : onlyCellText;

        var outlineMatch = OutlineNumberPrefixRegex.Match(unwrapped);
        if (outlineMatch.Success)
        {
            string number = outlineMatch.Groups["prefix"].Value.Replace("제", string.Empty, StringComparison.Ordinal).Trim();
            string title = CleanHeadingTitle(unwrapped[outlineMatch.Length..]);
            if (title.Length == 0 || title.Length > 64)
                return false;

            int level = Math.Clamp(number.Split('.', StringSplitOptions.RemoveEmptyEntries).Length, 1, 6);
            heading = $"{new string('#', level)} {title}";
            return true;
        }

        if (boldMatch.Success)
        {
            string title = CleanHeadingTitle(unwrapped);
            if (title.Length == 0 || title.Length > 64)
                return false;

            heading = $"## {title}";
            return true;
        }

        return false;
    }

    private static bool IsAdjacentToPipeTableRow(string[] lines, int index)
    {
        for (int j = index - 1; j <= index + 1; j++)
        {
            if (j < 0 || j >= lines.Length || j == index)
                continue;

            string trimmed = lines[j].Trim();
            if (trimmed.Length == 0)
                continue;

            if (trimmed.StartsWith('|') || MarkdownPipeTableNormalizer.IsPipeTableSeparator(trimmed))
                return true;
        }

        return false;
    }

    private static bool TryPromotePlainHeading(string[] lines, int index, out string heading)
    {
        heading = string.Empty;
        string line = lines[index];
        string trimmed = line.Trim();

        if (trimmed.Length == 0 || trimmed.Length > 80)
            return false;

        if (index > 0 && lines[index - 1].Trim().Length > 0)
            return false;

        if (index + 1 < lines.Length && lines[index + 1].Trim().Length > 0 &&
            !BoldOnlyLineRegex.IsMatch(trimmed) &&
            !OutlineNumberPrefixRegex.IsMatch(trimmed))
            return false;

        var boldMatch = BoldOnlyLineRegex.Match(trimmed);
        if (boldMatch.Success)
        {
            string title = CleanHeadingTitle(boldMatch.Groups["title"].Value);
            if (title.Length == 0 || title.Length > 64)
                return false;

            string indent = line[..(line.Length - line.TrimStart().Length)];
            heading = $"{indent}## {title}";
            return true;
        }

        var outlineMatch = OutlineNumberPrefixRegex.Match(trimmed);
        if (outlineMatch.Success)
        {
            string number = outlineMatch.Groups["prefix"].Value.Replace("제", string.Empty, StringComparison.Ordinal).Trim();
            string title = CleanHeadingTitle(trimmed[outlineMatch.Length..]);
            if (title.Length == 0 || title.Length > 64)
                return false;

            int level = Math.Clamp(number.Split('.', StringSplitOptions.RemoveEmptyEntries).Length, 1, 6);
            string indent = line[..(line.Length - line.TrimStart().Length)];
            heading = $"{indent}{new string('#', level)} {title}";
            return true;
        }

        return false;
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
