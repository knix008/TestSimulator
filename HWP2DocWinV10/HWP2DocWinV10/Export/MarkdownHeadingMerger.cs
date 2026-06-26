using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Export;

/// <summary>
/// unhwp가 추출한 제목 정보를 rhwp 본문 Markdown에 반영합니다.
/// </summary>
internal static class MarkdownHeadingMerger
{
    private static readonly Regex MarkdownHeadingRegex = new(
        @"^(#{1,6})\s+(.+)$",
        RegexOptions.Compiled);

    private static readonly Regex BoldOnlyLineRegex = new(
        @"^\s*\*\*(.+?)\*\*\s*$",
        RegexOptions.Compiled);

    private static readonly Regex BoldSegmentRegex = new(
        @"\*\*(.+?)\*\*",
        RegexOptions.Compiled);

    private static readonly Regex BrTagRegex = new(
        @"<br\s*/?>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static string MergeBodyWithStructureHints(string bodyMarkdown, string structureMarkdown)
    {
        if (string.IsNullOrWhiteSpace(bodyMarkdown))
            return bodyMarkdown;

        Dictionary<string, int> hints = ExtractHeadingHints(structureMarkdown);
        if (hints.Count == 0)
            return bodyMarkdown;

        var lines = bodyMarkdown.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        var result = new List<string>(lines.Length);

        foreach (string line in lines)
        {
            if (ShouldSkipMerge(line))
            {
                result.Add(line);
                continue;
            }

            if (TryApplyHeadingHint(line, hints, out string headingLine))
            {
                result.Add(headingLine);
                continue;
            }

            result.Add(line);
        }

        return string.Join('\n', result);
    }

    private static bool TryApplyHeadingHint(string line, Dictionary<string, int> hints, out string headingLine)
    {
        headingLine = string.Empty;
        string trimmed = line.Trim();
        if (trimmed.Length > 96)
            return false;

        if (line.StartsWith("  ", StringComparison.Ordinal) && trimmed.Length > 40)
            return false;

        foreach (string candidate in EnumerateComparableTexts(line))
        {
            if (TryFindHintLevel(candidate, hints, out int level))
            {
                string title = ExtractDisplayTitle(candidate);
                if (title.Length > 0 && title.Length <= 96)
                {
                    headingLine = $"{new string('#', level)} {title}";
                    return true;
                }
            }
        }

        return false;
    }

    private static IEnumerable<string> EnumerateComparableTexts(string line)
    {
        yield return line;

        if (line.Contains('|', StringComparison.Ordinal))
        {
            foreach (string cell in line.Split('|', StringSplitOptions.RemoveEmptyEntries))
            {
                string cellText = cell.Trim();
                if (cellText.Length > 0)
                    yield return cellText;
            }
        }
    }

    private static bool TryFindHintLevel(string text, Dictionary<string, int> hints, out int level)
    {
        level = 0;
        string normalized = NormalizeComparableTitle(text);
        if (normalized.Length == 0)
            return false;

        if (hints.TryGetValue(normalized, out level))
            return true;

        if (normalized.Length > 72)
            return false;

        foreach (var pair in hints)
        {
            if (pair.Key.Length > 72)
                continue;

            if (string.Equals(normalized, pair.Key, StringComparison.OrdinalIgnoreCase))
            {
                level = pair.Value;
                return true;
            }

            if (normalized.Length >= 6 &&
                pair.Key.Length >= 6 &&
                (normalized.Contains(pair.Key, StringComparison.OrdinalIgnoreCase) ||
                 pair.Key.Contains(normalized, StringComparison.OrdinalIgnoreCase)))
            {
                int shorter = Math.Min(normalized.Length, pair.Key.Length);
                int longer = Math.Max(normalized.Length, pair.Key.Length);
                if (shorter >= longer * 0.55)
                {
                    level = pair.Value;
                    return true;
                }
            }
        }

        return false;
    }

    private static Dictionary<string, int> ExtractHeadingHints(string structureMarkdown)
    {
        var hints = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (string rawLine in structureMarkdown.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n'))
        {
            string line = rawLine.Trim();
            if (line.Length == 0)
                continue;

            var headingMatch = MarkdownHeadingRegex.Match(line);
            if (headingMatch.Success)
            {
                AddHint(hints, headingMatch.Groups[2].Value, headingMatch.Groups[1].Value.Length);
                continue;
            }

            var boldMatch = BoldOnlyLineRegex.Match(line);
            if (boldMatch.Success)
            {
                AddHint(hints, boldMatch.Groups[1].Value, 2);
                continue;
            }

            foreach (Match segment in BoldSegmentRegex.Matches(line))
            {
                string segmentText = CleanInlineText(segment.Groups[1].Value);
                if (segmentText.Length >= 4 && segmentText.Length <= 96)
                    AddHint(hints, segmentText, 2);
            }

            if (line.Contains('|', StringComparison.Ordinal))
            {
                foreach (string cell in line.Split('|', StringSplitOptions.RemoveEmptyEntries))
                {
                    string cellText = CleanInlineText(cell);
                    if (cellText.Length >= 4 && cellText.Length <= 96)
                        AddHint(hints, cellText, 2);
                }
            }
        }

        return hints;
    }

    private static void AddHint(Dictionary<string, int> hints, string title, int level)
    {
        string key = NormalizeComparableTitle(title);
        if (key.Length == 0)
            return;

        level = Math.Clamp(level, 1, 6);
        if (!hints.TryGetValue(key, out int existing) || level < existing)
            hints[key] = level;
    }

    private static bool ShouldSkipMerge(string line)
    {
        string trimmed = line.Trim();
        if (trimmed.Length == 0)
            return true;

        if (trimmed.StartsWith('#'))
            return true;

        if (MarkdownPipeTableNormalizer.IsPipeTableSeparator(trimmed))
            return true;

        if (trimmed.StartsWith("![", StringComparison.Ordinal))
            return true;

        if (trimmed.StartsWith("<!--", StringComparison.Ordinal))
            return true;

        return false;
    }

    private static string ExtractDisplayTitle(string text)
    {
        string title = text.Trim();
        title = BrTagRegex.Replace(title, " ");
        title = Regex.Replace(title, @"\*\*(.+?)\*\*", "$1");
        title = Regex.Replace(title, @"^\|+|\|+$", string.Empty);
        title = Regex.Replace(title, @"\s+", " ").Trim();
        return title;
    }

    private static string CleanInlineText(string text)
    {
        string cleaned = BrTagRegex.Replace(text, " ");
        cleaned = Regex.Replace(cleaned, @"\*\*(.+?)\*\*", "$1");
        cleaned = Regex.Replace(cleaned, @"!\[[^\]]*\]\([^)]+\)", string.Empty);
        return Regex.Replace(cleaned, @"\s+", " ").Trim();
    }

    private static string NormalizeComparableTitle(string text)
    {
        string title = ExtractDisplayTitle(text);
        title = Regex.Replace(title, @"^(?:제\s*)?\d+(?:\.\d+)*\s*[.)]?\s*", string.Empty);
        title = Regex.Replace(title, @"[^\p{L}\p{N}\s]", string.Empty);
        title = Regex.Replace(title, @"\s+", " ").Trim();
        return title.ToLowerInvariant();
    }
}
