using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Export;

/// <summary>
/// unhwp 등에서 줄바꿈 없이 출력된 Markdown에 블록 단위 줄바꿈을 복원합니다.
/// </summary>
internal static class MarkdownLineBreakRestorer
{
    private static readonly Regex HeadingInlineRegex = new(
        @"(?<=[^\r\n])\s*(?=#{1,6}\s)",
        RegexOptions.Compiled);

    private static readonly Regex HtmlHeadingInlineRegex = new(
        @"(?<=[^\r\n])\s*(?=<h[1-6]\b)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex HtmlTableInlineRegex = new(
        @"(?<=[^\r\n])\s*(?=<table\b)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex SectionMarkerInlineRegex = new(
        @"(?<=[^\r\n])\s*(?=<!--\s*section\s+\d+\s*-->)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex BulletInlineRegex = new(
        @"(?<=[^\r\n])\s+(?=[•·∙○◦▪▫]\s)",
        RegexOptions.Compiled);

    private static readonly Regex DashListInlineRegex = new(
        @"(?<=[^\r\n])\s+(?=-\s+\S)",
        RegexOptions.Compiled);

    private static readonly Regex OrderedListInlineRegex = new(
        @"(?<=[^\r\n])\s+(?=\d+[.)]\s+\S)",
        RegexOptions.Compiled);

    private static readonly Regex PipeTableInlineRegex = new(
        @"(?<=[^\r\n])\s+(?=\|[^\r\n|]+\|)",
        RegexOptions.Compiled);

    private static readonly Regex MarkdownImageInlineRegex = new(
        @"(?<=[^\r\n])\s*(?=!\[[^\]]*\]\([^)]+\))",
        RegexOptions.Compiled);

    private static readonly Regex HtmlImageInlineRegex = new(
        @"(?<=[^\r\n])\s*(?=<img\b)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex HtmlBlockEndRegex = new(
        @"(</(?:p|div|table|thead|tbody|tr|h[1-6])>)",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex HtmlBreakRegex = new(
        @"<br\s*/?>",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static string Restore(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return string.Empty;

        string text = markdown.Replace("\r\n", "\n").Replace('\r', '\n');

        text = HtmlBreakRegex.Replace(text, match => match.Value + "\n");
        text = HtmlBlockEndRegex.Replace(text, "$1\n");
        text = HtmlTableInlineRegex.Replace(text, "\n");
        text = MarkdownImageInlineRegex.Replace(text, "\n");
        text = HtmlImageInlineRegex.Replace(text, "\n");
        text = HeadingInlineRegex.Replace(text, "\n");
        text = HtmlHeadingInlineRegex.Replace(text, "\n");

        if (NeedsRestore(text))
        {
            text = SectionMarkerInlineRegex.Replace(text, "\n");
            text = PipeTableInlineRegex.Replace(text, "\n");
            text = BulletInlineRegex.Replace(text, "\n");
            text = DashListInlineRegex.Replace(text, "\n");
            text = OrderedListInlineRegex.Replace(text, "\n");
        }

        return Regex.Replace(text, @"\n{3,}", "\n\n").Trim();
    }

    public static string FormatForEditor(string markdown)
    {
        string restored = Restore(markdown);
        restored = MarkdownPipeTableNormalizer.Normalize(restored);
        return restored.Replace("\n", Environment.NewLine);
    }

    private static bool NeedsRestore(string text)
    {
        int newlineCount = text.Count(static c => c == '\n');
        if (newlineCount == 0)
            return true;

        int lineCount = text.Split('\n').Length;
        if (lineCount <= 2 && text.Length > 400)
            return true;

        return newlineCount < Math.Max(3, text.Length / 240);
    }
}
