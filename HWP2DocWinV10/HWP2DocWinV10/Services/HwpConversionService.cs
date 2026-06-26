using System.Text;
using HWP2DocWinV10.Export;
using Unhwp;

namespace HWP2DocWinV10.Services;

internal sealed class HwpConversionResult
{
    public required string Markdown { get; init; }
    public required string AssetDirectory { get; init; }
    public required string MarkdownFilePath { get; init; }
    public required string SourceFilePath { get; init; }
}

internal static class HwpConversionService
{
    private static readonly string[] SupportedExtensions = [".hwp", ".hwpx"];

    public static bool IsSupported(string path)
    {
        string ext = Path.GetExtension(path);
        return SupportedExtensions.Contains(ext, StringComparer.OrdinalIgnoreCase);
    }

    public static async Task<HwpConversionResult> ConvertAsync(
        string inputPath,
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (!File.Exists(inputPath))
            throw new FileNotFoundException("입력 파일을 찾을 수 없습니다.", inputPath);

        if (!IsSupported(inputPath))
            throw new NotSupportedException("지원하지 않는 파일 형식입니다. .hwp 또는 .hwpx 파일만 변환할 수 있습니다.");

        string outputDirectory = Path.Combine(
            Path.GetTempPath(),
            "HWP2DocWinV10",
            Path.GetFileNameWithoutExtension(inputPath) + "_" + Guid.NewGuid().ToString("N")[..8]);

        Directory.CreateDirectory(outputDirectory);

        return await ConvertWithUnhwpAsync(inputPath, outputDirectory, progress, cancellationToken)
            .ConfigureAwait(false);
    }

    private static async Task<HwpConversionResult> ConvertWithUnhwpAsync(
        string inputPath,
        string outputDirectory,
        IProgress<string>? progress,
        CancellationToken cancellationToken)
    {
        progress?.Report("unhwp로 문서를 Markdown으로 변환하는 중...");

        string baseName = Path.GetFileNameWithoutExtension(inputPath);
        string markdownPath = Path.Combine(outputDirectory, $"{baseName}.md");
        string markdown = await Task.Run(() => ParseAndExtractAssets(inputPath, outputDirectory), cancellationToken)
            .ConfigureAwait(false);

        await File.WriteAllTextAsync(markdownPath, markdown, Encoding.UTF8, cancellationToken).ConfigureAwait(false);

        markdown = MarkdownHeadingNormalizer.Normalize(markdown);
        markdown = MarkdownPipeTableNormalizer.Normalize(markdown);
        markdown = MarkdownImageConsolidator.Consolidate(markdown, outputDirectory);
        markdown = MarkdownAssetPathResolver.RewriteMarkdownImages(markdown, outputDirectory);

        return new HwpConversionResult
        {
            Markdown = markdown,
            AssetDirectory = outputDirectory,
            MarkdownFilePath = markdownPath,
            SourceFilePath = inputPath
        };
    }

    private static string ParseAndExtractAssets(string inputPath, string outputDirectory)
    {
        try
        {
            using var document = UnhwpDocument.ParseFile(inputPath);
            string markdown = document.ToMarkdown(new MarkdownOptions());

            string assetsDirectory = Path.Combine(outputDirectory, "assets");
            foreach (string resourceId in document.GetResourceIds())
            {
                byte[]? data = document.GetResourceData(resourceId);
                if (data == null)
                    continue;

                Directory.CreateDirectory(assetsDirectory);
                File.WriteAllBytes(Path.Combine(assetsDirectory, resourceId), data);
            }

            return markdown;
        }
        catch (UnhwpException ex)
        {
            throw new InvalidOperationException($"HWP 변환에 실패했습니다.\n{ex.Message}", ex);
        }
    }
}
