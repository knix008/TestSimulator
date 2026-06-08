using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.BugRisk;

/// <summary>버그 위험 분석 오케스트레이터 — 패턴/Roslyn/메트릭 분석기를 통합합니다.</summary>
public static class BugRiskAnalyzer
{
    public static async Task<BugRiskResult> AnalyzeAsync(
        AnalysisResult partialResult,
        IReadOnlyList<string> sourceFiles,
        Dictionary<string, List<string>> filesByLanguage,
        CancellationToken cancellationToken = default)
    {
        var all = new List<BugRiskFinding>();

        // 1. 패턴 기반 분석 (모든 언어)
        try
        {
            var pf = await PatternBugRiskAnalyzer
                .AnalyzeAsync(sourceFiles, cancellationToken).ConfigureAwait(false);
            all.AddRange(pf);
        }
        catch (OperationCanceledException) { throw; }
        catch { /* best effort */ }

        // 2. Roslyn C# 구문 분석
        if (filesByLanguage.TryGetValue("csharp", out var csFiles) && csFiles.Count > 0)
        {
            try
            {
                var cf = await CSharpBugRiskAnalyzer
                    .AnalyzeAsync(csFiles, cancellationToken).ConfigureAwait(false);
                all.AddRange(cf);
            }
            catch (OperationCanceledException) { throw; }
            catch { /* best effort */ }
        }

        // 3. 기존 메트릭 기반 분석
        if (partialResult.Metrics.Functions.Count > 0)
        {
            try
            {
                var mf = MetricsBugRiskAnalyzer.Analyze(
                    partialResult.Metrics,
                    partialResult.CallGraph,
                    partialResult.QualityThresholds);
                all.AddRange(mf);
            }
            catch { /* best effort */ }
        }

        // 4. 외부 Lint 도구 (ESLint / pylint / RuboCop)
        try
        {
            var ef = await ExternalLintRunner
                .RunAsync(filesByLanguage, cancellationToken).ConfigureAwait(false);
            all.AddRange(ef);
        }
        catch (OperationCanceledException) { throw; }
        catch { /* best effort */ }

        // (카테고리, 파일, 줄) 기준 중복 제거 — 가장 높은 심각도 우선
        var deduped = all
            .GroupBy(
                f => $"{(int)f.Category}|{f.FilePath}|{f.LineNumber}",
                StringComparer.OrdinalIgnoreCase)
            .Select(g => g.OrderByDescending(f => (int)f.Severity).First());

        return BugRiskResult.FromFindings(deduped);
    }
}
