using CodeAnalyzer.Models;

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
        var metrics = result.Metrics;
        var summary = metrics.Summary;
        var issueNote = result.Issues.Count > 0
            ? $"{Environment.NewLine}{Environment.NewLine}주의: {result.Issues.Count}개 단계에서 오류가 발생했습니다. 일부 결과만 포함될 수 있습니다."
            : string.Empty;

        var summaryMessage =
            $"분석이 완료되었습니다.{issueNote}{Environment.NewLine}{Environment.NewLine}" +
            $"소요 시간: {AnalysisProgressFormatter.FormatDuration(elapsed)}{Environment.NewLine}" +
            $"스캔: 폴더 {directoryCount:N0}개 · 파일 {fileCount:N0}개{Environment.NewLine}" +
            $"함수 {result.CallGraph.Nodes.Count:N0}개 · 호출 {result.CallGraph.Edges.Count:N0}개 · " +
            $"메트릭 {metrics.Functions.Count:N0}개 · 중복 {result.Duplicates.Groups.Count:N0}건";

        var builder = new System.Text.StringBuilder();
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

        builder.AppendLine("호출 그래프");
        builder.AppendLine($"  함수(노드): {result.CallGraph.Nodes.Count:N0}개");
        builder.AppendLine($"  호출(엣지): {result.CallGraph.Edges.Count:N0}개");
        builder.AppendLine();

        builder.AppendLine("코드 메트릭");
        builder.AppendLine($"  분석 함수: {metrics.Functions.Count:N0}개");
        builder.AppendLine($"  코드 줄: {summary.TotalCodeLines:N0}줄");
        builder.AppendLine($"  메트릭 파일: {metrics.Files.Count:N0}개");
        if (metrics.FileAggregates.Count > 0)
        {
            builder.AppendLine($"  파일 집계: {metrics.FileAggregates.Count:N0}개");
        }

        builder.AppendLine();
        builder.AppendLine("품질 요약");
        builder.AppendLine($"  프로젝트 중복률: {summary.ProjectDuplicateLinePercent:F1}% ({summary.DuplicateLineCount:N0}줄)");
        builder.AppendLine($"  순환 호출: {summary.CircularCallChainCount:N0}건");
        builder.AppendLine($"  TODO 표식: {summary.TotalTodoMarkers:N0}개");
        builder.AppendLine($"  고복잡도(CC): {summary.HighCyclomaticCount:N0}함수");
        builder.AppendLine($"  God file: {summary.GodFileCount:N0}개");

        builder.AppendLine();
        builder.AppendLine("구조·연관");
        builder.AppendLine($"  타입: {result.Structure.Types.Count:N0}개 · 관계 {result.Structure.Relations.Count:N0}개");
        builder.AppendLine($"  파일 연관: {result.FileRelations.Files.Count:N0}파일 · {result.FileRelations.Edges.Count:N0}연결");
        builder.AppendLine($"  디렉터리 연관: {result.DirectoryRelations.Directories.Count:N0}개 · {result.DirectoryRelations.Edges.Count:N0}연결");

        builder.AppendLine();
        builder.AppendLine("기타");
        builder.AppendLine($"  중복 코드 그룹: {result.Duplicates.Groups.Count:N0}건 (기준 ≥{result.Duplicates.MinDuplicateLines}줄)");
        builder.AppendLine($"  전역 변수: {result.GlobalVariables.Variables.Count:N0}개");
        builder.AppendLine($"  DB 테이블: {result.DatabaseSchema.Tables.Count:N0}개 · 관계 {result.DatabaseSchema.Relations.Count:N0}개");

        if (result.Issues.Count > 0)
        {
            builder.AppendLine();
            builder.AppendLine($"분석 중 오류 ({result.Issues.Count}건)");
            foreach (var issue in result.Issues)
            {
                builder.AppendLine($"  · [{issue.Stage}] {issue.Message}");
            }
        }

        var detailText = builder.ToString().TrimEnd();
        var displayText = string.IsNullOrWhiteSpace(detailText)
            ? summaryMessage
            : $"{summaryMessage}{Environment.NewLine}{Environment.NewLine}{detailText}";

        return new AnalysisCompletionSummary(summaryMessage, detailText, displayText);
    }
}
