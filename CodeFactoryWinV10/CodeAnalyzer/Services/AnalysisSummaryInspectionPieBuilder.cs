using CodeAnalyzer.Models;
using CodeAnalyzer.Services.Metrics;

namespace CodeAnalyzer.Services;

public sealed class AnalysisSummaryInspectionSlice
{
    public required string Label { get; init; }
    public required string Group { get; init; }
    public required MetricInspectionKind Kind { get; init; }
    public double Value { get; init; }
    public InspectionPieSeverity Severity { get; init; }
}

public sealed class AnalysisSummaryInspectionGroup
{
    public required string Group { get; init; }
    public IReadOnlyList<AnalysisSummaryInspectionSlice> Slices { get; init; } = [];
}

/// <summary>분석 설정에서 활성화된 검사 항목별 측정값(파이 차트 슬라이스).</summary>
public static class AnalysisSummaryInspectionPieBuilder
{
    private static readonly string[] GroupOrder =
    [
        "탭",
        "함수·파일·타입",
        "파일",
        "타입",
        "아키텍처"
    ];

    public static IReadOnlyList<AnalysisSummaryInspectionGroup> BuildGrouped(AnalysisResult analysis)
    {
        var slices = Build(analysis);
        if (slices.Count == 0)
        {
            return [];
        }

        var orderMap = GroupOrder
            .Select((group, index) => (group, index))
            .ToDictionary(pair => pair.group, pair => pair.index, StringComparer.Ordinal);

        return slices
            .GroupBy(slice => slice.Group, StringComparer.Ordinal)
            .OrderBy(group => orderMap.GetValueOrDefault(group.Key, GroupOrder.Length))
            .ThenBy(group => group.Key, StringComparer.Ordinal)
            .Select(group => new AnalysisSummaryInspectionGroup
            {
                Group = group.Key,
                Slices = group.ToList()
            })
            .ToList();
    }

    public static IReadOnlyList<AnalysisSummaryInspectionSlice> Build(AnalysisResult analysis)
    {
        var inspections = MetricInspectionCatalog.NormalizeScope(analysis.QualityThresholds.EnabledInspections);
        var slices = new List<AnalysisSummaryInspectionSlice>();

        foreach (var option in MetricInspectionCatalog.Options)
        {
            if (!MetricInspectionCatalog.IsEnabled(inspections, option.Kind))
            {
                continue;
            }

            var value = ResolveValue(option.Kind, analysis);
            slices.Add(new AnalysisSummaryInspectionSlice
            {
                Label = option.Label,
                Group = option.Group,
                Kind = option.Kind,
                Value = value,
                Severity = AnalysisSummaryInspectionSeverityResolver.Resolve(option.Kind, value, analysis)
            });
        }

        return slices;
    }

