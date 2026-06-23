namespace ReqTrace.Importing;

/// <summary>
/// Builds requirement DTOs directly from mapped Excel/CSV rows.
/// LLM is used only when the description field still needs enrichment.
/// </summary>
internal static class LlmRowLocalConverter
{
    private const int MinDescriptionExtraChars = 12;

    public static bool NeedsLlmDescription(LlmSheetRow row, ColumnMapping? mapping)
    {
        if (row.IsSection)
            return false;

        var title = GetField(row, "title", mapping);
        var description = GetField(row, "description", mapping);

        if (string.IsNullOrWhiteSpace(title) && string.IsNullOrWhiteSpace(description))
            return HasAnyMeaningfulField(row, mapping, "title", "description");

        return IsWeakDescription(description, title);
    }

    public static bool NeedsLlmDescription(ExtractedRequirementDto dto) =>
        IsWeakDescription(dto.Description, dto.Title);

    /// <summary>
    /// Maps Excel row fields to a requirement DTO without calling the LLM.
    /// </summary>
    public static bool TryConvertFromExcelRow(LlmSheetRow row, ColumnMapping? mapping, out ExtractedRequirementDto dto)
    {
        dto = null!;
        if (row.IsSection)
            return false;

        var title = GetField(row, "title", mapping);
        var description = GetField(row, "description", mapping);
        if (string.IsNullOrWhiteSpace(title))
            title = description;
        if (string.IsNullOrWhiteSpace(title))
            return false;

        return TryBuildDto(row, mapping, title, description, out dto);
    }

    public static string BuildDescriptionFromRow(LlmSheetRow row, ColumnMapping? mapping, string title)
    {
        var parts = new List<string>();

        if (!string.IsNullOrWhiteSpace(row.CategoryContext)
            && !title.Contains(row.CategoryContext, StringComparison.OrdinalIgnoreCase))
        {
            parts.Add(row.CategoryContext.Trim());
        }

        for (var i = 0; i < row.Headers.Count && i < row.Values.Count; i++)
        {
            var header = row.Headers[i];
            var value = row.Values[i]?.Trim() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(value))
                continue;

            if (IsStructuralHeader(header))
                continue;

            if (string.Equals(value, title, StringComparison.OrdinalIgnoreCase))
                continue;

            if (title.Contains(value, StringComparison.OrdinalIgnoreCase)
                && value.Length < title.Length)
                continue;

            parts.Add(FormatFieldLine(header, value));
        }

        return parts.Count == 0
            ? title
            : string.Join(Environment.NewLine, parts.Distinct(StringComparer.Ordinal));
    }

    public static void EnsureMeaningfulDescription(
        ExtractedRequirementDto dto,
        LlmSheetRow row,
        ColumnMapping? mapping)
    {
        if (!IsWeakDescription(dto.Description, dto.Title))
            return;

        var enriched = BuildDescriptionFromRow(row, mapping, dto.Title?.Trim() ?? string.Empty);
        if (!IsWeakDescription(enriched, dto.Title))
            dto.Description = enriched;
    }

    public static bool IsWeakDescription(string? description, string? title)
    {
        var normalizedDescription = description?.Trim() ?? string.Empty;
        var normalizedTitle = title?.Trim() ?? string.Empty;

        if (string.IsNullOrWhiteSpace(normalizedDescription))
            return true;

        if (string.IsNullOrWhiteSpace(normalizedTitle))
            return normalizedDescription.Length < MinDescriptionExtraChars;

        if (string.Equals(normalizedDescription, normalizedTitle, StringComparison.OrdinalIgnoreCase))
            return true;

        if (normalizedDescription.Length < normalizedTitle.Length + MinDescriptionExtraChars
            && normalizedTitle.Contains(normalizedDescription, StringComparison.OrdinalIgnoreCase))
            return true;

        return false;
    }

    private static bool TryBuildDto(
        LlmSheetRow row,
        ColumnMapping? mapping,
        string title,
        string description,
        out ExtractedRequirementDto dto)
    {
        dto = new ExtractedRequirementDto
        {
            Code = NullIfEmpty(GetField(row, "code", mapping)),
            Title = title,
            Description = description?.Trim() ?? string.Empty,
            Category = NullIfEmpty(GetCategory(row, mapping)),
            Priority = NullIfEmpty(GetField(row, "priority", mapping)),
            Status = NullIfEmpty(GetField(row, "status", mapping)),
            ParentCode = NullIfEmpty(GetField(row, "parentCode", mapping))
        };

        return true;
    }

    private static string GetCategory(LlmSheetRow row, ColumnMapping? mapping) =>
        RequirementCategoryComposer.ComposeFromLlmRow(row, mapping);

    private static string GetField(LlmSheetRow row, string logicalName, ColumnMapping? mapping)
    {
        var index = FindHeaderIndex(row.Headers, logicalName);
        if (index >= 0 && index < row.Values.Count)
            return row.Values[index].Trim();

        return string.Empty;
    }

    private static int FindHeaderIndex(IReadOnlyList<string> headers, string logicalName)
    {
        for (var i = 0; i < headers.Count; i++)
        {
            if (string.Equals(headers[i], logicalName, StringComparison.OrdinalIgnoreCase))
                return i;
        }

        return -1;
    }

    private static bool HasAnyMeaningfulField(LlmSheetRow row, ColumnMapping? mapping, params string[] excluded)
    {
        var excludedSet = new HashSet<string>(excluded, StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < row.Headers.Count && i < row.Values.Count; i++)
        {
            if (excludedSet.Contains(row.Headers[i]))
                continue;

            if (!string.IsNullOrWhiteSpace(row.Values[i]))
                return true;
        }

        return false;
    }

    private static bool IsStructuralHeader(string header) =>
        header.Equals("code", StringComparison.OrdinalIgnoreCase)
        || header.Equals("title", StringComparison.OrdinalIgnoreCase)
        || header.Equals("description", StringComparison.OrdinalIgnoreCase)
        || header.Equals("category", StringComparison.OrdinalIgnoreCase)
        || header.Equals("priority", StringComparison.OrdinalIgnoreCase)
        || header.Equals("status", StringComparison.OrdinalIgnoreCase)
        || header.Equals("parentCode", StringComparison.OrdinalIgnoreCase);

    private static string FormatFieldLine(string header, string value) =>
        string.Equals(header, "col", StringComparison.OrdinalIgnoreCase)
        || header.StartsWith("col", StringComparison.OrdinalIgnoreCase)
            ? value
            : $"{header}: {value}";

    private static string? NullIfEmpty(string value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
