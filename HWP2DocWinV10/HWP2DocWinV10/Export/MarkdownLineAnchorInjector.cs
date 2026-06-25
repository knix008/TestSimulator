namespace HWP2DocWinV10.Export;

internal static class MarkdownLineAnchorInjector
{
    public static string Inject(string normalizedMarkdown)
    {
        if (string.IsNullOrWhiteSpace(normalizedMarkdown))
            return string.Empty;

        IReadOnlyList<int> anchorLines = MarkdownStructureParser.ParseFlat(normalizedMarkdown)
            .Select(static node => node.LineNumber)
            .Distinct()
            .OrderByDescending(static line => line)
            .ToList();

        if (anchorLines.Count == 0)
            return normalizedMarkdown;

        var lines = normalizedMarkdown.Split('\n').ToList();
        foreach (int line in anchorLines)
        {
            if (line < 0 || line >= lines.Count)
                continue;

            lines.Insert(line, $"""<span id="md-line-{line}" class="md-line-anchor"></span>""");
        }

        return string.Join('\n', lines);
    }
}
