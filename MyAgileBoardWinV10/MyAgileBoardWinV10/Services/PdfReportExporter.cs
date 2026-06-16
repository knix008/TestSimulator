using MyAgileBoardWinV10.Services;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace MyAgileBoardWinV10.Services;

public static class PdfReportExporter
{
    public static void Export(ProjectReportSnapshot report, string filePath)
    {
        Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(40);
                page.DefaultTextStyle(x => x.FontSize(10));

                page.Header().Text(report.ProjectName).FontSize(20).Bold();
                page.Footer().AlignCenter().Text(text =>
                {
                    text.Span("MyAgileBoard — ");
                    text.Span($"{report.GeneratedAt:yyyy-MM-dd HH:mm}");
                });

                page.Content().Column(col =>
                {
                    col.Spacing(8);
                    col.Item().Text($"생성일: {report.GeneratedAt:yyyy-MM-dd HH:mm}");
                    if (!string.IsNullOrWhiteSpace(report.ProjectFilePath))
                        col.Item().Text($"프로젝트 파일: {report.ProjectFilePath}");
                    col.Item().Text($"프로젝트 생성일: {report.ProjectCreatedAt:yyyy-MM-dd}");

                    col.Item().PaddingTop(8).Text("요약").FontSize(14).Bold();
                    col.Item().Text($"전체 카드: {report.TotalCards}  |  완료: {report.DoneCards}  |  진행중/대기: {report.RemainingCards}");
                    col.Item().Text($"전체 포인트: {report.TotalPoints}  |  완료 포인트: {report.DonePoints}  |  기한 초과: {report.OverdueCards}  |  아카이브: {report.ArchivedCount}");

                    if (report.Charts.HasCharts)
                    {
                        col.Item().PaddingTop(12).Text("차트").FontSize(14).Bold();

                        if (report.Charts.ColumnPieChartPng.Length > 0)
                        {
                            col.Item().PaddingTop(6).Text("컬럼별 카드 분포").FontSize(11).Bold();
                            col.Item().PaddingTop(4).Image(report.Charts.ColumnPieChartPng).FitWidth();
                        }

                        if (report.Charts.PriorityBarChartPng.Length > 0)
                        {
                            col.Item().PaddingTop(8).Text("우선순위별 카드 분포").FontSize(11).Bold();
                            col.Item().PaddingTop(4).Image(report.Charts.PriorityBarChartPng).FitWidth();
                        }

                        if (report.Charts.BurndownChartPng.Length > 0)
                        {
                            col.Item().PaddingTop(8).Text("Burn Down 차트").FontSize(11).Bold();
                            if (!string.IsNullOrWhiteSpace(report.Charts.BurndownCaption))
                                col.Item().Text(report.Charts.BurndownCaption).FontSize(9).FontColor(Colors.Grey.Darken1);
                            col.Item().PaddingTop(4).Image(report.Charts.BurndownChartPng).FitWidth();
                        }
                    }

                    foreach (var column in report.Columns)
                    {
                        col.Item().PaddingTop(12).Text(column.Name).FontSize(13).Bold();
                        col.Item().Text($"카드 {column.Cards.Count}개 · {(column.IsCompletionColumn ? "완료 컬럼" : "일반 컬럼")}");

                        foreach (var card in column.Cards)
                        {
                            col.Item().PaddingTop(6).BorderBottom(1).BorderColor(Colors.Grey.Lighten2).PaddingBottom(4).Column(cardCol =>
                            {
                                cardCol.Item().Text(card.Title).Bold();
                                var meta = $"우선순위: {card.Priority}  |  포인트: {card.Points}";
                                if (!string.IsNullOrWhiteSpace(card.Assignee))
                                    meta += $"  |  담당자: {card.Assignee}";
                                if (!string.IsNullOrWhiteSpace(card.DueDate))
                                    meta += $"  |  기한: {card.DueDate}";
                                cardCol.Item().Text(meta).FontSize(9).FontColor(Colors.Grey.Darken1);

                                if (!string.IsNullOrWhiteSpace(card.Tags))
                                    cardCol.Item().Text($"태그: {card.Tags}").FontSize(9);
                                if (!string.IsNullOrWhiteSpace(card.CompletedAt))
                                    cardCol.Item().Text($"완료일: {card.CompletedAt}").FontSize(9);
                                if (!string.IsNullOrWhiteSpace(card.Description))
                                    cardCol.Item().PaddingTop(2).Text(card.Description);
                            });
                        }
                    }
                });
            });
        }).GeneratePdf(filePath);
    }
}
