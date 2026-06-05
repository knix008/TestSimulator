using CodeAnalyzer.Models;
using CodeAnalyzer.Services.Metrics;
namespace CodeAnalyzer.Services.Reports;

public static class AnalysisReportBuilder
{
    private const int MaxFunctionRows = 50;
    private const int MaxFileRows = 40;
    private const int MaxDuplicateGroups = 25;
    private const int MaxCircularChains = 15;

    public static AnalysisReportDocument Build(AnalysisResult analysis, string rootDirectory)
    {
        var generatedAt = DateTime.Now;
        var root = string.IsNullOrWhiteSpace(rootDirectory) ? "(미지정)" : rootDirectory.Trim();
        var summary = analysis.Metrics.Summary;
        var thresholds = analysis.QualityThresholds;

        var sections = new List<ReportSection>
        {
            BuildOverviewSection(analysis, root, generatedAt),
            BuildQualitySection(summary, thresholds),
            BuildFunctionMetricsSection(analysis.Metrics.Functions, root, thresholds),
            BuildFileMetricsSection(analysis.Metrics, root),
            BuildDuplicateSection(analysis.Duplicates, root),
            BuildArchitectureSection(summary, analysis)
        };

        return new AnalysisReportDocument
        {
            Title = "Code Analyzer 분석 보고서",
            RootDirectory = root,
            GeneratedAt = generatedAt,
            Sections = sections,
            FooterNote =
                "본 보고서는 정적 분석 메트릭 기반 추정입니다. 목록은 상위 항목만 포함될 수 있습니다."
        };
    }

    private static ReportSection BuildOverviewSection(
        AnalysisResult analysis,
        string root,
        DateTime generatedAt)
    {
        var graph = analysis.CallGraph;
        var paragraphs = new List<string>
        {
            $"생성 시각: {generatedAt:yyyy-MM-dd HH:mm:ss}",
            $"루트 디렉터리: {root}",
            $"함수(호출 그래프): {graph.Nodes.Count:N0}개",
            $"호출 관계: {graph.Edges.Count:N0}개",
            $"분석 파일(메트릭): {analysis.Metrics.Files.Count:N0}개",
            $"메트릭 함수: {analysis.Metrics.Functions.Count:N0}개",
            $"중복 코드 그룹: {analysis.Duplicates.Groups.Count:N0}건",
            $"프로젝트 타입: {analysis.Structure.Types.Count:N0}개"
        };

        return new ReportSection
        {
            Heading = "1. 개요",
            Level = 2,
            Paragraphs = paragraphs
        };
    }

