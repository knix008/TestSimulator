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

internal readonly record struct HwpConversionOptions(bool UseRhwp = true);

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
        HwpConversionOptions options = default,
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

        string baseName = Path.GetFileNameWithoutExtension(inputPath);
        string markdownPath = Path.Combine(outputDirectory, $"{baseName}.md");

        progress?.Report("문서 구조를 분석하는 중...");
        string markdown;
        using (var structureDocument = await Task.Run(() => UnhwpDocument.ParseFile(inputPath), cancellationToken)
                         .ConfigureAwait(false))
        {
            string json = structureDocument.ToJson(compact: false);
            IReadOnlyList<StructuredHeadingHint> headingHints = UnhwpJsonHeadingExtractor.Extract(json);

            RhwpLocator.Refresh();
            if (options.UseRhwp && RhwpLocator.IsAvailable())
            {
                try
                {
                    progress?.Report("rhwp로 표·그림·본문을 변환하는 중...");
                    markdown = await RhwpConversionService.ExportMarkdownAsync(
                        inputPath,
                        outputDirectory,
                        cancellationToken).ConfigureAwait(false);
                    ExtractUnhwpAssets(structureDocument, outputDirectory);
                }
                catch (Exception ex) when (ex is InvalidOperationException or FileNotFoundException)
                {
                    progress?.Report("rhwp 변환 실패, unhwp 본문을 사용합니다...");
                    markdown = ExportUnhwpMarkdown(structureDocument, outputDirectory);
                }
            }
            else
            {
                progress?.Report(options.UseRhwp
                    ? "rhwp를 찾을 수 없어 unhwp로 Markdown을 변환하는 중..."
                    : "unhwp로 Markdown을 변환하는 중...");
                markdown = ExportUnhwpMarkdown(structureDocument, outputDirectory);
            }

            if (headingHints.Count > 0)
            {
                progress?.Report("챕터·제목 구조를 반영하는 중...");
                markdown = MarkdownStructuredHeadingApplicator.Apply(markdown, headingHints);
            }
        }

        markdown = MarkdownLineBreakRestorer.Restore(markdown);
        markdown = MarkdownPipeTableNormalizer.Normalize(markdown);
        markdown = MarkdownImageConsolidator.Consolidate(markdown, outputDirectory);
        markdown = MarkdownAssetPathResolver.RewriteMarkdownImages(markdown, outputDirectory);

        await File.WriteAllTextAsync(markdownPath, markdown, Encoding.UTF8, cancellationToken).ConfigureAwait(false);

        return new HwpConversionResult
        {
            Markdown = markdown,
            AssetDirectory = outputDirectory,
            MarkdownFilePath = markdownPath,
            SourceFilePath = inputPath
        };
    }

    private static string ExportUnhwpMarkdown(UnhwpDocument document, string outputDirectory)
    {
        string markdown = document.ToMarkdown(new MarkdownOptions());
        ExtractUnhwpAssets(document, outputDirectory);
        return markdown;
    }

    private static void ExtractUnhwpAssets(UnhwpDocument document, string outputDirectory)
    {
        string assetsDirectory = Path.Combine(outputDirectory, "assets");
        foreach (string resourceId in document.GetResourceIds())
        {
            byte[]? data = document.GetResourceData(resourceId);
            if (data == null)
                continue;

            Directory.CreateDirectory(assetsDirectory);
            File.WriteAllBytes(Path.Combine(assetsDirectory, resourceId), data);
        }
    }
}
