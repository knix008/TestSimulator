namespace MyWorkspace.Win;

using System.Globalization;
using Microsoft.Web.WebView2.Core;
using MyWorkspace.Core;
using MyWorkspace.Data;

internal static class PageAssetStore
{
    public const string EditorAssetHost = "page-assets.myworkspace";

    private static readonly string Root = Path.GetFullPath(Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MyWorkspaceWinV10",
        "PageAssets"));

    public static readonly string[] SupportedImageExtensions =
    [
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"
    ];

    private static readonly HashSet<string> WordRasterizationExtensions =
        new(StringComparer.OrdinalIgnoreCase) { ".webp", ".avif", ".svg" };

    public static string GetPageFolder(int pageId) =>
        Path.Combine(Root, pageId.ToString(CultureInfo.InvariantCulture));

    public static string AssetsRoot => Root;

    public static void ConfigureEditorWebView(CoreWebView2 webView)
    {
        Directory.CreateDirectory(Root);
        webView.SetVirtualHostNameToFolderMapping(
            EditorAssetHost,
            Root,
            CoreWebView2HostResourceAccessKind.Allow);
    }

    public static string ImportImage(int pageId, string sourcePath) =>
        ImportAsset(pageId, sourcePath, imageOnly: true);

    public static string ImportImageBytes(int pageId, byte[] content, string extension, string? preferredFileName = null)
    {
        if (string.IsNullOrWhiteSpace(extension))
            throw new InvalidOperationException(Localization.Format(K.UnsupportedImageFormat, extension));

        if (!IsSupportedImageExtension(extension))
            throw new InvalidOperationException(Localization.Format(K.UnsupportedImageFormat, extension));

        var fileName = AllocateUniqueAssetFileName(pageId, preferredFileName, extension);
        SaveAsset(pageId, fileName, content);
        return fileName;
    }

    public static string ImportFile(int pageId, string sourcePath) =>
        ImportAsset(pageId, sourcePath, imageOnly: false);

    public static string ImportAsset(int pageId, string sourcePath, bool imageOnly)
    {
        var extension = Path.GetExtension(sourcePath);
        if (imageOnly)
        {
            if (string.IsNullOrWhiteSpace(extension))
                throw new InvalidOperationException(Localization.Format(K.UnsupportedImageFormat, extension));

            if (!IsSupportedImageExtension(extension))
                throw new InvalidOperationException(Localization.Format(K.UnsupportedImageFormat, extension));
        }

        var fileName = AllocateUniqueAssetFileName(pageId, Path.GetFileName(sourcePath), extension);
        var content = File.ReadAllBytes(sourcePath);
        SaveAsset(pageId, fileName, content);
        return fileName;
    }

    public static bool IsSupportedImageExtension(string extension) =>
        SupportedImageExtensions.Contains(NormalizeExtension(extension));

    public static string GetAssetFileExtension(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return string.Empty;

        var normalized = System.Text.RegularExpressions.Regex.Replace(
            fileName.Trim(),
            @"\s+\(\d+\)$",
            string.Empty);
        return NormalizeExtension(Path.GetExtension(normalized));
    }

    public static bool IsSupportedImageAssetFileName(string fileName) =>
        IsSupportedImageExtension(GetAssetFileExtension(fileName));

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
        if (TryParseAssetUri(uri, out var pageId, out var fileName))
            return TryGetAssetPath(pageId, fileName);

        if (TryParseEditorUri(uri, out pageId, out fileName))
            return TryGetAssetPath(pageId, fileName);

        return null;
    }

    public static string? TryResolveExportAssetPath(string url, string exportFilePath)
    {
        if (string.IsNullOrWhiteSpace(url))
            return null;

        var fromUri = TryGetAssetPathFromUri(url);
        if (!string.IsNullOrWhiteSpace(fromUri) && File.Exists(fromUri))
            return fromUri;

        if (File.Exists(url))
            return Path.GetFullPath(url);

        if (url.StartsWith("file:", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var localPath = new Uri(url).LocalPath;
                if (File.Exists(localPath))
                    return localPath;
            }
            catch
            {
                return null;
            }
        }

        var outputDirectory = Path.GetDirectoryName(exportFilePath);
        if (string.IsNullOrWhiteSpace(outputDirectory))
            return null;

        var relativePath = url.Replace('/', Path.DirectorySeparatorChar);
        var combined = Path.GetFullPath(Path.Combine(outputDirectory, relativePath));
        if (!combined.StartsWith(Path.GetFullPath(outputDirectory), StringComparison.OrdinalIgnoreCase))
            return null;

        return File.Exists(combined) ? combined : null;
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

    public static string BuildEditorUri(int pageId, string fileName)
    {
        if (!IsValidFileName(fileName))
            throw new InvalidOperationException("Invalid asset file name.");

        return $"https://{EditorAssetHost}/{pageId}/{Uri.EscapeDataString(fileName)}";
    }

    public static string ToEditorUri(int pageId, string fileName)
    {
        if (TryGetAssetPath(pageId, fileName) == null)
            throw new FileNotFoundException("Page asset not found.", fileName);

        return BuildEditorUri(pageId, fileName);
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

    public static void EnsureCombinedAssetsMaterialized(string markdown)
    {
        foreach (var (pageId, fileName) in PageMarkdownNormalizer.GetAllReferencedAssets(markdown))
            TryGetAssetPath(pageId, fileName);
    }

    public static void SyncAssetsWithContent(int pageId, string markdown, AppServices? services = null) =>
        SyncAssetsWithReferencedFiles(
            pageId,
            PageMarkdownNormalizer.GetReferencedFileNames(markdown, pageId),
            services);

    public static void SyncAssetsWithReferencedFiles(
        int pageId,
        IReadOnlyCollection<string> referenced,
        AppServices? services = null)
    {
        services ??= AppConfig.Services;
        if (!SessionContext.IsLoggedIn || services == null)
            return;

        foreach (var fileName in referenced)
            MigrateLocalAssetToDatabase(pageId, fileName, services);

        services.PageAssets.PruneUnreferencedAssets(
            SessionContext.CurrentUser,
            pageId,
            referenced);
    }

    public static IReadOnlyCollection<string> CollectReferencedFileNames(
        int pageId,
        string pageMarkdown,
        IEnumerable<string> additionalMarkdown)
    {
        var referenced = new HashSet<string>(
            PageMarkdownNormalizer.GetReferencedFileNames(pageMarkdown, pageId),
            StringComparer.OrdinalIgnoreCase);

        foreach (var markdown in additionalMarkdown)
        {
            foreach (var fileName in PageMarkdownNormalizer.GetReferencedFileNames(markdown, pageId))
                referenced.Add(fileName);
        }

        return referenced;
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
        fileName = EnsureWritableAssetFileName(pageId, fileName, content);
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

    private static string AllocateUniqueAssetFileName(int pageId, string? preferredFileName, string? extensionHint = null)
    {
        var sanitized = SanitizeAssetFileName(preferredFileName);
        if (string.IsNullOrWhiteSpace(sanitized))
        {
            var extension = NormalizeExtension(extensionHint ?? Path.GetExtension(preferredFileName ?? string.Empty));
            return string.IsNullOrWhiteSpace(extension)
                ? Guid.NewGuid().ToString("N")
                : $"{Guid.NewGuid():N}{extension}";
        }

        if (!Path.HasExtension(sanitized) && !string.IsNullOrWhiteSpace(extensionHint))
            sanitized += NormalizeExtension(extensionHint);

        var existing = ListExistingAssetFileNames(pageId);
        var candidate = MakeUniqueAssetFileName(sanitized, existing);
        while (AssetFileNameExists(pageId, candidate))
        {
            existing = ListExistingAssetFileNames(pageId);
            candidate = MakeUniqueAssetFileName(candidate, existing);
        }

        return candidate;
    }

    private static string MakeUniqueAssetFileName(string sanitized, IEnumerable<string> existingNames)
    {
        var comparer = StringComparer.OrdinalIgnoreCase;
        var existing = existingNames as IReadOnlyCollection<string> ?? existingNames.ToList();
        if (!existing.Contains(sanitized, comparer))
            return sanitized;

        var extension = Path.GetExtension(sanitized);
        var baseName = Path.GetFileNameWithoutExtension(sanitized);
        if (string.IsNullOrEmpty(baseName))
            baseName = "asset";

        for (var index = 2; index < int.MaxValue; index++)
        {
            var candidate = $"{baseName}_{index}{extension}";
            if (!existing.Contains(candidate, comparer))
                return candidate;
        }

        return $"{baseName}_{Guid.NewGuid():N[..8]}{extension}";
    }

    private static string EnsureWritableAssetFileName(int pageId, string fileName, byte[] content)
    {
        if (!IsValidFileName(fileName))
            return fileName;

        if (!AssetFileNameExists(pageId, fileName))
            return fileName;

        var existing = ListExistingAssetFileNames(pageId);
        return MakeUniqueAssetFileName(fileName, existing);
    }

    private static bool AssetFileNameExists(int pageId, string fileName)
    {
        if (!IsValidFileName(fileName))
            return false;

        if (File.Exists(GetLocalCachePath(pageId, fileName)))
            return true;

        if (SessionContext.IsLoggedIn && AppConfig.Services != null)
        {
            return AppConfig.Services.PageAssets.AssetExists(
                SessionContext.CurrentUser,
                pageId,
                fileName);
        }

        return false;
    }

    public static string CloneEmbeddedPageAssetHtml(string html, int pageId)
    {
        if (string.IsNullOrWhiteSpace(html))
            return html;

        string MapUri(string uri)
        {
            if (string.IsNullOrWhiteSpace(uri))
                return uri;

            if (!PageMarkdownNormalizer.TryParseAnyPageAssetReference(uri, out var assetPageId, out var fileName)
                || assetPageId != pageId)
            {
                return uri;
            }

            var bytes = TryGetAssetBytes(pageId, fileName);
            if (bytes == null)
                return uri;

            var newFileName = AllocateUniqueAssetFileName(pageId, fileName, Path.GetExtension(fileName));
            SaveAsset(pageId, newFileName, bytes);
            return BuildEditorUri(pageId, newFileName);
        }

        html = System.Text.RegularExpressions.Regex.Replace(
            html,
            @"\b(?:src|href)\s*=\s*([""'])(?<url>[^""']+)\1",
            match =>
            {
                var mappedUri = MapUri(match.Groups["url"].Value);
                return match.Value.Replace(match.Groups["url"].Value, mappedUri, StringComparison.Ordinal);
            },
            System.Text.RegularExpressions.RegexOptions.IgnoreCase);

        return html;
    }

    private static IReadOnlyList<string> ListExistingAssetFileNames(int pageId)
    {
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var folder = GetPageFolder(pageId);
        if (Directory.Exists(folder))
        {
            foreach (var path in Directory.EnumerateFiles(folder))
            {
                var name = Path.GetFileName(path);
                if (!string.IsNullOrWhiteSpace(name))
                    names.Add(name);
            }
        }

        if (SessionContext.IsLoggedIn && AppConfig.Services != null)
        {
            foreach (var name in AppConfig.Services.PageAssets.GetAssetFileNames(SessionContext.CurrentUser, pageId))
            {
                if (!string.IsNullOrWhiteSpace(name))
                    names.Add(name);
            }

            var page = AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId);
            if (page != null)
            {
                foreach (var name in PageMarkdownNormalizer.GetReferencedFileNames(page.Content, pageId))
                {
                    if (!string.IsNullOrWhiteSpace(name))
                        names.Add(name);
                }
            }
        }

        return names.ToList();
    }

    private static string SanitizeAssetFileName(string? fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName))
            return string.Empty;

        var trimmed = Path.GetFileName(fileName.Trim());
        if (string.IsNullOrWhiteSpace(trimmed) || trimmed.Contains("..", StringComparison.Ordinal))
            return string.Empty;

        foreach (var invalid in Path.GetInvalidFileNameChars())
            trimmed = trimmed.Replace(invalid, '_');

        trimmed = System.Text.RegularExpressions.Regex.Replace(
            trimmed,
            @"\s+\((\d+)\)(?=\.[^.]+$)",
            "_$1");
        trimmed = trimmed.Replace(' ', '_');

        return trimmed.Trim('_');
    }

    private static void MigrateLocalAssetToDatabase(int pageId, string fileName, AppServices? services = null)
    {
        services ??= AppConfig.Services;
        if (!SessionContext.IsLoggedIn || services == null)
            return;

        if (services.PageAssets.AssetExists(SessionContext.CurrentUser, pageId, fileName))
            return;

        var localPath = GetLocalCachePath(pageId, fileName);
        if (!File.Exists(localPath))
            return;

        services.PageAssets.SaveAsset(
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

    private static string GetAssetContentType(string fileName) =>
        Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".gif" => "image/gif",
            ".webp" => "image/webp",
            ".svg" => "image/svg+xml",
            ".avif" => "image/avif",
            ".bmp" => "image/bmp",
            _ => "application/octet-stream"
        };
}
