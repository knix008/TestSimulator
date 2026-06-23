namespace ReqTrace.Importing;

/// <summary>
/// Builds granular requirement categories from hierarchy columns and section context.
/// </summary>
internal static class RequirementCategoryComposer
{
    public const string Separator = " / ";

    public static string Compose(params string?[] parts)
    {
        var segments = new List<string>();

        foreach (var part in parts)
        {
            if (string.IsNullOrWhiteSpace(part))
                continue;

            foreach (var segment in SplitSegments(part))
            {
                if (segments.Exists(s => s.Equals(segment, StringComparison.OrdinalIgnoreCase)))
                    continue;

                segments.Add(segment);
            }
        }

        return string.Join(Separator, segments);
    }

    public static string ComposeFromHierarchy(
        IReadOnlyList<string> rowValues,
        IReadOnlyList<int> columnIndexes,
        IReadOnlySet<int> hierarchyColumns,
        IReadOnlyDictionary<int, string> lastHierarchyValues,
        int? categoryColumn = null,
        string? categoryContext = null)
    {
        var hierarchyPathColumns = categoryColumn is int categoryIdx
            ? hierarchyColumns.Where(column => column != categoryIdx).ToHashSet()
            : hierarchyColumns;

        var hierarchyPath = SpreadsheetForwardFill.BuildHierarchyPath(
            rowValues,
            columnIndexes,
            hierarchyPathColumns,
            lastHierarchyValues);

        var mappedCategory = categoryColumn is int index
            ? SpreadsheetForwardFill.GetEffectiveValue(rowValues, index, hierarchyColumns, lastHierarchyValues)
            : string.Empty;

        return Compose(categoryContext, hierarchyPath, mappedCategory);
    }

    public static string ComposeFromLlmRow(LlmSheetRow row, ColumnMapping? mapping)
    {
        var mappedCategory = GetLogicalField(row, "category");
        if (!string.IsNullOrWhiteSpace(mappedCategory))
            return Compose(mappedCategory);

        var hierarchyParts = CollectHierarchyFieldValues(row, mapping);
        return Compose(row.CategoryContext, string.Join(Separator, hierarchyParts));
    }

    private static IEnumerable<string> CollectHierarchyFieldValues(LlmSheetRow row, ColumnMapping? mapping)
    {
        var segments = new List<string>();

        for (var i = 0; i < row.Headers.Count && i < row.Values.Count; i++)
        {
            var header = row.Headers[i];
            var value = row.Values[i].Trim();
            if (string.IsNullOrWhiteSpace(value))
                continue;

            if (IsMappedDataHeader(header, mapping))
                continue;

            if (string.Equals(header, "category", StringComparison.OrdinalIgnoreCase))
                continue;

            if (!LooksLikeHierarchyHeader(header))
                continue;

            if (segments.Count > 0 && segments[^1].Equals(value, StringComparison.OrdinalIgnoreCase))
                continue;

            segments.Add(value);
        }

        return segments;
    }

    private static bool IsMappedDataHeader(string header, ColumnMapping? mapping)
    {
        if (mapping is null)
            return false;

        return string.Equals(header, "code", StringComparison.OrdinalIgnoreCase)
               || string.Equals(header, "title", StringComparison.OrdinalIgnoreCase)
               || string.Equals(header, "description", StringComparison.OrdinalIgnoreCase)
               || string.Equals(header, "priority", StringComparison.OrdinalIgnoreCase)
               || string.Equals(header, "status", StringComparison.OrdinalIgnoreCase)
               || string.Equals(header, "source", StringComparison.OrdinalIgnoreCase)
               || string.Equals(header, "parentCode", StringComparison.OrdinalIgnoreCase);
    }

    private static bool LooksLikeHierarchyHeader(string header)
    {
        var normalized = NormalizeHeader(header);
        if (normalized.Length == 0)
            return false;

        string[] tokens =
        [
            "category", "module", "component", "area", "group", "division", "section",
            "parent", "parentcode", "depth", "level", "menu", "tree", "hierarchy",
            "분류", "카테고리", "모듈", "영역", "상위", "부모", "계층", "레벨", "단계",
            "대분류", "중분류", "소분류", "세분류", "메뉴", "구분", "그룹", "트리", "기능", "화면", "업무"
        ];

        return tokens.Any(token =>
            normalized.Contains(token, StringComparison.OrdinalIgnoreCase)
            || header.Contains(token, StringComparison.OrdinalIgnoreCase));
    }

    private static string GetLogicalField(LlmSheetRow row, string logicalName)
    {
        for (var i = 0; i < row.Headers.Count && i < row.Values.Count; i++)
        {
            if (string.Equals(row.Headers[i], logicalName, StringComparison.OrdinalIgnoreCase))
                return row.Values[i].Trim();
        }

        return string.Empty;
    }

    private static IEnumerable<string> SplitSegments(string value)
    {
        return value
            .Split(['/', '>', '|', '\\', '／', '〉', '»'], StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Select(segment => segment.Trim())
            .Where(segment => segment.Length > 0);
    }

    private static string NormalizeHeader(string header)
    {
        var sb = new System.Text.StringBuilder(header.Length);
        foreach (var ch in header.Trim().ToLowerInvariant())
        {
            if (char.IsLetterOrDigit(ch))
                sb.Append(ch);
        }

        return sb.ToString();
    }

    private static string GetCell(IReadOnlyList<string> rowValues, int columnIndex)
    {
        if (columnIndex < 0 || columnIndex >= rowValues.Count)
            return string.Empty;

        return rowValues[columnIndex].Trim();
    }
}
