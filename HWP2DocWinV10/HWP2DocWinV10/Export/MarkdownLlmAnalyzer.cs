using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Export;

internal sealed record MarkdownSection(string HeadingLine, string Body, int Index);

internal static class MarkdownLlmAnalyzer
{
    private static readonly Regex MarkdownHeadingRegex = new(
        @"^\s*#{1,6}\s+",
        RegexOptions.Compiled);

    private static readonly Regex HtmlHeadingRegex = new(
        @"^\s*<h[1-6]\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex BoldOnlyLineRegex = new(
        @"^\s*\*\*.+\*\*\s*$",
        RegexOptions.Compiled);

    private static readonly Regex OutlineNumberLineRegex = new(
        @"^\s*(?:제\s*)?\d+(?:\.\d+)*\s*[.)]?\s+\S",
        RegexOptions.Compiled);

    private static readonly Regex BulletCharRegex = new(
        @"^\s*[•·∙○◦▪▫]\s+",
        RegexOptions.Compiled);

    private const int IssueThreshold = 2;

    public static IReadOnlyList<MarkdownSection> SplitSections(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return [];

        string[] lines = markdown.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        var sections = new List<MarkdownSection>();
        var buffer = new List<string>();
        string heading = string.Empty;
        int index = 0;

        void Flush()
        {
            if (buffer.Count == 0 && heading.Length == 0)
                return;

            sections.Add(new MarkdownSection(
                heading,
                string.Join('\n', buffer).TrimEnd(),
                index++));
            buffer.Clear();
            heading = string.Empty;
        }

        foreach (string line in lines)
        {
            if (MarkdownHeadingRegex.IsMatch(line))
            {
                Flush();
                heading = line;
                continue;
            }

            buffer.Add(line);
        }

        Flush();
        return sections;
    }

    public static int ScoreIssues(string sectionText)
    {
        if (string.IsNullOrWhiteSpace(sectionText))
            return 0;

        int score = 0;
        bool inFence = false;

        foreach (string rawLine in sectionText.Split('\n'))
        {
            string line = rawLine.TrimEnd();
            string trimmed = line.Trim();

            if (trimmed.StartsWith("```", StringComparison.Ordinal))
            {
                inFence = !inFence;
                continue;
            }

            if (inFence || trimmed.Length == 0)
                continue;

            if (HtmlHeadingRegex.IsMatch(trimmed))
                score += 3;

            if (BulletCharRegex.IsMatch(line))
                score += 2;

            if (MarkdownPipeTableNormalizer.IsPipeTableSeparator(trimmed) &&
                !IsLikelyValidTableContext(sectionText, trimmed))
                score += 4;

            if (trimmed.StartsWith('|') && !trimmed.EndsWith('|') &&
                !MarkdownPipeTableNormalizer.IsPipeTableSeparator(trimmed))
                score += 3;

            if (LooksLikePlainHeading(trimmed))
                score += 2;
        }

        return score;
    }

    public static bool NeedsCleanup(string sectionText) => ScoreIssues(sectionText) >= IssueThreshold;

    public static bool NeedsCleanup(MarkdownSection section)
    {
        string combined = string.IsNullOrEmpty(section.HeadingLine)
            ? section.Body
            : section.HeadingLine + "\n" + section.Body;
        return NeedsCleanup(combined);
    }

    private static bool LooksLikePlainHeading(string trimmed)
    {
        if (trimmed.Length == 0 || trimmed.Length > 80)
            return false;

        if (MarkdownHeadingRegex.IsMatch(trimmed))
            return false;

        if (trimmed.StartsWith('|') ||
            trimmed.StartsWith("![", StringComparison.Ordinal) ||
            trimmed.StartsWith("- ", StringComparison.Ordinal) ||
            trimmed.StartsWith("* ", StringComparison.Ordinal) ||
            trimmed.StartsWith("<!--", StringComparison.Ordinal))
            return false;

        if (BoldOnlyLineRegex.IsMatch(trimmed))
            return true;

        if (OutlineNumberLineRegex.IsMatch(trimmed))
            return true;

        if (trimmed.Length <= 48 &&
               !EndsWithPunctuation(trimmed) &&
               !trimmed.Contains('。') &&
               char.IsLetterOrDigit(trimmed[0]))
            return true;

        return false;
    }

    private static bool EndsWithPunctuation(string text)
    {
        if (text.Length == 0)
            return false;

        char last = text[^1];
        return last is '.' or ',' or ';' or ':' or ')' or ']' or '】' or '」';
    }

    private static bool IsLikelyValidTableContext(string sectionText, string separatorLine)
    {
        string[] lines = sectionText.Split('\n');
        int separatorIndex = Array.FindIndex(lines, line => line.Trim() == separatorLine.Trim());
        if (separatorIndex <= 0)
            return false;

        string previous = lines[separatorIndex - 1].Trim();
        return previous.StartsWith('|') && previous.EndsWith('|');
    }
}
