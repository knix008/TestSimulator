using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using ReqTrace.Models;

namespace ReqTrace.Reporting;

public class PdfReportExporter : IReportExporter
{
    public string DefaultFileExtension => ".pdf";

    public void Export(TraceabilityReportData data, string outputFilePath)
    {
        QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

        Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(30);
                page.DefaultTextStyle(x => x.FontSize(9));

                page.Header().Column(col =>
                {
                    col.Item().Text($"{data.ProjectName} — Traceability Report").FontSize(18).Bold();
                    col.Item().Text($"Generated: {data.GeneratedUtc.ToLocalTime():yyyy-MM-dd HH:mm}").FontSize(9).FontColor(Colors.Grey.Darken1);
                });

                page.Content().Column(col =>
                {
                    col.Spacing(10);
                    col.Item().Element(c => ComposeSummary(c, data));
                    col.Item().Element(c => ComposeMatrix(c, data));
                });

                page.Footer().AlignCenter().Text(x =>
                {
                    x.CurrentPageNumber();
                    x.Span(" / ");
                    x.TotalPages();
                });
            });
        }).GeneratePdf(outputFilePath);
    }

    private static void ComposeSummary(QuestPDF.Infrastructure.IContainer container, TraceabilityReportData data)
    {
        var s = data.Summary;
        container.Column(col =>
        {
            col.Item().Text("Summary").FontSize(13).Bold();
            col.Item().Row(row =>
            {
                row.RelativeItem().Element(c => StatBox(c, "Requirements", s.TotalRequirements.ToString(), Colors.Blue.Lighten4));
                row.RelativeItem().Element(c => StatBox(c, "Test Cases", s.TotalTestCases.ToString(), Colors.Blue.Lighten4));
                row.RelativeItem().Element(c => StatBox(c, "Coverage", $"{s.CoveragePercent:F0}%", Colors.Blue.Lighten4));
                row.RelativeItem().Element(c => StatBox(c, "Pass Rate", $"{s.PassRatePercent:F0}%", Colors.Green.Lighten4));
            });
            col.Item().Row(row =>
            {
                row.RelativeItem().Element(c => StatBox(c, "Pass", s.PassCount.ToString(), Colors.Green.Lighten3));
                row.RelativeItem().Element(c => StatBox(c, "Fail", s.FailCount.ToString(), Colors.Red.Lighten3));
                row.RelativeItem().Element(c => StatBox(c, "Blocked", s.BlockedCount.ToString(), Colors.Orange.Lighten3));
                row.RelativeItem().Element(c => StatBox(c, "Not Run", s.NotRunCount.ToString(), Colors.Grey.Lighten3));
            });
        });
    }

    private static void StatBox(QuestPDF.Infrastructure.IContainer container, string label, string value, string color)
    {
        container.Border(1).BorderColor(Colors.Grey.Lighten2).Background(color).Padding(6).Column(col =>
        {
            col.Item().Text(label).FontSize(8).FontColor(Colors.Grey.Darken2);
            col.Item().Text(value).FontSize(14).Bold();
        });
    }

    private static void ComposeMatrix(QuestPDF.Infrastructure.IContainer container, TraceabilityReportData data)
    {
        container.Column(col =>
        {
            col.Item().Text("Traceability Matrix").FontSize(13).Bold();
            col.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(1.2f);
                    columns.RelativeColumn(2.5f);
                    columns.RelativeColumn(1.2f);
                    columns.RelativeColumn(2.5f);
                    columns.RelativeColumn(1.2f);
                    columns.RelativeColumn(1.5f);
                });

                table.Header(header =>
                {
                    foreach (var title in new[] { "Req Code", "Req / Test Case", "Category", "Test Case", "Status", "Last Run" })
                        header.Cell().Background(Colors.Grey.Lighten2).Padding(3).Text(title).Bold();
                });

                foreach (var row in data.Rows)
                {
                    var bg = row.LatestRunStatus switch
                    {
                        TestRunStatus.Pass => Colors.Green.Lighten4,
                        TestRunStatus.Fail => Colors.Red.Lighten4,
                        TestRunStatus.Blocked => Colors.Orange.Lighten4,
                        _ => Colors.White
                    };

                    table.Cell().Padding(3).Text(row.RequirementCode);
                    table.Cell().Padding(3).Text(row.RequirementTitle);
                    table.Cell().Padding(3).Text(row.Category);
                    table.Cell().Padding(3).Text(string.IsNullOrEmpty(row.TestCaseCode) ? "(no test case)" : $"{row.TestCaseCode} - {row.TestCaseTitle}");
                    table.Cell().Background(bg).Padding(3).Text(row.LatestRunStatus.ToString());
                    table.Cell().Padding(3).Text(row.LatestRunDate.HasValue ? row.LatestRunDate.Value.ToLocalTime().ToString("yyyy-MM-dd HH:mm") : "-");
                }
            });
        });
    }
}
