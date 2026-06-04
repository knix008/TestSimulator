namespace CodeAnalyzer.Models;

public enum ArchitectureInsightKind
{
    Summary,
    CircularCall,
    FileCoupling,
    DirectoryCoupling,
    FanOutHub,
    FanInHub,
    IsolatedFunction,
    DuplicateCode,
    TypeStructure
}

public sealed class ArchitectureInsight
{
    public required ArchitectureInsightKind Kind { get; init; }
    public required string Category { get; init; }
    public required string Description { get; init; }
    public WarningLevel Severity { get; init; } = WarningLevel.None;
    public object? NavigationTag { get; init; }
}
