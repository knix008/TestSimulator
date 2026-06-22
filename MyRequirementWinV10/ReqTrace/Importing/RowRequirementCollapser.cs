namespace ReqTrace.Importing;

/// <summary>
/// Ensures at most one requirement is produced per spreadsheet row.
/// </summary>
internal static class RowRequirementCollapser
{
    internal static ExtractedRequirementDto? CollapseToSingle(IReadOnlyList<ExtractedRequirementDto> items)
    {
        if (items.Count == 0)
            return null;

        if (items.Count == 1)
            return items[0];

        var title = FirstNonEmpty(items.Select(i => i.Title))
            ?? FirstNonEmpty(items.Select(i => i.Description))
            ?? string.Empty;

        if (string.IsNullOrWhiteSpace(title))
            return null;

        var descriptionParts = new List<string>();
        foreach (var item in items)
        {
            var itemDescription = item.Description?.Trim() ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(itemDescription)
                && !string.Equals(itemDescription, title, StringComparison.OrdinalIgnoreCase))
            {
                descriptionParts.Add(itemDescription);
                continue;
            }

            var itemTitle = item.Title?.Trim() ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(itemTitle)
                && !string.Equals(itemTitle, title, StringComparison.OrdinalIgnoreCase))
            {
                descriptionParts.Add(itemTitle);
            }
        }

        var description = descriptionParts.Count > 0
            ? string.Join(Environment.NewLine, descriptionParts.Distinct(StringComparer.Ordinal))
            : FirstNonEmpty(items.Select(i => i.Description)) ?? title;

        return new ExtractedRequirementDto
        {
            Code = FirstNonEmpty(items.Select(i => i.Code)),
            Title = title,
            Description = description,
            Category = FirstNonEmpty(items.Select(i => i.Category)),
            Priority = FirstNonEmpty(items.Select(i => i.Priority)),
            Status = FirstNonEmpty(items.Select(i => i.Status)),
            ParentCode = FirstNonEmpty(items.Select(i => i.ParentCode))
        };
    }

    private static string? FirstNonEmpty(IEnumerable<string?> values)
    {
        foreach (var value in values)
        {
            if (!string.IsNullOrWhiteSpace(value))
                return value.Trim();
        }

        return null;
    }
}
