using System.Text.RegularExpressions;

namespace MyWorkspace.Core;

public static partial class PageMarkdownTitleHelper
{
    [GeneratedRegex(@"^\s*#\s+(.+?)\s*$", RegexOptions.Multiline)]
    private static partial Regex FirstH1Regex();

    public static string ReplaceFirstHeadingTitle(string markdown, string newTitle)
    {
        var safeTitle = newTitle.Trim();
        if (FirstH1Regex().IsMatch(markdown))
            return FirstH1Regex().Replace(markdown, $"# {safeTitle}", 1);

        if (string.IsNullOrWhiteSpace(markdown))
            return $"# {safeTitle}\n\n";

        return $"# {safeTitle}\n\n{markdown.TrimStart()}";
    }
}
