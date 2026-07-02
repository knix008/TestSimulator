namespace MyWorkspace.Win;

internal static class PageReferenceHelper
{
    public const string UriPrefix = "page-ref:";

    public static bool TryParse(string href, out int pageId)
    {
        pageId = 0;
        if (string.IsNullOrWhiteSpace(href))
            return false;

        if (!href.StartsWith(UriPrefix, StringComparison.OrdinalIgnoreCase))
            return false;

        return int.TryParse(href.AsSpan(UriPrefix.Length), out pageId) && pageId > 0;
    }
}
