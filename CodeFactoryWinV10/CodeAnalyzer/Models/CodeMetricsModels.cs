namespace CodeAnalyzer.Models;

public enum WarningLevel { None, Warning, Critical }

public enum MetricsPrecision
{
    /// <summary>정규식·키워드 기반 근사.</summary>
    Approximate,
    /// <summary>Tree-sitter / 구문 트리 기반.</summary>
    Syntax,
    /// <summary>Roslyn 등 의미 분석 기반.</summary>
    Semantic
}

public sealed class FileLineMetric
{
    public required string FilePath { get; init; }
    public required string LanguageId { get; init; }
    public int PhysicalLines { get; init; }
    public int CodeLines { get; init; }
    public int BlankLines { get; init; }
    public int CommentLines { get; init; }
    public double CommentPercentPer100Code { get; init; }
    public int TodoMarkerCount { get; init; }
    public double TodoDensityPer100Lines { get; init; }
    public bool IsTestFile { get; init; }
    public int PublicApiCount { get; init; }
    public int SecuritySmellCount { get; init; }
    public IReadOnlyList<SecuritySmellHit> SecuritySmellHits { get; init; } = [];
    public string? SecuritySmellSummary { get; init; }
    public int GitChangeLineCount { get; init; }
}

/// <summary>파일 단위로 함수 메트릭을 집계한 결과.</summary>
public sealed class FileAggregateMetric
{
    public required string FilePath { get; init; }
    public required string LanguageId { get; init; }
    public int PhysicalLines { get; init; }
    public int CodeLines { get; init; }
    public int TodoMarkerCount { get; init; }
    public double TodoDensityPer100Lines { get; init; }
    public int FunctionCount { get; init; }
    public int MaxCyclomaticComplexity { get; init; }
    public int MaxCognitiveComplexity { get; init; }
    public int MaxNestingDepth { get; init; }
    public int MaxFanIn { get; init; }
    public int MaxFanOut { get; init; }
    public double AvgCyclomaticComplexity { get; init; }
    public double AvgCognitiveComplexity { get; init; }
    public double AvgMaintenanceIndex { get; init; }
    public double MinMaintenanceIndex { get; init; }
    public int TotalMagicNumbers { get; init; }
    public int MaxReturnCount { get; init; }
    public int DuplicateLineCount { get; init; }
    public double CommentPercentPer100Code { get; init; }
    public int WarningFunctionCount { get; init; }
    public bool IsTestFile { get; init; }
    public int PublicApiCount { get; init; }
    public int SecuritySmellCount { get; init; }
    public string? SecuritySmellSummary { get; init; }
    public int GitChangeLineCount { get; init; }
    public int MaxStatementCount { get; init; }
    public int MaxSwitchCaseCount { get; init; }
    public int TotalEmptyCatchCount { get; init; }
    public int TotalBroadCatchCount { get; init; }
    public int AsyncVoidCount { get; init; }
}

/// <summary>UML/구조 분석 타입과 함수 메트릭을 결합한 타입 단위 집계.</summary>
public sealed class TypeMetric
{
    public required string Id { get; init; }
    public required string DisplayName { get; init; }
    public required string FullName { get; init; }
    public required string FilePath { get; init; }
    public int LineNumber { get; init; }
    public string Kind { get; init; } = "class";
    public int MemberCount { get; init; }
    public int OperationCount { get; init; }
    public int MatchedFunctionCount { get; init; }
    public int MaxCyclomaticComplexity { get; init; }
    public int MaxCognitiveComplexity { get; init; }
    public double MinMaintenanceIndex { get; init; }
    public int DependencyOutCount { get; init; }
    public int DependencyInCount { get; init; }
    public int InheritanceOutCount { get; init; }
    public double LackOfCohesion { get; init; }
    public int DepthOfInheritance { get; init; }
    public int NumberOfChildren { get; init; }
    public int WeightedMethodCount { get; init; }
    public int ResponseForClass { get; init; }
}

