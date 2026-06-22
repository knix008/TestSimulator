using ClosedXML.Excel;
using ReqTrace.Localization;
using ReqTrace.Models;

namespace ReqTrace.Reporting;

public class ExcelReportExporter : IReportExporter
{
    public string DefaultFileExtension => ".xlsx";

    public void Export(TraceabilityReportData data, string outputFilePath)
    {
        using var workbook = new XLWorkbook();

        WriteSummarySheet(workbook, data);
        WriteRequirementsSheet(workbook, data);
        WriteTestCasesSheet(workbook, data);
        WriteTraceabilitySheet(workbook, data);
        WriteTestCaseStepsSheet(workbook, data);
        WriteCategorySheet(workbook, data);

        workbook.SaveAs(outputFilePath);
    }

    private static void WriteSummarySheet(XLWorkbook workbook, TraceabilityReportData data)
    {
        var sheet = workbook.Worksheets.Add(Loc.T("Export_Sheet_Summary"));
        sheet.Cell(1, 1).Value = $"{data.ProjectName} — {Loc.T("Dlg_ExportReport")}";
        sheet.Cell(1, 1).Style.Font.Bold = true;
        sheet.Cell(2, 1).Value = Loc.T("Export_GeneratedAt", data.GeneratedUtc.ToLocalTime().ToString("yyyy-MM-dd HH:mm"));

        var summaryRows = new (string Label, object Value)[]
        {
            (Loc.T("Export_TotalRequirements"), data.Summary.TotalRequirements),
            (Loc.T("Export_RequirementsWithTests"), data.Summary.RequirementsWithTests),
            (Loc.T("Export_RequirementsWithoutTests"), data.Summary.RequirementsWithoutTests),
            (Loc.T("Export_TotalTestCases"), data.Summary.TotalTestCases),
            (Loc.Enum(TestRunStatus.Pass), data.Summary.PassCount),
            (Loc.Enum(TestRunStatus.Fail), data.Summary.FailCount),
            (Loc.Enum(TestRunStatus.Blocked), data.Summary.BlockedCount),
            (Loc.Enum(TestRunStatus.NotRun), data.Summary.NotRunCount),
            (Loc.T("Export_CoveragePercent"), Math.Round(data.Summary.CoveragePercent, 1)),
            (Loc.T("Export_PassRatePercent"), Math.Round(data.Summary.PassRatePercent, 1))
        };

        var row = 4;
        foreach (var (label, value) in summaryRows)
        {
            sheet.Cell(row, 1).Value = label;
            sheet.Cell(row, 2).Value = XLCellValue.FromObject(value);
            row++;
        }

        sheet.Columns().AdjustToContents();
    }

    private static void WriteRequirementsSheet(XLWorkbook workbook, TraceabilityReportData data)
    {
        var sheet = workbook.Worksheets.Add(Loc.T("Export_Sheet_Requirements"));
        var headers = ReportExportColumns.RequirementHeaders();
        WriteHeaderRow(sheet, headers);

        var testStatusColumn = Array.IndexOf(ReportExportColumns.RequirementHeaderKeys, "Col_TestStatus") + 1;
        var row = 2;
        foreach (var requirement in data.Requirements)
        {
            WriteRow(sheet, row, ReportExportColumns.RequirementValues(requirement));
            sheet.Cell(row, testStatusColumn).Style.Fill.BackgroundColor =
                ReportExportStyling.ToExcelColor(requirement.AggregateTestStatus);
            row++;
        }

        FinalizeTable(sheet, headers.Length, row);
    }

    private static void WriteTestCasesSheet(XLWorkbook workbook, TraceabilityReportData data)
    {
        var sheet = workbook.Worksheets.Add(Loc.T("Export_Sheet_TestCases"));
        var headers = ReportExportColumns.TestCaseHeaders();
        WriteHeaderRow(sheet, headers);

        var statusColumn = Array.IndexOf(ReportExportColumns.TestCaseHeaderKeys, "Col_LatestStatus") + 1;
        var row = 2;
        foreach (var testCase in data.TestCases)
        {
            WriteRow(sheet, row, ReportExportColumns.TestCaseValues(testCase));
            sheet.Cell(row, statusColumn).Style.Fill.BackgroundColor =
                ReportExportStyling.ToExcelColor(testCase.LatestStatusValue);
            row++;
        }

        FinalizeTable(sheet, headers.Length, row);
    }

