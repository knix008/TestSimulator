using System.Text.RegularExpressions;

namespace MyWorkspace.Core;

public static partial class PageSearchSnippetBuilder
{
    [GeneratedRegex(@"^\s*#\s+.+$", RegexOptions.Multiline)]
    private static partial Regex HeadingLineRegex();

    [GeneratedRegex(@"!\[[^\]]*\]\([^)]+\)")]
    private static partial Regex ImageMarkdownRegex();

    [GeneratedRegex(@"\[([^\]]+)\]\([^)]+\)")]
    private static partial Regex LinkMarkdownRegex();

    [GeneratedRegex(@"[*_`>#\-|]")]
    private static partial Regex MarkdownNoiseRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();

    public static string Build(string content, string query, int maxLength = 96)
    {
        var plain = ToPlainText(content);
        if (string.IsNullOrWhiteSpace(plain))
            return string.Empty;

        var index = plain.IndexOf(query, StringComparison.OrdinalIgnoreCase);
        if (index < 0)
            return Truncate(plain, maxLength);

        var start = Math.Max(0, index - 24);
        var length = Math.Min(maxLength, plain.Length - start);
        var snippet = plain.Substring(start, length).Trim();
        if (start > 0)
            snippet = "…" + snippet;
        if (start + length < plain.Length)
            snippet += "…";

        return snippet;
    }

    private static string ToPlainText(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return string.Empty;

        var text = HeadingLineRegex().Replace(markdown, " ");
        text = ImageMarkdownRegex().Replace(text, " ");
        text = LinkMarkdownRegex().Replace(text, "$1");
        text = MarkdownNoiseRegex().Replace(text, " ");
        text = WhitespaceRegex().Replace(text, " ").Trim();
        return text;
    }

    private static string Truncate(string value, int maxLength)
    {
        if (value.Length <= maxLength)
            return value;

        return value[..maxLength].TrimEnd() + "…";
    }
}
