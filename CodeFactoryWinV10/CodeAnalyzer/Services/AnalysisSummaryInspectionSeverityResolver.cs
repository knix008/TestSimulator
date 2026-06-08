using CodeAnalyzer.Models;
using CodeAnalyzer.Services.Metrics;

namespace CodeAnalyzer.Services;

public enum InspectionPieSeverity
{
    /// <summary>검출 없음·정상 — 무색.</summary>
    Neutral,
    /// <summary>정보·규모 표시 — 파랑.</summary>
    Info,
    /// <summary>주의 필요 — 노랑.</summary>
    Warning,
    /// <summary>즉시 조치 권장 — 빨강.</summary>
    Critical
}

/// <summary>분석 항목 파이 슬라이스의 심각도(색상) 판정.</summary>
public static class AnalysisSummaryInspectionSeverityResolver
{
    public static InspectionPieSeverity Resolve(
        MetricInspectionKind kind,
        double value,
        AnalysisResult analysis)
    {
        if (IsInformationalKind(kind))
        {
            return InspectionPieSeverity.Info;
        }

        if (value <= 0)
        {
            return InspectionPieSeverity.Neutral;
        }

        return CountCritical(kind, analysis) > 0
            ? InspectionPieSeverity.Critical
            : InspectionPieSeverity.Warning;
    }

    private static bool IsInformationalKind(MetricInspectionKind kind) =>
        kind is MetricInspectionKind.ShowFilesTab
            or MetricInspectionKind.ShowFunctionsTab
            or MetricInspectionKind.ShowTypesTab
            or MetricInspectionKind.ShowPackagesTab
            or MetricInspectionKind.ShowArchitectureTab
            or MetricInspectionKind.ShowInformationSecurityTab
            or MetricInspectionKind.TypeStructure
            or MetricInspectionKind.GlobalVariables
            or MetricInspectionKind.DatabaseSchema
            or MetricInspectionKind.HalsteadMetrics
            or MetricInspectionKind.FileCoupling
            or MetricInspectionKind.DirectoryCoupling
            or MetricInspectionKind.FanInHub;

