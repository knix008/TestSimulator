using MyAgileBoardWinV10.Models;

namespace MyAgileBoardWinV10.Services;

public sealed class CardReportItem
{
    public string Title { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public string Assignee { get; init; } = string.Empty;
    public Priority Priority { get; init; }
    public int Points { get; init; }
    public string? DueDate { get; init; }
    public string Tags { get; init; } = string.Empty;
    public string CardColorHex { get; init; } = "#F5F5F5";
    public string? CompletedAt { get; init; }
}

public sealed class ColumnReportSection
{
    public string Name { get; init; } = string.Empty;
    public string HeaderColorHex { get; init; } = "#4472C4";
    public bool IsCompletionColumn { get; init; }
    public IReadOnlyList<CardReportItem> Cards { get; init; } = [];
}

public sealed class ProjectReportSnapshot
{
    public string ProjectName { get; init; } = string.Empty;
    public string? ProjectFilePath { get; init; }
    public DateTime GeneratedAt { get; init; }
    public DateTime ProjectCreatedAt { get; init; }
    public int TotalCards { get; init; }
    public int DoneCards { get; init; }
    public int RemainingCards => TotalCards - DoneCards;
    public int TotalPoints { get; init; }
    public int DonePoints { get; init; }
    public int OverdueCards { get; init; }
    public int ArchivedCount { get; init; }
    public IReadOnlyList<ColumnReportSection> Columns { get; init; } = [];
    public ReportChartImages Charts { get; init; } = new();
}
