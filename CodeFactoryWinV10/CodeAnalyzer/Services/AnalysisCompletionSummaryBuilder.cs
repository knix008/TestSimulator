using System.Text;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services.Metrics;

namespace CodeAnalyzer.Services;

public sealed record AnalysisCompletionSummary(
    string SummaryMessage,
    string DetailText,
    string DisplayText);

public static class AnalysisCompletionSummaryBuilder
{
    public static AnalysisCompletionSummary Build(
        AnalysisResult result,
        int directoryCount,
        int fileCount,
        TimeSpan elapsed,
        string? rootDirectory = null)
    {
        var inspections = result.QualityThresholds.EnabledInspections;
        var metrics = result.Metrics;
        var summary = metrics.Summary;
        var issueNote = result.Issues.Count > 0
            ? $"{Environment.NewLine}{Environment.NewLine}주의: {result.Issues.Count}개 단계에서 오류가 발생했습니다. 일부 결과만 포함될 수 있습니다."
            : string.Empty;

        var summaryMessage = BuildSummaryMessage(
            result,
            inspections,
            directoryCount,
            fileCount,
            elapsed,
            issueNote);

        var detailText = BuildDetailText(
            result,
            inspections,
            directoryCount,
            fileCount,
            elapsed,
            rootDirectory).TrimEnd();

        var displayText = string.IsNullOrWhiteSpace(detailText)
            ? summaryMessage
            : $"{summaryMessage}{Environment.NewLine}{Environment.NewLine}{detailText}";

        return new AnalysisCompletionSummary(summaryMessage, detailText, displayText);
    }

