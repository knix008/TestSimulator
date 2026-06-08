namespace CodeAnalyzer.Models;

public sealed class SecuritySmellHit
{
    public required string RuleId { get; init; }
    public required string Label { get; init; }
    public int LineNumber { get; init; }
}

public enum SecuritySeverity
{
    Critical,
    Warning,
    Info
}

public sealed class SecurityFinding
{
    public required string RuleId { get; init; }
    public required string Label { get; init; }
    public required SecuritySeverity Severity { get; init; }
    public required string FilePath { get; init; }
    public required string LanguageId { get; init; }
    public int LineNumber { get; init; }
    public string? Snippet { get; init; }
    public string? Explanation { get; init; }
    public string? Remediation { get; init; }
}

public sealed class SecurityAnalysisResult
{
    public IReadOnlyList<SecurityFinding> Findings { get; init; } = [];

    public IReadOnlyDictionary<string, IReadOnlyList<SecurityFinding>> ByRule { get; init; }
        = new Dictionary<string, IReadOnlyList<SecurityFinding>>(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyDictionary<string, IReadOnlyList<SecurityFinding>> ByFile { get; init; }
        = new Dictionary<string, IReadOnlyList<SecurityFinding>>(StringComparer.OrdinalIgnoreCase);

    public static SecurityAnalysisResult Empty { get; } = new();

    public static SecurityAnalysisResult FromFindings(IEnumerable<SecurityFinding> findings)
    {
        var list = findings
            .OrderBy(f => f.Severity == SecuritySeverity.Critical ? 0
                        : f.Severity == SecuritySeverity.Warning ? 1 : 2)
            .ThenBy(f => f.FilePath, StringComparer.OrdinalIgnoreCase)
            .ThenBy(f => f.LineNumber)
            .ToList();

        return new SecurityAnalysisResult
        {
            Findings = list,
            ByRule = list
                .GroupBy(f => f.RuleId, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => (IReadOnlyList<SecurityFinding>)g.ToList(), StringComparer.OrdinalIgnoreCase),
            ByFile = list
                .GroupBy(f => f.FilePath, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    g => g.Key,
                    g => (IReadOnlyList<SecurityFinding>)g.ToList(),
                    StringComparer.OrdinalIgnoreCase)
        };
    }
}
