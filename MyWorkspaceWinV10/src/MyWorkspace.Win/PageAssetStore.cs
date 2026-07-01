namespace MyWorkspace.Win;

using System.Globalization;

internal static class PageAssetStore
{
    public const string EditorAssetHost = "page-assets.myworkspace";

    private static readonly string Root = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MyWorkspaceWinV10",
        "PageAssets");

    public static readonly string[] SupportedImageExtensions =
    [
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif"
    ];

    private static readonly HashSet<string> WordRasterizationExtensions =
        new(StringComparer.OrdinalIgnoreCase) { ".webp", ".avif" };

    public static string GetPageFolder(int pageId) =>
        Path.Combine(Root, pageId.ToString(CultureInfo.InvariantCulture));

    public static string AssetsRoot => Root;

    public static void ConfigureEditorWebView(Microsoft.Web.WebView2.Core.CoreWebView2 webView)
    {
        Directory.CreateDirectory(Root);
        webView.SetVirtualHostNameToFolderMapping(
            EditorAssetHost,
            Root,
            Microsoft.Web.WebView2.Core.CoreWebView2HostResourceAccessKind.Allow);
    }

    public static string ImportImage(int pageId, string sourcePath) =>
        ImportAsset(pageId, sourcePath, imageOnly: true);

    public static string ImportFile(int pageId, string sourcePath) =>
        ImportAsset(pageId, sourcePath, imageOnly: false);

    public static string ImportAsset(int pageId, string sourcePath, bool imageOnly)
    {
        var extension = Path.GetExtension(sourcePath);
        if (string.IsNullOrWhiteSpace(extension))
            throw new InvalidOperationException("File extension is required.");

        if (imageOnly && !IsSupportedImageExtension(extension))
            throw new InvalidOperationException(Localization.Format(K.UnsupportedImageFormat, extension));

        var fileName = $"{Guid.NewGuid():N}{extension.ToLowerInvariant()}";
        var content = File.ReadAllBytes(sourcePath);
        SaveAsset(pageId, fileName, content);
        return fileName;
    }

    public static bool IsSupportedImageExtension(string extension) =>
        SupportedImageExtensions.Contains(NormalizeExtension(extension));

    public static bool IsSupportedExtension(string extension) =>
        IsSupportedImageExtension(extension);

    public static bool RequiresWordRasterization(string extension) =>
        WordRasterizationExtensions.Contains(NormalizeExtension(extension));

    private static string NormalizeExtension(string extension) =>
        string.IsNullOrWhiteSpace(extension) ? string.Empty : extension.ToLowerInvariant();

    public static string BuildMarkdownImageReference(int pageId, string fileName, string altText) =>
        $"![{altText}]({BuildAssetUri(pageId, fileName)})";

    public static string BuildMarkdownReference(int pageId, string fileName, string altText) =>
        BuildMarkdownImageReference(pageId, fileName, altText);

    public static string BuildMarkdownFileReference(int pageId, string fileName, string? displayName = null)
    {
        var label = string.IsNullOrWhiteSpace(displayName)
            ? fileName
            : displayName.Trim();
        return $"[{label}]({BuildAssetUri(pageId, fileName)})";
    }

    public static string BuildAssetUri(int pageId, string fileName) =>
        $"page-asset:{pageId}/{fileName}";

    public static byte[]? TryGetAssetBytes(int pageId, string fileName)
    {
        if (!IsValidFileName(fileName))
            return null;

        if (SessionContext.IsLoggedIn && AppConfig.Services != null)
        {
            var fromDb = AppConfig.Services.PageAssets.TryGetAssetBytes(
                SessionContext.CurrentUser,
                pageId,
                fileName);
            if (fromDb != null)
                return fromDb;
        }

        var localPath = GetLocalCachePath(pageId, fileName);
        return File.Exists(localPath) ? File.ReadAllBytes(localPath) : null;
    }

    public static string? TryGetAssetPath(int pageId, string fileName)
    {
        if (!IsValidFileName(fileName))
            return null;

        var localPath = GetLocalCachePath(pageId, fileName);
        if (File.Exists(localPath))
            return localPath;

        var bytes = TryGetAssetBytes(pageId, fileName);
        if (bytes == null)
            return null;

        WriteLocalCache(pageId, fileName, bytes);
        return localPath;
    }

    public static string? TryGetAssetPathFromUri(string uri)
    {
        if (!TryParseAssetUri(uri, out var pageId, out var fileName))
            return null;

        return TryGetAssetPath(pageId, fileName);
    }

    public static bool TryParseAssetUri(string uri, out int pageId, out string fileName)
    {
        pageId = 0;
        fileName = string.Empty;

        if (string.IsNullOrWhiteSpace(uri))
            return false;

        const string prefix = "page-asset:";
        if (!uri.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            return false;

        var remainder = uri[prefix.Length..];
        var slash = remainder.IndexOf('/');
        if (slash <= 0)
            return false;

        if (!int.TryParse(remainder[..slash], out pageId))
            return false;

        fileName = remainder[(slash + 1)..];
        return IsValidFileName(fileName);
    }

    public static string ToEditorUri(int pageId, string fileName)
    {
        if (TryGetAssetPath(pageId, fileName) == null)
            throw new FileNotFoundException("Page asset not found.", fileName);

        return $"https://{EditorAssetHost}/{pageId}/{fileName}";
    }

    public static bool TryParseEditorUri(string url, out int pageId, out string fileName)
    {
        pageId = 0;
        fileName = string.Empty;

        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri))
            return false;

        if (!uri.Host.Equals(EditorAssetHost, StringComparison.OrdinalIgnoreCase))
            return false;

        var path = uri.AbsolutePath.Trim('/');
        var slash = path.IndexOf('/');
        if (slash <= 0)
            return false;

        if (!int.TryParse(path[..slash], out pageId))
            return false;

        fileName = Uri.UnescapeDataString(path[(slash + 1)..]);
        return IsValidFileName(fileName);
    }

    public static string ToFileUri(int pageId, string fileName)
    {
        var path = TryGetAssetPath(pageId, fileName)
            ?? throw new FileNotFoundException("Page asset not found.", fileName);

        return new Uri(path).AbsoluteUri;
    }

    public static void EnsureAssetsMaterialized(int pageId, string markdown)
    {
        foreach (var fileName in PageMarkdownNormalizer.GetReferencedFileNames(markdown, pageId))
            TryGetAssetPath(pageId, fileName);
    }

    public static void SyncAssetsWithContent(int pageId, string markdown)
    {
        if (!SessionContext.IsLoggedIn || AppConfig.Services == null)
            return;

        var referenced = PageMarkdownNormalizer.GetReferencedFileNames(markdown, pageId);
        foreach (var fileName in referenced)
            MigrateLocalAssetToDatabase(pageId, fileName);

        AppConfig.Services.PageAssets.PruneUnreferencedAssets(
            SessionContext.CurrentUser,
            pageId,
            referenced);
    }

    public static string BuildOpenFileFilter() =>
        string.Join("|",
            Localization.Get(K.ImageFileFilterLabel),
            string.Join(";", SupportedImageExtensions.Select(static e => $"*{e}")),
            Localization.Get(K.AllFilesFilterLabel),
            "*.*");

    public static string BuildOpenAttachmentFilter() =>
        string.Join("|",
            Localization.Get(K.AllFilesFilterLabel),
            "*.*");

    public static void WriteAssetBytes(int pageId, string fileName, byte[] content) =>
        SaveAsset(pageId, fileName, content);

    private static void SaveAsset(int pageId, string fileName, byte[] content)
    {
        if (!IsValidFileName(fileName))
            throw new InvalidOperationException("Invalid asset file name.");

        if (SessionContext.IsLoggedIn && AppConfig.Services != null)
        {
            AppConfig.Services.PageAssets.SaveAsset(
                SessionContext.CurrentUser,
                pageId,
                fileName,
                content);
        }

        WriteLocalCache(pageId, fileName, content);
    }

    private static void MigrateLocalAssetToDatabase(int pageId, string fileName)
    {
        if (!SessionContext.IsLoggedIn || AppConfig.Services == null)
            return;

        if (AppConfig.Services.PageAssets.AssetExists(SessionContext.CurrentUser, pageId, fileName))
            return;

        var localPath = GetLocalCachePath(pageId, fileName);
        if (!File.Exists(localPath))
            return;

        AppConfig.Services.PageAssets.SaveAsset(
            SessionContext.CurrentUser,
            pageId,
            fileName,
            File.ReadAllBytes(localPath));
    }

    private static string GetLocalCachePath(int pageId, string fileName) =>
        Path.Combine(GetPageFolder(pageId), fileName);

    private static void WriteLocalCache(int pageId, string fileName, byte[] content)
    {
        var folder = GetPageFolder(pageId);
        Directory.CreateDirectory(folder);
        File.WriteAllBytes(Path.Combine(folder, fileName), content);
    }

    private static bool IsValidFileName(string fileName) =>
        !string.IsNullOrWhiteSpace(fileName) && !fileName.Contains("..", StringComparison.Ordinal);
}