    private static string BuildSummaryMessage(
        AnalysisResult result,
        MetricInspectionKind inspections,
        int directoryCount,
        int fileCount,
        TimeSpan elapsed,
        string issueNote)
    {
        var builder = new StringBuilder();
        builder.Append("분석이 완료되었습니다.");
        builder.Append(issueNote);
        builder.AppendLine();
        builder.AppendLine();
        builder.AppendLine($"소요 시간: {AnalysisProgressFormatter.FormatDuration(elapsed)}");
        builder.AppendLine($"스캔: 폴더 {directoryCount:N0}개 · 파일 {fileCount:N0}개");

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Overview, inspections))
        {
            var overviewParts = new List<string>
            {
                $"품질 점수 {AnalysisSummaryRadarBuilder.ComputeAverageScore(result, inspections):0.#}점"
            };

            if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.BugRisk, inspections))
            {
                overviewParts.Add($"버그 위험 {result.BugRisk.Findings.Count:N0}건");
            }

            if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Security, inspections))
            {
                overviewParts.Add($"보안 {result.Security.Findings.Count:N0}건");
            }

            builder.AppendLine(string.Join(" · ", overviewParts));
        }

        var resultParts = new List<string>();

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.CallGraph, inspections))
        {
            resultParts.Add($"함수 {result.CallGraph.Nodes.Count:N0}개");
            resultParts.Add($"호출 {result.CallGraph.Edges.Count:N0}개");
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Quality, inspections))
        {
            resultParts.Add($"메트릭 {result.Metrics.Functions.Count:N0}개");
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Duplicates, inspections))
        {
            resultParts.Add($"중복 {result.Duplicates.Groups.Count:N0}건");
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Globals, inspections))
        {
            resultParts.Add(
                $"전역 변수 {result.GlobalVariables.Variables.Count:N0}개" +
                $"(접근 {result.GlobalVariables.Accesses.Count:N0}건)");
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Database, inspections))
        {
            resultParts.Add($"DB {result.DatabaseSchema.Catalogs.Count:N0}개");
            resultParts.Add($"테이블 접근 {result.DatabaseSchema.Accesses.Count:N0}건");
            if (result.DatabaseSchema.ColumnAccesses.Count > 0)
            {
                resultParts.Add($"필드 접근 {result.DatabaseSchema.ColumnAccesses.Count:N0}건");
            }
        }

        if (resultParts.Count > 0)
        {
            builder.AppendLine(string.Join(" · ", resultParts));
        }

        return builder.ToString().TrimEnd();
    }

    private static string BuildDetailText(
        AnalysisResult result,
        MetricInspectionKind inspections,
        int directoryCount,
        int fileCount,
        TimeSpan elapsed,
        string? rootDirectory)
    {
        var metrics = result.Metrics;
        var summary = metrics.Summary;
        var builder = new StringBuilder();

        if (!string.IsNullOrWhiteSpace(rootDirectory))
        {
            builder.AppendLine("분석 루트");
            builder.AppendLine(rootDirectory.Trim());
            builder.AppendLine();
        }

        builder.AppendLine("소요 시간");
        builder.AppendLine(AnalysisProgressFormatter.FormatDuration(elapsed));
        builder.AppendLine();

        builder.AppendLine("스캔 범위");
        builder.AppendLine($"  폴더: {directoryCount:N0}개");
        builder.AppendLine($"  파일: {fileCount:N0}개");
        builder.AppendLine();

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Overview, inspections))
        {
            builder.AppendLine("품질 총괄");
            builder.AppendLine($"  품질 점수: {AnalysisSummaryRadarBuilder.ComputeAverageScore(result, inspections):0.#}점");

            if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Quality, inspections))
            {
                var (none, warn, critical) = CountFunctionWarningLevels(result);
                builder.AppendLine($"  정상 함수: {none:N0}개 · 경고 {warn:N0}개 · 심각 {critical:N0}개");
            }

            if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.BugRisk, inspections))
            {
                AppendSeverityCounts(
                    builder,
                    "버그 위험",
                    result.BugRisk.Findings.Count,
                    result.BugRisk.Findings.Count(f => f.Severity == BugRiskSeverity.Critical),
                    result.BugRisk.Findings.Count(f => f.Severity == BugRiskSeverity.Warning),
                    result.BugRisk.Findings.Count(f => f.Severity == BugRiskSeverity.Info));
            }

            if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Security, inspections))
            {
                AppendSeverityCounts(
                    builder,
                    "보안 검출",
                    result.Security.Findings.Count,
                    result.Security.Findings.Count(f => f.Severity == SecuritySeverity.Critical),
                    result.Security.Findings.Count(f => f.Severity == SecuritySeverity.Warning),
                    result.Security.Findings.Count(f => f.Severity == SecuritySeverity.Info),
                    $" · 영향 파일 {result.Security.ByFile.Count:N0}개");
            }

            builder.AppendLine();
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.CallGraph, inspections))
        {
            builder.AppendLine("호출 그래프");
            builder.AppendLine($"  함수(노드): {result.CallGraph.Nodes.Count:N0}개");
            builder.AppendLine($"  호출(엣지): {result.CallGraph.Edges.Count:N0}개");
            builder.AppendLine();
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Quality, inspections))
        {
            builder.AppendLine("코드 메트릭");
            builder.AppendLine($"  분석 함수: {metrics.Functions.Count:N0}개");
            builder.AppendLine($"  코드 줄: {summary.TotalCodeLines:N0}줄");
            builder.AppendLine($"  메트릭 파일: {metrics.Files.Count:N0}개");
            if (metrics.FileAggregates.Count > 0)
            {
                builder.AppendLine($"  파일 집계: {metrics.FileAggregates.Count:N0}개");
            }

            if (metrics.Packages.Count > 0)
            {
                builder.AppendLine($"  패키지: {metrics.Packages.Count:N0}개");
            }

            builder.AppendLine();
            builder.AppendLine("품질 요약");
            builder.AppendLine($"  프로젝트 중복률: {summary.ProjectDuplicateLinePercent:F1}% ({summary.DuplicateLineCount:N0}줄)");
            builder.AppendLine($"  순환 호출: {summary.CircularCallChainCount:N0}건");
            builder.AppendLine($"  TODO 표식: {summary.TotalTodoMarkers:N0}개");
            builder.AppendLine($"  고복잡도(CC): {summary.HighCyclomaticCount:N0}함수");
            builder.AppendLine($"  God file: {summary.GodFileCount:N0}개");

            if (summary.GitHotspotFileCount > 0)
            {
                builder.AppendLine($"  Git hotspot 파일: {summary.GitHotspotFileCount:N0}개");
            }

            builder.AppendLine();
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Structure, inspections))
        {
            builder.AppendLine("구조");
            builder.AppendLine($"  타입: {result.Structure.Types.Count:N0}개 · 관계 {result.Structure.Relations.Count:N0}개");
            builder.AppendLine();
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Relations, inspections))
        {
            builder.AppendLine("연관");
            builder.AppendLine($"  파일 연관: {result.FileRelations.Files.Count:N0}파일 · {result.FileRelations.Edges.Count:N0}연결");
            builder.AppendLine($"  디렉터리 연관: {result.DirectoryRelations.Directories.Count:N0}개 · {result.DirectoryRelations.Edges.Count:N0}연결");
            builder.AppendLine();
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Duplicates, inspections))
        {
            builder.AppendLine("중복 코드");
            builder.AppendLine($"  그룹: {result.Duplicates.Groups.Count:N0}건 (기준 ≥{result.Duplicates.MinDuplicateLines}줄)");
            builder.AppendLine();
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Globals, inspections))
        {
            builder.AppendLine("전역 변수");
            builder.AppendLine($"  변수: {result.GlobalVariables.Variables.Count:N0}개");
            builder.AppendLine($"  접근 관계: {result.GlobalVariables.Accesses.Count:N0}건");
            builder.AppendLine(
                $"  접근 함수: {result.GlobalVariables.Accesses.Select(access => access.FunctionId).Distinct(StringComparer.Ordinal).Count():N0}개");
            builder.AppendLine();
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Database, inspections))
        {
            builder.AppendLine("DB");
            builder.AppendLine($"  인스턴스: {result.DatabaseSchema.Catalogs.Count:N0}개 · 인스턴스 접근 {result.DatabaseSchema.CatalogAccesses.Count:N0}건");
            builder.AppendLine($"  테이블: {result.DatabaseSchema.Tables.Count:N0}개 · 관계 {result.DatabaseSchema.Relations.Count:N0}개");
            builder.AppendLine($"  테이블 접근: {result.DatabaseSchema.Accesses.Count:N0}건 · 필드 접근 {result.DatabaseSchema.ColumnAccesses.Count:N0}건");
            builder.AppendLine();
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.BugRisk, inspections) && result.BugRisk.Findings.Count > 0)
        {
            builder.AppendLine("버그 · 결함");
            foreach (var group in result.BugRisk.Findings
                         .GroupBy(finding => finding.Category)
                         .OrderByDescending(g => g.Count())
                         .Take(5))
            {
                builder.AppendLine($"  · {CategoryLabel(group.Key)}: {group.Count():N0}건");
            }

            builder.AppendLine();
        }

        if (AnalysisSummaryScope.IsIncluded(SummaryAreaKind.Security, inspections) && result.Security.Findings.Count > 0)
        {
            builder.AppendLine("정보 보호 · 보안");
            foreach (var group in result.Security.Findings
                         .GroupBy(finding => finding.RuleId, StringComparer.OrdinalIgnoreCase)
                         .OrderByDescending(g => g.Count())
                         .Take(5))
            {
                builder.AppendLine($"  · {Truncate(group.First().Label, 48)}: {group.Count():N0}건");
            }

            builder.AppendLine();
        }

        if (result.Issues.Count > 0)
        {
            builder.AppendLine($"분석 중 오류 ({result.Issues.Count}건)");
            foreach (var issue in result.Issues)
            {
                builder.AppendLine($"  · [{issue.Stage}] {issue.Message}");
            }
        }

        return builder.ToString();
    }

    private static void AppendSeverityCounts(
        StringBuilder builder,
        string label,
        int total,
        int critical,
        int warning,
        int info,
        string? suffix = null)
    {
        builder.AppendLine(
            $"  {label}: {total:N0}건 · Critical {critical:N0} · Warning {warning:N0} · Info {info:N0}{suffix}");
    }

    private static (int None, int Warn, int Critical) CountFunctionWarningLevels(AnalysisResult analysis)
    {
        var thresholds = analysis.QualityThresholds;
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

        return (none, warn, critical);
    }

    private static string CategoryLabel(BugRiskCategory category) => category switch
    {
        BugRiskCategory.LintViolation => "Lint",
        BugRiskCategory.PossiblyUnusedPrivate => "미사용",
        BugRiskCategory.HighComplexityNesting => "복잡·중첩",
        BugRiskCategory.ExceptionSwallowing => "예외 무음",
        BugRiskCategory.ResourceLeak => "리소스 누수",
        BugRiskCategory.UnusedVariable => "미사용 변수",
        _ => category.ToString()
    };

    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..(maxLength - 1)] + "…";
}
