using ReqTrace.Localization;

namespace ReqTrace.Importing;

public static class ColumnMappingEditor
{
    public static readonly string[] FieldNames =
    [
        "Code", "Title", "Description", "Category", "Priority", "Status", "Source", "ParentCode"
    ];

    public static void Reload(
        string filePath,
        string sheetName,
        int headerRow,
        IReadOnlyDictionary<string, ComboBox> fieldCombos,
        DataGridView previewGrid)
    {
        IReadOnlyList<string> headers;
        try
        {
            headers = ExcelRequirementImporter.ReadHeaderRow(filePath, sheetName, headerRow);
        }
        catch
        {
            return;
        }

        foreach (var combo in fieldCombos.Values)
            InitializeComboItems(combo, headers);

        var inferred = ColumnMappingHeuristics.Infer(headers);
        SetComboSelection(fieldCombos["Code"], inferred.CodeColumn);
        SetComboSelection(fieldCombos["Title"], inferred.TitleColumn);
        SetComboSelection(fieldCombos["Description"], inferred.DescriptionColumn);
        SetComboSelection(fieldCombos["Category"], inferred.CategoryColumn);
        SetComboSelection(fieldCombos["Priority"], inferred.PriorityColumn);
        SetComboSelection(fieldCombos["Status"], inferred.StatusColumn);
        SetComboSelection(fieldCombos["Source"], inferred.SourceColumn);
        SetComboSelection(fieldCombos["ParentCode"], inferred.ParentCodeColumn);

        previewGrid.Columns.Clear();
        previewGrid.Rows.Clear();
        foreach (var header in headers)
            previewGrid.Columns.Add(header, header);

        var previewRows = ExcelRequirementImporter.ReadPreviewRows(filePath, sheetName, headerRow, 8);
        foreach (var row in previewRows)
            previewGrid.Rows.Add(row.ToArray());
    }

    public static void InitializeComboItems(ComboBox combo, IReadOnlyList<string> headers)
    {
        combo.Items.Clear();
        combo.Items.Add(Loc.T("Common_None"));
        foreach (var header in headers)
            combo.Items.Add(header);
    }

    public static void SetComboSelection(ComboBox combo, int? columnIndex)
    {
        combo.SelectedIndex = columnIndex is { } idx && idx >= 0 ? idx + 1 : 0;
    }

    public static int? GetMappedColumn(ComboBox combo)
    {
        if (combo.SelectedIndex <= 0)
            return null;
        return combo.SelectedIndex - 1;
    }

    public static ColumnMapping BuildMapping(
        IReadOnlyDictionary<string, ComboBox> fieldCombos,
        bool generateCodeIfMissing,
        bool generateTestCases)
    {
        return new ColumnMapping
        {
            CodeColumn = GetMappedColumn(fieldCombos["Code"]),
            TitleColumn = GetMappedColumn(fieldCombos["Title"]),
            DescriptionColumn = GetMappedColumn(fieldCombos["Description"]),
            CategoryColumn = GetMappedColumn(fieldCombos["Category"]),
            PriorityColumn = GetMappedColumn(fieldCombos["Priority"]),
            StatusColumn = GetMappedColumn(fieldCombos["Status"]),
            SourceColumn = GetMappedColumn(fieldCombos["Source"]),
            ParentCodeColumn = GetMappedColumn(fieldCombos["ParentCode"]),
            GenerateCodeIfMissing = generateCodeIfMissing,
            GenerateTestCases = generateTestCases
        };
    }
}
