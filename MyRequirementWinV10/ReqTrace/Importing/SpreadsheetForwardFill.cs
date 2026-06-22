using System.Text;

namespace ReqTrace.Importing;

/// <summary>
/// Carries hierarchy/grouping column values down across rows (merged cells or blank grouped cells).
/// </summary>
internal static class SpreadsheetForwardFill
{
    private static readonly string[] HierarchyHeaderTokens =
    [
        "category", "module", "component", "area", "group", "division", "section",
        "parent", "parentcode", "depth", "level", "menu", "tree", "hierarchy",
        "분류", "카테고리", "모듈", "영역", "상위", "부모", "계층", "레벨", "단계",
        "대분류", "중분류", "소분류", "세분류", "메뉴", "구분", "그룹", "트리", "뎁스", "depth",
        "기능", "화면", "업무", "메뉴명", "메뉴트리", "시스템", "업무구분"
    ];

    public static HashSet<int> GetHierarchyColumnIndexes(
        IReadOnlyList<int> columnIndexes,
        ColumnMapping? mapping,
        IReadOnlyList<string> headers)
    {
        var result = new HashSet<int>();
        var titleColumn = mapping?.TitleColumn;

        foreach (var columnIndex in columnIndexes)
        {
            if (IsHierarchyColumn(columnIndex, mapping, headers, titleColumn))
                result.Add(columnIndex);
        }

        return result;
    }

    public static List<string> BuildEffectiveFields(
        IReadOnlyList<string> rowValues,
        IReadOnlyList<int> columnIndexes,
        IReadOnlySet<int> hierarchyColumns,
        IDictionary<int, string> lastValues)
    {
        UpdateHierarchyState(rowValues, hierarchyColumns, lastValues);

        var fields = new List<string>(columnIndexes.Count);

        foreach (var columnIndex in columnIndexes)
        {
            if (hierarchyColumns.Contains(columnIndex)
                && lastValues.TryGetValue(columnIndex, out var carried)
                && !string.IsNullOrWhiteSpace(carried))
            {
                fields.Add(carried);
                continue;
            }

            fields.Add(GetCell(rowValues, columnIndex));
        }

        return fields;
    }

    public static void UpdateHierarchyState(
        IReadOnlyList<string> rowValues,
        IReadOnlySet<int> hierarchyColumns,
        IDictionary<int, string> lastValues)
    {
        foreach (var columnIndex in hierarchyColumns)
        {
            var raw = GetCell(rowValues, columnIndex);
            if (!string.IsNullOrWhiteSpace(raw))
                lastValues[columnIndex] = raw;
        }
    }

    public static string BuildHierarchyPath(
        IReadOnlyList<string> rowValues,
        IReadOnlyList<int> columnIndexes,
        IReadOnlySet<int> hierarchyColumns,
        IReadOnlyDictionary<int, string> lastValues,
        bool onlyRawNonEmpty = false)
    {
        var parts = new List<string>();

        foreach (var columnIndex in columnIndexes)
        {
            if (!hierarchyColumns.Contains(columnIndex))
                continue;

            var value = onlyRawNonEmpty
                ? GetCell(rowValues, columnIndex)
                : GetEffectiveValue(rowValues, columnIndex, hierarchyColumns, lastValues);

            if (string.IsNullOrWhiteSpace(value))
                continue;

            if (parts.Count == 0 || !parts[^1].Equals(value, StringComparison.OrdinalIgnoreCase))
                parts.Add(value);
        }

        return string.Join(" / ", parts);
    }

    public static string GetEffectiveValue(
        IReadOnlyList<string> rowValues,
        int? columnIndex,
        IReadOnlySet<int> hierarchyColumns,
        IReadOnlyDictionary<int, string> lastValues)
    {
        if (columnIndex is not int idx)
            return string.Empty;

        var raw = GetCell(rowValues, idx);
        if (!string.IsNullOrWhiteSpace(raw))
            return raw;

        if (hierarchyColumns.Contains(idx)
            && lastValues.TryGetValue(idx, out var carried))
            return carried;

        return string.Empty;
    }

