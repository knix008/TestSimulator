namespace CodeAnalyzer.Models;

public sealed class AnalysisProgressReport
{
    public int Percent { get; init; }
    public required string Message { get; init; }
    public TimeSpan Elapsed { get; init; }
}
