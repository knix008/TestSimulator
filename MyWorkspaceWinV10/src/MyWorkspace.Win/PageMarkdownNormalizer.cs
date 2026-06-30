using System.Text.RegularExpressions;

namespace MyWorkspace.Win;

internal static partial class PageMarkdownNormalizer
{
    [GeneratedRegex(@"!\[(?<alt>[^\]]*)\]\((?<url>page-asset:\d+/[^)]+)\)", RegexOptions.IgnoreCase)]
    private static partial Regex MarkdownAssetRegex();

    [GeneratedRegex(@"!\[(?<alt>[^\]]*)\]\((?<url>[^)]+)\)", RegexOptions.IgnoreCase)]
    private static partial Regex MarkdownImageRegex();

    [GeneratedRegex(@"<img\b[^>]*\ssrc=[""'](?<url>[^""']+)[""'][^>]*>", RegexOptions.IgnoreCase)]
    private static partial Regex HtmlImageRegex();

    public static bool ContainsAssetReferences(string markdown) =>
        !string.IsNullOrEmpty(markdown) && MarkdownAssetRegex().IsMatch(markdown);

    public static string ExpandAssetReferences(string markdown, int pageId) =>
        MarkdownAssetRegex().Replace(markdown, match =>
        {
            if (!PageAssetStore.TryParseAssetUri(match.Groups["url"].Value, out var assetPageId, out var fileName))
                return match.Value;

            if (assetPageId != pageId)
                return match.Value;

            var alt = match.Groups["alt"].Value;
            var fileUri = PageAssetStore.ToFileUri(pageId, fileName);
            return $"![{alt}]({fileUri})";
        });

    public static string CollapseEditorImages(string markdown, int pageId)
    {
        var folder = PageAssetStore.GetPageFolder(pageId);
        var normalizedFolder = folder.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            + Path.DirectorySeparatorChar;

        return MarkdownImageRegex().Replace(markdown, match =>
        {
            var url = match.Groups["url"].Value;
            if (PageAssetStore.TryParseAssetUri(url, out _, out _))
                return match.Value;

            if (!TryMapPathToAsset(url, normalizedFolder, pageId, out var assetUri))
                return match.Value;

            var alt = match.Groups["alt"].Value;
            return $"![{alt}]({assetUri})";
        });
    }

    public static string MaterializeAssetsForExport(string markdown, int pageId, string markdownFilePath)
    {
        var directory = Path.GetDirectoryName(markdownFilePath);
        if (string.IsNullOrWhiteSpace(directory))
            return markdown;

        var assetsFolderName = Path.GetFileNameWithoutExtension(markdownFilePath) + "_assets";
        var assetsFolder = Path.Combine(directory, assetsFolderName);
        Directory.CreateDirectory(assetsFolder);

        return MarkdownAssetRegex().Replace(markdown, match =>
        {
            var url = match.Groups["url"].Value;
            if (!PageAssetStore.TryParseAssetUri(url, out var assetPageId, out var fileName) || assetPageId != pageId)
                return match.Value;

            var sourcePath = PageAssetStore.TryGetAssetPath(pageId, fileName);
            if (string.IsNullOrWhiteSpace(sourcePath))
                return match.Value;

            var destinationPath = Path.Combine(assetsFolder, fileName);
            File.Copy(sourcePath, destinationPath, overwrite: true);

            var relativePath = $"{assetsFolderName}/{fileName}".Replace('\\', '/');
            var alt = match.Groups["alt"].Value;
            return $"![{alt}]({relativePath})";
        });
    }

    public static string CollapseHtmlImages(string html, int pageId)
    {
        var folder = PageAssetStore.GetPageFolder(pageId);
        var normalizedFolder = folder.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            + Path.DirectorySeparatorChar;

        return HtmlImageRegex().Replace(html, match =>
        {
            var url = match.Groups["url"].Value;
            if (PageAssetStore.TryParseAssetUri(url, out _, out _))
                return match.Value;

            if (!TryMapPathToAsset(url, normalizedFolder, pageId, out var assetUri))
                return match.Value;

            return match.Value.Replace(url, assetUri, StringComparison.OrdinalIgnoreCase);
        });
    }

    private static bool TryMapPathToAsset(string url, string normalizedFolder, int pageId, out string assetUri)
    {
        assetUri = string.Empty;
        string? localPath = null;

        if (url.StartsWith("file:", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                localPath = new Uri(url).LocalPath;
            }
            catch
            {
                return false;
            }
        }
        else if (Path.IsPathRooted(url))
        {
            localPath = url;
        }

        if (string.IsNullOrWhiteSpace(localPath))
            return false;

        var normalizedPath = Path.GetFullPath(localPath);
        if (!normalizedPath.StartsWith(normalizedFolder, StringComparison.OrdinalIgnoreCase))
            return false;

        var fileName = Path.GetFileName(normalizedPath);
        if (string.IsNullOrWhiteSpace(fileName))
            return false;

        assetUri = PageAssetStore.BuildAssetUri(pageId, fileName);
        return true;
    }
}