    private static void WriteTraceabilitySheet(XLWorkbook workbook, TraceabilityReportData data)
    {
        var sheet = workbook.Worksheets.Add(Loc.T("Export_Sheet_Traceability"));
        var headers = ReportExportColumns.TraceabilityHeaders();
        WriteHeaderRow(sheet, headers);

        var reqTestStatusColumn = Array.IndexOf(ReportExportColumns.TraceabilityHeaderKeys, "Col_TestStatus") + 1;
        var tcStatusColumn = Array.IndexOf(ReportExportColumns.TraceabilityHeaderKeys, "Col_LatestStatus") + 1;
        var row = 2;
        foreach (var matrixRow in data.TraceabilityMatrix)
        {
            WriteRow(sheet, row, ReportExportColumns.TraceabilityValues(matrixRow));
            sheet.Cell(row, reqTestStatusColumn).Style.Fill.BackgroundColor =
                ReportExportStyling.ToExcelColor(matrixRow.RequirementAggregateStatus);

            if (!string.IsNullOrWhiteSpace(matrixRow.TestCaseCode)
                && matrixRow.TestCaseCode != Loc.T("Export_NoTestCase"))
            {
                sheet.Cell(row, tcStatusColumn).Style.Fill.BackgroundColor =
                    ReportExportStyling.ToExcelColor(matrixRow.LatestStatusValue);
            }

            row++;
        }

        FinalizeTable(sheet, headers.Length, row);
    }

    private static void WriteTestCaseStepsSheet(XLWorkbook workbook, TraceabilityReportData data)
    {
        var sheet = workbook.Worksheets.Add(Loc.T("Export_Sheet_TestCaseSteps"));
        var headers = ReportExportColumns.TestCaseStepHeaders();
        WriteHeaderRow(sheet, headers);

        var row = 2;
        foreach (var step in data.TestCaseSteps)
            WriteRow(sheet, row++, ReportExportColumns.TestCaseStepValues(step));

        FinalizeTable(sheet, headers.Length, row);
    }

    private static void WriteCategorySheet(XLWorkbook workbook, TraceabilityReportData data)
    {
        var sheet = workbook.Worksheets.Add(Loc.T("Export_Sheet_ByCategory"));
        var headers = new[]
        {
            Loc.T("Col_Category"),
            Loc.T("Export_RequirementsCount"),
            Loc.T("Export_TestCasesCount"),
            Loc.T("Export_CoveragePercent"),
            Loc.T("Export_PassRatePercent")
        };
        WriteHeaderRow(sheet, headers);

        var row = 2;
        foreach (var cat in data.Categories)
        {
            sheet.Cell(row, 1).Value = cat.Category;
            sheet.Cell(row, 2).Value = cat.RequirementCount;
            sheet.Cell(row, 3).Value = cat.TestCaseCount;
            sheet.Cell(row, 4).Value = Math.Round(cat.CoveragePercent, 1);
            sheet.Cell(row, 5).Value = Math.Round(cat.PassRatePercent, 1);
            row++;
        }

        FinalizeTable(sheet, headers.Length, row);
    }

    private static void WriteHeaderRow(IXLWorksheet sheet, IReadOnlyList<string> headers)
    {
        for (var c = 0; c < headers.Count; c++)
            sheet.Cell(1, c + 1).Value = headers[c];

        sheet.Range(1, 1, 1, headers.Count).Style.Font.Bold = true;
    }

    private static void WriteRow(IXLWorksheet sheet, int row, IReadOnlyList<string> values)
    {
        for (var c = 0; c < values.Count; c++)
            sheet.Cell(row, c + 1).Value = values[c];
    }

    private static void FinalizeTable(IXLWorksheet sheet, int columnCount, int nextRow)
    {
        if (nextRow <= 2)
        {
            sheet.Columns().AdjustToContents();
            return;
        }

        sheet.Range(1, 1, nextRow - 1, columnCount).SetAutoFilter();
        sheet.SheetView.FreezeRows(1);
        sheet.Columns().AdjustToContents();
    }
}
