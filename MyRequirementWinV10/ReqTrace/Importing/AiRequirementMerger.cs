using ReqTrace.Models;

namespace ReqTrace.Importing;

internal static class AiRequirementMerger
{
    internal static ImportResult EnrichLlmWithMappedBaseline(ImportResult llm, ImportResult mapped)
    {
        var merged = new ImportResult
        {
            RowsProcessed = llm.RowsProcessed,
            RowsSkipped = llm.RowsSkipped + mapped.RowsSkipped
        };

        merged.Warnings.AddRange(mapped.Warnings);
        merged.Warnings.AddRange(llm.Warnings);

        if (llm.Requirements.Count == 0)
        {
            merged.Requirements.AddRange(mapped.Requirements);
            return merged;
        }

        var mappedByCode = mapped.Requirements
            .Where(r => !string.IsNullOrWhiteSpace(r.Code))
            .GroupBy(r => r.Code.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var mappedByTitle = mapped.Requirements
            .GroupBy(r => NormalizeTitle(r.Title), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var consumedMapped = new HashSet<Requirement>();

        foreach (var requirement in llm.Requirements)
        {
            var mappedMatch = FindMappedMatch(requirement, mappedByCode, mappedByTitle);
            if (mappedMatch is not null)
            {
                consumedMapped.Add(mappedMatch);
                EnrichFromMapped(requirement, mappedMatch);
            }

            merged.Requirements.Add(requirement);
        }

        var mergedCodes = merged.Requirements
            .Where(r => !string.IsNullOrWhiteSpace(r.Code))
            .Select(r => r.Code.Trim())
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var mergedTitles = merged.Requirements
            .Select(r => NormalizeTitle(r.Title))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var mappedRequirement in mapped.Requirements)
        {
            if (consumedMapped.Contains(mappedRequirement))
                continue;

            var hasMatchingCode = !string.IsNullOrWhiteSpace(mappedRequirement.Code)
                && mergedCodes.Contains(mappedRequirement.Code.Trim());
            if (hasMatchingCode || mergedTitles.Contains(NormalizeTitle(mappedRequirement.Title)))
                continue;

            merged.Requirements.Add(mappedRequirement);
        }

        return merged;
    }

    private static Requirement? FindMappedMatch(
        Requirement llmRequirement,
        IReadOnlyDictionary<string, Requirement> mappedByCode,
        IReadOnlyDictionary<string, Requirement> mappedByTitle)
    {
        if (!string.IsNullOrWhiteSpace(llmRequirement.Code)
            && mappedByCode.TryGetValue(llmRequirement.Code.Trim(), out var byCode))
            return byCode;

        var titleKey = NormalizeTitle(llmRequirement.Title);
        if (!string.IsNullOrWhiteSpace(titleKey)
            && mappedByTitle.TryGetValue(titleKey, out var byTitle))
            return byTitle;

        return null;
    }

    private static void EnrichFromMapped(Requirement llmRequirement, Requirement mappedRequirement)
    {
        if (string.IsNullOrWhiteSpace(llmRequirement.Code) && !string.IsNullOrWhiteSpace(mappedRequirement.Code))
            llmRequirement.Code = mappedRequirement.Code;

        if (IsBlankDescription(llmRequirement.Description, llmRequirement.Title)
            && !IsBlankDescription(mappedRequirement.Description, mappedRequirement.Title))
        {
            llmRequirement.Description = mappedRequirement.Description;
        }
        else if (!IsBlankDescription(mappedRequirement.Description, mappedRequirement.Title)
                 && mappedRequirement.Description.Trim().Length > llmRequirement.Description.Trim().Length + 20)
        {
            llmRequirement.Description = mappedRequirement.Description;
        }

        if (string.IsNullOrWhiteSpace(llmRequirement.Category) && !string.IsNullOrWhiteSpace(mappedRequirement.Category))
            llmRequirement.Category = mappedRequirement.Category;

        if (string.IsNullOrWhiteSpace(llmRequirement.Source) && !string.IsNullOrWhiteSpace(mappedRequirement.Source))
            llmRequirement.Source = mappedRequirement.Source;

        if (llmRequirement.Priority == Priority.Medium && mappedRequirement.Priority != Priority.Medium)
            llmRequirement.Priority = mappedRequirement.Priority;

        if (llmRequirement.Status == RequirementStatus.Draft && mappedRequirement.Status != RequirementStatus.Draft)
            llmRequirement.Status = mappedRequirement.Status;

        if (llmRequirement.ParentId is null && mappedRequirement.ParentId is not null)
            llmRequirement.ParentId = mappedRequirement.ParentId;
    }

    private static bool IsBlankDescription(string? description, string? title)
    {
        if (string.IsNullOrWhiteSpace(description))
            return true;

        return !string.IsNullOrWhiteSpace(title)
               && string.Equals(description.Trim(), title.Trim(), StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizeTitle(string title) => title.Trim();
}
