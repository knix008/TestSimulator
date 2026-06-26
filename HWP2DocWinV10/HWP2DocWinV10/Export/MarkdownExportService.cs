using System.Text;

namespace HWP2DocWinV10.Export;

/// <summary>
/// Markdown 파일과 images/ 폴더를 함께보냅니다.
/// </summary>
internal static class MarkdownExportService
{
    public static async Task ExportAsync(
        string markdown,
        string? sourceAssetDirectory,
        string outputMarkdownPath,
        CancellationToken cancellationToken = default)
    {
        string exportDirectory = Path.GetDirectoryName(outputMarkdownPath)
            ?? throw new ArgumentException("유효한 저장 경로가 필요합니다.", nameof(outputMarkdownPath));

        Directory.CreateDirectory(exportDirectory);

        string prepared = MarkdownPipeTableNormalizer.Normalize(markdown);
        if (!string.IsNullOrWhiteSpace(sourceAssetDirectory) && Directory.Exists(sourceAssetDirectory))
        {
            prepared = MarkdownImageConsolidator.Consolidate(markdown, sourceAssetDirectory, exportDirectory);
        }
        else
        {
            Directory.CreateDirectory(Path.Combine(exportDirectory, "images"));
        }

        await File.WriteAllTextAsync(outputMarkdownPath, prepared, Encoding.UTF8, cancellationToken)
            .ConfigureAwait(false);
    }
}
