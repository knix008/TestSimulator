using ClosedXML.Excel;
using ReqTrace.Models;

namespace ReqTrace.Importing;

public static class ExcelRequirementImporter
{
    /// <summary>
    /// Opens the workbook for shared reading so the import still works while the file is
    /// open (read-only) in Excel elsewhere. If another process holds an exclusive lock,
    /// this still throws — callers should catch IOException and show a friendly message.
    /// </summary>
    private static XLWorkbook OpenWorkbook(string filePath)
    {
        using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        memory.Position = 0;
        return new XLWorkbook(memory);
    }

    public static IReadOnlyList<string> GetSheetNames(string filePath)
    {
        using var workbook = OpenWorkbook(filePath);
        return workbook.Worksheets.Select(w => w.Name).ToList();
    }

    public static IReadOnlyList<string> ReadHeaderRow(string filePath, string sheetName, int headerRowNumber)
    {
        using var workbook = OpenWorkbook(filePath);
        var sheet = workbook.Worksheet(sheetName);
        return ReadHeaderRow(sheet, headerRowNumber);
    }

    public static List<List<string>> ReadPreviewRows(string filePath, string sheetName, int headerRowNumber, int maxRows)
    {
        using var workbook = OpenWorkbook(filePath);
        var sheet = workbook.Worksheet(sheetName);
        var lastCol = GetLastColumn(sheet, headerRowNumber);
        var lastRow = GetLastDataRow(sheet, headerRowNumber, lastCol);
        var result = new List<List<string>>();

        for (var r = headerRowNumber + 1; r <= Math.Min(lastRow, headerRowNumber + maxRows); r++)
        {
            var rowValues = new List<string>();
            for (var c = 1; c <= lastCol; c++)
                rowValues.Add(GetCellText(sheet.Cell(r, c)));
            result.Add(rowValues);
        }

        return result;
    }

