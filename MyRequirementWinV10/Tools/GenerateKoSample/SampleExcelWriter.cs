using ClosedXML.Excel;
using GenerateKoSample;
using ReqTrace.Models;

namespace GenerateKoSample;

internal static class SampleExcelWriter
{
    internal static void Write(string filePath, bool korean)
    {
        var rows = korean ? SampleDefinitions.Korean : SampleDefinitions.English;
        string[] headers = korean
            ? new[] { "코드", "제목", "설명", "분류", "우선순위", "상태", "출처", "상위 코드" }
            : new[] { "Code", "Title", "Description", "Category", "Priority", "Status", "Source", "Parent Code" };

        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add(korean ? "요구사항" : "Requirements");
        var sheetRow = 1;

        for (var col = 0; col < headers.Length; col++)
            sheet.Cell(sheetRow, col + 1).Value = headers[col];

        var headerRange = sheet.Range(sheetRow, 1, sheetRow, headers.Length);
        headerRange.Style.Font.Bold = true;
        headerRange.Style.Fill.BackgroundColor = XLColor.FromHtml("#E8E8E8");

        foreach (var row in rows)
        {
            sheetRow++;
            sheet.Cell(sheetRow, 1).Value = row.Code;
            sheet.Cell(sheetRow, 2).Value = row.Title;
            sheet.Cell(sheetRow, 3).Value = row.Description;
            sheet.Cell(sheetRow, 4).Value = row.Category;
            sheet.Cell(sheetRow, 5).Value = FormatPriority(row.Priority, korean);
            sheet.Cell(sheetRow, 6).Value = FormatStatus(row.Status, korean);
            sheet.Cell(sheetRow, 7).Value = row.Source;
            sheet.Cell(sheetRow, 8).Value = row.ParentCode ?? string.Empty;
        }

        sheet.Columns().AdjustToContents();
        sheet.SheetView.FreezeRows(1);
        workbook.SaveAs(filePath);
    }

    private static string FormatPriority(Priority priority, bool korean) => (priority, korean) switch
    {
        (Priority.Low, true) => "낮음",
        (Priority.Medium, true) => "보통",
        (Priority.High, true) => "높음",
        (Priority.Critical, true) => "긴급",
        (Priority.Low, false) => "low",
        (Priority.Medium, false) => "medium",
        (Priority.High, false) => "high",
        (Priority.Critical, false) => "critical",
        _ => priority.ToString(),
    };

    private static string FormatStatus(RequirementStatus status, bool korean) => (status, korean) switch
    {
        (RequirementStatus.Draft, true) => "초안",
        (RequirementStatus.Approved, true) => "승인됨",
        (RequirementStatus.InProgress, true) => "진행 중",
        (RequirementStatus.Implemented, true) => "구현됨",
        (RequirementStatus.Deprecated, true) => "폐기됨",
        (RequirementStatus.Draft, false) => "draft",
        (RequirementStatus.Approved, false) => "approved",
        (RequirementStatus.InProgress, false) => "inProgress",
        (RequirementStatus.Implemented, false) => "implemented",
        (RequirementStatus.Deprecated, false) => "deprecated",
        _ => status.ToString(),
    };
}
