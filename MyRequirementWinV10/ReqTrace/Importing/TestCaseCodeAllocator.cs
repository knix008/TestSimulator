using System.Text.RegularExpressions;

namespace ReqTrace.Importing;

/// <summary>
/// Allocates test case codes using the project-wide TC-### numbering scheme.
/// </summary>
public static class TestCaseCodeAllocator
{
    private static readonly Regex StandardCodePattern = new(
        @"^TC-(\d+)$",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static string Format(int sequenceNumber) => $"TC-{sequenceNumber:D3}";

    public static string PreviewNextCode(IEnumerable<string>? existingCodes = null)
    {
        var (_, nextSequence) = CreateState(existingCodes);
        return Format(nextSequence);
    }

    public static (HashSet<string> UsedCodes, int NextSequence) CreateState(IEnumerable<string>? existingCodes = null)
    {
        var usedCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var nextSequence = 1;

        if (existingCodes is not null)
        {
            foreach (var code in existingCodes)
                RegisterCode(code, usedCodes, ref nextSequence);
        }

        return (usedCodes, nextSequence);
    }

    public static void RegisterCode(string? code, ISet<string> usedCodes, ref int nextSequence)
    {
        if (string.IsNullOrWhiteSpace(code))
            return;

        var normalized = code.Trim();
        usedCodes.Add(normalized);

        if (TryParseSequenceNumber(normalized, out var number))
            nextSequence = Math.Max(nextSequence, number + 1);
    }

    public static bool TryRegisterCode(string code, ISet<string> usedCodes, ref int nextSequence, out string normalizedCode)
    {
        normalizedCode = code.Trim();
        if (string.IsNullOrWhiteSpace(normalizedCode))
            return false;

        if (!usedCodes.Add(normalizedCode))
            return false;

        if (TryParseSequenceNumber(normalizedCode, out var number))
            nextSequence = Math.Max(nextSequence, number + 1);

        return true;
    }

    public static string AllocateNext(ISet<string> usedCodes, ref int nextSequence)
    {
        while (true)
        {
            var code = Format(nextSequence);
            nextSequence++;
            if (usedCodes.Add(code))
                return code;
        }
    }

    public static bool TryParseSequenceNumber(string code, out int sequenceNumber)
    {
        var match = StandardCodePattern.Match(code.Trim());
        if (match.Success && int.TryParse(match.Groups[1].Value, out sequenceNumber))
            return true;

        sequenceNumber = 0;
        return false;
    }
}
