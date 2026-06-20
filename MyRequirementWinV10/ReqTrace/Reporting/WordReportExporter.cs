using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using ReqTrace.Models;

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

        AppendHeading(body, $"{data.ProjectName} — Traceability Report", 28, true);
        AppendParagraph(body, $"Generated: {data.GeneratedUtc.ToLocalTime():yyyy-MM-dd HH:mm}", 9);

        AppendHeading(body, "Summary", 20, true);
        var s = data.Summary;
        AppendSummaryTable(body, new (string, string)[]
        {
            ("Total Requirements", s.TotalRequirements.ToString()),
            ("Requirements With Tests", s.RequirementsWithTests.ToString()),
            ("Requirements Without Tests", s.RequirementsWithoutTests.ToString()),
            ("Total Test Cases", s.TotalTestCases.ToString()),
            ("Pass", s.PassCount.ToString()),
            ("Fail", s.FailCount.ToString()),
            ("Blocked", s.BlockedCount.ToString()),
            ("Not Run", s.NotRunCount.ToString()),
            ("Coverage", $"{s.CoveragePercent:F1}%"),
            ("Pass Rate", $"{s.PassRatePercent:F1}%")
        });

        AppendHeading(body, "Traceability Matrix", 20, true);
        AppendMatrixTable(body, data);

        AppendHeading(body, "Coverage by Category", 20, true);
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
        table.AppendChild(CreateHeaderRow("Metric", "Value"));
        foreach (var (label, value) in rows)
            table.AppendChild(CreateRow(label, value));
        body.AppendChild(table);
        body.AppendChild(new Paragraph());
    }

    private static void AppendMatrixTable(Body body, TraceabilityReportData data)
    {
        var table = CreateTable();
        table.AppendChild(CreateHeaderRow("Req Code", "Req Title", "Category", "Test Case", "Status", "Last Run"));
        foreach (var row in data.Rows)
        {
            var testCaseText = string.IsNullOrEmpty(row.TestCaseCode) ? "(no test case)" : $"{row.TestCaseCode} - {row.TestCaseTitle}";
            var lastRun = row.LatestRunDate.HasValue ? row.LatestRunDate.Value.ToLocalTime().ToString("yyyy-MM-dd HH:mm") : "-";
            table.AppendChild(CreateRow(row.RequirementCode, row.RequirementTitle, row.Category, testCaseText, row.LatestRunStatus.ToString(), lastRun));
        }
        body.AppendChild(table);
        body.AppendChild(new Paragraph());
    }

    private static void AppendCategoryTable(Body body, TraceabilityReportData data)
    {
        var table = CreateTable();
        table.AppendChild(CreateHeaderRow("Category", "Requirements", "Test Cases", "Coverage", "Pass Rate"));
        foreach (var cat in data.Categories)
            table.AppendChild(CreateRow(cat.Category, cat.RequirementCount.ToString(), cat.TestCaseCount.ToString(),
                $"{cat.CoveragePercent:F1}%", $"{cat.PassRatePercent:F1}%"));
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
