namespace CodeAnalyzer.Services.Reports;

public static class AnalysisReportExportService
{
    public static AnalysisReportFormat ResolveFormat(string filePath)
    {
        var extension = Path.GetExtension(filePath).ToLowerInvariant();
        return extension switch
        {
            ".md" or ".markdown" => AnalysisReportFormat.Markdown,
            ".html" or ".htm" => AnalysisReportFormat.Html,
            ".docx" => AnalysisReportFormat.Word,
            ".pdf" => AnalysisReportFormat.Pdf,
            _ => throw new NotSupportedException(
                $"지원하지 않는 보고서 형식입니다: {extension}. " +
                "사용 가능: .md, .html, .docx, .pdf")
        };
    }

    public static void Save(
        Models.AnalysisResult analysis,
        string rootDirectory,
        string filePath)
    {
        var document = AnalysisReportBuilder.Build(analysis, rootDirectory);
        var format = ResolveFormat(filePath);

        switch (format)
        {
            case AnalysisReportFormat.Markdown:
                AnalysisReportMarkdownWriter.Write(document, filePath);
                break;
            case AnalysisReportFormat.Html:
                AnalysisReportHtmlWriter.Write(document, filePath);
                break;
            case AnalysisReportFormat.Word:
                AnalysisReportDocxWriter.Write(document, filePath);
                break;
            case AnalysisReportFormat.Pdf:
                AnalysisReportPdfWriter.Write(document, filePath);
                break;
            default:
                throw new NotSupportedException($"형식 {format}은(는) 지원하지 않습니다.");
        }
    }

    public static string BuildDefaultFileName(AnalysisReportFormat format, string? rootDirectory = null)
    {
        var extension = format switch
        {
            AnalysisReportFormat.Markdown => "md",
            AnalysisReportFormat.Html => "html",
            AnalysisReportFormat.Word => "docx",
            AnalysisReportFormat.Pdf => "pdf",
            _ => "report"
        };

        return AnalysisExportFileNameBuilder.Build(rootDirectory, extension);
    }
}
