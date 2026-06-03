namespace CodeAnalyzer.Services;

/// <summary>대형 솔루션에서 OOM·스택 오버플로우·UI 프리징 방지 상한.</summary>
public static class AnalysisScaleLimits
{
    public const int MaxRootMethodComboItems = 2_000;
    public const int MaxComboDropDownMeasureItems = 300;

    public const int MaxCallGraphVisualNodes = 8_000;
    public const int MaxCallGraphVisualDepth = 64;
    public const int CollapseCallGraphWhenNodeCountExceeds = 400;

    public const int MaxNodesForCircularCallDetection = 25_000;

    public const int MaxCodeMetricsUiFunctions = 5_000;
    public const int MaxCodeMetricsUiFiles = 3_000;

    public const int MaxDuplicateCodeGroups = 2_000;
    public const int MaxDuplicateWindowMapEntries = 200_000;
    public const int MaxSourceFilesForDuplicateDetection = 2_500;

    /// <summary>이 수 이상이면 Fan-in/out 복제 없이 경량 메트릭 집계.</summary>
    public const int MaxFunctionsForFullEnrichment = 80_000;
}
