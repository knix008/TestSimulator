using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.BugRisk;

/// <summary>기존 코드 메트릭 데이터를 기반으로 버그 위험을 분석합니다.</summary>
public static class MetricsBugRiskAnalyzer
{
    public static IReadOnlyList<BugRiskFinding> Analyze(
        CodeMetricsResult metrics,
        CallGraphResult callGraph,
        UserAnalysisSettings settings)
    {
        var findings = new List<BugRiskFinding>();
        AnalyzeComplexityAndNesting(metrics, settings, findings);
        AnalyzeMagicNumbers(metrics, settings, findings);
        AnalyzePossiblyUnusedPrivates(callGraph, findings);
        return findings;
    }

    // ── 높은 복잡도 + 깊은 중첩 복합 위험 ────────────────────────────────────
    private static void AnalyzeComplexityAndNesting(
        CodeMetricsResult metrics, UserAnalysisSettings settings,
        List<BugRiskFinding> findings)
    {
        var cyclWarn = settings.WarnCyclomaticComplexity;
        var cyclCrit = cyclWarn * 2;
        var nestWarn = settings.WarnMaxNestingDepth;

        foreach (var func in metrics.Functions)
        {
            if (func.CyclomaticComplexity < cyclWarn || func.MaxNestingDepth < nestWarn)
                continue;

            var sev = func.CyclomaticComplexity >= cyclCrit
                ? BugRiskSeverity.Critical
                : BugRiskSeverity.Warning;

            findings.Add(new BugRiskFinding
            {
                Category = BugRiskCategory.HighComplexityNesting,
                Severity = sev,
                Message = $"복잡도({func.CyclomaticComplexity})와 중첩 깊이({func.MaxNestingDepth})가 모두 임계값을 초과합니다.",
                FilePath = func.FilePath,
                LineNumber = func.StartLine,
                FunctionName = func.DisplayName,
                Detail = $"사이클로매틱: {func.CyclomaticComplexity}  인지 복잡도: {func.CognitiveComplexity}" +
                         $"  최대 중첩: {func.MaxNestingDepth}  반환 횟수: {func.ReturnCount}",
                LanguageId = func.LanguageId
            });
        }
    }

    // ── 과도한 매직 넘버 ─────────────────────────────────────────────────────
    private static void AnalyzeMagicNumbers(
        CodeMetricsResult metrics, UserAnalysisSettings settings,
        List<BugRiskFinding> findings)
    {
        var threshold = Math.Max(1, settings.WarnMagicNumbers);

        foreach (var func in metrics.Functions.Where(f => f.MagicNumberCount >= threshold))
        {
            findings.Add(new BugRiskFinding
            {
                Category = BugRiskCategory.MagicNumberAbuse,
                Severity = BugRiskSeverity.Info,
                Message = $"매직 넘버 {func.MagicNumberCount}개 사용 — 명명된 상수로 교체하면 유지보수성이 향상됩니다.",
                FilePath = func.FilePath,
                LineNumber = func.StartLine,
                FunctionName = func.DisplayName,
                LanguageId = func.LanguageId
            });
        }
    }

    // ── 호출 그래프에서 참조되지 않는 함수 ──────────────────────────────────
    private static void AnalyzePossiblyUnusedPrivates(
        CallGraphResult callGraph, List<BugRiskFinding> findings)
    {
        var calledIds = new HashSet<string>(
            callGraph.Edges.Select(e => e.CalleeId),
            StringComparer.Ordinal);

        foreach (var node in callGraph.Nodes)
        {
            if (calledIds.Contains(node.Id)) continue;
            if (!LooksPrivate(node.DisplayName)) continue;
            if (IsEntryPointLike(node.DisplayName)) continue;
            if (string.IsNullOrWhiteSpace(node.FilePath)) continue;

            findings.Add(new BugRiskFinding
            {
                Category = BugRiskCategory.PossiblyUnusedPrivate,
                Severity = BugRiskSeverity.Info,
                Message = $"'{node.DisplayName}'이(가) 호출 그래프에서 참조되지 않습니다.",
                FilePath = node.FilePath,
                LineNumber = node.LineNumber,
                FunctionName = node.DisplayName,
                Detail = "진입점, 이벤트 핸들러, 또는 리플렉션으로 호출되는 함수일 수 있습니다.",
                LanguageId = string.Empty
            });
        }
    }

    private static bool LooksPrivate(string name) =>
        !string.IsNullOrEmpty(name)
        && (char.IsLower(name[0]) && name.Length > 2
            || name.StartsWith("_", StringComparison.Ordinal));

    private static bool IsEntryPointLike(string name)
    {
        if (string.IsNullOrEmpty(name)) return true;
        var lo = name.ToLowerInvariant();
        return lo is "main" or "run" or "start" or "init" or "setup" or "execute"
            || lo.StartsWith("on", StringComparison.Ordinal)
            || lo.StartsWith("handle", StringComparison.Ordinal)
            || lo.Contains("test", StringComparison.OrdinalIgnoreCase);
    }
}
