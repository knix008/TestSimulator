namespace MyWorkspace.Win;

internal static class InternalReferenceHelper
{
    public static string NormalizeHref(string href)
    {
        if (string.IsNullOrWhiteSpace(href))
            return string.Empty;

        var trimmed = href.Trim();
        if (PageReferenceHelper.TryParse(trimmed, out _) || WorkspaceReferenceHelper.TryParse(trimmed, out _))
            return trimmed;

        var pageIndex = trimmed.IndexOf(PageReferenceHelper.UriPrefix, StringComparison.OrdinalIgnoreCase);
        if (pageIndex >= 0)
            return ExtractReferenceToken(trimmed, pageIndex, PageReferenceHelper.UriPrefix.Length);

        var workspaceIndex = trimmed.IndexOf(WorkspaceReferenceHelper.UriPrefix, StringComparison.OrdinalIgnoreCase);
        if (workspaceIndex >= 0)
            return ExtractReferenceToken(trimmed, workspaceIndex, WorkspaceReferenceHelper.UriPrefix.Length);

        return trimmed;
    }

    private static string ExtractReferenceToken(string href, int startIndex, int prefixLength)
    {
        var end = startIndex + prefixLength;
        while (end < href.Length && char.IsDigit(href[end]))
            end++;

        return href[startIndex..end];
    }
}
