namespace MyWorkspace.Win;

using System.Globalization;

internal static class PageAssetStore
{
    private static readonly string Root = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MyWorkspaceWinV10",
        "PageAssets");

    public static readonly string[] SupportedExtensions =
    [
        ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".avif", ".tif", ".tiff", ".ico", ".svg"
    ];

    private static readonly HashSet<string> WordRasterizationExtensions =
        new(StringComparer.OrdinalIgnoreCase) { ".webp", ".avif", ".svg" };

    public static string GetPageFolder(int pageId) => Path.Combine(Root, pageId.ToString(CultureInfo.InvariantCulture));

    public static string ImportImage(int pageId, string sourcePath)
    {
        var extension = Path.GetExtension(sourcePath);
        if (!IsSupportedExtension(extension))
            throw new InvalidOperationException($"Unsupported image format: {extension}");

        var folder = GetPageFolder(pageId);
        Directory.CreateDirectory(folder);

        var fileName = $"{Guid.NewGuid():N}{extension.ToLowerInvariant()}";
        var destination = Path.Combine(folder, fileName);
        File.Copy(sourcePath, destination, overwrite: true);
        return fileName;
    }

    public static bool IsSupportedExtension(string extension) =>
        SupportedExtensions.Contains(NormalizeExtension(extension));

    public static bool RequiresWordRasterization(string extension) =>
        WordRasterizationExtensions.Contains(NormalizeExtension(extension));

    private static string NormalizeExtension(string extension) =>
        string.IsNullOrWhiteSpace(extension) ? string.Empty : extension.ToLowerInvariant();

    public static string BuildMarkdownReference(int pageId, string fileName, string altText) =>
        $"![{altText}]({BuildAssetUri(pageId, fileName)})";

    public static string BuildAssetUri(int pageId, string fileName) =>
        $"page-asset:{pageId}/{fileName}";

    public static string? TryGetAssetPath(int pageId, string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName) || fileName.Contains("..", StringComparison.Ordinal))
            return null;

        var path = Path.Combine(GetPageFolder(pageId), fileName);
        return File.Exists(path) ? path : null;
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
        return !string.IsNullOrWhiteSpace(fileName);
    }

    public static string ToFileUri(int pageId, string fileName)
    {
        var path = TryGetAssetPath(pageId, fileName)
            ?? throw new FileNotFoundException("Page asset not found.", fileName);

        return new Uri(path).AbsoluteUri;
    }

    public static string BuildOpenFileFilter() =>
        string.Join("|",
            Localization.Get(K.ImageFileFilterLabel),
            string.Join(";", SupportedExtensions.Select(static e => $"*{e}")),
            Localization.Get(K.AllFilesFilterLabel),
            "*.*");

    public static void WriteAssetBytes(int pageId, string fileName, byte[] content)
    {
        if (string.IsNullOrWhiteSpace(fileName) || fileName.Contains("..", StringComparison.Ordinal))
            throw new InvalidOperationException("Invalid asset file name.");

        var folder = GetPageFolder(pageId);
        Directory.CreateDirectory(folder);
        File.WriteAllBytes(Path.Combine(folder, fileName), content);
    }
}
