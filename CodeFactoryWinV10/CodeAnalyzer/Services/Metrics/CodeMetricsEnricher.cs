using CodeAnalyzer.Models;
using CodeAnalyzer.Services;
using CodeAnalyzer.Services.Duplicates;

namespace CodeAnalyzer.Services.Metrics;

public static class CodeMetricsEnricher
{
    public static CodeMetricsResult Enrich(
        CodeMetricsResult metrics,
        CallGraphResult callGraph,
        DuplicateCodeResult duplicates,
        UserAnalysisSettings thresholds)
    {
        if (metrics.Functions.Count > AnalysisScaleLimits.MaxFunctionsForFullEnrichment)
        {
            return EnrichLargeProject(metrics, callGraph, duplicates, thresholds);
        }

        var functions = EnrichFunctions(metrics.Functions, callGraph);
        var files = metrics.Files;
        var fileAggregates = FileMetricsAggregator.Build(files, functions, thresholds);
        var summary = BuildSummary(functions, files, callGraph, duplicates, thresholds);

        var enrichedMetrics = new CodeMetricsResult
        {
            Files = files,
            FileAggregates = fileAggregates,
            Functions = functions,
            Summary = summary,
            FileMap = metrics.FileMap,
            FunctionMap = functions
                .GroupBy(func => func.Id, StringComparer.Ordinal)
                .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal)
        };

        return enrichedMetrics;
    }

    private static CodeMetricsResult EnrichLargeProject(
        CodeMetricsResult metrics,
        CallGraphResult callGraph,
        DuplicateCodeResult duplicates,
        UserAnalysisSettings thresholds)
    {
        var functions = metrics.Functions;
        var files = metrics.Files;
        IReadOnlyList<FileAggregateMetric> fileAggregates = functions.Count > AnalysisScaleLimits.MaxFunctionsForFullEnrichment / 2
            ? []
            : FileMetricsAggregator.Build(files, functions, thresholds);
        var summary = BuildSummary(functions, files, callGraph, duplicates, thresholds);

        return new CodeMetricsResult
        {
            Files = files,
            FileAggregates = fileAggregates,
            Functions = functions,
            Summary = summary,
            FileMap = metrics.FileMap,
            FunctionMap = metrics.FunctionMap
        };
    }

    private static List<FunctionMetric> EnrichFunctions(
        IReadOnlyList<FunctionMetric> functions,
        CallGraphResult callGraph)
    {
        var result = new List<FunctionMetric>(functions.Count);

        foreach (var func in functions)
        {
            var fanIn = callGraph.Incoming.TryGetValue(func.Id, out var incoming) ? incoming.Count : 0;
            var fanOut = callGraph.Outgoing.TryGetValue(func.Id, out var outgoing) ? outgoing.Count : 0;
            var mi = FunctionComplexityMetrics.ComputeMaintenanceIndex(
                func.LineCount,
                func.CyclomaticComplexity,
                func.CognitiveComplexity,
                func.ParameterCount);

            result.Add(new FunctionMetric
            {
                Id = func.Id,
                LanguageId = func.LanguageId,
                DisplayName = func.DisplayName,
                FullName = func.FullName,
                FilePath = func.FilePath,
                StartLine = func.StartLine,
                EndLine = func.EndLine,
                LineCount = func.LineCount,
                CyclomaticComplexity = func.CyclomaticComplexity,
                CognitiveComplexity = func.CognitiveComplexity,
                MaxNestingDepth = func.MaxNestingDepth,
                ParameterCount = func.ParameterCount,
                ReturnCount = func.ReturnCount,
                FanIn = fanIn,
                FanOut = fanOut,
                MagicNumberCount = func.MagicNumberCount,
                MaintenanceIndex = mi,
                Precision = func.Precision
            });
        }

        return result;
    }

    private static CodeQualitySummary BuildSummary(
        IReadOnlyList<FunctionMetric> functions,
        IReadOnlyList<FileLineMetric> files,
        CallGraphResult callGraph,
        DuplicateCodeResult duplicates,
        UserAnalysisSettings thresholds)
    {
        var totalCodeLines = files.Sum(file => file.CodeLines);
        var duplicateLines = duplicates.Groups.Sum(group => group.LineCount * Math.Max(0, group.Fragments.Count - 1));
        var duplicatePercent = totalCodeLines > 0
            ? Math.Round(100.0 * duplicateLines / totalCodeLines, 2)
            : 0;

        var cycles = ArchitectureMetricsBuilder.FindCircularCallChains(callGraph);

        return new CodeQualitySummary
        {
            TotalCodeLines = totalCodeLines,
            DuplicateLineCount = duplicateLines,
            ProjectDuplicateLinePercent = duplicatePercent,
            CircularCallChainCount = cycles.Count,
            CircularCallChains = cycles.ToList(),
            HighCyclomaticCount = functions.Count(func => func.CyclomaticComplexity >= thresholds.WarnCyclomaticComplexity),
            HighCognitiveCount = functions.Count(func => func.CognitiveComplexity >= thresholds.WarnCognitiveComplexity),
            DeepNestingCount = functions.Count(func => func.MaxNestingDepth >= thresholds.WarnMaxNestingDepth),
            HighFanOutCount = functions.Count(func => func.FanOut >= thresholds.WarnFanOut),
            LowMaintenanceIndexCount = functions.Count(func => func.MaintenanceIndex < thresholds.WarnMaintenanceIndex),
            HighParameterCount = functions.Count(func => func.ParameterCount >= thresholds.WarnParameterCount),
            TotalTodoMarkers = files.Sum(file => file.TodoMarkerCount),
            HighTodoDensityFileCount = files.Count(file =>
                file.TodoDensityPer100Lines >= thresholds.WarnTodoDensityPer100Lines)
        };
    }
}
