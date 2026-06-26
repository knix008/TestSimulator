using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Export;

/// <summary>
/// 변환된 이미지를 images/ 폴더로 모으고 Markdown 경로를 통일합니다.
/// </summary>
internal static class MarkdownImageConsolidator
{
    private static readonly Regex MarkdownImageRegex = new(
        @"!\[([^\]]*)\]\(([^)]+)\)",
        RegexOptions.Compiled);

    private static readonly Regex HtmlImageRegex = new(
        """(<img\b[^>]*\bsrc\s*=\s*["'])(?!https?:|data:)([^"']+)(["'])""",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static readonly string[] ImageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".emf", ".wmf"];

    public static string Consolidate(string markdown, string sourceAssetDirectory)
        => Consolidate(markdown, sourceAssetDirectory, sourceAssetDirectory);

    public static string Consolidate(string markdown, string sourceAssetDirectory, string exportDirectory)
    {
        if (string.IsNullOrWhiteSpace(markdown))
            return markdown;

        string imagesDirectory = Path.Combine(exportDirectory, "images");
        Directory.CreateDirectory(imagesDirectory);

        if (string.IsNullOrWhiteSpace(sourceAssetDirectory) || !Directory.Exists(sourceAssetDirectory))
            return markdown;

        string result = MarkdownImageRegex.Replace(markdown, match =>
            RewriteMarkdownImage(match.Groups[1].Value, match.Groups[2].Value.Trim(), sourceAssetDirectory, imagesDirectory));

        result = HtmlImageRegex.Replace(result, match =>
        {
            string path = match.Groups[2].Value.Trim();
            string? rewritten = TryCopyImageAndGetRelativePath(path, sourceAssetDirectory, imagesDirectory);
            if (rewritten == null)
                return match.Value;

            return match.Groups[1].Value + rewritten.Replace('\\', '/') + match.Groups[3].Value;
        });

        return AppendMissingRhwpAssets(result, sourceAssetDirectory, imagesDirectory);
    }

    private static string RewriteMarkdownImage(
        string alt,
        string path,
        string sourceAssetDirectory,
        string imagesDirectory)
    {
        string? rewritten = TryCopyImageAndGetRelativePath(path, sourceAssetDirectory, imagesDirectory);
        return rewritten == null
            ? $"![{alt}]({path})"
            : $"![{alt}]({rewritten.Replace('\\', '/')})";
    }

    private static string? TryCopyImageAndGetRelativePath(
        string path,
        string sourceAssetDirectory,
        string imagesDirectory)
    {
        string normalized = NormalizeImageReferencePath(path);
        if (IsRemoteOrDataUri(normalized))
            return null;

        string? sourcePath = MarkdownAssetPathResolver.ResolveAssetPath(sourceAssetDirectory, normalized);
        if (sourcePath == null)
            return null;

        string fileName = Path.GetFileName(sourcePath);
        string targetPath = Path.Combine(imagesDirectory, fileName);
        if (!PathsEqual(sourcePath, targetPath))
        {
            try
            {
                File.Copy(sourcePath, targetPath, overwrite: true);
            }
            catch (IOException)
            {
                // 이미 복사된 경우 등은 무시합니다.
            }
        }

        return $"images/{fileName}";
    }

    private static string AppendMissingRhwpAssets(
        string markdown,
        string sourceAssetDirectory,
        string imagesDirectory)
    {
        var referenced = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match match in MarkdownImageRegex.Matches(markdown))
        {
            string fileName = Path.GetFileName(NormalizeImageReferencePath(match.Groups[2].Value.Trim()));
            if (!string.IsNullOrEmpty(fileName))
                referenced.Add(fileName);
        }

        var additions = new List<string>();
        foreach (string assetFile in EnumerateRhwpAssetFiles(sourceAssetDirectory))
        {
            string fileName = Path.GetFileName(assetFile);
            if (referenced.Contains(fileName))
                continue;

            string targetPath = Path.Combine(imagesDirectory, fileName);
            if (!PathsEqual(assetFile, targetPath))
            {
                try
                {
                    File.Copy(assetFile, targetPath, overwrite: true);
                }
                catch (IOException)
                {
                    // 이미 복사된 경우 등은 무시합니다.
                }
            }

            additions.Add($"![{Path.GetFileNameWithoutExtension(fileName)}](images/{fileName.Replace('\\', '/')})");
            referenced.Add(fileName);
        }

        if (additions.Count == 0)
            return markdown;

        return markdown.TrimEnd() + "\n\n" + string.Join("\n\n", additions) + "\n";
    }

    private static IEnumerable<string> EnumerateRhwpAssetFiles(string sourceAssetDirectory)
    {
        foreach (string assetsFolder in Directory.EnumerateDirectories(sourceAssetDirectory, "*_assets", SearchOption.TopDirectoryOnly))
        {
            foreach (string file in Directory.EnumerateFiles(assetsFolder, "*.*", SearchOption.AllDirectories))
            {
                if (ImageExtensions.Contains(Path.GetExtension(file), StringComparer.OrdinalIgnoreCase))
                    yield return file;
            }
        }

        foreach (string folder in new[] { "images", "assets", "media", "img" })
        {
            string candidate = Path.Combine(sourceAssetDirectory, folder);
            if (!Directory.Exists(candidate))
                continue;

            foreach (string file in Directory.EnumerateFiles(candidate, "*.*", SearchOption.AllDirectories))
            {
                if (ImageExtensions.Contains(Path.GetExtension(file), StringComparer.OrdinalIgnoreCase))
                    yield return file;
            }
        }
    }

    private static string NormalizeImageReferencePath(string path)
    {
        string virtualPrefix = $"https://{PreviewAssetHost.HostName}/";
        if (path.StartsWith(virtualPrefix, StringComparison.OrdinalIgnoreCase))
        {
            string relative = path[virtualPrefix.Length..];
            try
            {
                relative = Uri.UnescapeDataString(relative);
            }
            catch (UriFormatException)
            {
                // 원본 경로를 사용합니다.
            }

            return relative.Replace('/', Path.DirectorySeparatorChar);
        }

        return path;
    }

    private static bool IsRemoteOrDataUri(string path)
    {
        return path.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
               path.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
               path.StartsWith("data:", StringComparison.OrdinalIgnoreCase) ||
               path.StartsWith("file:", StringComparison.OrdinalIgnoreCase);
    }

    private static bool PathsEqual(string left, string right)
    {
        return string.Equals(
            Path.GetFullPath(left),
            Path.GetFullPath(right),
            StringComparison.OrdinalIgnoreCase);
    }
}
