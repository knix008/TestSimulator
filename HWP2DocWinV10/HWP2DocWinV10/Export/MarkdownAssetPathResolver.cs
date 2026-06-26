using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Export;

/// <summary>
/// unhwp 변환 결과의 상대 이미지 경로를 실제 추출 파일 위치에 맞게 보정합니다.
/// </summary>
internal static class MarkdownAssetPathResolver
{
    private static readonly Regex MarkdownImageRegex = new(
        @"!\[([^\]]*)\]\(([^)]+)\)",
        RegexOptions.Compiled);

    private static readonly Regex HtmlImageSrcRegex = new(
        """(<img\b[^>]*\bsrc\s*=\s*["'])(?!https?:|data:|file:)([^"']+)(["'])""",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly Regex VirtualHostImageSrcRegex = new(
        $"""(<img\b[^>]*\bsrc\s*=\s*["'])(?!https?://{Regex.Escape(PreviewAssetHost.HostName)}|data:)([^"']+)(["'])""",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static string RewriteMarkdownImages(string markdown, string? assetDirectory)
    {
        if (string.IsNullOrWhiteSpace(assetDirectory) || string.IsNullOrWhiteSpace(markdown))
            return markdown;

        return MarkdownImageRegex.Replace(markdown, match =>
        {
            string alt = match.Groups[1].Value;
            string path = match.Groups[2].Value;
            if (IsRemoteOrDataUri(path))
                return match.Value;

            string? resolved = ResolveAssetPath(assetDirectory, path);
            if (resolved == null)
                return match.Value;

            string relative = ToAssetRelativePath(assetDirectory, resolved);
            return $"![{alt}]({relative})";
        });
    }

    public static string RewriteMarkdownImagesForVirtualHost(string markdown, string? assetDirectory)
    {
        if (string.IsNullOrWhiteSpace(assetDirectory) || string.IsNullOrWhiteSpace(markdown))
            return markdown;

        return MarkdownImageRegex.Replace(markdown, match =>
        {
            string alt = match.Groups[1].Value;
            string path = match.Groups[2].Value;
            if (IsRemoteOrDataUri(path) || IsVirtualHostUrl(path))
                return match.Value;

            string? resolved = ResolveAssetPath(assetDirectory, path);
            if (resolved == null)
                return match.Value;

            string relative = ToAssetRelativePath(assetDirectory, resolved);
            return $"![{alt}]({PreviewAssetHost.ToVirtualAssetUrl(relative)})";
        });
    }

    public static string RewriteHtmlImagesForVirtualHost(string html, string? assetDirectory)
    {
        if (string.IsNullOrWhiteSpace(assetDirectory) || string.IsNullOrWhiteSpace(html))
            return html;

        return VirtualHostImageSrcRegex.Replace(html, match =>
        {
            string path = match.Groups[2].Value;
            if (IsRemoteOrDataUri(path) || IsVirtualHostUrl(path))
                return match.Value;

            string? resolved = ResolveAssetPath(assetDirectory, path);
            if (resolved == null)
                return match.Value;

            string relative = ToAssetRelativePath(assetDirectory, resolved);
            string url = PreviewAssetHost.ToVirtualAssetUrl(relative);
            return match.Groups[1].Value + url + match.Groups[3].Value;
        });
    }

    public static string RewriteHtmlImages(string html, string? assetDirectory)
    {
        if (string.IsNullOrWhiteSpace(assetDirectory) || string.IsNullOrWhiteSpace(html))
            return html;

        return HtmlImageSrcRegex.Replace(html, match =>
        {
            string path = match.Groups[2].Value;
            if (IsRemoteOrDataUri(path))
                return match.Value;

            string? resolved = ResolveAssetPath(assetDirectory, path);
            if (resolved == null)
                return match.Value;

            string fileUri = new Uri(resolved).AbsoluteUri;
            return match.Groups[1].Value + fileUri + match.Groups[3].Value;
        });
    }

    public static string? ResolveAssetPath(string assetDirectory, string path)
    {
        string normalized = NormalizePathToken(path);
        if (string.IsNullOrWhiteSpace(normalized))
            return null;

        if (Path.IsPathRooted(normalized))
            return File.Exists(normalized) ? normalized : null;

        string direct = Path.GetFullPath(Path.Combine(assetDirectory, normalized));
        if (File.Exists(direct))
            return direct;

        string fileName = Path.GetFileName(normalized);
        if (string.IsNullOrEmpty(fileName))
            return null;

        string[] commonFolders = ["images", "media", "assets", "img"];
        foreach (string assetsFolder in Directory.EnumerateDirectories(assetDirectory, "*_assets", SearchOption.TopDirectoryOnly))
        {
            string candidate = Path.Combine(assetsFolder, fileName);
            if (File.Exists(candidate))
                return candidate;
        }
        foreach (string folder in commonFolders)
        {
            string candidate = Path.Combine(assetDirectory, folder, fileName);
            if (File.Exists(candidate))
                return candidate;
        }

        return Directory.EnumerateFiles(assetDirectory, fileName, SearchOption.AllDirectories)
            .FirstOrDefault();
    }

    private static string NormalizePathToken(string path)
    {
        string trimmed = path.Trim().Trim('"', '\'');
        if (trimmed.Length == 0)
            return string.Empty;

        try
        {
            trimmed = Uri.UnescapeDataString(trimmed);
        }
        catch (UriFormatException)
        {
            // 경로에 %가 포함된 경우 원본을 사용합니다.
        }

        trimmed = trimmed.Replace('\\', '/');
        while (trimmed.StartsWith("./", StringComparison.Ordinal))
            trimmed = trimmed[2..];

        return trimmed.Replace('/', Path.DirectorySeparatorChar);
    }

    private static string ToAssetRelativePath(string assetDirectory, string absolutePath)
    {
        string relative = Path.GetRelativePath(assetDirectory, absolutePath);
        return relative.Replace('\\', '/');
    }

    private static bool IsRemoteOrDataUri(string path)
    {
        return path.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
               path.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
               path.StartsWith("data:", StringComparison.OrdinalIgnoreCase) ||
               path.StartsWith("file:", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsVirtualHostUrl(string path)
    {
        return path.StartsWith($"https://{PreviewAssetHost.HostName}/", StringComparison.OrdinalIgnoreCase);
    }
}