    public static bool HasNewHierarchyValues(
        IReadOnlyList<string> rowValues,
        IReadOnlySet<int> hierarchyColumns)
    {
        foreach (var columnIndex in hierarchyColumns)
        {
            if (!string.IsNullOrWhiteSpace(GetCell(rowValues, columnIndex)))
                return true;
        }

        return false;
    }

    public static bool IsBlankRawRow(IReadOnlyList<string> rowValues) =>
        rowValues.All(string.IsNullOrWhiteSpace);

    public static bool HasRequirementContent(
        IReadOnlyList<string> rowValues,
        IReadOnlyList<int> columnIndexes,
        IReadOnlySet<int> hierarchyColumns,
        ColumnMapping? mapping)
    {
        if (IsBlankRawRow(rowValues))
            return false;

        foreach (var columnIndex in columnIndexes)
        {
            if (hierarchyColumns.Contains(columnIndex))
                continue;

            if (string.IsNullOrWhiteSpace(GetCell(rowValues, columnIndex)))
                continue;

            if (mapping is null || IsMappedDataColumn(columnIndex, mapping))
                return true;
        }

        return false;
    }

    public static bool IsBlankLlmSheetRow(LlmSheetRow row)
    {
        if (row.IsSection)
            return string.IsNullOrWhiteSpace(row.SectionText);

        return row.Values.All(string.IsNullOrWhiteSpace);
    }

    public static bool IsHierarchyOnlyRow(
        IReadOnlyList<string> rowValues,
        IReadOnlyList<int> columnIndexes,
        IReadOnlySet<int> hierarchyColumns,
        ColumnMapping? mapping)
    {
        var hasHierarchy = false;

        foreach (var columnIndex in columnIndexes)
        {
            var value = GetCell(rowValues, columnIndex);
            if (string.IsNullOrWhiteSpace(value))
                continue;

            if (hierarchyColumns.Contains(columnIndex))
            {
                hasHierarchy = true;
                continue;
            }

            if (IsMappedDataColumn(columnIndex, mapping))
                return false;
        }

        return hasHierarchy;
    }

    private static bool IsHierarchyColumn(
        int columnIndex,
        ColumnMapping? mapping,
        IReadOnlyList<string> headers,
        int? titleColumn)
    {
        if (mapping is not null)
        {
            if (columnIndex == mapping.CategoryColumn)
                return true;
            if (columnIndex == mapping.ParentCodeColumn)
                return true;
            if (columnIndex == mapping.CodeColumn)
                return false;
            if (columnIndex == mapping.TitleColumn)
                return false;
            if (columnIndex == mapping.DescriptionColumn)
                return false;
        }

        if (titleColumn is int titleIdx && columnIndex < titleIdx)
            return true;

        if (columnIndex >= 0 && columnIndex < headers.Count)
        {
            var header = headers[columnIndex].Trim();
            if (header.Length > 0 && HeaderLooksLikeHierarchy(header))
                return true;
        }

        return false;
    }

    private static bool HeaderLooksLikeHierarchy(string header)
    {
        var normalized = NormalizeHeader(header);
        if (normalized.Length == 0)
            return false;

        return HierarchyHeaderTokens.Any(token =>
            normalized.Contains(token, StringComparison.OrdinalIgnoreCase)
            || header.Contains(token, StringComparison.OrdinalIgnoreCase));
    }

    private static string NormalizeHeader(string header)
    {
        var sb = new StringBuilder(header.Length);
        foreach (var ch in header.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(ch))
                sb.Append(ch);
        }

        return sb.ToString();
    }

    private static bool IsMappedDataColumn(int columnIndex, ColumnMapping? mapping)
    {
        if (mapping is null)
            return true;

        return columnIndex == mapping.CodeColumn
               || columnIndex == mapping.TitleColumn
               || columnIndex == mapping.DescriptionColumn
               || columnIndex == mapping.PriorityColumn
               || columnIndex == mapping.StatusColumn
               || columnIndex == mapping.SourceColumn;
    }

    private static string GetCell(IReadOnlyList<string> rowValues, int columnIndex)
    {
        if (columnIndex < 0 || columnIndex >= rowValues.Count)
            return string.Empty;

        return rowValues[columnIndex].Trim();
    }
}
