using System.Text.RegularExpressions;

namespace MyWorkspace.Win;

internal sealed record PageMarkdownFileContent(string Title, string Body);

internal static partial class PageMarkdownImporter
{
    [GeneratedRegex(@"!\[(?<alt>[^\]]*)\]\((?<url>[^)]+)\)", RegexOptions.IgnoreCase)]
    private static partial Regex MarkdownImageRegex();

    [GeneratedRegex(@"(?<!!)\[(?<title>[^\]]*)\]\((?<url>[^)]+)\)", RegexOptions.IgnoreCase)]
    private static partial Regex MarkdownFileLinkRegex();

    public static PageMarkdownFileContent ReadFile(string markdownFilePath)
    {
        var raw = File.ReadAllText(markdownFilePath);
        var markdown = raw;
        var title = TryParseFrontMatterTitle(ref markdown);

        if (string.IsNullOrWhiteSpace(title))
            title = PageTitleHelper.ExtractTitleFromMarkdown(markdown);

        if (title == Localization.Get(K.UntitledPageTitle))
        {
            var fileTitle = Path.GetFileNameWithoutExtension(markdownFilePath).Trim();
            if (!string.IsNullOrWhiteSpace(fileTitle))
                title = fileTitle;
        }

        return new PageMarkdownFileContent(title.Trim(), markdown);
    }

    public static string ImportLocalAssets(string markdown, string markdownFilePath, int pageId)
    {
        markdown = ImportAssetLinks(markdown, markdownFilePath, pageId, MarkdownImageRegex(), imageLink: true);
        return ImportAssetLinks(markdown, markdownFilePath, pageId, MarkdownFileLinkRegex(), imageLink: false);
    }

    private static string ImportAssetLinks(
        string markdown,
        string markdownFilePath,
        int pageId,
        Regex regex,
        bool imageLink)
    {
        return regex.Replace(markdown, match =>
        {
            var url = match.Groups["url"].Value.Trim();
            if (ShouldSkipUrl(url))
                return match.Value;

            var localPath = ResolveLocalAssetPath(markdownFilePath, url);
            if (localPath == null)
                return match.Value;

            try
            {
                var extension = Path.GetExtension(localPath);
                var storedName = imageLink && PageAssetStore.IsSupportedImageExtension(extension)
                    ? PageAssetStore.ImportImage(pageId, localPath)
                    : PageAssetStore.ImportFile(pageId, localPath);

                var assetUri = PageAssetStore.BuildAssetUri(pageId, storedName);
                if (imageLink)
                {
                    var alt = match.Groups["alt"].Value;
                    return $"![{alt}]({assetUri})";
                }

                var label = match.Groups["title"].Value;
                return $"[{label}]({assetUri})";
            }
            catch
            {
                return match.Value;
            }
        });
    }

    private static bool ShouldSkipUrl(string url) =>
        url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
        url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
        url.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase) ||
        url.StartsWith("page-asset:", StringComparison.OrdinalIgnoreCase) ||
        url.StartsWith('#');

    private static string? ResolveLocalAssetPath(string markdownFilePath, string url)
    {
        var decoded = Uri.UnescapeDataString(url.Trim().Trim('"', '\''));
        if (string.IsNullOrWhiteSpace(decoded))
            return null;

        if (Path.IsPathRooted(decoded))
            return File.Exists(decoded) ? decoded : null;

        var markdownDirectory = Path.GetDirectoryName(markdownFilePath);
        if (string.IsNullOrWhiteSpace(markdownDirectory))
            return null;

        var normalizedRelative = decoded.Replace('/', Path.DirectorySeparatorChar);
        var combined = Path.GetFullPath(Path.Combine(markdownDirectory, normalizedRelative));
        if (File.Exists(combined))
            return combined;

        var assetsFolderName = Path.GetFileNameWithoutExtension(markdownFilePath) + "_assets";
        var assetsCandidate = Path.GetFullPath(
            Path.Combine(markdownDirectory, assetsFolderName, Path.GetFileName(normalizedRelative)));
        return File.Exists(assetsCandidate) ? assetsCandidate : null;
    }

    private static string? TryParseFrontMatterTitle(ref string markdown)
    {
        if (!markdown.StartsWith("---", StringComparison.Ordinal))
            return null;

        var closingIndex = markdown.IndexOf("\n---", 3, StringComparison.Ordinal);
        if (closingIndex < 0)
            return null;

        var frontMatter = markdown[3..closingIndex];
        markdown = markdown[(closingIndex + 4)..].TrimStart();

        foreach (var rawLine in frontMatter.Split('\n'))
        {
            var line = rawLine.Trim();
            if (!line.StartsWith("title:", StringComparison.OrdinalIgnoreCase))
                continue;

            var value = line["title:".Length..].Trim();
            if (value.Length >= 2 &&
                ((value.StartsWith('"') && value.EndsWith('"')) ||
                 (value.StartsWith('\'') && value.EndsWith('\''))))
            {
                value = value[1..^1];
            }

            return string.IsNullOrWhiteSpace(value) ? null : value;
        }

        return null;
    }
}
