namespace CodeAnalyzer.Models;

public sealed class DuplicateCodeFragment
{
    public required string FilePath { get; init; }
    public required string LanguageId { get; init; }
    public int StartLine { get; init; }
    public int EndLine { get; init; }
}

public sealed class DuplicateCodeGroup
{
    public required string Id { get; init; }
    public int LineCount { get; init; }
    public IReadOnlyList<string> DuplicateLines { get; init; } = [];
    public IReadOnlyList<string> SampleLines { get; init; } = [];
    public IReadOnlyList<DuplicateCodeFragment> Fragments { get; init; } = [];
}

public sealed class DuplicateCodeResult
{
    public int MinDuplicateLines { get; init; } = UserAnalysisSettings.DefaultMinDuplicateLines;
    public IReadOnlyList<DuplicateCodeGroup> Groups { get; init; } = [];
}
