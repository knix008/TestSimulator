using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Export;

/// <summary>
/// HWP/unhwp 변환 Markdown을 미리보기에 적합하게 정리합니다.
/// </summary>
internal static class MarkdownPreviewNormalizer
{
    private static readonly Regex YamlFrontmatterRegex = new(
        @"\A---[\r\n]+[\s\S]*?[\r\n]+---[\r\n]*",
        RegexOptions.Compiled);

    private static readonly Regex SectionMarkerRegex = new(
        @"<!--\s*section\s+\d+\s*-->\s*",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex BulletRegex = new(
        @"^(\s*)[•·∙○◦▪▫]\s+",
        RegexOptions.Compiled | RegexOptions.Multiline);

    public static string Normalize(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return string.Empty;

        string text = markdown.Replace("\r\n", "\n").Replace('\r', '\n');
        text = MarkdownLineBreakRestorer.Restore(text);
        text = YamlFrontmatterRegex.Replace(text, string.Empty);
        text = SectionMarkerRegex.Replace(text, string.Empty);
        text = BulletRegex.Replace(text, "$1- ");
        text = NormalizeOrderedListMarkers(text);
        text = EnsureBlankLineBeforeBlockElements(text);
        text = FixPipeTables(text);
        text = CollapseExcessiveBlankLines(text);
        return text.Trim();
    }

    private static string NormalizeOrderedListMarkers(string text)
    {
        return Regex.Replace(
            text,
            @"^(\s*)(\d+)[.)]\s+",
            "$1$2. ",
            RegexOptions.Multiline);
    }

    private static string EnsureBlankLineBeforeBlockElements(string text)
    {
        var lines = text.Split('\n');
        var result = new List<string>(lines.Length + 8);

        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i];
            if (i > 0 && NeedsLeadingBlankLine(line) && result.Count > 0 && result[^1].Length > 0)
            {
                if (result[^1].Length > 0)
                    result.Add(string.Empty);
            }

            result.Add(line);
        }

        return string.Join('\n', result);
    }

    private static bool NeedsLeadingBlankLine(string line)
    {
        if (line.StartsWith('#'))
            return true;

        if (line.StartsWith("```"))
            return true;

        if (Regex.IsMatch(line, @"^\s*[-*+]\s+"))
            return true;

        if (Regex.IsMatch(line, @"^\s*\d+\.\s+"))
            return true;

        if (line.StartsWith('>') || line.StartsWith('|'))
            return true;

        if (line.StartsWith("<table", StringComparison.OrdinalIgnoreCase) ||
            line.StartsWith("<div", StringComparison.OrdinalIgnoreCase) ||
            line.StartsWith("<h1", StringComparison.OrdinalIgnoreCase) ||
            line.StartsWith("<h2", StringComparison.OrdinalIgnoreCase))
            return true;

        return false;
    }

    private static string FixPipeTables(string text)
    {
        var lines = text.Split('\n');
        var result = new List<string>(lines.Length + 4);

        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i];
            result.Add(line);

            if (!IsPipeTableRow(line))
                continue;

            if (i + 1 < lines.Length && IsPipeTableSeparator(lines[i + 1]))
                continue;

            int columns = CountPipeColumns(line);
            if (columns >= 2)
                result.Add(BuildPipeSeparator(columns));
        }

        return string.Join('\n', result);
    }

    private static bool IsPipeTableRow(string line)
    {
        string trimmed = line.Trim();
        return trimmed.Contains('|') &&
               trimmed.Trim('|').Contains('|') &&
               !trimmed.StartsWith("```", StringComparison.Ordinal);
    }

    private static bool IsPipeTableSeparator(string line)
    {
        string trimmed = line.Trim();
        return trimmed.Contains('|') &&
               Regex.IsMatch(trimmed, @"^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$");
    }

    private static int CountPipeColumns(string line)
    {
        string trimmed = line.Trim().Trim('|');
        if (string.IsNullOrEmpty(trimmed))
            return 0;

        return trimmed.Split('|').Length;
    }

    private static string BuildPipeSeparator(int columns)
    {
        var cells = Enumerable.Repeat("---", columns);
        return "| " + string.Join(" | ", cells) + " |";
    }

    private static string CollapseExcessiveBlankLines(string text)
    {
        return Regex.Replace(text, @"\n{3,}", "\n\n");
    }
}
