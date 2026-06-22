using System.Text;
using ClosedXML.Excel;

namespace ReqTrace.Importing;

public sealed class LlmSheetCsvPayload
{
    public required string HeaderLine { get; init; }
    public required List<string> DataLines { get; init; }
    public int SkippedRows { get; init; }
}

/// <summary>
/// Converts Excel sheet rows into compact CSV for LLM import (smaller/faster than cell-address text).
/// Skips empty rows, prunes empty columns, forward-fills hierarchy columns, and marks section rows as #SECTION lines.
/// </summary>
public static class LlmSheetCsvBuilder
{
    public static LlmSheetCsvPayload Build(
        string filePath,
        string sheetName,
        int headerRow,
        ColumnMapping? mapping,
        IReadOnlyList<string> headers)
    {
        using var workbook = OpenWorkbook(filePath);
        var sheet = workbook.Worksheet(sheetName);
        var lastCol = Math.Max(GetLastColumn(sheet, headerRow), GetMaxMappedColumn(mapping) + 1);
        var lastRow = GetLastDataRow(sheet, headerRow, lastCol);

        var sourceHeaders = headers.Count > 0
            ? headers
            : ReadHeaderRow(sheet, headerRow, lastCol);

        var columnIndexes = GetActiveColumnIndexes(sheet, headerRow, lastCol, lastRow);
        if (columnIndexes.Count == 0)
            return new LlmSheetCsvPayload { HeaderLine = string.Empty, DataLines = [] };

        var includeInferredCategory = mapping?.TitleColumn is not null && mapping.CategoryColumn is null;
        var csvHeaders = columnIndexes
            .Select(idx => GetCsvColumnName(idx, mapping, sourceHeaders))
            .ToList();
        if (includeInferredCategory)
            csvHeaders.Add("category");

        var headerLine = FormatCsvLine(csvHeaders);

        var dataLines = new List<string>();
        var skippedRows = 0;
        var hierarchyColumns = SpreadsheetForwardFill.GetHierarchyColumnIndexes(columnIndexes, mapping, sourceHeaders);
        var lastHierarchyValues = new Dictionary<int, string>();

        for (var rowNumber = headerRow + 1; rowNumber <= lastRow; rowNumber++)
        {
            var rowValues = ReadRowValues(sheet, rowNumber, lastCol);
            if (SpreadsheetForwardFill.IsBlankRawRow(rowValues))
            {
                skippedRows++;
                continue;
            }

            if (IsDecorativeBannerRow(rowValues, columnIndexes))
            {
                skippedRows++;
                continue;
            }

            var rawTitle = GetMappedValue(rowValues, mapping?.TitleColumn);

            if (mapping?.TitleColumn is not null && string.IsNullOrWhiteSpace(rawTitle))
            {
                var sectionText = GetSectionText(rowValues, columnIndexes, mapping);
                if (string.IsNullOrWhiteSpace(sectionText)
                    && SpreadsheetForwardFill.HasNewHierarchyValues(rowValues, hierarchyColumns))
                {
                    sectionText = SpreadsheetForwardFill.BuildHierarchyPath(
                        rowValues, columnIndexes, hierarchyColumns, lastHierarchyValues, onlyRawNonEmpty: true);
                }

                if (string.IsNullOrWhiteSpace(sectionText)
                    && SpreadsheetForwardFill.IsHierarchyOnlyRow(rowValues, columnIndexes, hierarchyColumns, mapping))
                {
                    SpreadsheetForwardFill.BuildEffectiveFields(
                        rowValues, columnIndexes, hierarchyColumns, lastHierarchyValues);
                    skippedRows++;
                    continue;
                }

                if (!string.IsNullOrWhiteSpace(sectionText))
                {
                    SpreadsheetForwardFill.BuildEffectiveFields(
                        rowValues, columnIndexes, hierarchyColumns, lastHierarchyValues);
                    var sectionPath = SpreadsheetForwardFill.BuildHierarchyPath(
                        rowValues, columnIndexes, hierarchyColumns, lastHierarchyValues);
                    dataLines.Add(FormatCsvLine(
                        includeInferredCategory
                            ? ["#SECTION", sectionText, sectionPath]
                            : ["#SECTION", sectionText]));
                    continue;
                }

                skippedRows++;
                continue;
            }

            if (mapping?.TitleColumn is null
                && SpreadsheetForwardFill.IsHierarchyOnlyRow(rowValues, columnIndexes, hierarchyColumns, mapping))
            {
                SpreadsheetForwardFill.BuildEffectiveFields(
                    rowValues, columnIndexes, hierarchyColumns, lastHierarchyValues);
                var sectionText = SpreadsheetForwardFill.BuildHierarchyPath(
                    rowValues, columnIndexes, hierarchyColumns, lastHierarchyValues, onlyRawNonEmpty: true);
                if (string.IsNullOrWhiteSpace(sectionText))
                    sectionText = SpreadsheetForwardFill.BuildHierarchyPath(
                        rowValues, columnIndexes, hierarchyColumns, lastHierarchyValues);

                var sectionPath = SpreadsheetForwardFill.BuildHierarchyPath(
                    rowValues, columnIndexes, hierarchyColumns, lastHierarchyValues);
                dataLines.Add(FormatCsvLine(
                    includeInferredCategory
                        ? ["#SECTION", sectionText, sectionPath]
                        : ["#SECTION", sectionText]));
                continue;
            }

            var fields = SpreadsheetForwardFill.BuildEffectiveFields(
                rowValues, columnIndexes, hierarchyColumns, lastHierarchyValues);

            ApplyGranularCategory(
                fields,
                csvHeaders,
                rowValues,
                columnIndexes,
                hierarchyColumns,
                lastHierarchyValues,
                mapping);

            if (fields.All(string.IsNullOrWhiteSpace)
                || !SpreadsheetForwardFill.HasRequirementContent(rowValues, columnIndexes, hierarchyColumns, mapping))
            {
                skippedRows++;
                continue;
            }

            dataLines.Add(FormatCsvLine(fields));
        }

        return new LlmSheetCsvPayload
        {
            HeaderLine = headerLine,
            DataLines = dataLines,
            SkippedRows = skippedRows
        };
    }

