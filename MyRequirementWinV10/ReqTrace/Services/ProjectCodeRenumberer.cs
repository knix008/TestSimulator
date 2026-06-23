using ReqTrace.Importing;
using ReqTrace.Models;

namespace ReqTrace.Services;

/// <summary>
/// Renumbers project-wide standard codes after deletions so sequences stay contiguous.
/// Uses a temporary-code pass first so in-place renames never create duplicate codes.
/// </summary>
public static class ProjectCodeRenumberer
{
    public static void RenumberStandardRequirementCodes(IEnumerable<Requirement> requirements)
    {
        var ordered = requirements
            .Select(requirement => (Requirement: requirement, Number: TryParseRequirementNumber(requirement.Code)))
            .Where(entry => entry.Number.HasValue)
            .OrderBy(entry => entry.Number!.Value)
            .ThenBy(entry => entry.Requirement.Code, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (ordered.Count == 0)
            return;

        var tempPrefix = $"__renumber_{Guid.NewGuid():N}_";
        for (var i = 0; i < ordered.Count; i++)
            ordered[i].Requirement.Code = $"{tempPrefix}{i}";

        var sequence = 1;
        foreach (var (requirement, _) in ordered)
        {
            requirement.Code = RequirementCodeAllocator.Format(sequence++);
            requirement.ModifiedUtc = DateTime.UtcNow;
        }
    }

    public static void RenumberStandardTestCaseCodes(IEnumerable<Requirement> requirements)
    {
        var ordered = requirements
            .SelectMany(requirement => requirement.TestCases)
            .Select(testCase => (TestCase: testCase, Number: TryParseTestCaseNumber(testCase.Code)))
            .Where(entry => entry.Number.HasValue)
            .OrderBy(entry => entry.Number!.Value)
            .ThenBy(entry => entry.TestCase.Code, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (ordered.Count == 0)
            return;

        var tempPrefix = $"__renumber_{Guid.NewGuid():N}_";
        for (var i = 0; i < ordered.Count; i++)
            ordered[i].TestCase.Code = $"{tempPrefix}{i}";

        var sequence = 1;
        foreach (var (testCase, _) in ordered)
            testCase.Code = TestCaseCodeAllocator.Format(sequence++);
    }

    private static int? TryParseRequirementNumber(string code) =>
        RequirementCodeAllocator.TryParseSequenceNumber(code, out var number) ? number : null;

    private static int? TryParseTestCaseNumber(string code) =>
        TestCaseCodeAllocator.TryParseSequenceNumber(code, out var number) ? number : null;
}
