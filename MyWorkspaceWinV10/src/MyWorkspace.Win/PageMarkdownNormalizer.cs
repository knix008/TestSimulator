using System.Text.RegularExpressions;

namespace MyWorkspace.Win;

internal static partial class PageMarkdownNormalizer
{
    [GeneratedRegex(@"!\[(?<alt>[^\]]*)\]\((?<url>page-asset:\d+/[^)]+)\)", RegexOptions.IgnoreCase)]
    private static partial Regex MarkdownImageAssetRegex();

    [GeneratedRegex(@"(?<!!)\[(?<title>[^\]]*)\]\((?<url>page-asset:\d+/[^)]+)\)", RegexOptions.IgnoreCase)]
    private static partial Regex MarkdownFileAssetRegex();

    [GeneratedRegex(
        @"!\[(?<alt>[^\]]*)\]\(\s*(?:<(?<urlAngle>[^>]+)>|(?<urlPlain>[^)\s""]+))\s*(?:""(?<title>[^""]*)"")?\s*\)",
        RegexOptions.IgnoreCase)]
    private static partial Regex MarkdownImageRegex();

    [GeneratedRegex(
        @"!\[(?<alt>[^\]]*)\]\(\s*page-asset:(?<pageId>\d+)/(?<base>[^\s(""(\]]+?)\s+\((?<dup>\d+)\)\s*(?:""(?<title>[^""]*)""\s*)?\)",
        RegexOptions.IgnoreCase)]
    private static partial Regex BrokenParenDupeImageLinkRegex();

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

