using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using ReqTrace.Localization;
using ReqTrace.Models;

namespace ReqTrace.Reporting;

public class PdfReportExporter : IReportExporter
{
    public string DefaultFileExtension => ".pdf";

    public void Export(TraceabilityReportData data, string outputFilePath)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.Margin(20);
                page.DefaultTextStyle(x => x.FontSize(7));

                page.Header().Column(col =>
                {
                    col.Item().Text($"{data.ProjectName} — {Loc.T("Dlg_ExportReport")}").FontSize(14).Bold();
                    col.Item().Text(Loc.T("Export_GeneratedAt", data.GeneratedUtc.ToLocalTime().ToString("yyyy-MM-dd HH:mm")))
                        .FontSize(8).FontColor(Colors.Grey.Darken1);
                });

                page.Content().Column(col =>
                {
                    col.Spacing(10);
                    col.Item().Element(c => ComposeSummary(c, data));
                    col.Item().Element(c => ComposeRequirements(c, data));
                    col.Item().Element(c => ComposeTestCases(c, data));
                    col.Item().Element(c => ComposeTraceability(c, data));
                    col.Item().Element(c => ComposeTestCaseSteps(c, data));
                    col.Item().Element(c => ComposeCategories(c, data));
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

    private static void ComposeSummary(IContainer container, TraceabilityReportData data)
    {
        var s = data.Summary;
        container.Column(col =>
        {
            col.Item().Text(Loc.T("Export_Section_Summary")).FontSize(11).Bold();
            col.Item().Row(row =>
            {
                row.RelativeItem().Element(c => StatBox(c, Loc.T("Export_TotalRequirements"), s.TotalRequirements.ToString(), Colors.Blue.Lighten4));
                row.RelativeItem().Element(c => StatBox(c, Loc.T("Export_TotalTestCases"), s.TotalTestCases.ToString(), Colors.Blue.Lighten4));
                row.RelativeItem().Element(c => StatBox(c, Loc.T("Export_CoveragePercent"), $"{s.CoveragePercent:F0}%", Colors.Blue.Lighten4));
                row.RelativeItem().Element(c => StatBox(c, Loc.T("Export_PassRatePercent"), $"{s.PassRatePercent:F0}%", Colors.Green.Lighten4));
            });
            col.Item().Row(row =>
            {
                row.RelativeItem().Element(c => StatBox(c, Loc.Enum(TestRunStatus.Pass), s.PassCount.ToString(), Colors.Green.Lighten3));
                row.RelativeItem().Element(c => StatBox(c, Loc.Enum(TestRunStatus.Fail), s.FailCount.ToString(), Colors.Red.Lighten3));
                row.RelativeItem().Element(c => StatBox(c, Loc.Enum(TestRunStatus.Blocked), s.BlockedCount.ToString(), Colors.Orange.Lighten3));
                row.RelativeItem().Element(c => StatBox(c, Loc.Enum(TestRunStatus.NotRun), s.NotRunCount.ToString(), Colors.Grey.Lighten3));
            });
        });
    }

    private static void StatBox(IContainer container, string label, string value, string color)
    {
        container.Border(1).BorderColor(Colors.Grey.Lighten2).Background(color).Padding(4).Column(col =>
        {
            col.Item().Text(label).FontSize(6).FontColor(Colors.Grey.Darken2);
            col.Item().Text(value).FontSize(10).Bold();
        });
    }

    private static void ComposeRequirements(IContainer container, TraceabilityReportData data) =>
        ComposeDataTable(
            container,
            Loc.T("Export_Section_Requirements"),
            ReportExportColumns.RequirementHeaders(),
            data.Requirements.Select(ReportExportColumns.RequirementValues),
            Array.IndexOf(ReportExportColumns.RequirementHeaderKeys, "Col_TestStatus"),
            rowIndex => data.Requirements[rowIndex].AggregateTestStatus);

    private static void ComposeTestCases(IContainer container, TraceabilityReportData data) =>
        ComposeDataTable(
            container,
            Loc.T("Export_Section_TestCases"),
            ReportExportColumns.TestCaseHeaders(),
            data.TestCases.Select(ReportExportColumns.TestCaseValues),
            Array.IndexOf(ReportExportColumns.TestCaseHeaderKeys, "Col_LatestStatus"),
            rowIndex => data.TestCases[rowIndex].LatestStatusValue);

    private static void ComposeTraceability(IContainer container, TraceabilityReportData data) =>
        ComposeDataTable(
            container,
            Loc.T("Export_Section_Traceability"),
            ReportExportColumns.TraceabilityHeaders(),
            data.TraceabilityMatrix.Select(ReportExportColumns.TraceabilityValues),
            Array.IndexOf(ReportExportColumns.TraceabilityHeaderKeys, "Col_LatestStatus"),
            rowIndex => data.TraceabilityMatrix[rowIndex].LatestStatusValue);

    private static void ComposeTestCaseSteps(IContainer container, TraceabilityReportData data) =>
        ComposeDataTable(
            container,
            Loc.T("Export_Section_TestCaseSteps"),
            ReportExportColumns.TestCaseStepHeaders(),
            data.TestCaseSteps.Select(ReportExportColumns.TestCaseStepValues),
            statusColumnIndex: -1,
            statusSelector: null);

    private static void ComposeCategories(IContainer container, TraceabilityReportData data)
    {
        container.Column(col =>
        {
            col.Item().Text(Loc.T("Export_Section_ByCategory")).FontSize(11).Bold();
            col.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    columns.RelativeColumn(2.5f);
                    columns.RelativeColumn(1f);
                    columns.RelativeColumn(1f);
                    columns.RelativeColumn(1f);
                    columns.RelativeColumn(1f);
                });

                table.Header(header =>
                {
                    header.Cell().Background(Colors.Grey.Lighten2).Padding(2).Text(Loc.T("Col_Category")).Bold();
                    header.Cell().Background(Colors.Grey.Lighten2).Padding(2).Text(Loc.T("Export_RequirementsCount")).Bold();
                    header.Cell().Background(Colors.Grey.Lighten2).Padding(2).Text(Loc.T("Export_TestCasesCount")).Bold();
                    header.Cell().Background(Colors.Grey.Lighten2).Padding(2).Text(Loc.T("Export_CoveragePercent")).Bold();
                    header.Cell().Background(Colors.Grey.Lighten2).Padding(2).Text(Loc.T("Export_PassRatePercent")).Bold();
                });

                foreach (var cat in data.Categories)
                {
                    table.Cell().Padding(2).Text(cat.Category);
                    table.Cell().Padding(2).Text(cat.RequirementCount.ToString());
                    table.Cell().Padding(2).Text(cat.TestCaseCount.ToString());
                    table.Cell().Padding(2).Text($"{cat.CoveragePercent:F1}%");
                    table.Cell().Padding(2).Text($"{cat.PassRatePercent:F1}%");
                }
            });
        });
    }

    private static void ComposeDataTable(
        IContainer container,
        string title,
        IReadOnlyList<string> headers,
        IEnumerable<string[]> rows,
        int statusColumnIndex,
        Func<int, TestRunStatus>? statusSelector)
    {
        var rowList = rows.ToList();
        container.Column(col =>
        {
            col.Item().Text(title).FontSize(11).Bold();
            col.Item().Table(table =>
            {
                table.ColumnsDefinition(columns =>
                {
                    foreach (var _ in headers)
                        columns.RelativeColumn();
                });

                table.Header(header =>
                {
                    foreach (var headerTitle in headers)
                        header.Cell().Background(Colors.Grey.Lighten2).Padding(2).Text(headerTitle).Bold().FontSize(6);
                });

                for (var rowIndex = 0; rowIndex < rowList.Count; rowIndex++)
                {
                    var values = rowList[rowIndex];
                    for (var columnIndex = 0; columnIndex < values.Length; columnIndex++)
                    {
                        var value = values[columnIndex];
                        if (statusSelector is not null && columnIndex == statusColumnIndex)
                        {
                            table.Cell().Element(c => c
                                .Background(ReportExportStyling.ToPdfColor(statusSelector(rowIndex)))
                                .Padding(2)
                                .Text(value)
                                .FontSize(6));
                        }
                        else
                        {
                            table.Cell().Padding(2).Text(value).FontSize(6);
                        }
                    }
                }
            });
        });
    }
}