    public static string BuildPreviewSnippet(LlmSheetCsvPayload payload, int maxLines = 12)
    {
        if (string.IsNullOrWhiteSpace(payload.HeaderLine))
            return string.Empty;

        var lines = new List<string> { payload.HeaderLine };
        lines.AddRange(payload.DataLines.Take(maxLines));
        if (payload.DataLines.Count > maxLines)
            lines.Add($"... +{payload.DataLines.Count - maxLines} rows");

        return string.Join(Environment.NewLine, lines);
    }

    private static List<int> GetActiveColumnIndexes(IXLWorksheet sheet, int headerRow, int lastCol, int lastRow)
    {
        var indexes = new List<int>();
        for (var c = 1; c <= lastCol; c++)
        {
            var header = GetCellText(sheet.Cell(headerRow, c));
            var hasData = !string.IsNullOrWhiteSpace(header);
            if (!hasData)
            {
                for (var r = headerRow + 1; r <= lastRow && !hasData; r++)
                {
                    if (!string.IsNullOrWhiteSpace(GetCellText(sheet.Cell(r, c))))
                        hasData = true;
                }
            }

            if (hasData)
                indexes.Add(c - 1);
        }

        return indexes;
    }

    private static string GetCsvColumnName(int columnIndex, ColumnMapping? mapping, IReadOnlyList<string> headers)
    {
        if (mapping is not null)
        {
            var logical = GetLogicalFieldName(columnIndex, mapping);
            if (logical is not null)
                return logical;
        }

        if (columnIndex >= 0 && columnIndex < headers.Count && !string.IsNullOrWhiteSpace(headers[columnIndex]))
            return SanitizeHeader(headers[columnIndex]);

        return $"col_{columnIndex + 1}";
    }

    private static void ApplyGranularCategory(
        List<string> fields,
        IReadOnlyList<string> csvHeaders,
        IReadOnlyList<string> rowValues,
        IReadOnlyList<int> columnIndexes,
        IReadOnlySet<int> hierarchyColumns,
        IReadOnlyDictionary<int, string> lastHierarchyValues,
        ColumnMapping? mapping)
    {
        var fullCategory = RequirementCategoryComposer.ComposeFromHierarchy(
            rowValues,
            columnIndexes,
            hierarchyColumns,
            lastHierarchyValues,
            mapping?.CategoryColumn);

        if (string.IsNullOrWhiteSpace(fullCategory))
            return;

        var categoryIndex = -1;
        for (var i = 0; i < csvHeaders.Count; i++)
        {
            if (string.Equals(csvHeaders[i], "category", StringComparison.OrdinalIgnoreCase))
            {
                categoryIndex = i;
                break;
            }
        }

        if (categoryIndex >= 0)
        {
            while (fields.Count <= categoryIndex)
                fields.Add(string.Empty);

            fields[categoryIndex] = fullCategory;
            return;
        }

        if (mapping?.TitleColumn is not null)
            fields.Add(fullCategory);
    }

    private static string? GetLogicalFieldName(int columnIndex, ColumnMapping mapping)
    {
        if (mapping.CodeColumn == columnIndex) return "code";
        if (mapping.TitleColumn == columnIndex) return "title";
        if (mapping.DescriptionColumn == columnIndex) return "description";
        if (mapping.CategoryColumn == columnIndex) return "category";
        if (mapping.PriorityColumn == columnIndex) return "priority";
        if (mapping.StatusColumn == columnIndex) return "status";
        if (mapping.SourceColumn == columnIndex) return "source";
        if (mapping.ParentCodeColumn == columnIndex) return "parentCode";
        return null;
    }

