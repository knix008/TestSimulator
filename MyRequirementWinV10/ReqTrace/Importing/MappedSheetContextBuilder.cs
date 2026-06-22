using System.Text;
using ReqTrace.Localization;

namespace ReqTrace.Importing;

public static class MappedSheetContextBuilder
{
    public static string BuildMappingHint(ColumnMapping mapping, IReadOnlyList<string> headers)
    {
        if (headers.Count == 0)
            return string.Empty;

        var lines = new List<string>();
        AppendMappingLine(lines, Loc.T("Import_Code"), mapping.CodeColumn, headers);
        AppendMappingLine(lines, Loc.T("Import_Title"), mapping.TitleColumn, headers);
        AppendMappingLine(lines, Loc.T("Import_Description"), mapping.DescriptionColumn, headers);
        AppendMappingLine(lines, Loc.T("Import_Category"), mapping.CategoryColumn, headers);
        AppendMappingLine(lines, Loc.T("Import_Priority"), mapping.PriorityColumn, headers);
        AppendMappingLine(lines, Loc.T("Import_Status"), mapping.StatusColumn, headers);
        AppendMappingLine(lines, Loc.T("Import_Source"), mapping.SourceColumn, headers);
        AppendMappingLine(lines, Loc.T("Import_ParentCode"), mapping.ParentCodeColumn, headers);

        if (lines.Count == 0)
            return string.Empty;

        var sb = new StringBuilder();
        sb.AppendLine(LocalizationService.IsEnglish
            ? "User column mapping (apply these field assignments):"
            : "사용자 열 매핑(아래 필드 지정을 적용하세요):");
        foreach (var line in lines)
            sb.AppendLine(line);

        return sb.ToString().TrimEnd();
    }

    public static string BuildStructuredRowsHint(
        string filePath,
        string sheetName,
        int headerRow,
        ColumnMapping mapping,
        int maxRows = 15)
    {
        if (mapping.TitleColumn is null)
            return string.Empty;

        var importResult = ExcelRequirementImporter.Import(filePath, sheetName, headerRow, mapping);
        return BuildStructuredRowsHintFromResult(importResult, maxRows);
    }

    public static string BuildStructuredRowsHintFromResult(ImportResult importResult, int maxRows = 15)
    {
        if (importResult.Requirements.Count == 0)
            return string.Empty;

        var sb = new StringBuilder();
        sb.AppendLine(LocalizationService.IsEnglish
            ? "Rows already mapped from the spreadsheet (use as baseline, normalize wording if needed):"
            : "스프레드시트에서 매핑된 행(기준 데이터, 필요 시 문구만 정리):");

        foreach (var req in importResult.Requirements.Take(maxRows))
        {
            sb.Append("- ");
            sb.Append($"code=\"{req.Code}\", title=\"{req.Title}\"");
            if (!string.IsNullOrWhiteSpace(req.Description))
                sb.Append($", description=\"{req.Description}\"");
            if (!string.IsNullOrWhiteSpace(req.Category))
                sb.Append($", category=\"{req.Category}\"");
            if (!string.IsNullOrWhiteSpace(req.Source))
                sb.Append($", source=\"{req.Source}\"");
            sb.AppendLine();
        }

        if (importResult.Requirements.Count > maxRows)
            sb.AppendLine($"... +{importResult.Requirements.Count - maxRows} more mapped rows");

        return sb.ToString().TrimEnd();
    }

    private static void AppendMappingLine(List<string> lines, string fieldLabel, int? columnIndex, IReadOnlyList<string> headers)
    {
        if (columnIndex is not { } idx || idx < 0 || idx >= headers.Count)
            return;

        var columnLetter = ColumnLetter(idx + 1);
        lines.Add($"- {fieldLabel} -> column {columnLetter} ({headers[idx]})");
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
