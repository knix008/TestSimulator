using System.Text.RegularExpressions;

namespace MyWorkspace.Win;

internal static partial class PageMarkdownNormalizer
{
    [GeneratedRegex(@"!\[(?<alt>[^\]]*)\]\((?<url>page-asset:\d+/[^)]+)\)", RegexOptions.IgnoreCase)]
    private static partial Regex MarkdownImageAssetRegex();

    [GeneratedRegex(@"(?<!!)\[(?<title>[^\]]*)\]\((?<url>page-asset:\d+/[^)]+)\)", RegexOptions.IgnoreCase)]
    private static partial Regex MarkdownFileAssetRegex();

    [GeneratedRegex(@"!\[(?<alt>[^\]]*)\]\(\s*(?<url>[^)\s]+)\s*(?:""(?<title>[^""]*)"")?\s*\)", RegexOptions.IgnoreCase)]
    private static partial Regex MarkdownImageRegex();

    [GeneratedRegex(@"(?<!!)\[(?<title>[^\]]*)\]\((?<url>[^)]+)\)", RegexOptions.IgnoreCase)]
    private static partial Regex MarkdownFileLinkRegex();

    [GeneratedRegex(@"<img\b[^>]*\ssrc=[""'](?<url>[^""']+)[""'][^>]*>", RegexOptions.IgnoreCase)]
    private static partial Regex HtmlImageRegex();

    [GeneratedRegex(@"<img\b(?<attrs>[^>]*?)\/?>", RegexOptions.IgnoreCase)]
    private static partial Regex HtmlImgTagRegex();

    [GeneratedRegex(@"\bwidth\s*:\s*(?<width>\d+)\s*px", RegexOptions.IgnoreCase)]
    private static partial Regex CssWidthPxRegex();

    [GeneratedRegex(@"<span\b(?<wrapattrs>[^>]*\beditor-image-wrap\b[^>]*)>(?<inner><img\b[^>]*>[\s\S]*?)</span>", RegexOptions.IgnoreCase)]
    private static partial Regex EditorImageWrapRegex();

