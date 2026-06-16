using MyAgileBoardWinV10.Models;
using MyAgileBoardWinV10.Utils;

namespace MyAgileBoardWinV10.Services;

public static class ProjectReportBuilder
{
    public static ProjectReportSnapshot Build(KanbanProject project)
    {
        var doneColumnIds = project.Columns
            .Where(c => c.IsCompletionColumn)
            .Select(c => c.Id)
            .ToHashSet();

        var allCards = project.Columns.SelectMany(c => c.Cards).ToList();
        var doneCards = project.Columns
            .Where(c => c.IsCompletionColumn)
            .SelectMany(c => c.Cards)
            .ToList();

        int overdue = allCards.Count(c =>
            c.DueDate.HasValue
            && c.DueDate.Value.Date < DateTime.Today
            && !project.Columns.Any(col => col.IsCompletionColumn && col.Cards.Any(x => x.Id == c.Id)));

        var columns = project.Columns.Select(col => new ColumnReportSection
        {
            Name = col.Name,
            HeaderColorHex = col.HeaderColorHex,
            IsCompletionColumn = col.IsCompletionColumn,
            Cards = col.Cards.Select(ToCardItem).ToList()
        }).ToList();

        return new ProjectReportSnapshot
        {
            ProjectName = project.Name,
            ProjectFilePath = string.IsNullOrWhiteSpace(project.FilePath) ? null : project.FilePath,
            GeneratedAt = DateTime.Now,
            ProjectCreatedAt = project.CreatedAt,
            TotalCards = allCards.Count,
            DoneCards = doneCards.Count,
            TotalPoints = allCards.Sum(c => c.Points),
            DonePoints = doneCards.Sum(c => c.Points),
            OverdueCards = overdue,
            ArchivedCount = project.ArchivedCards.Count,
            Columns = columns,
            Charts = ReportChartRenderer.Build(project)
        };
    }

    private static CardReportItem ToCardItem(KanbanCard card) => new()
    {
        Title = card.Title,
        Description = CardShapePainter.GetDescriptionPlain(card),
        Assignee = card.Assignee,
        Priority = card.Priority,
        Points = card.Points,
        DueDate = card.DueDate?.ToString("yyyy-MM-dd"),
        Tags = card.Tags,
        CardColorHex = card.CardColorHex,
        CompletedAt = card.CompletedAt?.ToString("yyyy-MM-dd HH:mm")
    };
}