    private static ReportSection BuildQualitySection(
        CodeQualitySummary summary,
        UserAnalysisSettings thresholds)
    {
        var paragraphs = new List<string>
        {
            $"프로젝트 중복 라인 비율: {summary.ProjectDuplicateLinePercent:F1}% ({summary.DuplicateLineCount:N0} / {summary.TotalCodeLines:N0} 코드줄)",
            $"순환 호출 체인: {summary.CircularCallChainCount:N0}건",
            $"고복잡도(CC≥{thresholds.WarnCyclomaticComplexity}): {summary.HighCyclomaticCount:N0}함수",
            $"고인지복잡도(≥{thresholds.WarnCognitiveComplexity}): {summary.HighCognitiveCount:N0}함수",
            $"깊은 중첩(≥{thresholds.WarnMaxNestingDepth}): {summary.DeepNestingCount:N0}함수",
            $"높은 Fan-out(≥{thresholds.WarnFanOut}): {summary.HighFanOutCount:N0}함수",
            $"낮은 MI(<{thresholds.WarnMaintenanceIndex:F0}): {summary.LowMaintenanceIndexCount:N0}함수",
            $"다매개변수(≥{thresholds.WarnParameterCount}): {summary.HighParameterCount:N0}함수",
            $"TODO 마커 합계: {summary.TotalTodoMarkers:N0}개",
            $"다중 return(≥{thresholds.WarnReturnCount}): {summary.HighReturnCount:N0}함수",
            $"매직 넘버(≥{thresholds.WarnMagicNumbers}): {summary.HighMagicNumberCount:N0}함수",
            $"God file(≥{thresholds.WarnGodFileCodeLines:N0}줄): {summary.GodFileCount:N0}파일",
            $"주석 부족(<{thresholds.WarnMinCommentPercent:F0}%): {summary.LowCommentFileCount:N0}파일",
            $"높은 TODO 밀도 파일(≥{thresholds.WarnTodoDensityPer100Lines:F1}/100줄): {summary.HighTodoDensityFileCount:N0}개",
            $"다문장 함수(≥{thresholds.WarnStatementCount}): {summary.HighStatementCount:N0}개",
            $"다case switch(≥{thresholds.WarnSwitchCaseCount}): {summary.HighSwitchCaseCount:N0}개",
            $"빈 catch 함수: {summary.EmptyCatchFunctionCount:N0}개",
            $"광범위 catch 함수: {summary.BroadCatchFunctionCount:N0}개",
            $"async void: {summary.AsyncVoidCount:N0}개",
            $"미사용 가능 코드: {summary.PossiblyUnusedCount:N0}개",
            $"public API 과다 파일(≥{thresholds.WarnPublicApiCount}): {summary.HighPublicApiFileCount:N0}개",
            $"테스트 코드 LOC 비율(근사): {summary.TestCodeLinePercent:F1}%",
            $"보안 smell 파일: {summary.SecuritySmellFileCount:N0}개",
            $"불안정 패키지(I≥{thresholds.WarnInstability:F2}): {summary.HighInstabilityPackageCount:N0}개",
            $"Git 핫스팟 파일: {summary.GitHotspotFileCount:N0}개"
        };

        return new ReportSection
        {
            Heading = "2. 품질 요약",
            Level = 2,
            Paragraphs = paragraphs
        };
    }

    private static ReportSection BuildFunctionMetricsSection(
        IReadOnlyList<FunctionMetric> functions,
        string root,
        UserAnalysisSettings thresholds)
    {
        var rows = functions
            .OrderByDescending(func => func.CyclomaticComplexity)
            .ThenByDescending(func => func.CognitiveComplexity)
            .Take(MaxFunctionRows)
            .Select(func => new ReportTableRow
            {
                Cells =
                [
                    func.DisplayName,
                    ReportFormatting.FormatFileName(func.FilePath, root),
                    func.StartLine.ToString(),
                    func.CyclomaticComplexity.ToString(),
                    func.CognitiveComplexity.ToString(),
                    func.MaxNestingDepth.ToString(),
                    func.ParameterCount.ToString(),
                    func.FanOut.ToString(),
                    func.MaintenanceIndex.ToString("F1")
                ]
            })
            .ToList();

        return new ReportSection
        {
            Heading = "3. 함수 메트릭 (CC 상위)",
            Level = 2,
            Paragraphs =
            [
                $"전체 {functions.Count:N0}개 중 Cyclomatic 복잡도 상위 {rows.Count}개.",
                $"경고 기준: CC≥{thresholds.WarnCyclomaticComplexity}, 인지≥{thresholds.WarnCognitiveComplexity}."
            ],
            Table = new ReportTable
            {
                Headers = ["함수", "파일", "줄", "CC", "인지", "중첩", "매개", "FanOut", "MI"],
                Rows = rows
            }
        };
    }

