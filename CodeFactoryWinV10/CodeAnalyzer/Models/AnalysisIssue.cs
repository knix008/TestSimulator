namespace CodeAnalyzer.Models;

public sealed class AnalysisIssue
{
    public required string Stage { get; init; }
    public required string Message { get; init; }
    public string? Detail { get; init; }
}
