using System.Text.RegularExpressions;

namespace MyWorkspace.Win;

internal static partial class PageMarkdownNormalizer
{
    [GeneratedRegex(@"!\[(?<alt>[^\]]*)\]\((?<url>page-asset:\d+/[^)]+)\)", RegexOptions.IgnoreCase)]
    private static partial Regex MarkdownImageAssetRegex();

    [GeneratedRegex(@"(?<!!)\[(?<title>[^\]]*)\]\((?<url>page-asset:\d+/[^)]+)\)", RegexOptions.IgnoreCase)]
    private static partial Regex MarkdownFileAssetRegex();

    [GeneratedRegex(@"!\[(?<alt>[^\]]*)\]\((?<url>[^)]+)\)", RegexOptions.IgnoreCase)]
    private static partial Regex MarkdownImageRegex();

    [GeneratedRegex(@"(?<!!)\[(?<title>[^\]]*)\]\((?<url>[^)]+)\)", RegexOptions.IgnoreCase)]
    private static partial Regex MarkdownFileLinkRegex();

    [GeneratedRegex(@"<img\b[^>]*\ssrc=[""'](?<url>[^""']+)[""'][^>]*>", RegexOptions.IgnoreCase)]
    private static partial Regex HtmlImageRegex();

    [GeneratedRegex(@"<span\b[^>]*class=[""']editor-image-wrap[""'][^>]*>(?<inner>.*?)</span>", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex EditorImageWrapRegex();

    [GeneratedRegex(@"<a\b[^>]*class=[""']editor-file-attachment[""'][^>]*\shref=[""'](?<url>[^""']+)[""'][^>]*>(?<text>.*?)</a>", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex HtmlFileAttachmentRegex();

    public static bool ContainsAssetReferences(string markdown) =>
        EnumerateAssetUriReferences(markdown).Any();

    public static IEnumerable<string> EnumerateAssetUriReferences(string markdown)
    {
        if (string.IsNullOrEmpty(markdown))
            yield break;

        foreach (Match match in MarkdownImageAssetRegex().Matches(markdown))
            yield return match.Groups["url"].Value;

        foreach (Match match in MarkdownFileAssetRegex().Matches(markdown))
            yield return match.Groups["url"].Value;
    }

    public static IReadOnlyList<string> GetReferencedFileNames(string markdown, int pageId)
    {
        var fileNames = new List<string>();
        foreach (var uri in EnumerateAssetUriReferences(markdown))
        {
            if (!PageAssetStore.TryParseAssetUri(uri, out var assetPageId, out var fileName))
                continue;

            if (assetPageId != pageId)
                continue;

            if (!fileNames.Contains(fileName, StringComparer.OrdinalIgnoreCase))
                fileNames.Add(fileName);
        }

        return fileNames;
    }

    public static string ExpandAssetReferences(string markdown, int pageId)
    {
        markdown = ExpandImageAssetReferences(markdown, pageId);
        return ExpandFileAssetReferences(markdown, pageId);
    }

    public static string PrepareHtmlForMarkdown(string html, int pageId)
    {
        html = UnwrapResizableImages(html);
        html = CollapseHtmlImages(html, pageId);
        html = CollapseHtmlFileAttachments(html, pageId);
        return html;
    }

    public static string CollapseEditorImages(string markdown, int pageId) =>
        CollapseLocalAssetLinks(markdown, pageId, MarkdownImageRegex(), static (alt, uri) => $"![{alt}]({uri})");

    public static string CollapseEditorFileLinks(string markdown, int pageId) =>
        CollapseLocalAssetLinks(markdown, pageId, MarkdownFileLinkRegex(), static (title, uri) => $"[{title}]({uri})");

    public static string MaterializeAssetsForExport(string markdown, int pageId, string markdownFilePath)
    {
        var directory = Path.GetDirectoryName(markdownFilePath);
        if (string.IsNullOrWhiteSpace(directory))
            return markdown;

        var assetsFolderName = Path.GetFileNameWithoutExtension(markdownFilePath) + "_assets";
        var assetsFolder = Path.Combine(directory, assetsFolderName);
        Directory.CreateDirectory(assetsFolder);

        markdown = MaterializeAssetMatches(markdown, pageId, assetsFolderName, assetsFolder, MarkdownImageAssetRegex(),
            static (alt, relativePath) => $"![{alt}]({relativePath})");
        return MaterializeAssetMatches(markdown, pageId, assetsFolderName, assetsFolder, MarkdownFileAssetRegex(),
            static (title, relativePath) => $"[{title}]({relativePath})");
    }

    public static string CollapseHtmlImages(string html, int pageId) =>
        CollapseHtmlAssetUrls(html, pageId, HtmlImageRegex());

    public static string CollapseHtmlFileAttachments(string html, int pageId)
    {
        html = HtmlFileAttachmentRegex().Replace(html, match =>
        {
            var url = match.Groups["url"].Value;
            if (PageAssetStore.TryParseAssetUri(url, out _, out _))
                return match.Value;

            if (!TryMapPathToAsset(url, GetNormalizedPageFolder(pageId), pageId, out var assetUri))
                return match.Value;

            var text = match.Groups["text"].Value;
            return $"""<a class="editor-file-attachment" href="{assetUri}">{text}</a>""";
        });

        return html;
    }

    private static string ExpandImageAssetReferences(string markdown, int pageId) =>
        MarkdownImageAssetRegex().Replace(markdown, match => ExpandAssetMatch(match, pageId, static (alt, fileUri) => $"![{alt}]({fileUri})"));

    private static string ExpandFileAssetReferences(string markdown, int pageId) =>
        MarkdownFileAssetRegex().Replace(markdown, match => ExpandAssetMatch(match, pageId, static (title, fileUri) => $"[{title}]({fileUri})"));

    private static string ExpandAssetMatch(Match match, int pageId, Func<string, string, string> format)
    {
        if (!PageAssetStore.TryParseAssetUri(match.Groups["url"].Value, out var assetPageId, out var fileName))
            return match.Value;

        if (assetPageId != pageId)
            return match.Value;

        var label = match.Groups.Count > 2 && match.Groups["alt"].Success
            ? match.Groups["alt"].Value
            : match.Groups["title"].Value;
        var fileUri = PageAssetStore.ToEditorUri(pageId, fileName);
        return format(label, fileUri);
    }

    private static string CollapseLocalAssetLinks(
        string markdown,
        int pageId,
        Regex regex,
        Func<string, string, string> format)
    {
        var normalizedFolder = GetNormalizedPageFolder(pageId);
        return regex.Replace(markdown, match =>
        {
            var url = match.Groups["url"].Value;
            if (PageAssetStore.TryParseAssetUri(url, out _, out _))
                return match.Value;

            if (!TryMapPathToAsset(url, normalizedFolder, pageId, out var assetUri))
                return match.Value;

            var label = match.Groups["alt"].Success
                ? match.Groups["alt"].Value
                : match.Groups["title"].Value;
            return format(label, assetUri);
        });
    }

    private static string MaterializeAssetMatches(
        string markdown,
        int pageId,
        string assetsFolderName,
        string assetsFolder,
        Regex regex,
        Func<string, string, string> format)
    {
        return regex.Replace(markdown, match =>
        {
            var url = match.Groups["url"].Value;
            if (!PageAssetStore.TryParseAssetUri(url, out var assetPageId, out var fileName) || assetPageId != pageId)
                return match.Value;

            var sourcePath = PageAssetStore.TryGetAssetPath(pageId, fileName);
            byte[]? assetBytes = null;
            if (!string.IsNullOrWhiteSpace(sourcePath) && File.Exists(sourcePath))
                assetBytes = File.ReadAllBytes(sourcePath);
            else
                assetBytes = PageAssetStore.TryGetAssetBytes(pageId, fileName);

            if (assetBytes == null)
                return match.Value;

            var destinationPath = Path.Combine(assetsFolder, fileName);
            File.WriteAllBytes(destinationPath, assetBytes);

            var relativePath = $"{assetsFolderName}/{fileName}".Replace('\\', '/');
            var label = match.Groups["alt"].Success
                ? match.Groups["alt"].Value
                : match.Groups["title"].Value;
            return format(label, relativePath);
        });
    }

    private static string UnwrapResizableImages(string html) =>
        EditorImageWrapRegex().Replace(html, match =>
        {
            var inner = match.Groups["inner"].Value;
            var imgMatch = HtmlImageRegex().Match(inner);
            return imgMatch.Success ? imgMatch.Value : inner;
        });

    private static string CollapseHtmlAssetUrls(string html, int pageId, Regex regex)
    {
        var normalizedFolder = GetNormalizedPageFolder(pageId);
        return regex.Replace(html, match =>
        {
            var url = match.Groups["url"].Value;
            if (PageAssetStore.TryParseAssetUri(url, out _, out _))
                return match.Value;

            if (!TryMapPathToAsset(url, normalizedFolder, pageId, out var assetUri))
                return match.Value;

            return match.Value.Replace(url, assetUri, StringComparison.OrdinalIgnoreCase);
        });
    }

    private static string GetNormalizedPageFolder(int pageId)
    {
        var folder = PageAssetStore.GetPageFolder(pageId);
        return folder.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
            + Path.DirectorySeparatorChar;
    }

    private static bool TryMapPathToAsset(string url, string normalizedFolder, int pageId, out string assetUri)
    {
        assetUri = string.Empty;

        if (PageAssetStore.TryParseEditorUri(url, out var editorPageId, out var editorFileName) &&
            editorPageId == pageId)
        {
            assetUri = PageAssetStore.BuildAssetUri(pageId, editorFileName);
            return true;
        }

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
