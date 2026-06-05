namespace CodeAnalyzer.Services.Reports;

public sealed class AnalysisReportDocument
{
    public required string Title { get; init; }
    public required string RootDirectory { get; init; }
    public DateTime GeneratedAt { get; init; }
    public IReadOnlyList<ReportSection> Sections { get; init; } = [];
    public string FooterNote { get; init; } = string.Empty;
}

public sealed class ReportSection
{
    public required string Heading { get; init; }
    public int Level { get; init; } = 2;
    public IReadOnlyList<string> Paragraphs { get; init; } = [];
    public IReadOnlyList<string> BulletItems { get; init; } = [];
    public ReportTable? Table { get; init; }
}

public sealed class ReportTable
{
    public IReadOnlyList<string> Headers { get; init; } = [];
    public IReadOnlyList<ReportTableRow> Rows { get; init; } = [];
}

public sealed class ReportTableRow
{
    public IReadOnlyList<string> Cells { get; init; } = [];
    public double? RiskScore { get; init; }
}

public enum AnalysisReportFormat
{
    Markdown,
    Html,
    Word,
    Pdf
}
