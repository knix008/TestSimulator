using ClosedXML.Excel;
using ReqTrace.Models;

namespace ReqTrace.Reporting;

public class ExcelReportExporter : IReportExporter
{
    public string DefaultFileExtension => ".xlsx";

    public void Export(TraceabilityReportData data, string outputFilePath)
    {
        using var workbook = new XLWorkbook();

        var summarySheet = workbook.Worksheets.Add("Summary");
        summarySheet.Cell(1, 1).Value = $"{data.ProjectName} — Traceability Report";
        summarySheet.Cell(1, 1).Style.Font.Bold = true;
        summarySheet.Cell(2, 1).Value = $"Generated: {data.GeneratedUtc.ToLocalTime():yyyy-MM-dd HH:mm}";

        var summaryRows = new (string Label, object Value)[]
        {
            ("Total Requirements", data.Summary.TotalRequirements),
            ("Requirements With Tests", data.Summary.RequirementsWithTests),
            ("Requirements Without Tests", data.Summary.RequirementsWithoutTests),
            ("Total Test Cases", data.Summary.TotalTestCases),
            ("Pass", data.Summary.PassCount),
            ("Fail", data.Summary.FailCount),
            ("Blocked", data.Summary.BlockedCount),
            ("Not Run", data.Summary.NotRunCount),
            ("Coverage %", Math.Round(data.Summary.CoveragePercent, 1)),
            ("Pass Rate %", Math.Round(data.Summary.PassRatePercent, 1))
        };

        var r = 4;
        foreach (var (label, value) in summaryRows)
        {
            summarySheet.Cell(r, 1).Value = label;
            summarySheet.Cell(r, 2).Value = XLCellValue.FromObject(value);
            if (label is "Pass" or "Fail" or "Blocked")
                summarySheet.Cell(r, 2).Style.Fill.BackgroundColor = label switch
                {
                    "Pass" => XLColor.LightGreen,
                    "Fail" => XLColor.LightPink,
                    _ => XLColor.LightYellow
                };
            r++;
        }
        summarySheet.Columns().AdjustToContents();

        var categorySheet = workbook.Worksheets.Add("By Category");
        categorySheet.Cell(1, 1).Value = "Category";
        categorySheet.Cell(1, 2).Value = "Requirements";
        categorySheet.Cell(1, 3).Value = "Test Cases";
        categorySheet.Cell(1, 4).Value = "Coverage %";
        categorySheet.Cell(1, 5).Value = "Pass Rate %";
        categorySheet.Range(1, 1, 1, 5).Style.Font.Bold = true;
        var cr = 2;
        foreach (var cat in data.Categories)
        {
            categorySheet.Cell(cr, 1).Value = cat.Category;
            categorySheet.Cell(cr, 2).Value = cat.RequirementCount;
            categorySheet.Cell(cr, 3).Value = cat.TestCaseCount;
            categorySheet.Cell(cr, 4).Value = Math.Round(cat.CoveragePercent, 1);
            categorySheet.Cell(cr, 5).Value = Math.Round(cat.PassRatePercent, 1);
            cr++;
        }
        categorySheet.Columns().AdjustToContents();

        var matrixSheet = workbook.Worksheets.Add("Traceability Matrix");
        string[] headers = { "Req Code", "Req Title", "Category", "Priority", "Req Status", "Test Case Code", "Test Case Title", "Latest Status", "Last Run" };
        for (var c = 0; c < headers.Length; c++)
            matrixSheet.Cell(1, c + 1).Value = headers[c];
        matrixSheet.Range(1, 1, 1, headers.Length).Style.Font.Bold = true;

        var mr = 2;
        foreach (var row in data.Rows)
        {
            matrixSheet.Cell(mr, 1).Value = row.RequirementCode;
            matrixSheet.Cell(mr, 2).Value = row.RequirementTitle;
            matrixSheet.Cell(mr, 3).Value = row.Category;
            matrixSheet.Cell(mr, 4).Value = row.Priority.ToString();
            matrixSheet.Cell(mr, 5).Value = row.RequirementStatus.ToString();
            matrixSheet.Cell(mr, 6).Value = row.TestCaseCode;
            matrixSheet.Cell(mr, 7).Value = row.TestCaseTitle;
            matrixSheet.Cell(mr, 8).Value = row.LatestRunStatus.ToString();
            matrixSheet.Cell(mr, 9).Value = row.LatestRunDate.HasValue ? row.LatestRunDate.Value.ToLocalTime().ToString("yyyy-MM-dd HH:mm") : "-";

            matrixSheet.Cell(mr, 8).Style.Fill.BackgroundColor = row.LatestRunStatus switch
            {
                TestRunStatus.Pass => XLColor.LightGreen,
                TestRunStatus.Fail => XLColor.LightPink,
                TestRunStatus.Blocked => XLColor.LightYellow,
                _ => XLColor.White
            };
            mr++;
        }

        if (mr > 2)
        {
            matrixSheet.Range(1, 1, mr - 1, headers.Length).SetAutoFilter();
            matrixSheet.SheetView.FreezeRows(1);
        }
        matrixSheet.Columns().AdjustToContents();

        workbook.SaveAs(outputFilePath);
    }
}
