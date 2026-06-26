using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Export;

/// <summary>
/// JSON에서 추출한 제목 힌트를 본문 Markdown에 순서대로 반영합니다.
/// </summary>
internal static class MarkdownStructuredHeadingApplicator
{
    private static readonly Regex BrTagRegex = new(
        @"<br\s*/?>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static string Apply(string bodyMarkdown, IReadOnlyList<StructuredHeadingHint> hints)
    {
        if (string.IsNullOrWhiteSpace(bodyMarkdown) || hints.Count == 0)
            return bodyMarkdown;

        var lines = bodyMarkdown.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        var result = new List<string>(lines.Length);
        int hintIndex = 0;

        foreach (string line in lines)
        {
            if (hintIndex >= hints.Count)
            {
                result.Add(line);
                continue;
            }

            if (ShouldSkip(line))
            {
                result.Add(line);
                continue;
            }

            if (TryMatchHint(line, hints[hintIndex], out string displayTitle))
            {
                result.Add($"{new string('#', hints[hintIndex].Level)} {displayTitle}");
                hintIndex++;
                continue;
            }

            result.Add(line);
        }

        return string.Join('\n', result);
    }

    private static bool TryMatchHint(string line, StructuredHeadingHint hint, out string displayTitle)
    {
        displayTitle = hint.Title;

        foreach (string candidate in EnumerateComparableTexts(line))
        {
            string key = UnhwpJsonHeadingExtractor.NormalizeKey(candidate);
            if (key.Length == 0)
                continue;

            if (key.Equals(hint.NormalizedKey, StringComparison.OrdinalIgnoreCase))
            {
                displayTitle = ExtractDisplayTitle(candidate);
                return true;
            }

            if (key.Length >= 6 &&
                hint.NormalizedKey.Length >= 6 &&
                (key.Contains(hint.NormalizedKey, StringComparison.OrdinalIgnoreCase) ||
                 hint.NormalizedKey.Contains(key, StringComparison.OrdinalIgnoreCase)))
            {
                int shorter = Math.Min(key.Length, hint.NormalizedKey.Length);
                int longer = Math.Max(key.Length, hint.NormalizedKey.Length);
                if (shorter >= longer * 0.7)
                {
                    displayTitle = ExtractDisplayTitle(candidate);
                    return true;
                }
            }
        }

        return false;
    }

    private static IEnumerable<string> EnumerateComparableTexts(string line)
    {
        yield return line;

        if (!line.Contains('|', StringComparison.Ordinal))
            yield break;

        foreach (string cell in line.Split('|', StringSplitOptions.RemoveEmptyEntries))
        {
            string cellText = cell.Trim();
            if (cellText.Length > 0)
                yield return cellText;
        }
    }

    private static bool ShouldSkip(string line)
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

        if (line.StartsWith("  ", StringComparison.Ordinal) && trimmed.Length > 48)
            return true;

        return false;
    }

    private static string ExtractDisplayTitle(string text)
    {
        string title = BrTagRegex.Replace(text, " ");
        title = Regex.Replace(title, @"\*\*(.+?)\*\*", "$1");
        title = Regex.Replace(title, @"^\|+|\|+$", string.Empty);
        title = Regex.Replace(title, @"\s+", " ").Trim();
        return title;
    }
}
