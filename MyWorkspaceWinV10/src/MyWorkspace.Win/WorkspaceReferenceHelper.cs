namespace MyWorkspace.Win;

internal static class WorkspaceReferenceHelper
{
    public const string UriPrefix = "workspace-ref:";

    public static bool TryParse(string href, out int workspaceId)
    {
        workspaceId = 0;
        if (string.IsNullOrWhiteSpace(href))
            return false;

        if (!href.StartsWith(UriPrefix, StringComparison.OrdinalIgnoreCase))
            return false;

        return int.TryParse(href.AsSpan(UriPrefix.Length), out workspaceId) && workspaceId > 0;
    }
}
