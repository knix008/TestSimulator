using ClosedXML.Excel;
using System.Text;

namespace ReqTrace.Importing;

public static class ExcelSheetTextExtractor
{
    private const int MaxColumns = 26;

    public sealed class SheetText
    {
        public required string Preamble { get; init; }
        public required List<string> Rows { get; init; }
        public string FullText => Preamble + Environment.NewLine + string.Join(Environment.NewLine, Rows);
    }

    public static SheetText Extract(string filePath, string sheetName)
    {
        using var workbook = OpenWorkbook(filePath);
        var sheet = workbook.Worksheet(sheetName);
        var lastCol = Math.Min(GetLastColumn(sheet), MaxColumns);
        var lastRow = GetLastDataRow(sheet, lastCol);
        var rows = new List<string>();

        for (var r = 1; r <= lastRow; r++)
        {
            var rowText = FormatRow(sheet, r, lastCol);
            if (!string.IsNullOrWhiteSpace(rowText))
                rows.Add(rowText);
        }

        var preamble = BuildPreamble(sheet, lastCol, lastRow, rows);
        return new SheetText { Preamble = preamble, Rows = rows };
    }

    public static string BuildPreview(string filePath, string sheetName, int maxChars = 4000)
    {
        var sheetText = Extract(filePath, sheetName);
        if (sheetText.FullText.Length <= maxChars)
            return sheetText.FullText;

        return sheetText.FullText[..maxChars] + Environment.NewLine + "...";
    }

    private static string BuildPreamble(IXLWorksheet sheet, int lastCol, int lastRow, List<string> rows)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"Sheet: {sheet.Name}");
        sb.AppendLine($"Grid: rows 1-{lastRow}, columns A-{ColumnLetter(lastCol)}");

        if (rows.Count > 0)
        {
            var headerGuess = FormatRow(sheet, 1, lastCol);
            if (!string.IsNullOrWhiteSpace(headerGuess))
                sb.AppendLine($"Row 1 (possible header): {headerGuess}");
        }

        sb.AppendLine("Cell format: R{row}: A{row}=\"value\" | B{row}=\"value\" ...");
        sb.AppendLine("Merged cells show the value once at the top-left cell.");
        return sb.ToString().TrimEnd();
    }

    private static string FormatRow(IXLWorksheet sheet, int rowNumber, int lastCol)
    {
        var parts = new List<string>();
        var hasData = false;

        for (var c = 1; c <= lastCol; c++)
        {
            var text = GetCellText(sheet.Cell(rowNumber, c));
            if (!string.IsNullOrWhiteSpace(text))
                hasData = true;

            parts.Add($"{ColumnLetter(c)}{rowNumber}=\"{EscapeCell(text)}\"");
        }

        return hasData ? $"R{rowNumber}: {string.Join(" | ", parts)}" : string.Empty;
    }

    private static string EscapeCell(string text) =>
        text.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\"", "\\\"", StringComparison.Ordinal)
            .Replace("\r\n", "\\n", StringComparison.Ordinal)
            .Replace("\r", "\\n", StringComparison.Ordinal)
            .Replace("\n", "\\n", StringComparison.Ordinal);

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

    private static XLWorkbook OpenWorkbook(string filePath)
    {
        using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        memory.Position = 0;
        return new XLWorkbook(memory);
    }

    private static int GetLastColumn(IXLWorksheet sheet)
    {
        var fromSheet = sheet.LastColumnUsed()?.ColumnNumber() ?? 0;
        var fromRange = sheet.RangeUsed()?.LastColumn().ColumnNumber() ?? 0;
        return Math.Max(fromSheet, fromRange);
    }

    private static int GetLastDataRow(IXLWorksheet sheet, int lastCol)
    {
        if (lastCol <= 0)
            return 1;

        var baseline = Math.Max(
            sheet.LastRowUsed()?.RowNumber() ?? 1,
            sheet.RangeUsed()?.LastRow().RowNumber() ?? 1);

        var lastDataRow = 1;
        var emptyStreak = 0;
        const int maxEmptyStreak = 25;
        var scanEnd = Math.Max(baseline + 5000, 1);

        for (var r = 1; r <= scanEnd; r++)
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
