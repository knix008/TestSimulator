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

        return MarkdownImageRegex.Replace(markdown, match =>
        {
            string alt = match.Groups[1].Value;
            string path = NormalizeImageReferencePath(match.Groups[2].Value.Trim());
            if (IsRemoteOrDataUri(path))
                return match.Value;

            string? sourcePath = MarkdownAssetPathResolver.ResolveAssetPath(sourceAssetDirectory, path);
            if (sourcePath == null)
                return match.Value;

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

            return $"![{alt}](images/{fileName.Replace('\\', '/')})";
        });
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
