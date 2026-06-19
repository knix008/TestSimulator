namespace MyGitWinV10.App.Services;

public static class RepositorySummaryExportService
{
    public static void Export(RepositorySummary summary, string filePath)
    {
        switch (Path.GetExtension(filePath).ToLowerInvariant())
        {
            case ".md":
            case ".markdown":
                RepositorySummaryMarkdownExporter.Export(summary, filePath);
                break;
            case ".docx":
                RepositorySummaryWordExporter.Export(summary, filePath);
                break;
            case ".pdf":
                RepositorySummaryPdfExporter.Export(summary, filePath);
                break;
            default:
                throw new NotSupportedException($"Unsupported export format: {Path.GetExtension(filePath)}");
        }
    }
}