    [GeneratedRegex(@"<table\b[^>]*>.*?</table>", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex HtmlTableRegex();

    [GeneratedRegex(@"<(td|th)\b[^>]*\bstyle\s*=\s*(['""])(?<style>.*?)\2", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex HtmlTableCellStyleRegex();

    [GeneratedRegex(@"@@MYWS-TABLE-\d+@@", RegexOptions.IgnoreCase)]
    private static partial Regex BrokenStyledTablePlaceholderRegex();

    [GeneratedRegex(@"\b(text-align\s*:|vertical-align\s*:|font-size\s*:|background-color\s*:|width\s*:|height\s*:|min-width\s*:|min-height\s*:|max-width\s*:)", RegexOptions.IgnoreCase)]
    private static partial Regex CellPresentationStyleRegex();

    [GeneratedRegex(@"<span\s+class\s*=\s*(['""])editor-table-(?:col|row)-resize-handle\1[^>]*>\s*</span>", RegexOptions.IgnoreCase)]
    private static partial Regex EditorTableResizeHandleRegex();

    [GeneratedRegex(@"\s*\beditor-table-has-layout\b", RegexOptions.IgnoreCase)]
    private static partial Regex EditorTableLayoutClassRegex();

    [GeneratedRegex(@"\beditor-table-cell-selected\b", RegexOptions.IgnoreCase)]
    private static partial Regex EditorTableCellSelectedClassRegex();

    [GeneratedRegex(@"<div\s+class\s*=\s*(['""])editor-table-valign-inner[^'""]*\1[^>]*>(?<body>.*?)</div>", RegexOptions.IgnoreCase | RegexOptions.Singleline)]
    private static partial Regex EditorTableValignInnerRegex();

    [GeneratedRegex(@"\s*\beditor-table-v-(?:top|middle|bottom)\b", RegexOptions.IgnoreCase)]
    private static partial Regex EditorTableValignClassRegex();

    [GeneratedRegex(@"EDITOR(?:\\_)?_SIZED(?:\\_)?_IMAGE(?:\\_)?_\d+", RegexOptions.IgnoreCase)]
    private static partial Regex BrokenLegacySizedImagePlaceholderRegex();

    private const string SizedImagePlaceholderPrefix = "@@MYWS-SIZED-";
    private const string SizedImagePlaceholderSuffix = "@@";
    private const string StyledTablePlaceholderPrefix = "@@MYWS-TABLE-";
    private const string StyledTablePlaceholderSuffix = "@@";

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
            yield return ExtractMarkdownImageUrl(match);

        foreach (Match match in MarkdownFileLinkRegex().Matches(markdown))
            yield return match.Groups["url"].Value;

        foreach (Match match in HtmlImageRegex().Matches(markdown))
            yield return match.Groups["url"].Value;
    }

    public static IReadOnlyList<string> GetReferencedFileNames(string markdown, int pageId)
    {
        markdown = RepairBrokenPageAssetImageLinks(markdown);
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

    public static IReadOnlyList<(int PageId, string FileName)> GetAllReferencedAssets(string markdown)
    {
        markdown = RepairBrokenPageAssetImageLinks(markdown);
        var assets = new List<(int PageId, string FileName)>();
        foreach (var uri in EnumerateAssetUriReferences(markdown))
        {
            if (!TryParseAnyPageAssetReference(uri, out var pageId, out var fileName))
                continue;

            if (assets.Any(item => item.PageId == pageId &&
                                   item.FileName.Equals(fileName, StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            assets.Add((pageId, fileName));
        }

        return assets;
    }

    internal static bool TryParseAnyPageAssetReference(string url, out int pageId, out string fileName)
    {
        fileName = string.Empty;
        pageId = 0;

        url = NormalizeMarkdownLinkUrl(url);
        if (PageAssetStore.TryParseAssetUri(url, out pageId, out fileName))
            return true;

        return PageAssetStore.TryParseEditorUri(url, out pageId, out fileName);
    }

    public static string MaterializeCombinedAssetsForExport(string markdown, string exportFilePath)
    {
        PageAssetStore.EnsureCombinedAssetsMaterialized(markdown);

        var directory = Path.GetDirectoryName(exportFilePath);
        if (string.IsNullOrWhiteSpace(directory))
            return markdown;

        var assetsFolderName = Path.GetFileNameWithoutExtension(exportFilePath) + "_assets";
        var assetsFolder = Path.Combine(directory, assetsFolderName);

        markdown = SanitizeBrokenImagePlaceholders(markdown);
        markdown = MaterializeCombinedHtmlImageAssets(markdown, assetsFolderName, assetsFolder);
        markdown = MaterializeCombinedHtmlAnchorAssets(markdown, assetsFolderName, assetsFolder);
        markdown = MaterializeCombinedAssetMatches(markdown, assetsFolderName, assetsFolder, MarkdownImageRegex(),
            static (alt, relativePath) => $"![{alt}]({relativePath})");
        return MaterializeCombinedAssetMatches(markdown, assetsFolderName, assetsFolder, MarkdownFileLinkRegex(),
            static (title, relativePath) => $"[{title}]({relativePath})");
    }

    public static string PrepareMarkdownForCombinedPdfExport(string markdown, string exportFilePath)
    {
        PageAssetStore.EnsureCombinedAssetsMaterialized(markdown);

        var directory = Path.GetDirectoryName(exportFilePath);
        if (string.IsNullOrWhiteSpace(directory))
            return markdown;

        var assetsFolderName = Path.GetFileNameWithoutExtension(exportFilePath) + "_assets";
        var assetsFolder = Path.Combine(directory, assetsFolderName);

        markdown = SanitizeBrokenImagePlaceholders(markdown);
        markdown = ExpandCombinedImageAssetReferences(markdown);
        markdown = ExpandCombinedHtmlImageAssetReferences(markdown);
        return MaterializeCombinedNonImageFileAssetsForExport(markdown, assetsFolderName, assetsFolder);
    }

    private static string ExpandCombinedImageAssetReferences(string markdown) =>
        MarkdownImageRegex().Replace(markdown, match =>
        {
            var url = ExtractMarkdownImageUrl(match);
            var alt = match.Groups["alt"].Value;
            var title = match.Groups["title"].Success ? match.Groups["title"].Value : string.Empty;
            var width = TryParseEditorWidthTitle(title);

            if (!TryParseAnyPageAssetReference(url, out var pageId, out var fileName))
                return match.Value;

            if (!PageAssetStore.IsSupportedImageAssetFileName(fileName))
                return match.Value;

            var editorUri = PageAssetStore.BuildEditorUri(pageId, fileName);
            if (width.HasValue)
                return BuildSizedImageTag(editorUri, width.Value, alt);

            return $"![{alt}]({editorUri})";
        });

    private static string ExpandCombinedHtmlImageAssetReferences(string markdown) =>
        HtmlImgTagRegex().Replace(markdown, match =>
        {
            var attrs = match.Groups["attrs"].Value;
            var src = ExtractAttributeValue(attrs, "src");
            if (string.IsNullOrWhiteSpace(src) ||
                !TryParseAnyPageAssetReference(src, out var pageId, out var fileName))
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

    private static string MaterializeCombinedNonImageFileAssetsForExport(
        string markdown,
        string assetsFolderName,
        string assetsFolder)
    {
        static bool IsNonImageFile(string fileName) =>
            !PageAssetStore.IsSupportedImageAssetFileName(fileName);

        markdown = MaterializeCombinedAssetMatches(
            markdown,
            assetsFolderName,
            assetsFolder,
            MarkdownFileLinkRegex(),
            static (title, relativePath) => $"[{title}]({relativePath})",
            IsNonImageFile);

        markdown = HtmlFileAttachmentRegex().Replace(markdown, match =>
        {
            var url = match.Groups["url"].Value;
            if (!TryParseAnyPageAssetReference(url, out var pageId, out var fileName) || !IsNonImageFile(fileName))
                return match.Value;

            if (!TryWriteCombinedAssetToFolder(pageId, fileName, assetsFolder, out _))
                return match.Value;

            var relativePath = BuildCombinedRelativeAssetPath(assetsFolderName, pageId, fileName);
            var text = StripHtml(match.Groups["text"].Value);
            if (string.IsNullOrWhiteSpace(text))
                text = fileName;

            return $"""<a class="file-attachment" href="{EscapeHtmlAttribute(relativePath)}">{EscapeHtml(text)}</a>""";
        });

        return MaterializeCombinedHtmlAnchorAssets(
            markdown,
            assetsFolderName,
            assetsFolder,
            IsNonImageFile);
    }

    private static string MaterializeCombinedHtmlImageAssets(string markdown, string assetsFolderName, string assetsFolder) =>
        HtmlImgTagRegex().Replace(markdown, match =>
        {
            var attrs = match.Groups["attrs"].Value;
            var src = ExtractAttributeValue(attrs, "src");
            if (string.IsNullOrWhiteSpace(src) ||
                !TryParseAnyPageAssetReference(src, out var pageId, out var fileName))
            {
                return match.Value;
            }

            if (!TryWriteCombinedAssetToFolder(pageId, fileName, assetsFolder, out _))
                return match.Value;

            var relativePath = BuildCombinedRelativeAssetPath(assetsFolderName, pageId, fileName);
            attrs = SetAttributeValue(attrs, "src", relativePath);
            return attrs.Length > 0 ? $"<img {attrs}>" : $"""<img src="{EscapeHtmlAttribute(relativePath)}">""";
        });

    private static string MaterializeCombinedHtmlAnchorAssets(string markdown, string assetsFolderName, string assetsFolder) =>
        MaterializeCombinedHtmlAnchorAssets(markdown, assetsFolderName, assetsFolder, static _ => true);

    private static string MaterializeCombinedHtmlAnchorAssets(
        string markdown,
        string assetsFolderName,
        string assetsFolder,
        Func<string, bool> includeFile)
    {
        return HtmlAnchorRegex().Replace(markdown, match =>
        {
            var url = match.Groups["url"].Value;
            if (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase))
            {
                return match.Value;
            }

            if (!TryParseAnyPageAssetReference(url, out var pageId, out var fileName) || !includeFile(fileName))
                return match.Value;

            if (!TryWriteCombinedAssetToFolder(pageId, fileName, assetsFolder, out _))
                return match.Value;

            var relativePath = BuildCombinedRelativeAssetPath(assetsFolderName, pageId, fileName);
            var before = match.Groups["before"].Value;
            var after = match.Groups["after"].Value;
            var text = match.Groups["text"].Value;
            if (string.IsNullOrWhiteSpace(text))
                text = fileName;

            return $"<a{before}{relativePath}{after}>{text}</a>";
        });
    }

    private static string MaterializeCombinedAssetMatches(
        string markdown,
        string assetsFolderName,
        string assetsFolder,
        Regex regex,
        Func<string, string, string> format,
        Func<string, bool>? includeFile = null)
    {
        return regex.Replace(markdown, match =>
        {
            var url = match.Groups["urlAngle"].Success
                ? ExtractMarkdownImageUrl(match)
                : NormalizeMarkdownLinkUrl(match.Groups["url"].Value);
            if (!TryParseAnyPageAssetReference(url, out var pageId, out var fileName))
                return match.Value;

            if (includeFile != null && !includeFile(fileName))
                return match.Value;

            if (!TryWriteCombinedAssetToFolder(pageId, fileName, assetsFolder, out _))
                return match.Value;

            var relativePath = BuildCombinedRelativeAssetPath(assetsFolderName, pageId, fileName);
            var label = match.Groups["alt"].Success
                ? match.Groups["alt"].Value
                : match.Groups["title"].Value;
            if (string.IsNullOrWhiteSpace(label))
                label = fileName;

            return format(label, relativePath);
        });
    }

    private static string BuildCombinedRelativeAssetPath(string assetsFolderName, int pageId, string fileName) =>
        $"{assetsFolderName}/{pageId}/{fileName}".Replace('\\', '/');

    private static bool TryWriteCombinedAssetToFolder(int pageId, string fileName, string assetsFolder, out string destinationPath)
    {
        var pageFolder = Path.Combine(assetsFolder, pageId.ToString(System.Globalization.CultureInfo.InvariantCulture));
        destinationPath = Path.Combine(pageFolder, fileName);

        var sourcePath = PageAssetStore.TryGetAssetPath(pageId, fileName);
        byte[]? assetBytes = null;
        if (!string.IsNullOrWhiteSpace(sourcePath) && File.Exists(sourcePath))
            assetBytes = File.ReadAllBytes(sourcePath);
        else
            assetBytes = PageAssetStore.TryGetAssetBytes(pageId, fileName);

        if (assetBytes == null)
            return false;

        Directory.CreateDirectory(pageFolder);
        File.WriteAllBytes(destinationPath, assetBytes);
        return true;
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
        markdown = RepairBrokenPageAssetImageLinks(markdown);
        markdown = ExpandImageAssetReferences(markdown, pageId);
        markdown = ExpandHtmlImageAssetReferences(markdown, pageId);
        return ExpandFileAssetReferences(markdown, pageId);
    }

    public static string PrepareHtmlForMarkdown(string html, int pageId)
    {
        html = StripEditorTableSelectionMarkup(html);
        html = StripEditorTableValignMarkup(html);
        html = StripEditorTableResizeMarkup(html);
        html = PromoteImageWrapWidths(html);
        html = UnwrapResizableImages(html);
        html = NormalizeImageWidthAttributes(html);
        html = CollapseHtmlImages(html, pageId);
        html = CollapseHtmlFileAttachments(html, pageId);
        return html;
    }

    public static (string Html, IReadOnlyList<string> PreservedTables) ExtractStyledTables(string html)
    {
        var preserved = new List<string>();
        var index = 0;

        html = HtmlTableRegex().Replace(html, match =>
        {
            if (!TableHasCellPresentationStyles(match.Value))
                return match.Value;

            preserved.Add(match.Value);
            return BuildStyledTablePlaceholder(index++);
        });

        return (html, preserved);
    }

    public static string RestoreStyledTables(string markdown, IReadOnlyList<string> preservedTables)
    {
        if (preservedTables.Count == 0)
            return markdown;

        for (var i = 0; i < preservedTables.Count; i++)
        {
            var table = preservedTables[i];
            markdown = markdown.Replace(BuildStyledTablePlaceholder(i), table, StringComparison.Ordinal);
            markdown = markdown.Replace($"EDITOR_STYLED_TABLE_{i}", table, StringComparison.Ordinal);
            markdown = markdown.Replace($"EDITOR\\_STYLED\\_TABLE\\_{i}", table, StringComparison.Ordinal);
        }

        return markdown;
    }

    private static bool TableHasCellPresentationStyles(string tableHtml)
    {
        if (tableHtml.Contains("editor-table-has-bg", StringComparison.OrdinalIgnoreCase))
            return true;

        foreach (Match match in HtmlTableCellStyleRegex().Matches(tableHtml))
        {
            if (CellPresentationStyleRegex().IsMatch(match.Groups["style"].Value))
                return true;
        }

        return false;
    }

    private static string StripEditorTableSelectionMarkup(string html) =>
        EditorTableCellSelectedClassRegex().Replace(html, string.Empty);

    private static string StripEditorTableValignMarkup(string html)
    {
        html = EditorTableValignInnerRegex().Replace(html, m => m.Groups["body"].Value);
        return EditorTableValignClassRegex().Replace(html, string.Empty);
    }

    private static string StripEditorTableResizeMarkup(string html)
    {
        html = EditorTableResizeHandleRegex().Replace(html, string.Empty);
        return EditorTableLayoutClassRegex().Replace(html, string.Empty);
    }

    private static string BuildStyledTablePlaceholder(int index) =>
        $"{StyledTablePlaceholderPrefix}{index}{StyledTablePlaceholderSuffix}";

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
        PageAssetStore.EnsureAssetsMaterialized(pageId, markdown);

        var directory = Path.GetDirectoryName(exportFilePath);
        if (string.IsNullOrWhiteSpace(directory))
            return markdown;

        var assetsFolderName = Path.GetFileNameWithoutExtension(exportFilePath) + "_assets";
        var assetsFolder = Path.Combine(directory, assetsFolderName);
        Directory.CreateDirectory(assetsFolder);

        markdown = SanitizeBrokenImagePlaceholders(markdown);
        markdown = MaterializeHtmlImageAssets(markdown, pageId, assetsFolderName, assetsFolder);
        markdown = MaterializeHtmlAnchorAssets(markdown, pageId, assetsFolderName, assetsFolder);
        markdown = MaterializeAssetMatches(markdown, pageId, assetsFolderName, assetsFolder, MarkdownImageRegex(),
            static (alt, relativePath) => $"![{alt}]({relativePath})");
        return MaterializeAssetMatches(markdown, pageId, assetsFolderName, assetsFolder, MarkdownFileLinkRegex(),
            static (title, relativePath) => $"[{title}]({relativePath})");
    }

    public static string PrepareMarkdownForPdfExport(string markdown, int pageId, string exportFilePath)
    {
        PageAssetStore.EnsureAssetsMaterialized(pageId, markdown);

        var directory = Path.GetDirectoryName(exportFilePath);
        if (string.IsNullOrWhiteSpace(directory))
            return ExpandAssetReferences(markdown, pageId);

        var assetsFolderName = Path.GetFileNameWithoutExtension(exportFilePath) + "_assets";
        var assetsFolder = Path.Combine(directory, assetsFolderName);

        markdown = SanitizeBrokenImagePlaceholders(markdown);
        markdown = ExpandImageAssetReferences(markdown, pageId);
        markdown = ExpandHtmlImageAssetReferences(markdown, pageId);
        return MaterializeNonImageFileAssetsForExport(markdown, pageId, assetsFolderName, assetsFolder);
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
            var url = ExtractMarkdownImageUrl(match);
            var alt = match.Groups["alt"].Value;
            var title = match.Groups["title"].Success ? match.Groups["title"].Value : string.Empty;
            var width = TryParseEditorWidthTitle(title);

            if (!TryParsePageAssetReference(url, pageId, out var fileName))
                return match.Value;

            if (!PageAssetStore.IsSupportedImageAssetFileName(fileName))
                return match.Value;

            var editorUri = PageAssetStore.BuildEditorUri(pageId, fileName);
            if (width.HasValue)
                return BuildSizedImageTag(editorUri, width.Value, alt);

            return $"![{alt}]({editorUri})";
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
        var wrappedUri = WrapMarkdownAssetUri(assetUri);
        if (match.Groups["title"].Success && !string.IsNullOrWhiteSpace(match.Groups["title"].Value))
            return $"![{alt}]({wrappedUri} \"{EscapeMarkdownTitle(match.Groups["title"].Value)}\")";

        return $"![{alt}]({wrappedUri})";
    }

    private static string BuildSizedMarkdownImageReference(string assetUri, int widthPx, string alt) =>
        $"![{alt}]({WrapMarkdownAssetUri(assetUri)} \"editor-width:{widthPx}\")";

    public static string RepairBrokenPageAssetImageLinks(string markdown)
    {
        if (string.IsNullOrEmpty(markdown))
            return markdown;

        return BrokenParenDupeImageLinkRegex().Replace(markdown, match =>
        {
            if (!int.TryParse(match.Groups["pageId"].Value, out var pageId))
                return match.Value;

            var fileName = $"{match.Groups["base"].Value} ({match.Groups["dup"].Value})";
            var assetUri = PageAssetStore.BuildAssetUri(pageId, fileName);
            var alt = match.Groups["alt"].Value;

            if (match.Groups["title"].Success &&
                TryParseEditorWidthTitle(match.Groups["title"].Value) is { } width)
            {
                return BuildSizedMarkdownImageReference(assetUri, width, alt);
            }

            return $"![{alt}]({WrapMarkdownAssetUri(assetUri)})";
        });
    }

    private static string WrapMarkdownAssetUri(string assetUri) =>
        assetUri.StartsWith('<') ? assetUri : $"<{assetUri}>";

    private static string ExtractMarkdownImageUrl(Match match)
    {
        if (match.Groups["urlAngle"].Success && !string.IsNullOrWhiteSpace(match.Groups["urlAngle"].Value))
            return NormalizeMarkdownLinkUrl(match.Groups["urlAngle"].Value);

        if (match.Groups["urlPlain"].Success)
            return NormalizeMarkdownLinkUrl(match.Groups["urlPlain"].Value);

        return string.Empty;
    }

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
        MaterializeHtmlAnchorAssets(markdown, pageId, assetsFolderName, assetsFolder, static _ => true);

    private static string MaterializeHtmlAnchorAssets(
        string markdown,
        int pageId,
        string assetsFolderName,
        string assetsFolder,
        Func<string, bool> includeFile)
    {
        return HtmlAnchorRegex().Replace(markdown, match =>
        {
            var url = match.Groups["url"].Value;
            if (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase))
            {
                return match.Value;
            }

            if (!TryParsePageAssetReference(url, pageId, out var fileName) || !includeFile(fileName))
                return match.Value;

            if (!TryWriteAssetToFolder(pageId, fileName, assetsFolder, out _))
                return match.Value;

            var relativePath = BuildRelativeAssetPath(assetsFolderName, fileName);
            var before = match.Groups["before"].Value;
            var after = match.Groups["after"].Value;
            var text = match.Groups["text"].Value;
            if (string.IsNullOrWhiteSpace(text))
                text = fileName;

            return $"<a{before}{relativePath}{after}>{text}</a>";
        });
    }

    private static string MaterializeNonImageFileAssetsForExport(
        string markdown,
        int pageId,
        string assetsFolderName,
        string assetsFolder)
    {
        static bool IsNonImageFile(string fileName) =>
            !PageAssetStore.IsSupportedImageAssetFileName(fileName);

        markdown = MaterializeAssetMatches(
            markdown,
            pageId,
            assetsFolderName,
            assetsFolder,
            MarkdownFileLinkRegex(),
            static (title, relativePath) => $"[{title}]({relativePath})",
            IsNonImageFile);

        markdown = HtmlFileAttachmentRegex().Replace(markdown, match =>
        {
            var url = match.Groups["url"].Value;
            if (!TryParsePageAssetReference(url, pageId, out var fileName) || !IsNonImageFile(fileName))
                return match.Value;

            if (!TryWriteAssetToFolder(pageId, fileName, assetsFolder, out _))
                return match.Value;

            var relativePath = BuildRelativeAssetPath(assetsFolderName, fileName);
            var text = StripHtml(match.Groups["text"].Value);
            if (string.IsNullOrWhiteSpace(text))
                text = fileName;

            return $"""<a class="file-attachment" href="{EscapeHtmlAttribute(relativePath)}">{EscapeHtml(text)}</a>""";
        });

        return MaterializeHtmlAnchorAssets(markdown, pageId, assetsFolderName, assetsFolder, IsNonImageFile);
    }

    private static string StripHtml(string value) =>
        Regex.Replace(value, "<[^>]+>", string.Empty).Trim();

    private static string EscapeHtml(string value) =>
        System.Net.WebUtility.HtmlEncode(value);

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

        Directory.CreateDirectory(assetsFolder);
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
        Func<string, string, string> format,
        Func<string, bool>? includeFile = null)
    {
        return regex.Replace(markdown, match =>
        {
            var url = match.Groups["urlAngle"].Success
                ? ExtractMarkdownImageUrl(match)
                : NormalizeMarkdownLinkUrl(match.Groups["url"].Value);
            if (!TryParsePageAssetReference(url, pageId, out var fileName))
                return match.Value;

            if (includeFile != null && !includeFile(fileName))
                return match.Value;

            if (!TryWriteAssetToFolder(pageId, fileName, assetsFolder, out _))
                return match.Value;

            var relativePath = BuildRelativeAssetPath(assetsFolderName, fileName);
            var label = match.Groups["alt"].Success
                ? match.Groups["alt"].Value
                : match.Groups["title"].Value;
            if (string.IsNullOrWhiteSpace(label))
                label = fileName;

            return format(label, relativePath);
        });
    }

    private static string NormalizeMarkdownLinkUrl(string url)
    {
        url = url.Trim().Trim('"', '\'');
        if (url.StartsWith('<') && url.EndsWith('>'))
            url = url[1..^1].Trim();

        var spaceIndex = url.IndexOf(' ');
        if (spaceIndex <= 0)
            return url;

        var remainder = url[spaceIndex..].TrimStart();
        if (remainder.StartsWith("\"", StringComparison.Ordinal) || remainder.StartsWith("'", StringComparison.Ordinal))
            return url[..spaceIndex].Trim();

        return url;
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
