using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public sealed class MultiLanguageCallGraphAnalyzer
{
    private readonly CSharpCallGraphAnalyzer _csharpAnalyzer = new();
    private readonly VisualBasicCallGraphAnalyzer _visualBasicAnalyzer = new();
    private readonly IReadOnlyList<PatternCallGraphAnalyzer> _patternAnalyzers = PatternCallGraphAnalyzer.CreateAll();

    public async Task<(CallGraphResult Result, int FileCount, int DirectoryCount)> AnalyzeAsync(
        string rootPath,
        IEnumerable<string> excludedDirectories,
        IEnumerable<string> enabledLanguageIds,
        IProgress<AnalysisProgressReport>? progress = null,
        CancellationToken cancellationToken = default)
    {
        progress?.Report(new AnalysisProgressReport { Percent = 0, Message = "파일 검색 중..." });

        var languageIds = enabledLanguageIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var extensions = LanguageRegistry.GetExtensions(languageIds);
        var sourceFiles = DirectoryScanService
            .GetSourceFiles(rootPath, excludedDirectories, extensions)
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var directoryCount = sourceFiles
            .Select(path => Path.GetDirectoryName(path) ?? rootPath)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Count();

        if (sourceFiles.Count == 0)
        {
            progress?.Report(new AnalysisProgressReport { Percent = 100, Message = "분석할 파일이 없습니다." });
            return (new CallGraphResult(), 0, 0);
        }

        var filesByLanguage = GroupFilesByLanguage(sourceFiles, languageIds);
        var batches = BuildAnalysisBatches(filesByLanguage, languageIds);
        var totalSteps = sourceFiles.Count + batches.Count;
        var tracker = new AnalysisProgressTracker(progress, totalSteps);

        tracker.Report($"{sourceFiles.Count}개 파일, {directoryCount}개 폴더 발견", stepDelta: 0);

        var results = new List<CallGraphResult>();

        foreach (var batch in batches)
        {
            cancellationToken.ThrowIfCancellationRequested();
            tracker.Report($"{batch.DisplayName} 분석 중...", stepDelta: 0);

            CallGraphResult batchResult = batch.LanguageId switch
            {
                "csharp" => await _csharpAnalyzer.AnalyzeAsync(batch.Files, tracker, cancellationToken).ConfigureAwait(false),
                "vbnet" => await _visualBasicAnalyzer.AnalyzeAsync(batch.Files, tracker, cancellationToken).ConfigureAwait(false),
                _ => await batch.PatternAnalyzer!.AnalyzeAsync(batch.Files, tracker, cancellationToken).ConfigureAwait(false)
            };

            results.Add(batchResult);
            tracker.Report($"{batch.DisplayName} 분석 완료");
        }

        var merged = CallGraphBuilder.Merge(results);
        tracker.ReportComplete($"병합 완료: 함수 {merged.Nodes.Count}개, 호출 {merged.Edges.Count}개");

        return (merged, sourceFiles.Count, directoryCount);
    }

    private List<AnalysisBatch> BuildAnalysisBatches(
        Dictionary<string, List<string>> filesByLanguage,
        HashSet<string> languageIds)
    {
        var batches = new List<AnalysisBatch>();

        if (filesByLanguage.TryGetValue("csharp", out var csharpFiles) && csharpFiles.Count > 0)
        {
            batches.Add(new AnalysisBatch("csharp", "C#", csharpFiles, null));
        }

        if (filesByLanguage.TryGetValue("vbnet", out var vbFiles) && vbFiles.Count > 0)
        {
            batches.Add(new AnalysisBatch("vbnet", "VB.NET", vbFiles, null));
        }

        foreach (var patternAnalyzer in _patternAnalyzers)
        {
            if (!languageIds.Contains(patternAnalyzer.LanguageId))
            {
                continue;
            }

            if (!filesByLanguage.TryGetValue(patternAnalyzer.LanguageId, out var files) || files.Count == 0)
            {
                continue;
            }

            var displayName = LanguageRegistry.All.First(language => language.Id == patternAnalyzer.LanguageId).DisplayName;
            batches.Add(new AnalysisBatch(patternAnalyzer.LanguageId, displayName, files, patternAnalyzer));
        }

        return batches;
    }

    private static Dictionary<string, List<string>> GroupFilesByLanguage(
        IEnumerable<string> sourceFiles,
        HashSet<string> enabledLanguageIds)
    {
        var groups = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

        foreach (var file in sourceFiles)
        {
            var language = LanguageRegistry.FindByExtension(Path.GetExtension(file));
            if (language is null || !enabledLanguageIds.Contains(language.Id))
            {
                continue;
            }

            if (!groups.TryGetValue(language.Id, out var list))
            {
                list = [];
                groups[language.Id] = list;
            }

            list.Add(file);
        }

        return groups;
    }

    private sealed record AnalysisBatch(
        string LanguageId,
        string DisplayName,
        List<string> Files,
        PatternCallGraphAnalyzer? PatternAnalyzer);
}
