using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Metrics;

public static class CodeMetricsBuilder
{
    public static CodeMetricsResult Build(
        IReadOnlyList<FileLineMetric> fileMetrics,
        IReadOnlyList<FunctionMetric> functionMetrics)
    {
        var fileMap = fileMetrics
            .GroupBy(file => file.FilePath, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

        var dedupedFunctions = functionMetrics
            .GroupBy(func => func.Id, StringComparer.Ordinal)
            .Select(group => PickPreferredFunction(group))
            .OrderBy(func => func.FilePath, StringComparer.OrdinalIgnoreCase)
            .ThenBy(func => func.StartLine)
            .ToList();

        var functionMap = dedupedFunctions.ToDictionary(func => func.Id, StringComparer.Ordinal);

        return new CodeMetricsResult
        {
            Files = fileMetrics.OrderBy(file => file.FilePath, StringComparer.OrdinalIgnoreCase).ToList(),
            Functions = dedupedFunctions,
            FileMap = fileMap,
            FunctionMap = functionMap
        };
    }

    private static FunctionMetric PickPreferredFunction(IGrouping<string, FunctionMetric> group)
    {
        return group
            .OrderByDescending(func => (int)func.Precision)
            .ThenByDescending(func => func.LineCount)
            .ThenByDescending(func => func.CyclomaticComplexity)
            .ThenBy(func => func.StartLine)
            .First();
    }

    public static CodeMetricsResult Merge(IEnumerable<CodeMetricsResult> results)
    {
        var files = new List<FileLineMetric>();
        var functions = new List<FunctionMetric>();

        foreach (var result in results)
        {
            files.AddRange(result.Files);
            functions.AddRange(result.Functions);
        }

        return Build(files, functions);
    }
}
