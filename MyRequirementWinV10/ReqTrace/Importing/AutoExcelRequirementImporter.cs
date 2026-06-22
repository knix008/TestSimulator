namespace ReqTrace.Importing;

public sealed class AutoExcelImportPlan
{
    public required string FilePath { get; init; }
    public required string SheetName { get; init; }
    public int HeaderRow { get; init; } = 1;
    public required ColumnMapping Mapping { get; init; }
}

public static class AutoExcelRequirementImporter
{
    public static AutoExcelImportPlan? TryCreatePlan(string filePath, int headerRow = 1)
    {
        IReadOnlyList<string> sheets;
        try
        {
            sheets = ExcelRequirementImporter.GetSheetNames(filePath);
        }
        catch
        {
            return null;
        }

        if (sheets.Count == 0)
            return null;

        var sheetName = sheets[0];
        IReadOnlyList<string> headers;
        try
        {
            headers = ExcelRequirementImporter.ReadHeaderRow(filePath, sheetName, headerRow);
        }
        catch
        {
            return null;
        }

        var mapping = ColumnMappingHeuristics.Infer(headers);
        if (mapping.TitleColumn is null)
            return null;

        mapping.GenerateCodeIfMissing = true;
        mapping.GenerateTestCases = true;

        return new AutoExcelImportPlan
        {
            FilePath = filePath,
            SheetName = sheetName,
            HeaderRow = headerRow,
            Mapping = mapping
        };
    }

    public static ImportResult Import(
        AutoExcelImportPlan plan,
        IProgress<int>? progress = null,
        IEnumerable<string>? reservedCodes = null,
        IEnumerable<string>? reservedTestCaseCodes = null) =>
        ExcelRequirementImporter.Import(
            plan.FilePath,
            plan.SheetName,
            plan.HeaderRow,
            plan.Mapping,
            progress,
            reservedCodes,
            reservedTestCaseCodes);
}
