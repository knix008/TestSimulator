using ReqTrace.Importing;
using ReqTrace.Models;

namespace ReqTrace.Services;

/// <summary>
/// Renumbers project-wide standard codes after deletions so sequences stay contiguous.
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

        var sequence = 1;
        foreach (var (requirement, _) in ordered)
        {
            var newCode = RequirementCodeAllocator.Format(sequence++);
            if (string.Equals(requirement.Code, newCode, StringComparison.OrdinalIgnoreCase))
                continue;

            requirement.Code = newCode;
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

        var sequence = 1;
        foreach (var (testCase, _) in ordered)
        {
            var newCode = TestCaseCodeAllocator.Format(sequence++);
            if (string.Equals(testCase.Code, newCode, StringComparison.OrdinalIgnoreCase))
                continue;

            testCase.Code = newCode;
        }
    }

    private static int? TryParseRequirementNumber(string code) =>
        RequirementCodeAllocator.TryParseSequenceNumber(code, out var number) ? number : null;

    private static int? TryParseTestCaseNumber(string code) =>
        TestCaseCodeAllocator.TryParseSequenceNumber(code, out var number) ? number : null;
}
