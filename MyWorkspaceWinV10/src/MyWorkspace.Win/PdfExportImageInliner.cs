using System.Text.RegularExpressions;

namespace MyWorkspace.Win;

internal static partial class PdfExportImageInliner
{
    [GeneratedRegex(@"<img\b(?<before>[^>]*?\ssrc=)[""'](?<src>[^""']+)[""'](?<after>[^>]*)>", RegexOptions.IgnoreCase)]
    private static partial Regex HtmlImageSrcRegex();

    public static string InlineAllImages(string html)
    {
        if (string.IsNullOrEmpty(html))
            return html;

        return HtmlImageSrcRegex().Replace(html, match =>
        {
            var src = match.Groups["src"].Value;
            if (src.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                return match.Value;

            if (!TryResolveImageBytesFromAnyPage(src, out var bytes, out var mimeType))
                return match.Value;

            var dataUri = $"data:{mimeType};base64,{Convert.ToBase64String(bytes)}";
            return $"<img{match.Groups["before"].Value}\"{dataUri}\"{match.Groups["after"].Value}>";
        });
    }

    public static string InlineImages(string html, int pageId)
    {
        if (string.IsNullOrEmpty(html))
            return html;

        return HtmlImageSrcRegex().Replace(html, match =>
        {
            var src = match.Groups["src"].Value;
            if (src.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                return match.Value;

            if (!TryResolveImageBytes(src, pageId, out var bytes, out var mimeType))
                return match.Value;

            var dataUri = $"data:{mimeType};base64,{Convert.ToBase64String(bytes)}";
            return $"<img{match.Groups["before"].Value}\"{dataUri}\"{match.Groups["after"].Value}>";
        });
    }

    private static bool TryResolveImageBytesFromAnyPage(string src, out byte[] bytes, out string mimeType)
    {
        bytes = Array.Empty<byte>();
        mimeType = "application/octet-stream";

        if (!PageMarkdownNormalizer.TryParseAnyPageAssetReference(src, out var pageId, out var fileName))
            return false;

        if (!PageAssetStore.IsSupportedImageExtension(Path.GetExtension(fileName)))
            return false;

        var data = PageAssetStore.TryGetAssetBytes(pageId, fileName);
        if (data == null || data.Length == 0)
            return false;

        bytes = data;
        mimeType = GetMimeType(fileName);
        return true;
    }

    private static bool TryResolveImageBytes(string src, int pageId, out byte[] bytes, out string mimeType)
    {
        bytes = Array.Empty<byte>();
        mimeType = "application/octet-stream";

        if (!TryParseImageAssetReference(src, pageId, out var fileName))
            return false;

        if (!PageAssetStore.IsSupportedImageExtension(Path.GetExtension(fileName)))
            return false;

        var data = PageAssetStore.TryGetAssetBytes(pageId, fileName);
        if (data == null || data.Length == 0)
            return false;

        bytes = data;
        mimeType = GetMimeType(fileName);
        return true;
    }

    private static bool TryParseImageAssetReference(string url, int pageId, out string fileName)
    {
        fileName = string.Empty;
        if (string.IsNullOrWhiteSpace(url))
            return false;

        if (PageAssetStore.TryParseAssetUri(url, out var assetPageId, out fileName) && assetPageId == pageId)
            return true;

        return PageAssetStore.TryParseEditorUri(url, out assetPageId, out fileName) && assetPageId == pageId;
    }

    private static string GetMimeType(string fileName) =>
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
