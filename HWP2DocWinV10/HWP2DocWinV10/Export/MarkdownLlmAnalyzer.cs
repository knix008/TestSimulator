using System.Text.RegularExpressions;
using HWP2DocWinV10.Services;

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

    private static readonly Regex HtmlTableTagRegex = new(
        @"<table\b",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex HtmlMarkupRegex = new(
        @"</?(?:p|div|span|br|h[1-6]|table|thead|tbody|tr|td|th)\b",
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

    private const int IssueThreshold = 1;
    private const int FastIssueThreshold = 2;
    private const int MinSectionChars = 16;

    public static bool HasSubstantiveContent(MarkdownSection section)
    {
        string combined = string.IsNullOrEmpty(section.HeadingLine)
            ? section.Body
            : section.HeadingLine + "\n" + section.Body;
        return combined.Trim().Length >= MinSectionChars;
    }

    public static bool NeedsLlmProcessing(
        MarkdownSection section,
        LlmProcessingTargets targets,
        bool fastMode = false)
    {
        if (!HasSubstantiveContent(section) || targets == LlmProcessingTargets.None)
            return false;

        string combined = string.IsNullOrEmpty(section.HeadingLine)
            ? section.Body
            : section.HeadingLine + "\n" + section.Body;

        int threshold = fastMode ? FastIssueThreshold : IssueThreshold;

        if (targets.HasFlag(LlmProcessingTargets.Tables) && ScoreTableIssues(combined) >= threshold)
            return true;

        if (targets.HasFlag(LlmProcessingTargets.Headings) && ScoreHeadingIssues(combined) >= threshold)
            return true;

        if (targets.HasFlag(LlmProcessingTargets.Lists) && ScoreListIssues(combined) >= threshold)
            return true;

        return targets.HasFlag(LlmProcessingTargets.HtmlMarkup) &&
               ScoreHtmlMarkupIssues(combined) >= threshold;
    }

    public static bool NeedsTableRestructuring(MarkdownSection section, bool fastMode = false)
        => NeedsLlmProcessing(section, LlmProcessingTargets.Tables, fastMode);

    public static bool NeedsRestructuring(MarkdownSection section, bool fastMode = false)
        => NeedsLlmProcessing(section, LlmProcessingTargetCatalog.Default, fastMode);

    public static int ScoreForTargets(string sectionText, LlmProcessingTargets targets)
    {
        if (string.IsNullOrWhiteSpace(sectionText) || targets == LlmProcessingTargets.None)
            return 0;

        int score = 0;
        if (targets.HasFlag(LlmProcessingTargets.Tables))
            score += ScoreTableIssues(sectionText);
        if (targets.HasFlag(LlmProcessingTargets.Headings))
            score += ScoreHeadingIssues(sectionText);
        if (targets.HasFlag(LlmProcessingTargets.Lists))
            score += ScoreListIssues(sectionText);
        if (targets.HasFlag(LlmProcessingTargets.HtmlMarkup))
            score += ScoreHtmlMarkupIssues(sectionText);
        return score;
    }

    public static int ScoreTableIssues(string sectionText)
    {
        if (string.IsNullOrWhiteSpace(sectionText))
            return 0;

        int score = 0;
        bool inFence = false;
        bool hasPipeRow = false;
        int pipeLineCount = 0;

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

            if (HtmlTableTagRegex.IsMatch(trimmed))
                score += 3;

            if (MarkdownPipeTableNormalizer.IsPipeTableSeparator(trimmed) &&
                !IsLikelyValidTableContext(sectionText, trimmed))
            {
                score += 4;
                continue;
            }

            if (MarkdownPipeTableNormalizer.IsPipeTableRow(trimmed))
            {
                hasPipeRow = true;
                pipeLineCount++;
                continue;
            }

            if (trimmed.StartsWith('|') || trimmed.Contains('|'))
            {
                score += 3;
                if (trimmed.Count(c => c == '|') >= 2)
                    pipeLineCount++;
            }
        }

        if (hasPipeRow && !HasValidGfmTableBlock(sectionText))
            score += 4;

        if (pipeLineCount >= 2 && !HasValidGfmTableBlock(sectionText))
            score += 2;

        return score;
    }

    public static int ScoreHeadingIssues(string sectionText)
    {
        if (string.IsNullOrWhiteSpace(sectionText))
            return 0;

        int score = 0;
        bool inFence = false;

        foreach (string rawLine in sectionText.Split('\n'))
        {
            string trimmed = rawLine.Trim();
            if (trimmed.StartsWith("```", StringComparison.Ordinal))
            {
                inFence = !inFence;
                continue;
            }

            if (inFence || trimmed.Length == 0)
                continue;

            if (HtmlHeadingRegex.IsMatch(trimmed))
                score += 3;

            if (LooksLikePlainHeading(trimmed))
                score += 2;
        }

        return score;
    }

    public static int ScoreListIssues(string sectionText)
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

            if (BulletCharRegex.IsMatch(line))
                score += 2;

            if (Regex.IsMatch(trimmed, @"^\d+\)\s+") && !Regex.IsMatch(trimmed, @"^\d+\.\s+"))
                score += 1;
        }

        return score;
    }

    public static int ScoreHtmlMarkupIssues(string sectionText)
    {
        if (string.IsNullOrWhiteSpace(sectionText))
            return 0;

        int score = 0;
        bool inFence = false;

        foreach (string rawLine in sectionText.Split('\n'))
        {
            string trimmed = rawLine.Trim();
            if (trimmed.StartsWith("```", StringComparison.Ordinal))
            {
                inFence = !inFence;
                continue;
            }

            if (inFence || trimmed.Length == 0)
                continue;

            if (HtmlMarkupRegex.IsMatch(trimmed))
                score += 2;
        }

        return score;
    }

    public static int ScoreIssues(string sectionText) => ScoreTableIssues(sectionText);

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

    public static bool NeedsCleanup(string sectionText) =>
        ScoreTableIssues(sectionText) >= IssueThreshold;

    public static bool NeedsCleanup(MarkdownSection section) =>
        NeedsLlmProcessing(section, LlmProcessingTargetCatalog.Default);

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

    private static bool HasValidGfmTableBlock(string sectionText)
    {
        string[] lines = sectionText.Split('\n');
        for (int i = 0; i < lines.Length - 1; i++)
        {
            if (MarkdownPipeTableNormalizer.IsPipeTableRow(lines[i]) &&
                MarkdownPipeTableNormalizer.IsPipeTableSeparator(lines[i + 1]))
                return true;
        }

        return false;
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
