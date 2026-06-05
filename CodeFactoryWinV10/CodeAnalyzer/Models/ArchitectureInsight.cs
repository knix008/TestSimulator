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
    TypeStructure,
    GlobalVariable,
    DatabaseSchema,
    FileDuplicate,
    GodFile,
    LowComment,
    PossiblyUnusedCode,
    CatchQuality,
    AsyncVoid,
    TestCoverage,
    PackageInstability,
    LayerViolation,
    TypeCohesion,
    InheritanceMetrics,
    GitHotspot,
    SecuritySmell
}

public sealed class ArchitectureInsight
{
    public required ArchitectureInsightKind Kind { get; init; }
    public required string Category { get; init; }
    public required string Description { get; init; }
    public WarningLevel Severity { get; init; } = WarningLevel.None;
    public object? NavigationTag { get; init; }
}
