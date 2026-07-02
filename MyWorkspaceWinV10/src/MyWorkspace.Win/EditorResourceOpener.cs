namespace MyWorkspace.Win;

using System.Diagnostics;

internal static class EditorResourceOpener
{
    public static bool TryOpen(string href)
    {
        if (string.IsNullOrWhiteSpace(href))
            return false;

        if (PageAssetStore.TryParseAssetUri(href, out var pageId, out var fileName))
            return TryOpenLocalFile(PageAssetStore.TryGetAssetPath(pageId, fileName));

        if (PageAssetStore.TryParseEditorUri(href, out pageId, out fileName))
            return TryOpenLocalFile(PageAssetStore.TryGetAssetPath(pageId, fileName));

        if (!Uri.TryCreate(href, UriKind.Absolute, out var uri))
            return TryOpenLocalFile(File.Exists(href) ? href : null);

        if (uri.Scheme.Equals(Uri.UriSchemeFile, StringComparison.OrdinalIgnoreCase))
            return TryOpenLocalFile(uri.LocalPath);

        if (uri.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) ||
            uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
            uri.Scheme.Equals("mailto", StringComparison.OrdinalIgnoreCase))
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = href,
                UseShellExecute = true
            });
            return true;
        }

        return false;
    }

    private static bool TryOpenLocalFile(string? path)
    {
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            return false;

        Process.Start(new ProcessStartInfo
        {
            FileName = path,
            UseShellExecute = true
        });
        return true;
    }
}
