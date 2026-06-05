using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

/// <summary>개별 <see cref="MetricInspectionKind"/> 선택에 따른 분석 실행 요구 사항.</summary>
public static class MetricInspectionRuntime
{
    private static readonly MetricInspectionKind FunctionMetricInspections =
        MetricInspectionKind.CyclomaticComplexity
        | MetricInspectionKind.CognitiveComplexity
        | MetricInspectionKind.NestingDepth
        | MetricInspectionKind.ParameterCount
        | MetricInspectionKind.ReturnCount
        | MetricInspectionKind.MagicNumbers
        | MetricInspectionKind.FanOut
        | MetricInspectionKind.MaintenanceIndex
        | MetricInspectionKind.GodType
        | MetricInspectionKind.StatementCount
        | MetricInspectionKind.SwitchCaseCount
        | MetricInspectionKind.CatchQuality
        | MetricInspectionKind.AsyncVoid
        | MetricInspectionKind.PossiblyUnusedCode
        | MetricInspectionKind.HalsteadMetrics;

    private static readonly MetricInspectionKind FileMetricInspections =
        MetricInspectionKind.TodoDensity
        | MetricInspectionKind.GodFile
        | MetricInspectionKind.LowCommentRatio
        | MetricInspectionKind.FileDuplicateLines
        | MetricInspectionKind.PublicApiDensity
        | MetricInspectionKind.TestCodeRatio
        | MetricInspectionKind.GitHotspot
        | MetricInspectionKind.SecuritySmells;

    private static readonly MetricInspectionKind CallGraphInspections =
        MetricInspectionKind.FanOut
        | MetricInspectionKind.CircularCalls
        | MetricInspectionKind.FileCoupling
        | MetricInspectionKind.DirectoryCoupling
        | MetricInspectionKind.FanOutHub
        | MetricInspectionKind.FanInHub
        | MetricInspectionKind.IsolatedFunctions;

    private static readonly MetricInspectionKind ArchitectureInsightInspections =
        MetricInspectionKind.CircularCalls
        | MetricInspectionKind.FileCoupling
        | MetricInspectionKind.DirectoryCoupling
        | MetricInspectionKind.FanOutHub
        | MetricInspectionKind.FanInHub
        | MetricInspectionKind.IsolatedFunctions
        | MetricInspectionKind.GlobalVariables
        | MetricInspectionKind.DatabaseSchema
        | MetricInspectionKind.DuplicateCodeGroups
        | MetricInspectionKind.FileDuplicateLines
        | MetricInspectionKind.TypeStructure
        | MetricInspectionKind.GodFile
        | MetricInspectionKind.LowCommentRatio
        | MetricInspectionKind.PossiblyUnusedCode
        | MetricInspectionKind.TestCodeRatio
        | MetricInspectionKind.PackageInstability
        | MetricInspectionKind.LayerViolation
        | MetricInspectionKind.GitHotspot
        | MetricInspectionKind.SecuritySmells
        | MetricInspectionKind.CatchQuality
        | MetricInspectionKind.AsyncVoid;

    public static bool RequiresFileLineMetrics(MetricInspectionKind inspections) =>
        IsOn(inspections, MetricInspectionKind.ShowFilesTab)
        || IsOn(inspections, FileMetricInspections)
        || IsOn(inspections, FunctionMetricInspections);

    public static bool RequiresFunctionMetrics(MetricInspectionKind inspections) =>
        IsOn(inspections, MetricInspectionKind.ShowFunctionsTab)
        || IsOn(inspections, FunctionMetricInspections);

    public static bool RequiresCallGraph(MetricInspectionKind inspections) =>
        IsOn(inspections, CallGraphInspections);

    public static bool RequiresCallGraphEnrichment(MetricInspectionKind inspections) =>
        RequiresCallGraph(inspections) || IsOn(inspections, MetricInspectionKind.FanOut);

    public static bool RequiresTypeStructure(MetricInspectionKind inspections) =>
        IsOn(inspections, MetricInspectionKind.TypeStructure)
        || IsOn(inspections, MetricInspectionKind.ShowTypesTab)
        || IsOn(inspections, MetricInspectionKind.TypeCohesion)
        || IsOn(inspections, MetricInspectionKind.InheritanceDepth)
        || IsOn(inspections, MetricInspectionKind.HalsteadMetrics);

    public static bool RequiresDuplicateScan(MetricInspectionKind inspections) =>
        IsOn(inspections, MetricInspectionKind.DuplicateCodeGroups)
        || IsOn(inspections, MetricInspectionKind.FileDuplicateLines);

    public static bool RequiresGlobalVariables(MetricInspectionKind inspections) =>
        IsOn(inspections, MetricInspectionKind.GlobalVariables);

    public static bool RequiresDatabaseSchema(MetricInspectionKind inspections) =>
        IsOn(inspections, MetricInspectionKind.DatabaseSchema);

    public static bool RequiresMetricsEnrichment(MetricInspectionKind inspections) =>
        RequiresFunctionMetrics(inspections)
        || IsOn(inspections, FileMetricInspections)
        || RequiresDuplicateScan(inspections)
        || IsOn(inspections, MetricInspectionKind.PackageInstability)
        || IsOn(inspections, MetricInspectionKind.LayerViolation)
        || IsOn(inspections, MetricInspectionKind.PossiblyUnusedCode);

    public static bool RequiresArchitectureInsights(MetricInspectionKind inspections) =>
        IsOn(inspections, ArchitectureInsightInspections);

    public static bool IsInspectionEnabled(MetricInspectionKind inspections, MetricInspectionKind flag) =>
        MetricInspectionScope.IsEnabled(inspections, flag);

    private static bool IsOn(MetricInspectionKind scope, MetricInspectionKind flags) =>
        (scope & flags) != 0;
}