public sealed class FunctionMetric
{
    public required string Id { get; init; }
    public required string LanguageId { get; init; }
    public required string DisplayName { get; init; }
    public required string FullName { get; init; }
    public required string FilePath { get; init; }
    public int StartLine { get; init; }
    public int EndLine { get; init; }
    public int LineCount { get; init; }
    public int CyclomaticComplexity { get; init; }
    public int CognitiveComplexity { get; init; }
    public int MaxNestingDepth { get; init; }
    public int ParameterCount { get; init; }
    public int ReturnCount { get; init; }
    public int FanIn { get; init; }
    public int FanOut { get; init; }
    public int MagicNumberCount { get; init; }
    public double MaintenanceIndex { get; init; }
    public MetricsPrecision Precision { get; init; }
    public int StatementCount { get; init; }
    public int SwitchCaseCount { get; init; }
    public int EmptyCatchCount { get; init; }
    public int BroadCatchCount { get; init; }
    public bool IsAsyncVoid { get; init; }
    public bool IsPublic { get; init; }
    public bool IsPossiblyUnused { get; init; }
    public int HalsteadVolume { get; init; }
    public int WeightedMethodComplexity { get; init; }
}

public sealed class CodeQualitySummary
{
    public double ProjectDuplicateLinePercent { get; init; }
    public int DuplicateLineCount { get; init; }
    public int TotalCodeLines { get; init; }
    public int CircularCallChainCount { get; init; }
    public IReadOnlyList<CircularCallChain> CircularCallChains { get; init; } = [];
    public int HighCyclomaticCount { get; init; }
    public int HighCognitiveCount { get; init; }
    public int DeepNestingCount { get; init; }
    public int HighFanOutCount { get; init; }
    public int LowMaintenanceIndexCount { get; init; }
    public int HighParameterCount { get; init; }
    public int TotalTodoMarkers { get; init; }
    public int HighTodoDensityFileCount { get; init; }
    public int HighReturnCount { get; init; }
    public int HighMagicNumberCount { get; init; }
    public int GodFileCount { get; init; }
    public int LowCommentFileCount { get; init; }
    public int HighStatementCount { get; init; }
    public int HighSwitchCaseCount { get; init; }
    public int EmptyCatchFunctionCount { get; init; }
    public int BroadCatchFunctionCount { get; init; }
    public int AsyncVoidCount { get; init; }
    public int PossiblyUnusedCount { get; init; }
    public int HighPublicApiFileCount { get; init; }
    public double TestCodeLinePercent { get; init; }
    public int SecuritySmellFileCount { get; init; }
    public int HighInstabilityPackageCount { get; init; }
    public int LayerViolationCount { get; init; }
    public int LowCohesionTypeCount { get; init; }
    public int DeepInheritanceTypeCount { get; init; }
    public int GitHotspotFileCount { get; init; }
}

public sealed class PackageMetric
{
    public required string DirectoryPath { get; init; }
    public int AfferentCoupling { get; init; }
    public int EfferentCoupling { get; init; }
    public double Instability { get; init; }
    public double Abstractness { get; init; }
    public double DistanceFromMainSequence { get; init; }
}

public sealed class CodeMetricsResult
{
    public IReadOnlyList<FileLineMetric> Files { get; init; } = [];
    public IReadOnlyList<FileAggregateMetric> FileAggregates { get; init; } = [];
    public IReadOnlyList<FunctionMetric> Functions { get; init; } = [];
    public CodeQualitySummary Summary { get; init; } = new();

    public IReadOnlyDictionary<string, FileLineMetric> FileMap { get; init; }
        = new Dictionary<string, FileLineMetric>(StringComparer.OrdinalIgnoreCase);

    public IReadOnlyDictionary<string, FunctionMetric> FunctionMap { get; init; }
        = new Dictionary<string, FunctionMetric>(StringComparer.Ordinal);

    public IReadOnlyList<PackageMetric> Packages { get; init; } = [];
}
