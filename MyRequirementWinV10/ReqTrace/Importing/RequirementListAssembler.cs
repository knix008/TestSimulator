using ReqTrace.Localization;
using ReqTrace.Models;

namespace ReqTrace.Importing;

/// <summary>
/// Assembles per-row extraction results into the final ordered requirement list.
/// </summary>
internal static class RequirementListAssembler
{
    internal static bool TryAppendSingle(
        ImportResult result,
        ExtractedRequirementDto item,
        string sourceName,
        bool generateCodeIfMissing,
        bool generateTestCases,
        IDictionary<string, string> parentCodeByRequirementCode,
        ISet<string> usedCodes,
        ref int sequence,
        ISet<string> testCaseUsedCodes,
        ref int testCaseNextSequence,
        out Requirement requirement)
    {
        requirement = null!;
        result.RowsProcessed++;

        var title = item.Title?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(title))
        {
            result.RowsSkipped++;
            result.Warnings.Add(Loc.T("Msg_AiImportSkippedNoTitle"));
            return false;
        }

        var code = item.Code?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(code))
        {
            if (generateCodeIfMissing)
                code = RequirementCodeAllocator.AllocateNext(usedCodes, ref sequence);
            else
            {
                result.RowsSkipped++;
                result.Warnings.Add(Loc.T("Msg_AiImportSkippedNoCode", title));
                return false;
            }
        }
        else if (!RequirementCodeAllocator.TryRegisterCode(code, usedCodes, ref sequence, out code))
        {
            if (generateCodeIfMissing)
            {
                var originalCode = code;
                code = RequirementCodeAllocator.AllocateNext(usedCodes, ref sequence);
                result.Warnings.Add(Loc.T("Msg_AiImportDuplicateCodeReassigned", originalCode, code, title));
            }
            else
            {
                result.RowsSkipped++;
                result.Warnings.Add(Loc.T("Msg_AiImportSkippedDuplicateCode", code, title));
                return false;
            }
        }

        var description = NormalizeDescription(item.Description, item.Title);
        requirement = new Requirement
        {
            Code = code,
            Title = title,
            Description = description,
            Category = item.Category?.Trim() ?? string.Empty,
            Source = sourceName,
            Priority = EnumImportParser.ParsePriorityOrDefault(item.Priority ?? string.Empty, Priority.Medium),
            Status = EnumImportParser.ParseStatusOrDefault(item.Status ?? string.Empty, RequirementStatus.Draft)
        };

        var parentCode = item.ParentCode?.Trim();
        if (!string.IsNullOrWhiteSpace(parentCode))
            parentCodeByRequirementCode[code] = parentCode;

        if (generateTestCases)
        {
            var generated = TestCaseGenerator.Generate(requirement, testCaseUsedCodes, ref testCaseNextSequence);
            foreach (var tc in generated)
                tc.RequirementId = requirement.Id;
            requirement.TestCases.AddRange(generated);
        }

        result.Requirements.Add(requirement);
        return true;
    }

    internal static void AppendRequirements(
        ImportResult result,
        IReadOnlyList<ExtractedRequirementDto> items,
        string sourceName,
        bool generateCodeIfMissing,
        bool generateTestCases,
        IDictionary<string, string> parentCodeByRequirementCode,
        ISet<string> usedCodes,
        ref int sequence,
        ISet<string> testCaseUsedCodes,
        ref int testCaseNextSequence)
    {
        foreach (var item in items)
        {
            TryAppendSingle(
                result,
                item,
                sourceName,
                generateCodeIfMissing,
                generateTestCases,
                parentCodeByRequirementCode,
                usedCodes,
                ref sequence,
                testCaseUsedCodes,
                ref testCaseNextSequence,
                out _);
        }
    }

    private static string NormalizeDescription(string? description, string? title)
    {
        var normalizedDescription = description?.Trim() ?? string.Empty;
        var normalizedTitle = title?.Trim() ?? string.Empty;

        if (!string.IsNullOrWhiteSpace(normalizedDescription))
            return normalizedDescription;

        return normalizedTitle;
    }
}
