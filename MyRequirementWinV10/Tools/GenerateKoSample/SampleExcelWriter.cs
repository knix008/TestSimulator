using ClosedXML.Excel;
using GenerateKoSample;
using ReqTrace.Models;

namespace GenerateKoSample;

internal static class SampleExcelWriter
{
    // Matches ReqTrace.Importing.RequirementCategoryComposer.Separator (internal to
    // the ReqTrace assembly, so not directly referenceable from this tool project).
    private const string CategorySeparator = " / ";

    // Number of "Shop / Module / Function"-style levels each sample row's Category
    // path carries (see SampleDefinitions). Matches the deepest path in the data.
    private const int HierarchyLevels = 3;

    internal static void Write(string filePath, bool korean)
    {
        var rows = korean ? SampleDefinitions.Korean : SampleDefinitions.English;
        // Deliberately avoid header text like "대분류"/"Category" for level 1: that
        // also matches ColumnMappingHeuristics' single-column "Category" synonym list,
        // which would make the importer treat this same column as both a hierarchy
        // level AND the flat mapped Category column, duplicating it in the composed
        // path. "구분N"/"GroupN" are recognized purely as hierarchy levels.
        var hierarchyHeaders = korean
            ? new[] { "구분1", "구분2", "구분3" }
            : new[] { "Group 1", "Group 2", "Group 3" };
        string[] headers = korean
            ? new[] { "코드" }.Concat(hierarchyHeaders).Concat(new[] { "제목", "설명", "우선순위", "상태", "출처", "상위 코드" }).ToArray()
            : new[] { "Code" }.Concat(hierarchyHeaders).Concat(new[] { "Title", "Description", "Priority", "Status", "Source", "Parent Code" }).ToArray();

        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add(korean ? "요구사항" : "Requirements");
        var sheetRow = 1;

        for (var col = 0; col < headers.Length; col++)
            sheet.Cell(sheetRow, col + 1).Value = headers[col];

        var headerRange = sheet.Range(sheetRow, 1, sheetRow, headers.Length);
        headerRange.Style.Font.Bold = true;
        headerRange.Style.Fill.BackgroundColor = XLColor.FromHtml("#E8E8E8");

        var previousLevels = new string[HierarchyLevels];

        foreach (var row in rows)
        {
            sheetRow++;
            var levels = SplitCategoryLevels(row.Category);

            sheet.Cell(sheetRow, 1).Value = row.Code;

            for (var level = 0; level < HierarchyLevels; level++)
            {
                // Forward-fill: only write a hierarchy cell when its value changed
                // from the previous row, mirroring the merged/blank-grouped cells a
                // real multi-level requirement spreadsheet would have. The importer's
                // SpreadsheetForwardFill carries the last seen value down through
                // blank cells, so this is the realistic shape to test against.
                var value = levels[level];
                sheet.Cell(sheetRow, 2 + level).Value = value == previousLevels[level] ? string.Empty : value;
                previousLevels[level] = value;
            }

            var col = 2 + HierarchyLevels;
            sheet.Cell(sheetRow, col++).Value = row.Title;
            sheet.Cell(sheetRow, col++).Value = row.Description;
            sheet.Cell(sheetRow, col++).Value = FormatPriority(row.Priority, korean);
            sheet.Cell(sheetRow, col++).Value = FormatStatus(row.Status, korean);
            sheet.Cell(sheetRow, col++).Value = row.Source;
            sheet.Cell(sheetRow, col).Value = row.ParentCode ?? string.Empty;
        }

        sheet.Columns().AdjustToContents();
        sheet.SheetView.FreezeRows(1);
        workbook.SaveAs(filePath);
    }

    private static string[] SplitCategoryLevels(string category)
    {
        var parts = category.Split(CategorySeparator, StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        var levels = new string[HierarchyLevels];
        for (var i = 0; i < HierarchyLevels; i++)
            levels[i] = i < parts.Length ? parts[i] : string.Empty;

        return levels;
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
