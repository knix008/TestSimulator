using System.Diagnostics;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services.Duplicates;
using CodeAnalyzer.Services.Database;
using CodeAnalyzer.Services.GlobalVariables;
using CodeAnalyzer.Services.Metrics;
namespace CodeAnalyzer.Services;

public sealed class MultiLanguageCallGraphAnalyzer
{
    private readonly ProjectStructureAnalyzer _structureAnalyzer = new();
    private readonly GlobalVariableAnalyzer _globalVariableAnalyzer = new();
    private readonly DatabaseSchemaAnalyzer _databaseSchemaAnalyzer = new();

    public async Task<(AnalysisResult Result, int FileCount, int DirectoryCount)> AnalyzeAsync(
        string rootPath,
        IEnumerable<string> excludedDirectories,
        IEnumerable<string> enabledLanguageIds,
        UserAnalysisSettings qualityThresholds,
        IProgress<AnalysisProgressReport>? progress = null,
        CancellationToken cancellationToken = default)
    {
        progress?.Report(new AnalysisProgressReport
        {
            Percent = 0,
            Message = "파일 검색 중...",
            Elapsed = TimeSpan.Zero
        });

        var languageIds = enabledLanguageIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var extensions = LanguageRegistry.GetExtensions(languageIds);
        var scanStopwatch = Stopwatch.StartNew();
        var sourceFiles = new List<string>();

        foreach (var file in DirectoryScanService.GetSourceFiles(rootPath, excludedDirectories, extensions, cancellationToken))
        {
            cancellationToken.ThrowIfCancellationRequested();
            sourceFiles.Add(file);

            if (sourceFiles.Count % 200 == 0)
            {
                progress?.Report(new AnalysisProgressReport
                {
                    Percent = 0,
                    Message = $"파일 검색 중... ({sourceFiles.Count}개 발견)",
                    Elapsed = scanStopwatch.Elapsed
                });
            }
        }

        sourceFiles.Sort(StringComparer.OrdinalIgnoreCase);

        var directoryCount = sourceFiles
            .Select(path => Path.GetDirectoryName(path) ?? rootPath)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();

        if (sourceFiles.Count == 0)
        {
            progress?.Report(new AnalysisProgressReport { Percent = 100, Message = "분석할 파일이 없습니다." });
            return (new AnalysisResult(), 0, 0);
        }

        var filesByLanguage = GroupFilesByLanguage(sourceFiles, languageIds);
        var batches = BuildAnalysisBatches(filesByLanguage, languageIds);
        var metricsBatches = BuildMetricsBatches(filesByLanguage, languageIds);
        var totalSteps = CalculateTotalSteps(batches)
            + CalculateMetricsSteps(metricsBatches)
            + 7;
        var tracker = new AnalysisProgressTracker(progress, totalSteps);
        var issues = new List<AnalysisIssue>();

        tracker.Report($"{sourceFiles.Count}개 파일, {directoryCount}개 폴더 발견", stepDelta: 0);

        var results = new List<CallGraphResult>();

        foreach (var batch in batches)
        {
            cancellationToken.ThrowIfCancellationRequested();
            tracker.Report($"{batch.DisplayName} 분석 중...", stepDelta: 0);

            CallGraphResult batchResult;
            try
            {
                batchResult = await batch.Analyzer.AnalyzeAsync(batch.Files, tracker, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                RecordIssue(issues, $"{batch.DisplayName} 호출 그래프", ex);
                tracker.Report($"{batch.DisplayName} 오류 (나머지 계속): {ex.Message}", stepDelta: 0);
                batchResult = new CallGraphResult();
            }

            results.Add(batchResult);
            tracker.Report($"{batch.DisplayName} 분석 완료");
        }

        var merged = CallGraphBuilder.Merge(results);
        cancellationToken.ThrowIfCancellationRequested();
        tracker.Report("파일 간 호출 관계 집계 중...");
        var fileRelations = FileCallGraphBuilder.Build(merged);
        tracker.Report("디렉터리 간 호출 관계 집계 중...");
        var directoryRelations = DirectoryCallGraphBuilder.Build(merged);
        tracker.Report("구조(클래스·상속) 분석 중...");

        var structure = await _structureAnalyzer.AnalyzeAsync(
            filesByLanguage,
            languageIds,
            merged,
            cancellationToken).ConfigureAwait(false);

        tracker.Report("전역 변수 검색 중...");
        GlobalVariableResult globalVariables;
        try
        {
            globalVariables = await _globalVariableAnalyzer.AnalyzeAsync(
                filesByLanguage,
                languageIds,
                cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            RecordIssue(issues, "전역 변수", ex);
            tracker.Report($"전역 변수 오류 (빈 결과로 계속): {ex.Message}");
            globalVariables = new GlobalVariableResult();
        }

        tracker.Report("DB 스키마(ERD) 추출 중...");
        DatabaseSchemaResult databaseSchema;
        try
        {
            databaseSchema = await _databaseSchemaAnalyzer.AnalyzeAsync(
                sourceFiles,
                filesByLanguage,
                languageIds,
                cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            RecordIssue(issues, "DB ERD", ex);
            tracker.Report($"DB ERD 오류 (빈 결과로 계속): {ex.Message}");
            databaseSchema = new DatabaseSchemaResult();
        }

        tracker.Report("코드 메트릭(LOC·복잡도) 분석 중...");
        var fileLineMetrics = await FileLineMetricsCollector.CollectAsync(sourceFiles, cancellationToken).ConfigureAwait(false);
        var metricsResults = new List<CodeMetricsResult>();

        foreach (var batch in metricsBatches)
        {
            cancellationToken.ThrowIfCancellationRequested();
            tracker.Report($"{batch.DisplayName} 메트릭 분석 중...", stepDelta: 0);

            try
            {
                var batchMetrics = await batch.Analyzer.AnalyzeAsync(batch.Files, tracker, cancellationToken).ConfigureAwait(false);
                metricsResults.Add(batchMetrics);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                RecordIssue(issues, $"{batch.DisplayName} 메트릭", ex);
                tracker.Report($"{batch.DisplayName} 메트릭 오류 (나머지 계속): {ex.Message}", stepDelta: 0);
            }

            tracker.Report($"{batch.DisplayName} 메트릭 완료");
        }

        var mergedMetrics = CodeMetricsBuilder.Build(
            fileLineMetrics,
            metricsResults.SelectMany(result => result.Functions).ToList());

        cancellationToken.ThrowIfCancellationRequested();
        var qualitySettings = UserAnalysisSettings.CloneThresholds(qualityThresholds);
        qualitySettings.MinDuplicateLines = Math.Clamp(
            qualitySettings.MinDuplicateLines,
            UserAnalysisSettings.MinDuplicateLinesFloor,
            UserAnalysisSettings.MinDuplicateLinesCeiling);
        var minDuplicateLines = qualitySettings.MinDuplicateLines;
        DuplicateCodeResult duplicates;
        if (sourceFiles.Count > AnalysisScaleLimits.MaxSourceFilesForDuplicateDetection)
        {
            tracker.Report(
                $"중복 코드 검색 건너뜀 (파일 {sourceFiles.Count:N0}개 > {AnalysisScaleLimits.MaxSourceFilesForDuplicateDetection:N0})");
            duplicates = new DuplicateCodeResult { MinDuplicateLines = minDuplicateLines };
        }
        else
        {
            tracker.Report($"중복 코드 검색 중 (최소 {minDuplicateLines}줄)...");

            try
            {
                duplicates = await Task.Run(
                    () => DuplicateCodeAnalyzer.Analyze(sourceFiles, minDuplicateLines, cancellationToken),
                    cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                RecordIssue(issues, "중복 코드", ex);
                tracker.Report($"중복 코드 오류 (빈 결과로 계속): {ex.Message}");
                duplicates = new DuplicateCodeResult { MinDuplicateLines = minDuplicateLines };
            }
        }

        tracker.Report("품질 메트릭 집계 중...");
        CodeMetricsResult enrichedMetrics;
        try
        {
            enrichedMetrics = CodeMetricsEnricher.Enrich(mergedMetrics, merged, duplicates, qualitySettings);
        }
        catch (OutOfMemoryException ex)
        {
            ForceCompactingGc();
            RecordIssue(issues, "품질 메트릭", ex);
            tracker.Report("품질 메트릭 메모리 부족 (기본 메트릭 유지)");
            enrichedMetrics = mergedMetrics;
        }
        catch (Exception ex)
        {
            RecordIssue(issues, "품질 메트릭", ex);
            tracker.Report($"품질 메트릭 오류 (기본 유지): {ex.Message}");
            enrichedMetrics = mergedMetrics;
        }

        mergedMetrics = enrichedMetrics;

        tracker.ReportComplete(
            $"병합 완료: 함수 {merged.Nodes.Count}개, 호출 {merged.Edges.Count}개, " +
            $"파일 {fileRelations.Files.Count}개, 디렉터리 {directoryRelations.Directories.Count}개, 타입 {structure.Types.Count}개, " +
            $"메트릭 함수 {mergedMetrics.Functions.Count}개, 중복 {duplicates.Groups.Count}건, 전역 변수 {globalVariables.Variables.Count}개, DB 테이블 {databaseSchema.Tables.Count}개");

        return (new AnalysisResult
        {
            CallGraph = merged,
            FileRelations = fileRelations,
            DirectoryRelations = directoryRelations,
            Structure = structure,
            Metrics = mergedMetrics,
            Duplicates = duplicates,
            GlobalVariables = globalVariables,
            DatabaseSchema = databaseSchema,
            QualityThresholds = qualitySettings,
            Issues = issues
        }, sourceFiles.Count, directoryCount);
    }

    private static void ForceCompactingGc()
    {
        try
        {
            GC.Collect(GC.MaxGeneration, GCCollectionMode.Forced, blocking: true, compacting: true);
            GC.WaitForPendingFinalizers();
            GC.Collect(GC.MaxGeneration, GCCollectionMode.Forced, blocking: true, compacting: true);
        }
        catch
        {
            // ignore GC failures
        }
    }

    private static void RecordIssue(List<AnalysisIssue> issues, string stage, Exception exception)
    {
        issues.Add(new AnalysisIssue
        {
            Stage = stage,
            Message = exception.Message,
            Detail = ExceptionDetailFormatter.Format(exception)
        });
    }

    private static List<AnalysisBatch> BuildAnalysisBatches(
        Dictionary<string, List<string>> filesByLanguage,
        HashSet<string> languageIds)
    {
        var batches = new List<AnalysisBatch>();

        foreach (var (languageId, files) in filesByLanguage)
        {
            if (!languageIds.Contains(languageId) || files.Count == 0) continue;

            var analyzer = LanguageAnalyzerRegistry.GetAnalyzer(languageId);
            if (analyzer is null) continue;

            var displayName = LanguageRegistry.All
                .FirstOrDefault(l => l.Id.Equals(languageId, StringComparison.OrdinalIgnoreCase))
                ?.DisplayName ?? languageId;

            batches.Add(new AnalysisBatch(languageId, displayName, files, analyzer));
        }

        // Stable order: C# first (Roslyn), then VB.NET, then the rest alphabetically
        return batches
            .OrderBy(b => b.LanguageId switch { "csharp" => 0, "vbnet" => 1, _ => 2 })
            .ThenBy(b => b.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static Dictionary<string, List<string>> GroupFilesByLanguage(
        IEnumerable<string> sourceFiles,
        HashSet<string> enabledLanguageIds)
    {
        var groups = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

        foreach (var file in sourceFiles)
        {
            var language = LanguageRegistry.FindByExtension(Path.GetExtension(file));
            if (language is null || !enabledLanguageIds.Contains(language.Id)) continue;

            if (!groups.TryGetValue(language.Id, out var list))
            {
                list = [];
                groups[language.Id] = list;
            }

            list.Add(file);
        }

        return groups;
    }

    private static List<MetricsBatch> BuildMetricsBatches(
        Dictionary<string, List<string>> filesByLanguage,
        HashSet<string> languageIds)
    {
        var batches = new List<MetricsBatch>();

        foreach (var (languageId, files) in filesByLanguage)
        {
            if (!languageIds.Contains(languageId) || files.Count == 0)
            {
                continue;
            }

            var analyzer = LanguageMetricsAnalyzerRegistry.GetAnalyzer(languageId);
            if (analyzer is null)
            {
                continue;
            }

            var displayName = LanguageRegistry.All
                .FirstOrDefault(language => language.Id.Equals(languageId, StringComparison.OrdinalIgnoreCase))
                ?.DisplayName ?? languageId;

            batches.Add(new MetricsBatch(languageId, displayName, files, analyzer));
        }

        return batches
            .OrderBy(batch => batch.LanguageId switch { "csharp" => 0, "vbnet" => 1, _ => 2 })
            .ThenBy(batch => batch.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static int CalculateTotalSteps(IReadOnlyList<AnalysisBatch> batches)
    {
        var steps = 0;

        foreach (var batch in batches)
        {
            // Roslyn analyzers do two passes (parse + semantic); Tree-sitter does one
            var perFileSteps = batch.LanguageId is "csharp" or "vbnet" ? 2 : 1;
            steps += batch.Files.Count * perFileSteps;
            steps += 1;
        }

        return Math.Max(steps, 1);
    }

    private static int CalculateMetricsSteps(IReadOnlyList<MetricsBatch> batches)
    {
        var steps = 0;

        foreach (var batch in batches)
        {
            steps += batch.Files.Count;
            steps += 1;
        }

        return steps;
    }

    private sealed record AnalysisBatch(
        string LanguageId,
        string DisplayName,
        List<string> Files,
        ICallGraphAnalyzer Analyzer);

    private sealed record MetricsBatch(
        string LanguageId,
        string DisplayName,
        List<string> Files,
        ICodeMetricsAnalyzer Analyzer);
}