    [GeneratedRegex(@"<a\b[^>]*class=[""']editor-file-attachment[""'][^>]*\shref=[""'](?<url>[^""']+)[""'][^>]*>(?<text>.*?)</a>", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex HtmlFileAttachmentRegex();

    [GeneratedRegex(@"<a\b(?<before>[^>]*?\shref=[""'])(?<url>[^""']+)(?<after>[""'][^>]*?)>(?<text>.*?)</a>", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex HtmlAnchorRegex();


    [GeneratedRegex(@"@@MYWS-SIZED-\d+@@", RegexOptions.IgnoreCase)]
    private static partial Regex BrokenSizedImagePlaceholderRegex();

    [GeneratedRegex(@"EDITOR(?:\\_)?_SIZED(?:\\_)?_IMAGE(?:\\_)?_\d+", RegexOptions.IgnoreCase)]
    private static partial Regex BrokenLegacySizedImagePlaceholderRegex();

    private const string SizedImagePlaceholderPrefix = "@@MYWS-SIZED-";
    private const string SizedImagePlaceholderSuffix = "@@";

    public static string SanitizeBrokenImagePlaceholders(string markdown)
    {
        if (string.IsNullOrEmpty(markdown))
            return markdown;

        markdown = BrokenSizedImagePlaceholderRegex().Replace(markdown, string.Empty);
        markdown = BrokenLegacySizedImagePlaceholderRegex().Replace(markdown, string.Empty);
        return markdown;
    }

    public static bool ContainsAssetReferences(string markdown) =>
        EnumerateAssetUriReferences(markdown).Any();

    public static IEnumerable<string> EnumerateAssetUriReferences(string markdown)
    {
        if (string.IsNullOrEmpty(markdown))
            yield break;

        foreach (Match match in MarkdownImageRegex().Matches(markdown))
            yield return match.Groups["url"].Value;

        foreach (Match match in MarkdownFileLinkRegex().Matches(markdown))
            yield return match.Groups["url"].Value;

        foreach (Match match in HtmlImageRegex().Matches(markdown))
            yield return match.Groups["url"].Value;
    }

    public static IReadOnlyList<string> GetReferencedFileNames(string markdown, int pageId)
    {
        var fileNames = new List<string>();
        foreach (var uri in EnumerateAssetUriReferences(markdown))
        {
            if (TryParseReferencedAsset(uri, pageId, out var fileName) &&
                !fileNames.Contains(fileName, StringComparer.OrdinalIgnoreCase))
            {
                fileNames.Add(fileName);
            }
        }

        return fileNames;
    }

    private static bool TryParseReferencedAsset(string uri, int pageId, out string fileName)
    {
        fileName = string.Empty;

        if (PageAssetStore.TryParseAssetUri(uri, out var assetPageId, out fileName) &&
            assetPageId == pageId)
        {
            return true;
        }

        return PageAssetStore.TryParseEditorUri(uri, out assetPageId, out fileName) &&
               assetPageId == pageId;
    }

    public static string ExpandAssetReferences(string markdown, int pageId)
    {
        markdown = SanitizeBrokenImagePlaceholders(markdown);
        markdown = ExpandImageAssetReferences(markdown, pageId);
        markdown = ExpandHtmlImageAssetReferences(markdown, pageId);
        return ExpandFileAssetReferences(markdown, pageId);
    }

    public static string PrepareHtmlForMarkdown(string html, int pageId)
    {
        html = PromoteImageWrapWidths(html);
        html = UnwrapResizableImages(html);
        html = NormalizeImageWidthAttributes(html);
        html = CollapseHtmlImages(html, pageId);
        html = CollapseHtmlFileAttachments(html, pageId);
        return html;
    }

    public static (string Html, IReadOnlyList<string> PreservedImages) ExtractSizedImages(string html)
    {
        html = PromoteImageWrapWidths(html);
        html = UnwrapResizableImages(html);
        var preserved = new List<string>();
        var index = 0;

        html = HtmlImgTagRegex().Replace(html, match =>
        {
            var attrs = match.Groups["attrs"].Value;
            var src = ExtractAttributeValue(attrs, "src");
            if (string.IsNullOrWhiteSpace(src))
                return match.Value;

            var alt = ExtractAttributeValue(attrs, "alt") ?? string.Empty;
            var width = ExtractWidthPxFromAttrs(attrs);
            preserved.Add(width.HasValue
                ? BuildSizedImageTag(src, width.Value, alt)
                : $"""<img src="{EscapeHtmlAttribute(src)}" alt="{EscapeHtmlAttribute(alt)}">""");
            return BuildSizedImagePlaceholder(index++);
        });

        return (html, preserved);
    }

    public static string RestoreSizedImages(string markdown, IReadOnlyList<string> preservedImages)
    {
        if (preservedImages.Count == 0)
            return markdown;

        for (var i = 0; i < preservedImages.Count; i++)
        {
            var image = preservedImages[i];
            markdown = markdown.Replace(BuildSizedImagePlaceholder(i), image, StringComparison.Ordinal);

            // ReverseMarkdown escapes underscores in plain-text placeholders from older builds.
            markdown = markdown.Replace($"EDITOR_SIZED_IMAGE_{i}", image, StringComparison.Ordinal);
            markdown = markdown.Replace($"EDITOR\\_SIZED\\_IMAGE\\_{i}", image, StringComparison.Ordinal);
        }

        return markdown;
    }

    public static string PersistSizedImagesInMarkdown(string markdown, int pageId) =>
        HtmlImgTagRegex().Replace(markdown, match =>
        {
            var attrs = match.Groups["attrs"].Value;
            var width = ExtractWidthPxFromAttrs(attrs);
            if (!width.HasValue)
                return match.Value;

            var src = ExtractAttributeValue(attrs, "src");
            if (string.IsNullOrWhiteSpace(src) || !TryResolveStoredAssetUri(src, pageId, out var assetUri))
                return match.Value;

            var alt = ExtractAttributeValue(attrs, "alt") ?? string.Empty;
            return BuildSizedMarkdownImageReference(assetUri, width.Value, alt);
        });

    public static string CollapseEditorImages(string markdown, int pageId) =>
        CollapseLocalAssetLinks(markdown, pageId, MarkdownImageRegex(), CollapseMarkdownImageLink);

    public static string CollapseEditorFileLinks(string markdown, int pageId) =>
        CollapseLocalAssetLinks(markdown, pageId, MarkdownFileLinkRegex(), static (match, uri) =>
        {
            var label = match.Groups["title"].Value;
            return $"[{label}]({uri})";
        });

    public static string MaterializeAssetsForExport(string markdown, int pageId, string exportFilePath)
    {
        var directory = Path.GetDirectoryName(exportFilePath);
        if (string.IsNullOrWhiteSpace(directory))
            return markdown;

        var assetsFolderName = Path.GetFileNameWithoutExtension(exportFilePath) + "_assets";
        var assetsFolder = Path.Combine(directory, assetsFolderName);
        Directory.CreateDirectory(assetsFolder);

        markdown = MaterializeHtmlImageAssets(markdown, pageId, assetsFolderName, assetsFolder);
        markdown = MaterializeHtmlAnchorAssets(markdown, pageId, assetsFolderName, assetsFolder);
        markdown = MaterializeAssetMatches(markdown, pageId, assetsFolderName, assetsFolder, MarkdownImageAssetRegex(),
            static (alt, relativePath) => $"![{alt}]({relativePath})");
        return MaterializeAssetMatches(markdown, pageId, assetsFolderName, assetsFolder, MarkdownFileAssetRegex(),
            static (title, relativePath) => $"[{title}]({relativePath})");
    }

    internal static int? TryGetHtmlImageWidthPx(string imgTagOrAttrs)
    {
        var match = HtmlImgTagRegex().Match(imgTagOrAttrs);
        return match.Success
            ? ExtractWidthPxFromAttrs(match.Groups["attrs"].Value)
            : ExtractWidthPxFromAttrs(imgTagOrAttrs);
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
        MarkdownImageRegex().Replace(markdown, match =>
        {
            var url = match.Groups["url"].Value;
            var alt = match.Groups["alt"].Value;
            var title = match.Groups["title"].Success ? match.Groups["title"].Value : string.Empty;
            var width = TryParseEditorWidthTitle(title);

            if (PageAssetStore.TryParseAssetUri(url, out var assetPageId, out var fileName) &&
                assetPageId == pageId)
            {
                var editorUri = PageAssetStore.BuildEditorUri(pageId, fileName);
                if (width.HasValue)
                    return BuildSizedImageTag(editorUri, width.Value, alt);

                return $"![{alt}]({editorUri})";
            }

            if (PageAssetStore.TryParseEditorUri(url, out assetPageId, out fileName) &&
                assetPageId == pageId)
            {
                if (width.HasValue)
                    return BuildSizedImageTag(url, width.Value, alt);

                return match.Value;
            }

            return match.Value;
        });

    private static int? TryParseEditorWidthTitle(string? title)
    {
        if (string.IsNullOrWhiteSpace(title))
            return null;

        var match = Regex.Match(title, @"(?:editor-width|width)\s*:\s*(\d+)", RegexOptions.IgnoreCase);
        return match.Success && int.TryParse(match.Groups[1].Value, out var width) && width > 0
            ? width
            : null;
    }

    private static string ExpandHtmlImageAssetReferences(string markdown, int pageId) =>
        HtmlImgTagRegex().Replace(markdown, match =>
        {
            var attrs = match.Groups["attrs"].Value;
            var src = ExtractAttributeValue(attrs, "src");
            if (string.IsNullOrWhiteSpace(src) ||
                !TryParsePageAssetReference(src, pageId, out var fileName))
            {
                return match.Value;
            }

            var width = ExtractWidthPxFromAttrs(attrs);
            var alt = ExtractAttributeValue(attrs, "alt") ?? string.Empty;
            var fileUri = PageAssetStore.BuildEditorUri(pageId, fileName);
            return width.HasValue
                ? BuildSizedImageTag(fileUri, width.Value, alt)
                : $"""<img src="{EscapeHtmlAttribute(fileUri)}" alt="{EscapeHtmlAttribute(alt)}">""";
        });

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
        var fileUri = PageAssetStore.BuildEditorUri(pageId, fileName);
        return format(label, fileUri);
    }

    private static string CollapseLocalAssetLinks(
        string markdown,
        int pageId,
        Regex regex,
        Func<Match, string, string> format)
    {
        var normalizedFolder = GetNormalizedPageFolder(pageId);
        return regex.Replace(markdown, match =>
        {
            var url = match.Groups["url"].Value;
            if (PageAssetStore.TryParseAssetUri(url, out _, out _))
                return match.Value;

            if (!TryMapPathToAsset(url, normalizedFolder, pageId, out var assetUri))
                return match.Value;

            return format(match, assetUri);
        });
    }

    private static string CollapseMarkdownImageLink(Match match, string assetUri)
    {
        var alt = match.Groups["alt"].Value;
        if (match.Groups["title"].Success && !string.IsNullOrWhiteSpace(match.Groups["title"].Value))
            return $"![{alt}]({assetUri} \"{EscapeMarkdownTitle(match.Groups["title"].Value)}\")";

        return $"![{alt}]({assetUri})";
    }

    private static string BuildSizedMarkdownImageReference(string assetUri, int widthPx, string alt) =>
        $"![{alt}]({assetUri} \"editor-width:{widthPx}\")";

    private static string EscapeMarkdownTitle(string title) =>
        title.Replace("\\", "\\\\").Replace("\"", "\\\"");

    private static bool TryResolveStoredAssetUri(string src, int pageId, out string assetUri)
    {
        assetUri = string.Empty;

        if (PageAssetStore.TryParseAssetUri(src, out var assetPageId, out var fileName) &&
            assetPageId == pageId)
        {
            assetUri = PageAssetStore.BuildAssetUri(pageId, fileName);
            return true;
        }

        if (PageAssetStore.TryParseEditorUri(src, out assetPageId, out fileName) &&
            assetPageId == pageId)
        {
            assetUri = PageAssetStore.BuildAssetUri(pageId, fileName);
            return true;
        }

        return false;
    }

    private static string MaterializeHtmlImageAssets(string markdown, int pageId, string assetsFolderName, string assetsFolder) =>
        HtmlImgTagRegex().Replace(markdown, match =>
        {
            var attrs = match.Groups["attrs"].Value;
            var src = ExtractAttributeValue(attrs, "src");
            if (string.IsNullOrWhiteSpace(src) || !TryParsePageAssetReference(src, pageId, out var fileName))
                return match.Value;

            if (!TryWriteAssetToFolder(pageId, fileName, assetsFolder, out _))
                return match.Value;

            var relativePath = BuildRelativeAssetPath(assetsFolderName, fileName);
            attrs = SetAttributeValue(attrs, "src", relativePath);
            return attrs.Length > 0 ? $"<img {attrs}>" : $"""<img src="{EscapeHtmlAttribute(relativePath)}">""";
        });

    private static string MaterializeHtmlAnchorAssets(string markdown, int pageId, string assetsFolderName, string assetsFolder) =>
        HtmlAnchorRegex().Replace(markdown, match =>
        {
            var url = match.Groups["url"].Value;
            if (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase))
            {
                return match.Value;
            }

            if (!TryParsePageAssetReference(url, pageId, out var fileName))
                return match.Value;

            if (!TryWriteAssetToFolder(pageId, fileName, assetsFolder, out _))
                return match.Value;

            var relativePath = BuildRelativeAssetPath(assetsFolderName, fileName);
            var before = match.Groups["before"].Value;
            var after = match.Groups["after"].Value;
            var text = match.Groups["text"].Value;
            return $"<a{before}{relativePath}{after}>{text}</a>";
        });

    private static string BuildRelativeAssetPath(string assetsFolderName, string fileName) =>
        $"{assetsFolderName}/{fileName}".Replace('\\', '/');

    private static bool TryWriteAssetToFolder(int pageId, string fileName, string assetsFolder, out string destinationPath)
    {
        destinationPath = Path.Combine(assetsFolder, fileName);

        var sourcePath = PageAssetStore.TryGetAssetPath(pageId, fileName);
        byte[]? assetBytes = null;
        if (!string.IsNullOrWhiteSpace(sourcePath) && File.Exists(sourcePath))
            assetBytes = File.ReadAllBytes(sourcePath);
        else
            assetBytes = PageAssetStore.TryGetAssetBytes(pageId, fileName);

        if (assetBytes == null)
            return false;

        File.WriteAllBytes(destinationPath, assetBytes);
        return true;
    }

    private static string SetAttributeValue(string attrs, string name, string value)
    {
        attrs = RemoveAttribute(attrs, name).Trim();
        var encoded = EscapeHtmlAttribute(value);
        return attrs.Length > 0 ? $"{attrs} {name}=\"{encoded}\"" : $"{name}=\"{encoded}\"";
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

            if (!TryWriteAssetToFolder(pageId, fileName, assetsFolder, out _))
                return match.Value;

            var relativePath = BuildRelativeAssetPath(assetsFolderName, fileName);
            var label = match.Groups["alt"].Success
                ? match.Groups["alt"].Value
                : match.Groups["title"].Value;
            return format(label, relativePath);
        });
    }

    private static string PromoteImageWrapWidths(string html) =>
        EditorImageWrapRegex().Replace(html, match =>
        {
            var inner = match.Groups["inner"].Value;
            var imgMatch = HtmlImgTagRegex().Match(inner);
            if (!imgMatch.Success)
                return match.Value;

            var width = ExtractEditorSavedWidthPx(match.Groups["wrapattrs"].Value, imgMatch.Groups["attrs"].Value);
            return width.HasValue
                ? EnsureImgTagWidth(imgMatch.Value, width.Value)
                : imgMatch.Value;
        });

    private static string UnwrapResizableImages(string html) =>
        EditorImageWrapRegex().Replace(html, match =>
        {
            var inner = match.Groups["inner"].Value;
            var imgMatch = HtmlImgTagRegex().Match(inner);
            if (!imgMatch.Success)
                return inner;

            var img = imgMatch.Value;
            var savedWidth = ExtractEditorSavedWidthPx(match.Groups["wrapattrs"].Value, imgMatch.Groups["attrs"].Value);
            return savedWidth.HasValue
                ? EnsureImgTagWidth(img, savedWidth.Value)
                : img;
        });

    private static int? ExtractEditorSavedWidthPx(string wrapAttrs, string imgAttrs)
    {
        var wrapWidth = ExtractWidthPxFromStyle(ExtractAttributeValue(wrapAttrs, "style"));
        if (wrapWidth.HasValue)
            return wrapWidth;

        var wrapDataWidth = ExtractAttributeValue(wrapAttrs, "data-editor-width");
        if (int.TryParse(wrapDataWidth, out var parsedWrapData) && parsedWrapData > 0)
            return parsedWrapData;

        var dataWidth = ExtractAttributeValue(imgAttrs, "data-editor-width");
        if (int.TryParse(dataWidth, out var parsedData) && parsedData > 0)
            return parsedData;

        var imgStyleWidth = ExtractWidthPxFromStyle(ExtractAttributeValue(imgAttrs, "style"));
        if (imgStyleWidth.HasValue && imgStyleWidth.Value <= 4096)
            return imgStyleWidth;

        var widthAttr = ExtractAttributeValue(imgAttrs, "width");
        if (int.TryParse(widthAttr, out var parsedWidth) && parsedWidth > 0 && parsedWidth <= 4096)
            return parsedWidth;

        return null;
    }

    private static string NormalizeImageWidthAttributes(string html) =>
        HtmlImgTagRegex().Replace(html, match =>
        {
            var attrs = match.Groups["attrs"].Value;
            var width = ExtractEditorSavedWidthPx(string.Empty, attrs);
            if (!width.HasValue)
                return match.Value;

            var src = ExtractAttributeValue(attrs, "src");
            if (string.IsNullOrWhiteSpace(src))
                return match.Value;

            var alt = ExtractAttributeValue(attrs, "alt") ?? string.Empty;
            return BuildSizedImageTag(src, width.Value, alt);
        });

    private static string BuildSizedImagePlaceholder(int index) =>
        $"{SizedImagePlaceholderPrefix}{index}{SizedImagePlaceholderSuffix}";

    private static string BuildSizedImageTag(string src, int width, string alt) =>
        $"<img src=\"{EscapeHtmlAttribute(src)}\" width=\"{width}\" data-editor-width=\"{width}\" style=\"width: {width}px; height: auto; max-width: none;\" alt=\"{EscapeHtmlAttribute(alt)}\">";

    private static int? ExtractWidthPxFromStyle(string? style)
    {
        if (string.IsNullOrWhiteSpace(style))
            return null;

        var styleMatch = CssWidthPxRegex().Match(style);
        if (!styleMatch.Success)
            return null;

        return int.TryParse(styleMatch.Groups["width"].Value, out var parsedWidth) && parsedWidth > 0
            ? parsedWidth
            : null;
    }

    private static string EnsureImgTagWidth(string imgTag, int widthPx)
    {
        var imgMatch = HtmlImgTagRegex().Match(imgTag);
        if (!imgMatch.Success)
            return imgTag;

        var attrs = imgMatch.Groups["attrs"].Value;
        var src = ExtractAttributeValue(attrs, "src");
        if (string.IsNullOrWhiteSpace(src))
            return imgTag;

        var alt = ExtractAttributeValue(attrs, "alt") ?? string.Empty;
        return BuildSizedImageTag(src, widthPx, alt);
    }

    private static int? ExtractWidthPxFromAttrs(string attrs)
    {
        var editorWidth = ExtractAttributeValue(attrs, "data-editor-width");
        if (int.TryParse(editorWidth, out var parsedEditorWidth) && parsedEditorWidth > 0)
            return parsedEditorWidth;

        var style = ExtractAttributeValue(attrs, "style");
        var styleWidth = ExtractWidthPxFromStyle(style);
        if (styleWidth.HasValue)
            return styleWidth;

        var widthAttr = ExtractAttributeValue(attrs, "width");
        if (int.TryParse(widthAttr, out var parsedWidth) && parsedWidth > 0)
            return parsedWidth;

        return null;
    }

    private static string? ExtractAttributeValue(string attrs, string name)
    {
        var pattern = $"""{Regex.Escape(name)}\s*=\s*("([^"]*)"|'([^']*)')""";
        var match = Regex.Match(attrs, pattern, RegexOptions.IgnoreCase);
        if (!match.Success)
            return null;

        return match.Groups[2].Success ? match.Groups[2].Value : match.Groups[3].Value;
    }

    private static string RemoveAttribute(string attrs, string name)
    {
        var pattern = $"""{Regex.Escape(name)}\s*=\s*("([^"]*)"|'([^']*)')""";
        return Regex.Replace(attrs, pattern, string.Empty, RegexOptions.IgnoreCase).Trim();
    }

    private static string RemoveStyleProperty(string attrs, string propertyName)
    {
        var style = ExtractAttributeValue(attrs, "style");
        if (string.IsNullOrWhiteSpace(style))
            return attrs;

        var cleaned = Regex.Replace(
            style,
            $@"\b{Regex.Escape(propertyName)}\s*:\s*[^;]+;?",
            string.Empty,
            RegexOptions.IgnoreCase).Trim().Trim(';');

        attrs = RemoveAttribute(attrs, "style");
        if (string.IsNullOrWhiteSpace(cleaned))
            return attrs.Trim();

        return $"{attrs} style=\"{cleaned}\"".Trim();
    }

    private static string EscapeHtmlAttribute(string value) =>
        value.Replace("&", "&amp;", StringComparison.Ordinal)
            .Replace("\"", "&quot;", StringComparison.Ordinal)
            .Replace("<", "&lt;", StringComparison.Ordinal);

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

    private static bool TryParsePageAssetReference(string url, int pageId, out string fileName)
    {
        fileName = string.Empty;

        if (PageAssetStore.TryParseAssetUri(url, out var assetPageId, out fileName) &&
            assetPageId == pageId)
        {
            return true;
        }

        return PageAssetStore.TryParseEditorUri(url, out assetPageId, out fileName) &&
               assetPageId == pageId;
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
