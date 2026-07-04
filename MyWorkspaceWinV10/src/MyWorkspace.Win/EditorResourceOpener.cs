namespace MyWorkspace.Win;

using System.Diagnostics;

internal static class EditorResourceOpener
{
    public static bool TryOpen(string href)
    {
        if (string.IsNullOrWhiteSpace(href))
            return false;

        var localPath = TryResolveLocalPath(href);
        if (!string.IsNullOrWhiteSpace(localPath))
            return TryOpenLocalFile(localPath);

        if (!Uri.TryCreate(href, UriKind.Absolute, out var uri))
            return false;

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

    public static bool TryDownload(string href, IWin32Window? owner)
    {
        var localPath = TryResolveLocalPath(href);
        if (string.IsNullOrWhiteSpace(localPath) || !File.Exists(localPath))
            return false;

        var extension = Path.GetExtension(localPath);
        using var dialog = new SaveFileDialog
        {
            Title = Localization.Get(K.EditorResourceDownload),
            FileName = Path.GetFileName(localPath),
            Filter = string.IsNullOrWhiteSpace(extension)
                ? $"{Localization.Get(K.AllFilesFilterLabel)}|*.*"
                : $"{extension.TrimStart('.')} (*{extension})|*{extension}|{Localization.Get(K.AllFilesFilterLabel)}|*.*",
            OverwritePrompt = true
        };

        if (dialog.ShowDialog(owner) != DialogResult.OK)
            return true;

        File.Copy(localPath, dialog.FileName, overwrite: true);
        return true;
    }

    public static bool IsImageResource(string href)
    {
        if (string.IsNullOrWhiteSpace(href))
            return false;

        if (PageAssetStore.TryParseAssetUri(href, out var pageId, out var fileName) ||
            PageAssetStore.TryParseEditorUri(href, out pageId, out fileName))
        {
            return PageAssetStore.IsSupportedImageAssetFileName(fileName);
        }

        var localPath = TryResolveLocalPath(href);
        if (!string.IsNullOrWhiteSpace(localPath))
            return PageAssetStore.IsSupportedImageExtension(Path.GetExtension(localPath));

        if (Uri.TryCreate(href, UriKind.Absolute, out var uri) &&
            (uri.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) ||
             uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)))
        {
            return PageAssetStore.IsSupportedImageExtension(Path.GetExtension(uri.AbsolutePath));
        }

        return false;
    }

    public static string? TryResolveLocalPath(string href)
    {
        if (string.IsNullOrWhiteSpace(href))
            return null;

        if (PageAssetStore.TryParseAssetUri(href, out var pageId, out var fileName) ||
            PageAssetStore.TryParseEditorUri(href, out pageId, out fileName))
        {
            return PageAssetStore.TryGetAssetPath(pageId, fileName);
        }

        if (Uri.TryCreate(href, UriKind.Absolute, out var uri) &&
            uri.Scheme.Equals(Uri.UriSchemeFile, StringComparison.OrdinalIgnoreCase))
        {
            return File.Exists(uri.LocalPath) ? uri.LocalPath : null;
        }

        return File.Exists(href) ? Path.GetFullPath(href) : null;
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