    public static ImportResult Import(
        string filePath,
        string sheetName,
        int headerRowNumber,
        ColumnMapping mapping,
        IProgress<int>? progress = null,
        IEnumerable<string>? reservedCodes = null,
        IEnumerable<string>? reservedTestCaseCodes = null)
    {
        var result = new ImportResult();
        using var workbook = OpenWorkbook(filePath);
        var sheet = workbook.Worksheet(sheetName);
        var lastCol = Math.Max(GetLastColumn(sheet, headerRowNumber), GetMaxMappedColumn(mapping) + 1);
        var lastRow = GetLastDataRow(sheet, headerRowNumber, lastCol);
        var totalRows = Math.Max(1, lastRow - headerRowNumber);

        var codeToParentCode = new Dictionary<Requirement, string>();
        var (usedCodes, sequence) = RequirementCodeAllocator.CreateState(reservedCodes);
        var (testCaseUsedCodes, testCaseNextSequence) = TestCaseCodeAllocator.CreateState(reservedTestCaseCodes);
        var headers = ReadHeaderRow(sheet, headerRowNumber);
        var allColumnIndexes = Enumerable.Range(0, lastCol).ToList();
        var hierarchyColumns = SpreadsheetForwardFill.GetHierarchyColumnIndexes(allColumnIndexes, mapping, headers);
        var lastHierarchyValues = new Dictionary<int, string>();

        progress?.Report(0);

        for (var r = headerRowNumber + 1; r <= lastRow; r++)
        {
            progress?.Report((int)(100.0 * (r - headerRowNumber) / totalRows));

            var rowValues = ReadRowValues(sheet, r, lastCol);

            if (SpreadsheetForwardFill.IsBlankRawRow(rowValues))
                continue;

            SpreadsheetForwardFill.UpdateHierarchyState(rowValues, hierarchyColumns, lastHierarchyValues);

            if (!SpreadsheetForwardFill.HasRequirementContent(rowValues, allColumnIndexes, hierarchyColumns, mapping))
            {
                if (SpreadsheetForwardFill.IsHierarchyOnlyRow(rowValues, allColumnIndexes, hierarchyColumns, mapping))
                    result.RowsSkipped++;

                continue;
            }

            var title = GetValue(rowValues, mapping.TitleColumn);
            if (string.IsNullOrWhiteSpace(title))
                title = GetValue(rowValues, mapping.DescriptionColumn);

            if (string.IsNullOrWhiteSpace(title))
            {
                if (SpreadsheetForwardFill.IsHierarchyOnlyRow(rowValues, allColumnIndexes, hierarchyColumns, mapping))
                {
                    result.RowsSkipped++;
                    continue;
                }

                result.Warnings.Add($"Row {r}: skipped — missing Title.");
                result.RowsSkipped++;
                continue;
            }

            result.RowsProcessed++;

            var code = GetValue(rowValues, mapping.CodeColumn);
            if (string.IsNullOrWhiteSpace(code))
            {
                if (mapping.GenerateCodeIfMissing)
                    code = RequirementCodeAllocator.AllocateNext(usedCodes, ref sequence);
                else
                {
                    result.Warnings.Add($"Row {r}: skipped — missing Code.");
                    result.RowsSkipped++;
                    continue;
                }
            }
            else if (!RequirementCodeAllocator.TryRegisterCode(code, usedCodes, ref sequence, out code))
            {
                if (mapping.GenerateCodeIfMissing)
                {
                    var originalCode = code;
                    code = RequirementCodeAllocator.AllocateNext(usedCodes, ref sequence);
                    result.Warnings.Add($"Row {r}: code '{originalCode}' duplicated — reassigned to '{code}'.");
                }
                else
                {
                    result.Warnings.Add($"Row {r}: skipped — duplicate code '{code}'.");
                    result.RowsSkipped++;
                    continue;
                }
            }

            var requirement = new Requirement
            {
                Code = code.Trim(),
                Title = title.Trim(),
                Description = GetValue(rowValues, mapping.DescriptionColumn),
                Category = RequirementCategoryComposer.ComposeFromHierarchy(
                    rowValues,
                    allColumnIndexes,
                    hierarchyColumns,
                    lastHierarchyValues,
                    mapping.CategoryColumn),
                Source = string.IsNullOrWhiteSpace(GetValue(rowValues, mapping.SourceColumn))
                    ? Path.GetFileName(filePath)
                    : GetValue(rowValues, mapping.SourceColumn)
            };

            requirement.Priority = ParsePriorityOrDefault(GetValue(rowValues, mapping.PriorityColumn), Priority.Medium, r, result.Warnings);
            requirement.Status = ParseStatusOrDefault(GetValue(rowValues, mapping.StatusColumn), RequirementStatus.Draft, r, result.Warnings);

            var parentCode = SpreadsheetForwardFill.GetEffectiveValue(
                rowValues, mapping.ParentCodeColumn, hierarchyColumns, lastHierarchyValues);
            if (!string.IsNullOrWhiteSpace(parentCode))
                codeToParentCode[requirement] = parentCode.Trim();

            if (mapping.GenerateTestCases)
            {
                var generated = TestCaseGenerator.Generate(requirement, testCaseUsedCodes, ref testCaseNextSequence);
                foreach (var tc in generated)
                    tc.RequirementId = requirement.Id;
                requirement.TestCases.AddRange(generated);
            }

            result.Requirements.Add(requirement);
        }

        var requirementsByCode = result.Requirements.ToDictionary(r => r.Code, StringComparer.OrdinalIgnoreCase);
        foreach (var (requirement, parentCode) in codeToParentCode)
        {
            if (requirementsByCode.TryGetValue(parentCode, out var parent))
                requirement.ParentId = parent.Id;
            else
                result.Warnings.Add($"Requirement '{requirement.Code}': parent code '{parentCode}' not found among imported rows.");
        }

        progress?.Report(100);
        return result;
    }

    private static IReadOnlyList<string> ReadHeaderRow(IXLWorksheet sheet, int headerRowNumber)
    {
        var row = sheet.Row(headerRowNumber);
        var lastCol = GetLastColumn(sheet, headerRowNumber);
        var headers = new List<string>();
        for (var c = 1; c <= lastCol; c++)
            headers.Add(GetCellText(row.Cell(c)));
        return headers;
    }