    private static int CountCritical(MetricInspectionKind kind, AnalysisResult analysis)
    {
        var metrics = analysis.Metrics;
        var functions = metrics.Functions;
        var files = metrics.Files;
        var thresholds = analysis.QualityThresholds;
        var t = thresholds;

        return kind switch
        {
            MetricInspectionKind.CyclomaticComplexity => functions.Count(func =>
                func.CyclomaticComplexity >= t.WarnCyclomaticComplexity * 2),
            MetricInspectionKind.CognitiveComplexity => functions.Count(func =>
                func.CognitiveComplexity >= t.WarnCognitiveComplexity * 2),
            MetricInspectionKind.NestingDepth => functions.Count(func =>
                func.MaxNestingDepth >= t.WarnMaxNestingDepth * 2),
            MetricInspectionKind.ParameterCount => functions.Count(func =>
                func.ParameterCount >= t.WarnParameterCount + 5),
            MetricInspectionKind.ReturnCount => functions.Count(func =>
                func.ReturnCount >= t.WarnReturnCount * 2),
            MetricInspectionKind.MagicNumbers => functions.Count(func =>
                func.MagicNumberCount >= t.WarnMagicNumbers * 3),
            MetricInspectionKind.FanOut => functions.Count(func =>
                func.FanOut >= t.WarnFanOut * 2),
            MetricInspectionKind.MaintenanceIndex => functions.Count(func =>
                func.MaintenanceIndex < t.WarnMaintenanceIndex * 0.6),
            MetricInspectionKind.StatementCount => functions.Count(func =>
                func.StatementCount >= t.WarnStatementCount * 2),
            MetricInspectionKind.SwitchCaseCount => functions.Count(func =>
                func.SwitchCaseCount >= t.WarnSwitchCaseCount * 2),
            MetricInspectionKind.CatchQuality => functions.Count(func =>
                func.EmptyCatchCount > 0 || func.BroadCatchCount > 0),
            MetricInspectionKind.AsyncVoid => functions.Count(func => func.IsAsyncVoid),
            MetricInspectionKind.PossiblyUnusedCode => functions.Count(func =>
                func.IsPossiblyUnused && FileMetricsAggregator.GetFunctionWarningLevel(func, t) == WarningLevel.Critical),

            MetricInspectionKind.TodoDensity => files.Count(file =>
                file.TodoDensityPer100Lines >= t.WarnTodoDensityPer100Lines * 3),
            MetricInspectionKind.GodFile => CountFiles(metrics, thresholds)
                .Count(file => file.CodeLines >= t.WarnGodFileCodeLines * 2),
            MetricInspectionKind.LowCommentRatio => files.Count(file =>
                file.CodeLines >= FileMetricsAggregator.MinCodeLinesForCommentWarning
                && file.CommentPercentPer100Code < t.WarnMinCommentPercent * 0.5),
            MetricInspectionKind.FileDuplicateLines => CountFiles(metrics, thresholds)
                .Count(file => file.DuplicateLineCount >= 50),
            MetricInspectionKind.PublicApiDensity => CountFiles(metrics, thresholds)
                .Count(file => file.PublicApiCount >= t.WarnPublicApiCount * 2),
            MetricInspectionKind.SecuritySmells => analysis.Security.Findings.Count > 0
                ? analysis.Security.Findings.Count(f => f.Severity == SecuritySeverity.Critical)
                : files.Count(file => file.SecuritySmellCount >= t.WarnSecuritySmellCount * 2),
            MetricInspectionKind.GitHotspot => files.Count(file =>
                file.GitChangeLineCount >= t.WarnGitChangeLines * 2),

            MetricInspectionKind.GodType => CountGodTypes(analysis)
                .Count(type => type.MemberCount + type.OperationCount >= t.WarnGodTypeMemberCount * 2),
            MetricInspectionKind.TypeCohesion => CountGodTypes(analysis)
                .Count(type => type.LackOfCohesion >= t.WarnLackOfCohesion * 1.5),
            MetricInspectionKind.InheritanceDepth => CountGodTypes(analysis)
                .Count(type => type.DepthOfInheritance >= t.WarnInheritanceDepth * 2),

            MetricInspectionKind.CircularCalls => analysis.Metrics.Summary.CircularCallChainCount >= 3 ? 1 : 0,
            MetricInspectionKind.FanOutHub => functions.Count(func => func.FanOut >= t.WarnFanOut * 2),
            MetricInspectionKind.IsolatedFunctions => functions.Count(func =>
                func.FanIn == 0 && func.FanOut == 0 && func.CyclomaticComplexity >= t.WarnCyclomaticComplexity),
            MetricInspectionKind.DuplicateCodeGroups => analysis.Duplicates.Groups.Count(group =>
                group.LineCount >= t.MinDuplicateLines * 3),
            MetricInspectionKind.PackageInstability => metrics.Packages.Count(pkg =>
                pkg.Instability >= Math.Min(0.95, t.WarnInstability + 0.2)),
            MetricInspectionKind.LayerViolation => analysis.Metrics.Summary.LayerViolationCount >= 5 ? 1 : 0,
            MetricInspectionKind.TestCodeRatio => analysis.Metrics.Summary.TestCodeLinePercent
                < t.WarnMinTestCodePercent * 0.5 ? 1 : 0,

            MetricInspectionKind.ShowArchitectureTab or _ => CountCriticalInsights(analysis)
        };
    }

    private static int CountCriticalInsights(AnalysisResult analysis) =>
        ArchitectureMetricsBuilder.BuildInsights(
                analysis.Metrics,
                analysis.CallGraph,
                analysis.FileRelations,
                analysis.DirectoryRelations,
                analysis.Structure,
                analysis.Duplicates,
                analysis.QualityThresholds,
                analysis.GlobalVariables,
                analysis.DatabaseSchema)
            .Count(insight => !insight.IsCategorySummary && insight.Severity == WarningLevel.Critical);

    private static IReadOnlyList<FileAggregateMetric> CountFiles(
        CodeMetricsResult metrics,
        UserAnalysisSettings thresholds)
    {
        if (metrics.FileAggregates.Count > 0)
        {
            return metrics.FileAggregates;
        }

        return metrics.Files.Select(file => new FileAggregateMetric
        {
            FilePath = file.FilePath,
            LanguageId = file.LanguageId,
            PhysicalLines = file.PhysicalLines,
            CodeLines = file.CodeLines,
            TodoMarkerCount = file.TodoMarkerCount,
            TodoDensityPer100Lines = file.TodoDensityPer100Lines,
            FunctionCount = 0,
            MinMaintenanceIndex = 100,
            CommentPercentPer100Code = file.CommentPercentPer100Code,
            PublicApiCount = file.PublicApiCount,
            SecuritySmellCount = file.SecuritySmellCount,
            GitChangeLineCount = file.GitChangeLineCount
        }).ToList();
    }

    private static IReadOnlyList<TypeMetric> CountGodTypes(AnalysisResult analysis)
    {
        if (analysis.Structure.Types.Count == 0)
        {
            return [];
        }

        return TypeMetricsBuilder.Build(
            analysis.Structure,
            analysis.Metrics.Functions,
            analysis.QualityThresholds);
    }
}
