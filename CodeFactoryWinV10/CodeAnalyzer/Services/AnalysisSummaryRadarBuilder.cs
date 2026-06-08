using CodeAnalyzer.Models;
using CodeAnalyzer.Services.Metrics;

namespace CodeAnalyzer.Services;

internal static class AnalysisSummaryRadarBuilder
{
    public static float ComputeAverageScore(AnalysisResult analysis, MetricInspectionKind inspections)
    {
        var axes = Build(analysis, inspections);
        return axes.Count == 0 ? 100f : (float)axes.Average(axis => axis.Score);
    }

    public static IReadOnlyList<AnalysisSummaryRadarAxis> Build(AnalysisResult analysis, MetricInspectionKind inspections)
    {
        var axes = new List<AnalysisSummaryRadarAxis>();

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.BugRisk, inspections))
        {
            axes.Add(Axis(
                "결함·버그 예방",
                "잠재 버그·코드 결함·Lint 위반",
                ScoreDefectPrevention(analysis)));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Quality, inspections))
        {
            axes.Add(Axis(
                "복잡도·유지보수",
                "함수 복잡도·경고·유지보수 지수",
                ScoreMaintainability(analysis)));
            axes.Add(Axis(
                "견고성·보안",
                "예외 처리·보안 smell·async void",
                ScoreRobustness(analysis)));
            axes.Add(Axis(
                "테스트·문서화",
                "테스트 코드 비율·주석·TODO",
                ScoreTestAndDocumentation(analysis)));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.CallGraph, inspections))
        {
            axes.Add(Axis(
                "호출·구조 안정성",
                "순환 호출·Fan-out·미사용·God file",
                ScoreCallStability(analysis)));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Duplicates, inspections))
        {
            axes.Add(Axis(
                "중복·DRY",
                "중복 코드·재사용성",
                ScoreDuplicates(analysis)));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Structure, inspections))
        {
            axes.Add(Axis(
                "설계·응집도",
                "타입 응집·상속·레이어 규칙",
                ScoreDesignCohesion(analysis)));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Relations, inspections))
        {
            axes.Add(Axis(
                "모듈·결합도",
                "파일·패키지 결합·God file",
                ScoreModuleCoupling(analysis)));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Globals, inspections))
        {
            axes.Add(Axis(
                "전역 상태 관리",
                "쓰기 가능 전역·다중 접근",
                ScoreGlobals(analysis)));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Database, inspections))
        {
            axes.Add(Axis(
                "DB 참조 정합성",
                "미참조 테이블·스키마 활용",
                ScoreDatabase(analysis)));
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Security, inspections))
        {
            axes.Add(Axis(
                "정보 보호·보안",
                "보안 smell·민감 정보·취약 패턴",
                ScoreSecurity(analysis)));
        }

        return axes;
    }

    private static AnalysisSummaryRadarAxis Axis(string label, string detail, float score) =>
        new()
        {
            Label = label,
            Detail = detail,
            Score = score
        };

    private static float ScoreDefectPrevention(AnalysisResult analysis)
    {
        var result = analysis.BugRisk;
        var critical = result.Findings.Count(f => f.Severity == BugRiskSeverity.Critical);
        var warning = result.Findings.Count(f => f.Severity == BugRiskSeverity.Warning);
        var info = result.Findings.Count(f => f.Severity == BugRiskSeverity.Info);
        return ClampScore(100f - critical * 12f - warning * 4f - info * 0.8f);
    }

    private static float ScoreMaintainability(AnalysisResult analysis)
    {
        var thresholds = analysis.QualityThresholds;
        var total = analysis.Metrics.Functions.Count;
        if (total == 0)
        {
            return 100f;
        }

        var none = 0;
        var warn = 0;
        var critical = 0;
        foreach (var function in analysis.Metrics.Functions)
        {
            switch (FileMetricsAggregator.GetFunctionWarningLevel(function, thresholds))
            {
                case WarningLevel.Critical:
                    critical++;
                    break;
                case WarningLevel.Warning:
                    warn++;
                    break;
                default:
                    none++;
                    break;
            }
        }

        var summary = analysis.Metrics.Summary;
        var levelScore = (none + warn * 0.55f) / total * 100f;
        var metricPressure = (summary.HighCyclomaticCount
            + summary.HighCognitiveCount
            + summary.DeepNestingCount
            + summary.LowMaintenanceIndexCount) / (float)total;
        return ClampScore(levelScore - metricPressure * 22f - critical / (float)total * 18f);
    }

    private static float ScoreRobustness(AnalysisResult analysis)
    {
        var summary = analysis.Metrics.Summary;
        var fileCount = Math.Max(1, analysis.Metrics.Files.Count);
        var penalty = summary.SecuritySmellFileCount / (float)fileCount * 45f
            + summary.EmptyCatchFunctionCount * 4f
            + summary.BroadCatchFunctionCount * 2f
            + summary.AsyncVoidCount * 5f
            + summary.HighMagicNumberCount * 0.15f;
        return ClampScore(100f - penalty);
    }

    private static float ScoreTestAndDocumentation(AnalysisResult analysis)
    {
        var summary = analysis.Metrics.Summary;
        var fileCount = Math.Max(1, analysis.Metrics.Files.Count);
        var testScore = Math.Min(100f, (float)summary.TestCodeLinePercent * 2f);
        var commentScore = ClampScore(100f - summary.LowCommentFileCount / (float)fileCount * 55f);
        var todoPenalty = Math.Min(25f, summary.TotalTodoMarkers * 0.08f);
        return ClampScore(testScore * 0.5f + commentScore * 0.35f + (100f - todoPenalty) * 0.15f);
    }

    private static float ScoreCallStability(AnalysisResult analysis)
    {
        var summary = analysis.Metrics.Summary;
        var penalty = summary.CircularCallChainCount * 20f
            + summary.HighFanOutCount * 2.5f
            + summary.PossiblyUnusedCount * 0.9f
            + summary.GodFileCount * 6f;
        return ClampScore(100f - penalty);
    }

    private static float ScoreDuplicates(AnalysisResult analysis)
    {
        var percent = analysis.Metrics.Summary.ProjectDuplicateLinePercent;
        return ClampScore(100f - (float)percent * 2.8f);
    }

    private static float ScoreDesignCohesion(AnalysisResult analysis)
    {
        var summary = analysis.Metrics.Summary;
        var penalty = summary.LowCohesionTypeCount * 5f
            + summary.DeepInheritanceTypeCount * 4f
            + summary.LayerViolationCount * 10f;
        return ClampScore(100f - penalty);
    }

    private static float ScoreModuleCoupling(AnalysisResult analysis)
    {
        var summary = analysis.Metrics.Summary;
        var penalty = summary.HighInstabilityPackageCount * 6f + summary.GodFileCount * 5f;

        if (analysis.FileRelations.Files.Count > 0)
        {
            var avgOutCoupling = analysis.FileRelations.Files
                .Select(file => analysis.FileRelations.Edges.Count(edge =>
                    string.Equals(edge.FromFileId, file.Id, StringComparison.OrdinalIgnoreCase)))
                .Average();
            penalty += (float)avgOutCoupling * 5f;
        }

        return ClampScore(100f - penalty);
    }

    private static float ScoreGlobals(AnalysisResult analysis)
    {
        var globals = analysis.GlobalVariables;
        if (globals.Variables.Count == 0)
        {
            return 100f;
        }

        var writableVariables = globals.Variables.Count(variable =>
            globals.Accesses.Any(access =>
                string.Equals(access.GlobalVariableId, variable.Id, StringComparison.Ordinal)
                && access.Kind is GlobalVariableAccessKind.Write or GlobalVariableAccessKind.ReadWrite));
        var writableRatio = writableVariables / (float)globals.Variables.Count;
        var multiAccess = globals.Variables.Count(variable =>
            globals.Accesses
                .Where(access => string.Equals(access.GlobalVariableId, variable.Id, StringComparison.Ordinal))
                .Select(access => access.FunctionId)
                .Distinct(StringComparer.Ordinal)
                .Count() >= 3);
        var multiRatio = multiAccess / (float)globals.Variables.Count;
        return ClampScore(100f - writableRatio * 40f - multiRatio * 25f - globals.Variables.Count * 0.4f);
    }

    private static float ScoreDatabase(AnalysisResult analysis)
    {
        var schema = analysis.DatabaseSchema;
        if (schema.Tables.Count == 0)
        {
            return 100f;
        }

        var orphanTables = schema.Tables.Count(table =>
            !schema.Accesses.Any(access => string.Equals(access.TableId, table.Id, StringComparison.Ordinal)));
        var orphanRatio = orphanTables / (float)schema.Tables.Count;
        return ClampScore(100f - orphanRatio * 100f);
    }

    private static float ScoreSecurity(AnalysisResult analysis)
    {
        var result = analysis.Security;
        var critical = result.Findings.Count(f => f.Severity == SecuritySeverity.Critical);
        var warning = result.Findings.Count(f => f.Severity == SecuritySeverity.Warning);
        var info = result.Findings.Count(f => f.Severity == SecuritySeverity.Info);
        return ClampScore(100f - critical * 14f - warning * 5f - info * 1.2f);
    }

    private static float ClampScore(float value) => Math.Clamp(value, 0f, 100f);
}