    private static int GetLastColumn(IXLWorksheet sheet, int headerRowNumber)
    {
        var fromSheet = sheet.LastColumnUsed()?.ColumnNumber() ?? 0;
        var fromHeader = sheet.Row(headerRowNumber).LastCellUsed()?.Address.ColumnNumber ?? 0;
        var fromRange = sheet.RangeUsed()?.LastColumn().ColumnNumber() ?? 0;
        return Math.Max(fromSheet, Math.Max(fromHeader, fromRange));
    }

    private static int GetMaxMappedColumn(ColumnMapping mapping)
    {
        var columns = new[]
        {
            mapping.CodeColumn,
            mapping.TitleColumn,
            mapping.DescriptionColumn,
            mapping.CategoryColumn,
            mapping.PriorityColumn,
            mapping.StatusColumn,
            mapping.SourceColumn,
            mapping.ParentCodeColumn
        };

        return columns.Where(c => c.HasValue).Select(c => c!.Value).DefaultIfEmpty(0).Max();
    }

    private static int GetLastDataRow(IXLWorksheet sheet, int headerRowNumber, int lastCol)
    {
        if (lastCol <= 0)
            return headerRowNumber;

        var baseline = Math.Max(
            sheet.LastRowUsed()?.RowNumber() ?? headerRowNumber,
            sheet.RangeUsed()?.LastRow().RowNumber() ?? headerRowNumber);

        var lastDataRow = headerRowNumber;
        var emptyStreak = 0;
        const int maxEmptyStreak = 25;
        var scanEnd = Math.Max(baseline + 5000, headerRowNumber + 1);

        for (var r = headerRowNumber + 1; r <= scanEnd; r++)
        {
            if (RowHasData(sheet, r, lastCol))
            {
                lastDataRow = r;
                emptyStreak = 0;
                continue;
            }

            if (r > baseline)
            {
                emptyStreak++;
                if (emptyStreak >= maxEmptyStreak)
                    break;
            }
        }

        return lastDataRow;
    }

    private static bool RowHasData(IXLWorksheet sheet, int rowNumber, int lastCol)
    {
        for (var c = 1; c <= lastCol; c++)
        {
            if (!string.IsNullOrWhiteSpace(GetCellText(sheet.Cell(rowNumber, c))))
                return true;
        }

        return false;
    }

    private static string[] ReadRowValues(IXLWorksheet sheet, int rowNumber, int lastCol)
    {
        var rowValues = new string[lastCol];
        for (var c = 1; c <= lastCol; c++)
            rowValues[c - 1] = GetCellText(sheet.Cell(rowNumber, c));
        return rowValues;
    }

    private static string GetCellText(IXLCell cell)
    {
        if (cell.IsMerged())
            cell = cell.MergedRange().FirstCell();

        if (cell.IsEmpty())
            return string.Empty;

        var formatted = cell.GetFormattedString().Trim();
        if (!string.IsNullOrEmpty(formatted))
            return formatted;

        return cell.Value.ToString()?.Trim() ?? string.Empty;
    }

    private static string GetValue(string[] row, int? column) =>
        column is { } c && c >= 0 && c < row.Length ? row[c] : string.Empty;

    private static Priority ParsePriorityOrDefault(string value, Priority defaultValue, int rowNumber, List<string> warnings)
    {
        if (string.IsNullOrWhiteSpace(value))
            return defaultValue;

        if (EnumImportParser.TryParsePriority(value, out var parsed))
            return parsed;

        warnings.Add($"Row {rowNumber}: unrecognized Priority value '{value}', defaulted to {defaultValue}.");
        return defaultValue;
    }

    private static RequirementStatus ParseStatusOrDefault(string value, RequirementStatus defaultValue, int rowNumber, List<string> warnings)
    {
        if (string.IsNullOrWhiteSpace(value))
            return defaultValue;

        if (EnumImportParser.TryParseStatus(value, out var parsed))
            return parsed;

        warnings.Add($"Row {rowNumber}: unrecognized Status value '{value}', defaulted to {defaultValue}.");
        return defaultValue;
    }
}

