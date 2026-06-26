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
        => MarkdownConversionPostProcessor.Apply(markdown);

    public static string NormalizeLayout(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return string.Empty;

        string text = markdown.Replace("\r\n", "\n").Replace('\r', '\n');
        text = YamlFrontmatterRegex.Replace(text, string.Empty);
        text = SectionMarkerRegex.Replace(text, string.Empty);
        text = BulletRegex.Replace(text, "$1- ");
        text = NormalizeOrderedListMarkers(text);
        text = EnsureBlankLineBeforeBlockElements(text);
        text = EnsureBlankLineAfterHtmlTables(text);
        text = CollapseExcessiveBlankLines(text);
        return text.Trim();
    }

    private static string NormalizeOrderedListMarkers(string text)
    {
        var lines = text.Split('\n');
        var result = new List<string>(lines.Length);

        foreach (string line in lines)
        {
            if (IsMarkdownHeadingLine(line) || IsOutlineNumberLine(line))
            {
                result.Add(line);
                continue;
            }

            result.Add(OrderedListLineRegex.Replace(line, "$1$2. "));
        }

        return string.Join('\n', result);
    }

    private static readonly Regex OrderedListLineRegex = new(
        @"^(\s*)(\d+)[.)]\s+",
        RegexOptions.Compiled);

    private static bool IsMarkdownHeadingLine(string line)
    {
        string trimmed = line.TrimStart();
        return trimmed.StartsWith('#') && Regex.IsMatch(trimmed, @"^#{1,6}\s+\S");
    }

    private static bool IsOutlineNumberLine(string line)
    {
        string trimmed = line.Trim();
        return Regex.IsMatch(trimmed, @"^(?:제\s*)?\d+\.\d+(?:\.\d+)*\s+\S");
    }

    private static string EnsureBlankLineBeforeBlockElements(string text)
    {
        var lines = text.Split('\n');
        var result = new List<string>(lines.Length + 8);

        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i];
            if (i > 0 && NeedsLeadingBlankLine(line) && result.Count > 0 && result[^1].Length > 0)
                result.Add(string.Empty);

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

        if (line.StartsWith("<img", StringComparison.OrdinalIgnoreCase))
            return true;

        if (line.StartsWith("![", StringComparison.Ordinal))
            return true;

        return false;
    }

    private static string EnsureBlankLineAfterHtmlTables(string text)
    {
        return Regex.Replace(
            text,
            @"(</table>)(\s*)(?=[^\r\n])",
            "$1\n\n",
            RegexOptions.IgnoreCase);
    }

    private static string CollapseExcessiveBlankLines(string text)
    {
        return Regex.Replace(text, @"\n{3,}", "\n\n");
    }
}
