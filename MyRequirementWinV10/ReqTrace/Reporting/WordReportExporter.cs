using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using ReqTrace.Localization;

namespace ReqTrace.Reporting;

public class WordReportExporter : IReportExporter
{
    public string DefaultFileExtension => ".docx";

    public void Export(TraceabilityReportData data, string outputFilePath)
    {
        using var wordDoc = WordprocessingDocument.Create(outputFilePath, WordprocessingDocumentType.Document);
        var mainPart = wordDoc.AddMainDocumentPart();
        mainPart.Document = new Document();
        var body = mainPart.Document.AppendChild(new Body());

        AppendHeading(body, $"{data.ProjectName} — {Loc.T("Dlg_ExportReport")}", 28, true);
        AppendParagraph(body, Loc.T("Export_GeneratedAt", data.GeneratedUtc.ToLocalTime().ToString("yyyy-MM-dd HH:mm")), 9);

        AppendHeading(body, Loc.T("Export_Section_Summary"), 20, true);
        var s = data.Summary;
        AppendSummaryTable(body, new (string, string)[]
        {
            (Loc.T("Export_TotalRequirements"), s.TotalRequirements.ToString()),
            (Loc.T("Export_RequirementsWithTests"), s.RequirementsWithTests.ToString()),
            (Loc.T("Export_RequirementsWithoutTests"), s.RequirementsWithoutTests.ToString()),
            (Loc.T("Export_TotalTestCases"), s.TotalTestCases.ToString()),
            (Loc.Enum(Models.TestRunStatus.Pass), s.PassCount.ToString()),
            (Loc.Enum(Models.TestRunStatus.Fail), s.FailCount.ToString()),
            (Loc.Enum(Models.TestRunStatus.Blocked), s.BlockedCount.ToString()),
            (Loc.Enum(Models.TestRunStatus.NotRun), s.NotRunCount.ToString()),
            (Loc.T("Export_CoveragePercent"), $"{s.CoveragePercent:F1}%"),
            (Loc.T("Export_PassRatePercent"), $"{s.PassRatePercent:F1}%")
        });

        AppendSectionTable(body, Loc.T("Export_Section_Requirements"),
            ReportExportColumns.RequirementHeaders(),
            data.Requirements.Select(ReportExportColumns.RequirementValues));

        AppendSectionTable(body, Loc.T("Export_Section_TestCases"),
            ReportExportColumns.TestCaseHeaders(),
            data.TestCases.Select(ReportExportColumns.TestCaseValues));

        AppendSectionTable(body, Loc.T("Export_Section_Traceability"),
            ReportExportColumns.TraceabilityHeaders(),
            data.TraceabilityMatrix.Select(ReportExportColumns.TraceabilityValues));

        AppendSectionTable(body, Loc.T("Export_Section_TestCaseSteps"),
            ReportExportColumns.TestCaseStepHeaders(),
            data.TestCaseSteps.Select(ReportExportColumns.TestCaseStepValues));

        AppendHeading(body, Loc.T("Export_Section_ByCategory"), 20, true);
        AppendCategoryTable(body, data);
    }

    private static void AppendHeading(Body body, string text, int fontSizeHalfPoints, bool bold)
    {
        var run = new Run(new RunProperties(new Bold() { Val = bold }, new FontSize { Val = fontSizeHalfPoints.ToString() }), new Text(text));
        body.AppendChild(new Paragraph(run) { ParagraphProperties = new ParagraphProperties(new SpacingBetweenLines { Before = "200", After = "100" }) });
    }

    private static void AppendParagraph(Body body, string text, int fontSizeHalfPoints)
    {
        var run = new Run(new RunProperties(new FontSize { Val = fontSizeHalfPoints.ToString() }), new Text(text));
        body.AppendChild(new Paragraph(run));
    }

    private static void AppendSummaryTable(Body body, (string Label, string Value)[] rows)
    {
        var table = CreateTable();
        table.AppendChild(CreateHeaderRow(Loc.T("Export_Metric"), Loc.T("Export_Value")));
        foreach (var (label, value) in rows)
            table.AppendChild(CreateRow(label, value));
        body.AppendChild(table);
        body.AppendChild(new Paragraph());
    }

    private static void AppendSectionTable(Body body, string title, IReadOnlyList<string> headers, IEnumerable<string[]> rows)
    {
        AppendHeading(body, title, 20, true);
        var table = CreateTable();
        table.AppendChild(CreateHeaderRow(headers.ToArray()));
        foreach (var values in rows)
            table.AppendChild(CreateRow(values));
        body.AppendChild(table);
        body.AppendChild(new Paragraph());
    }

    private static void AppendCategoryTable(Body body, TraceabilityReportData data)
    {
        var table = CreateTable();
        table.AppendChild(CreateHeaderRow(
            Loc.T("Col_Category"),
            Loc.T("Export_RequirementsCount"),
            Loc.T("Export_TestCasesCount"),
            Loc.T("Export_CoveragePercent"),
            Loc.T("Export_PassRatePercent")));
        foreach (var cat in data.Categories)
            table.AppendChild(CreateRow(
                cat.Category,
                cat.RequirementCount.ToString(),
                cat.TestCaseCount.ToString(),
                $"{cat.CoveragePercent:F1}%",
                $"{cat.PassRatePercent:F1}%"));
        body.AppendChild(table);
    }

    private static Table CreateTable()
    {
        var table = new Table();
        var props = new TableProperties(
            new TableBorders(
                new TopBorder { Val = BorderValues.Single, Size = 6 },
                new BottomBorder { Val = BorderValues.Single, Size = 6 },
                new LeftBorder { Val = BorderValues.Single, Size = 6 },
                new RightBorder { Val = BorderValues.Single, Size = 6 },
                new InsideHorizontalBorder { Val = BorderValues.Single, Size = 6 },
                new InsideVerticalBorder { Val = BorderValues.Single, Size = 6 }));
        table.AppendChild(props);
        return table;
    }

    private static TableRow CreateHeaderRow(params string[] values)
    {
        var row = new TableRow();
        foreach (var value in values)
        {
            var cell = new TableCell(new Paragraph(new Run(new RunProperties(new Bold()), new Text(value))));
            cell.AppendChild(new TableCellProperties(new Shading { Fill = "D9D9D9" }));
            row.AppendChild(cell);
        }
        return row;
    }

    private static TableRow CreateRow(params string[] values)
    {
        var row = new TableRow();
        foreach (var value in values)
            row.AppendChild(new TableCell(new Paragraph(new Run(new Text(value)))));
        return row;
    }
}
