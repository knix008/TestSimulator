using System.Text.RegularExpressions;

namespace MyWorkspace.Win;

internal static partial class PageTitleHelper
{
    [GeneratedRegex(@"^\s*#\s+(.+?)\s*$", RegexOptions.Multiline)]
    private static partial Regex FirstH1Regex();

    public static string CreateInitialMarkdown(string title)
    {
        var safeTitle = NormalizeTitle(title);
        return $"# {safeTitle}\n\n";
    }

    public static string EnsureTitleHeading(string title, string content)
    {
        if (FirstH1Regex().IsMatch(content))
            return content;

        var safeTitle = NormalizeTitle(title);
        if (string.IsNullOrWhiteSpace(content))
            return CreateInitialMarkdown(safeTitle);

        return $"# {safeTitle}\n\n{content.TrimStart()}";
    }

    public static string ExtractTitleFromMarkdown(string markdown)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return Localization.Get(K.UntitledPageTitle);

        var match = FirstH1Regex().Match(markdown);
        if (!match.Success)
            return Localization.Get(K.UntitledPageTitle);

        return NormalizeTitle(match.Groups[1].Value);
    }

    public static string ReplaceFirstHeadingTitle(string markdown, string newTitle)
    {
        var safeTitle = NormalizeTitle(newTitle);
        if (FirstH1Regex().IsMatch(markdown))
            return FirstH1Regex().Replace(markdown, $"# {safeTitle}", 1);

        return CreateInitialMarkdown(safeTitle) + markdown.TrimStart();
    }

    private static string NormalizeTitle(string title)
    {
        var trimmed = title.Trim();
        return string.IsNullOrEmpty(trimmed)
            ? Localization.Get(K.UntitledPageTitle)
            : trimmed;
    }
}
