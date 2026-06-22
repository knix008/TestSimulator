using System.Text;
using ClosedXML.Excel;

namespace ReqTrace.Importing;

public static class MappedSheetTextExtractor
{
    public static List<string> BuildLabeledRows(
        string filePath,
        string sheetName,
        int headerRow,
        ColumnMapping mapping,
        IReadOnlyList<string> headers)
    {
        using var workbook = OpenWorkbook(filePath);
        var sheet = workbook.Worksheet(sheetName);
        var lastCol = Math.Max(GetLastColumn(sheet, headerRow), GetMaxMappedColumn(mapping) + 1);
        var lastRow = GetLastDataRow(sheet, headerRow, lastCol);
        var rows = new List<string>();
        string? activeCategory = null;

        for (var rowNumber = headerRow + 1; rowNumber <= lastRow; rowNumber++)
        {
            var rowValues = ReadRowValues(sheet, rowNumber, lastCol);
            if (rowValues.All(string.IsNullOrWhiteSpace))
                continue;

            var title = GetCell(rowValues, mapping.TitleColumn);
            var category = GetCell(rowValues, mapping.CategoryColumn);
            if (!string.IsNullOrWhiteSpace(category))
                activeCategory = category;

            if (string.IsNullOrWhiteSpace(title))
            {
                var sectionText = FormatUnmappedCells(sheet, rowNumber, lastCol, rowValues, mapping);
                if (!string.IsNullOrWhiteSpace(sectionText))
                    rows.Add(FormatSectionRow(rowNumber, sectionText, activeCategory));
                continue;
            }

            rows.Add(FormatDataRow(rowNumber, rowValues, mapping, headers, activeCategory));
        }

        return rows;
    }

    private static string FormatDataRow(
        int rowNumber,
        IReadOnlyList<string> rowValues,
        ColumnMapping mapping,
        IReadOnlyList<string> headers,
        string? activeCategory)
    {
        var parts = new List<string>();
        AppendField(parts, "code", mapping.CodeColumn, rowValues, headers);
        AppendField(parts, "title", mapping.TitleColumn, rowValues, headers);
        AppendField(parts, "description", mapping.DescriptionColumn, rowValues, headers);
        AppendField(parts, "category", mapping.CategoryColumn, rowValues, headers, activeCategory);
        AppendField(parts, "priority", mapping.PriorityColumn, rowValues, headers);
        AppendField(parts, "status", mapping.StatusColumn, rowValues, headers);
        AppendField(parts, "source", mapping.SourceColumn, rowValues, headers);
        AppendField(parts, "parentCode", mapping.ParentCodeColumn, rowValues, headers);

        var extras = FormatUnmappedCells(rowNumber, rowValues, mapping, headers);
        if (!string.IsNullOrWhiteSpace(extras))
            parts.Add($"extra=\"{Escape(extras)}\"");

        return $"[Row {rowNumber}] {string.Join(" | ", parts)}";
    }

    private static string FormatSectionRow(int rowNumber, string sectionText, string? activeCategory)
    {
        var categoryHint = string.IsNullOrWhiteSpace(activeCategory)
            ? string.Empty
            : $" | inferredCategory=\"{Escape(activeCategory)}\"";
        return $"[Section row {rowNumber}] text=\"{Escape(sectionText)}\"{categoryHint}";
    }

    private static string FormatUnmappedCells(
        IXLWorksheet sheet,
        int rowNumber,
        int lastCol,
        IReadOnlyList<string> rowValues,
        ColumnMapping mapping)
    {
        var mappedColumns = GetMappedColumns(mapping);
        var parts = new List<string>();

        for (var c = 1; c <= lastCol; c++)
        {
            if (mappedColumns.Contains(c - 1))
                continue;

            var text = GetCellText(sheet.Cell(rowNumber, c));
            if (string.IsNullOrWhiteSpace(text))
                continue;

            parts.Add($"{ColumnLetter(c)}=\"{Escape(text)}\"");
        }

        return string.Join(" ", parts);
    }

    private static string FormatUnmappedCells(
        int rowNumber,
        IReadOnlyList<string> rowValues,
        ColumnMapping mapping,
        IReadOnlyList<string> headers)
    {
        var mappedColumns = GetMappedColumns(mapping);
        var parts = new List<string>();

        for (var i = 0; i < rowValues.Count; i++)
        {
            if (mappedColumns.Contains(i))
                continue;

            var text = rowValues[i];
            if (string.IsNullOrWhiteSpace(text))
                continue;

            var header = i < headers.Count ? headers[i] : ColumnLetter(i + 1);
            parts.Add($"{header}=\"{Escape(text)}\"");
        }

        return string.Join(" ", parts);
    }

    private static void AppendField(
        List<string> parts,
        string fieldName,
        int? columnIndex,
        IReadOnlyList<string> rowValues,
        IReadOnlyList<string> headers,
        string? fallback = null)
    {
        var value = GetCell(rowValues, columnIndex);
        if (string.IsNullOrWhiteSpace(value))
            value = fallback ?? string.Empty;

        if (string.IsNullOrWhiteSpace(value))
            return;

        var label = columnIndex is { } idx && idx >= 0 && idx < headers.Count
            ? headers[idx]
            : fieldName;
        parts.Add($"{fieldName}=\"{Escape(value)}\" ({label})");
    }

    private static HashSet<int> GetMappedColumns(ColumnMapping mapping)
    {
        var columns = new HashSet<int>();
        foreach (var column in new[]
        {
            mapping.CodeColumn, mapping.TitleColumn, mapping.DescriptionColumn, mapping.CategoryColumn,
            mapping.PriorityColumn, mapping.StatusColumn, mapping.SourceColumn, mapping.ParentCodeColumn
        })
        {
            if (column is { } idx && idx >= 0)
                columns.Add(idx);
        }

        return columns;
    }

    private static string GetCell(IReadOnlyList<string> rowValues, int? columnIndex)
    {
        if (columnIndex is not { } idx || idx < 0 || idx >= rowValues.Count)
            return string.Empty;

        return rowValues[idx].Trim();
    }

    private static string Escape(string text) =>
        text.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\"", "\\\"", StringComparison.Ordinal)
            .Replace("\r\n", "\\n", StringComparison.Ordinal)
            .Replace("\r", "\\n", StringComparison.Ordinal)
            .Replace("\n", "\\n", StringComparison.Ordinal);

    private static int GetMaxMappedColumn(ColumnMapping mapping)
    {
        var columns = new[]
        {
            mapping.CodeColumn, mapping.TitleColumn, mapping.DescriptionColumn, mapping.CategoryColumn,
            mapping.PriorityColumn, mapping.StatusColumn, mapping.SourceColumn, mapping.ParentCodeColumn
        };

        return columns.Where(c => c.HasValue).Select(c => c!.Value).DefaultIfEmpty(0).Max();
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

    private static string ColumnLetter(int columnNumber)
    {
        var dividend = columnNumber;
        var columnName = string.Empty;
        while (dividend > 0)
        {
            var modulo = (dividend - 1) % 26;
            columnName = Convert.ToChar('A' + modulo) + columnName;
            dividend = (dividend - modulo) / 26;
        }

        return columnName;
    }
}