    private static double ResolveValue(MetricInspectionKind kind, AnalysisResult analysis)
    {
        var metrics = analysis.Metrics;
        var summary = metrics.Summary;
        var thresholds = analysis.QualityThresholds;
        var functions = metrics.Functions;
        var files = metrics.Files;

        return kind switch
        {
            MetricInspectionKind.ShowFilesTab => files.Count,
            MetricInspectionKind.ShowFunctionsTab => functions.Count,
            MetricInspectionKind.ShowTypesTab => analysis.Structure.Types.Count,
            MetricInspectionKind.ShowPackagesTab => metrics.Packages.Count,
            MetricInspectionKind.ShowArchitectureTab => CountArchitectureDetails(analysis),

            MetricInspectionKind.CyclomaticComplexity => summary.HighCyclomaticCount,
            MetricInspectionKind.CognitiveComplexity => summary.HighCognitiveCount,
            MetricInspectionKind.NestingDepth => summary.DeepNestingCount,
            MetricInspectionKind.ParameterCount => summary.HighParameterCount,
            MetricInspectionKind.ReturnCount => summary.HighReturnCount,
            MetricInspectionKind.MagicNumbers => summary.HighMagicNumberCount,
            MetricInspectionKind.FanOut => summary.HighFanOutCount,
            MetricInspectionKind.MaintenanceIndex => summary.LowMaintenanceIndexCount,

            MetricInspectionKind.TodoDensity => summary.TotalTodoMarkers,
            MetricInspectionKind.GodFile => summary.GodFileCount,
            MetricInspectionKind.LowCommentRatio => summary.LowCommentFileCount,
            MetricInspectionKind.FileDuplicateLines => CountFilesWithDuplicateLines(metrics, analysis.Duplicates),

            MetricInspectionKind.GodType => CountGodTypes(analysis),

            MetricInspectionKind.CircularCalls => summary.CircularCallChainCount,
            MetricInspectionKind.FileCoupling => analysis.FileRelations.Edges.Count,
            MetricInspectionKind.DirectoryCoupling => analysis.DirectoryRelations.Edges.Count,
            MetricInspectionKind.FanOutHub => functions.Count(func => func.FanOut >= thresholds.WarnFanOut),
            MetricInspectionKind.FanInHub => functions.Count(func =>
                func.FanIn >= Math.Max(thresholds.WarnFanOut, 3)),
            MetricInspectionKind.IsolatedFunctions => functions.Count(func => func.FanIn == 0 && func.FanOut == 0),
            MetricInspectionKind.GlobalVariables => analysis.GlobalVariables.Variables.Count,
            MetricInspectionKind.DatabaseSchema => analysis.DatabaseSchema?.Tables.Count ?? 0,
            MetricInspectionKind.DuplicateCodeGroups => analysis.Duplicates.Groups.Count,
            MetricInspectionKind.TypeStructure => analysis.Structure.Types.Count,

            MetricInspectionKind.StatementCount => summary.HighStatementCount,
            MetricInspectionKind.SwitchCaseCount => summary.HighSwitchCaseCount,
            MetricInspectionKind.CatchQuality => summary.EmptyCatchFunctionCount + summary.BroadCatchFunctionCount,
            MetricInspectionKind.AsyncVoid => summary.AsyncVoidCount,
            MetricInspectionKind.PossiblyUnusedCode => summary.PossiblyUnusedCount,
            MetricInspectionKind.PublicApiDensity => summary.HighPublicApiFileCount,
            MetricInspectionKind.TestCodeRatio => files.Where(file => file.IsTestFile).Sum(file => file.CodeLines),
            MetricInspectionKind.PackageInstability => summary.HighInstabilityPackageCount,
            MetricInspectionKind.LayerViolation => summary.LayerViolationCount,
            MetricInspectionKind.TypeCohesion => summary.LowCohesionTypeCount,
            MetricInspectionKind.InheritanceDepth => summary.DeepInheritanceTypeCount,
            MetricInspectionKind.GitHotspot => summary.GitHotspotFileCount,
            MetricInspectionKind.SecuritySmells => summary.SecuritySmellFileCount,
            MetricInspectionKind.HalsteadMetrics => functions.Count(func =>
                func.HalsteadVolume > 0 || func.WeightedMethodComplexity > 0),

            _ => 0
        };
    }

    private static int CountArchitectureDetails(AnalysisResult analysis)
    {
        var thresholds = analysis.QualityThresholds;
        return ArchitectureMetricsBuilder.BuildInsights(
                analysis.Metrics,
                analysis.CallGraph,
                analysis.FileRelations,
                analysis.DirectoryRelations,
                analysis.Structure,
                analysis.Duplicates,
                thresholds,
                analysis.GlobalVariables,
                analysis.DatabaseSchema)
            .Count(insight => !insight.IsCategorySummary);
    }

    private static int CountGodTypes(AnalysisResult analysis)
    {
        if (analysis.Structure.Types.Count == 0)
        {
            return 0;
        }

        var thresholds = analysis.QualityThresholds;
        return TypeMetricsBuilder.Build(analysis.Structure, analysis.Metrics.Functions, thresholds)
            .Count(type => type.MemberCount + type.OperationCount >= thresholds.WarnGodTypeMemberCount);
    }

    private static int CountFilesWithDuplicateLines(CodeMetricsResult metrics, DuplicateCodeResult duplicates)
    {
        if (metrics.FileAggregates.Count > 0)
        {
            return metrics.FileAggregates.Count(file => file.DuplicateLineCount > 0);
        }

        if (duplicates.Groups.Count == 0)
        {
            return 0;
        }

        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var group in duplicates.Groups)
        {
            foreach (var fragment in group.Fragments)
            {
                paths.Add(fragment.FilePath);
            }
        }

        return paths.Count;
    }
}