    private static ReportSection BuildFileMetricsSection(CodeMetricsResult metrics, string root)
    {
        var fileRows = metrics.FileAggregates.Count > 0
            ? metrics.FileAggregates
            : metrics.Files.Select(file => new FileAggregateMetric
            {
                FilePath = file.FilePath,
                LanguageId = file.LanguageId,
                PhysicalLines = file.PhysicalLines,
                CodeLines = file.CodeLines,
                TodoMarkerCount = file.TodoMarkerCount,
                TodoDensityPer100Lines = file.TodoDensityPer100Lines,
                FunctionCount = 0,
                MinMaintenanceIndex = 100
            }).ToList();

        var rows = fileRows
            .OrderByDescending(file => file.MaxCyclomaticComplexity)
            .ThenByDescending(file => file.WarningFunctionCount)
            .Take(MaxFileRows)
            .Select(file => new ReportTableRow
            {
                Cells =
                [
                    ReportFormatting.FormatFileName(file.FilePath, root),
                    file.LanguageId,
                    file.CodeLines.ToString(),
                    file.FunctionCount.ToString(),
                    file.MaxCyclomaticComplexity.ToString(),
                    file.MaxCognitiveComplexity.ToString(),
                    file.MinMaintenanceIndex.ToString("F1"),
                    file.TodoMarkerCount.ToString(),
                    file.WarningFunctionCount.ToString()
                ]
            })
            .ToList();

        return new ReportSection
        {
            Heading = "4. 파일 메트릭",
            Level = 2,
            Paragraphs = [$"파일 {fileRows.Count:N0}개 중 상위 {rows.Count}개 (Max CC 기준)."],
            Table = new ReportTable
            {
                Headers = ["파일", "언어", "코드줄", "함수", "MaxCC", "Max인지", "MinMI", "TODO", "경고함수"],
                Rows = rows
            }
        };
    }

    private static ReportSection BuildDuplicateSection(DuplicateCodeResult duplicates, string root)
    {
        var rows = duplicates.Groups
            .OrderByDescending(group => group.LineCount * group.Fragments.Count)
            .Take(MaxDuplicateGroups)
            .Select(group =>
            {
                var locations = string.Join("; ",
                    group.Fragments.Take(4).Select(fragment =>
                        $"{ReportFormatting.FormatFileName(fragment.FilePath, root)}:{fragment.StartLine}-{fragment.EndLine}"));
                if (group.Fragments.Count > 4)
                {
                    locations += $" (+{group.Fragments.Count - 4})";
                }

                var sample = group.SampleLines.Count > 0
                    ? string.Join(" / ", group.SampleLines.Take(2).Select(line => Truncate(line, 60)))
                    : string.Empty;

                return new ReportTableRow
                {
                    Cells =
                    [
                        group.LineCount.ToString(),
                        group.Fragments.Count.ToString(),
                        locations,
                        sample
                    ]
                };
            })
            .ToList();

        return new ReportSection
        {
            Heading = "5. 중복 코드",
            Level = 2,
            Paragraphs =
            [
                $"최소 연속 줄 수: {duplicates.MinDuplicateLines}",
                $"그룹 {duplicates.Groups.Count:N0}건 중 상위 {rows.Count}건 표시."
            ],
            Table = rows.Count > 0
                ? new ReportTable
                {
                    Headers = ["줄수", "위치수", "위치", "샘플"],
                    Rows = rows
                }
                : null
        };
    }

    private static ReportSection BuildArchitectureSection(CodeQualitySummary summary, AnalysisResult analysis)
    {
        var rows = summary.CircularCallChains
            .Take(MaxCircularChains)
            .Select(chain => new ReportTableRow
            {
                Cells = [chain.DisplayText]
            })
            .ToList();

        var paragraphs = new List<string>
        {
            $"프로젝트 중복률: {summary.ProjectDuplicateLinePercent:F2}%",
            $"순환 호출: {summary.CircularCallChainCount}건"
        };

        ReportTable? table = null;
        if (rows.Count > 0)
        {
            table = new ReportTable
            {
                Headers = ["순환 호출 체인"],
                Rows = rows
            };
        }

        paragraphs.Add(
            $"파일 연관: {analysis.FileRelations.Files.Count}파일, {analysis.FileRelations.Edges.Count}엣지 · " +
            $"디렉터리: {analysis.DirectoryRelations.Directories.Count}개");

        return new ReportSection
        {
            Heading = "6. 아키텍처",
            Level = 2,
            Paragraphs = paragraphs,
            Table = table
        };
    }

    private static string Truncate(string value, int maxLength)
    {
        if (value.Length <= maxLength)
        {
            return value;
        }

        return value[..maxLength] + "…";
    }
}