    private static bool IsDecorativeBannerRow(IReadOnlyList<string> rowValues, IReadOnlyList<int> columnIndexes)
    {
        var nonEmpty = columnIndexes
            .Select(idx => GetCell(rowValues, idx))
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .ToList();

        if (nonEmpty.Count != 1)
            return false;

        var text = nonEmpty[0];
        if (text.Length < 8)
            return false;

        return text.Contains("메뉴", StringComparison.OrdinalIgnoreCase)
               || text.Contains("menu", StringComparison.OrdinalIgnoreCase)
               || text.Contains("v2", StringComparison.OrdinalIgnoreCase)
               || text.Contains("버전", StringComparison.OrdinalIgnoreCase)
               || text.Contains("version", StringComparison.OrdinalIgnoreCase);
    }

    private static string GetSectionText(
        IReadOnlyList<string> rowValues,
        IReadOnlyList<int> columnIndexes,
        ColumnMapping? mapping)
    {
        var parts = new List<string>();
        foreach (var idx in columnIndexes)
        {
            if (IsMappedColumn(idx, mapping))
                continue;

            var text = GetCell(rowValues, idx);
            if (!string.IsNullOrWhiteSpace(text))
                parts.Add(text);
        }

        return string.Join(" / ", parts).Trim();
    }

    private static bool IsMappedColumn(int columnIndex, ColumnMapping? mapping)
    {
        if (mapping is null)
            return false;

        return columnIndex == mapping.CodeColumn
               || columnIndex == mapping.TitleColumn
               || columnIndex == mapping.DescriptionColumn
               || columnIndex == mapping.CategoryColumn
               || columnIndex == mapping.PriorityColumn
               || columnIndex == mapping.StatusColumn
               || columnIndex == mapping.SourceColumn
               || columnIndex == mapping.ParentCodeColumn;
    }

    private static string SanitizeHeader(string header)
    {
        var trimmed = header.Trim();
        if (trimmed.Length == 0)
            return "col";

        var sb = new StringBuilder(trimmed.Length);
        foreach (var ch in trimmed)
            sb.Append(char.IsLetterOrDigit(ch) || ch is '_' or '-' ? ch : '_');

        return sb.ToString().Trim('_');
    }

    private static string FormatCsvLine(IReadOnlyList<string> fields) =>
        string.Join(",", fields.Select(EscapeCsv));

    private static string EscapeCsv(string value)
    {
        if (string.IsNullOrEmpty(value))
            return string.Empty;

        var normalized = value
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n');

        if (normalized.Contains('"', StringComparison.Ordinal)
            || normalized.Contains(',', StringComparison.Ordinal)
            || normalized.Contains('\n', StringComparison.Ordinal))
        {
            return "\"" + normalized.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
        }

        return normalized;
    }

    private static string GetMappedValue(IReadOnlyList<string> rowValues, int? columnIndex) =>
        columnIndex is { } idx ? GetCell(rowValues, idx) : string.Empty;

    private static string GetCell(IReadOnlyList<string> rowValues, int columnIndex)
    {
        if (columnIndex < 0 || columnIndex >= rowValues.Count)
            return string.Empty;
        return rowValues[columnIndex].Trim();
    }

    private static int GetMaxMappedColumn(ColumnMapping? mapping)
    {
        if (mapping is null)
            return 0;

        var columns = new[]
        {
            mapping.CodeColumn, mapping.TitleColumn, mapping.DescriptionColumn, mapping.CategoryColumn,
            mapping.PriorityColumn, mapping.StatusColumn, mapping.SourceColumn, mapping.ParentCodeColumn
        };

        return columns.Where(c => c.HasValue).Select(c => c!.Value).DefaultIfEmpty(0).Max();
    }

    private static IReadOnlyList<string> ReadHeaderRow(IXLWorksheet sheet, int headerRow, int lastCol)
    {
        var headers = new List<string>(lastCol);
        for (var c = 1; c <= lastCol; c++)
            headers.Add(GetCellText(sheet.Cell(headerRow, c)));
        return headers;
    }

    private static XLWorkbook OpenWorkbook(string filePath)
    {
        using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        memory.Position = 0;
        return new XLWorkbook(memory);
    }

    private static int GetLastColumn(IXLWorksheet sheet, int headerRowNumber)
    {
        var fromSheet = sheet.LastColumnUsed()?.ColumnNumber() ?? 0;
        var fromRange = sheet.RangeUsed()?.LastColumn().ColumnNumber() ?? 0;
        return Math.Max(fromSheet, fromRange);
    }

    private static int GetLastDataRow(IXLWorksheet sheet, int headerRowNumber, int lastCol)
    {
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

    private static List<string> ReadRowValues(IXLWorksheet sheet, int rowNumber, int lastCol)
    {
        var values = new List<string>(lastCol);
        for (var c = 1; c <= lastCol; c++)
            values.Add(GetCellText(sheet.Cell(rowNumber, c)));
        return values;
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
}
