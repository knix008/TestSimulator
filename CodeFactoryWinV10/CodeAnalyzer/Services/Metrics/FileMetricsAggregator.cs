using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Metrics;

public static class FileMetricsAggregator
{
    public static IReadOnlyList<FileAggregateMetric> Build(
        IReadOnlyList<FileLineMetric> files,
        IReadOnlyList<FunctionMetric> functions,
        UserAnalysisSettings thresholds)
    {
        var functionsByFile = functions
            .GroupBy(func => func.FilePath, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);

        var aggregates = new List<FileAggregateMetric>(files.Count);

        foreach (var file in files.OrderBy(f => f.FilePath, StringComparer.OrdinalIgnoreCase))
        {
            functionsByFile.TryGetValue(file.FilePath, out var fileFunctions);
            fileFunctions ??= [];

            if (fileFunctions.Count == 0)
            {
                aggregates.Add(new FileAggregateMetric
                {
                    FilePath = file.FilePath,
                    LanguageId = file.LanguageId,
                    PhysicalLines = file.PhysicalLines,
                    CodeLines = file.CodeLines,
                    TodoMarkerCount = file.TodoMarkerCount,
                    TodoDensityPer100Lines = file.TodoDensityPer100Lines,
                    FunctionCount = 0,
                    MinMaintenanceIndex = 100
                });
                continue;
            }

            aggregates.Add(new FileAggregateMetric
            {
                FilePath = file.FilePath,
                LanguageId = file.LanguageId,
                PhysicalLines = file.PhysicalLines,
                CodeLines = file.CodeLines,
                TodoMarkerCount = file.TodoMarkerCount,
                TodoDensityPer100Lines = file.TodoDensityPer100Lines,
                FunctionCount = fileFunctions.Count,
                MaxCyclomaticComplexity = fileFunctions.Max(func => func.CyclomaticComplexity),
                MaxCognitiveComplexity = fileFunctions.Max(func => func.CognitiveComplexity),
                MaxNestingDepth = fileFunctions.Max(func => func.MaxNestingDepth),
                MaxFanIn = fileFunctions.Max(func => func.FanIn),
                MaxFanOut = fileFunctions.Max(func => func.FanOut),
                AvgCyclomaticComplexity = Math.Round(fileFunctions.Average(func => func.CyclomaticComplexity), 1),
                AvgCognitiveComplexity = Math.Round(fileFunctions.Average(func => func.CognitiveComplexity), 1),
                AvgMaintenanceIndex = Math.Round(fileFunctions.Average(func => func.MaintenanceIndex), 1),
                MinMaintenanceIndex = Math.Round(fileFunctions.Min(func => func.MaintenanceIndex), 1),
                TotalMagicNumbers = fileFunctions.Sum(func => func.MagicNumberCount),
                WarningFunctionCount = fileFunctions.Count(func => ExceedsThreshold(func, thresholds))
            });
        }

        return aggregates;
    }

    public static bool ExceedsThreshold(FunctionMetric func, UserAnalysisSettings thresholds) =>
        func.CyclomaticComplexity >= thresholds.WarnCyclomaticComplexity
        || func.CognitiveComplexity >= thresholds.WarnCognitiveComplexity
        || func.MaxNestingDepth >= thresholds.WarnMaxNestingDepth
        || func.ParameterCount >= thresholds.WarnParameterCount
        || func.FanOut >= thresholds.WarnFanOut
        || func.MaintenanceIndex < thresholds.WarnMaintenanceIndex;

    public static bool ExceedsFileThreshold(FileAggregateMetric file, UserAnalysisSettings thresholds) =>
        file.MaxCyclomaticComplexity >= thresholds.WarnCyclomaticComplexity
        || file.MaxCognitiveComplexity >= thresholds.WarnCognitiveComplexity
        || file.MaxNestingDepth >= thresholds.WarnMaxNestingDepth
        || file.MaxFanOut >= thresholds.WarnFanOut
        || file.MinMaintenanceIndex < thresholds.WarnMaintenanceIndex
        || file.TodoDensityPer100Lines >= thresholds.WarnTodoDensityPer100Lines;

    public static WarningLevel GetFunctionWarningLevel(FunctionMetric func, UserAnalysisSettings t)
    {
        if (func.CyclomaticComplexity >= t.WarnCyclomaticComplexity * 2
            || func.CognitiveComplexity >= t.WarnCognitiveComplexity * 2
            || func.MaxNestingDepth >= t.WarnMaxNestingDepth * 2
            || func.ParameterCount >= t.WarnParameterCount + 5
            || func.FanOut >= t.WarnFanOut * 2
            || func.MaintenanceIndex < t.WarnMaintenanceIndex * 0.6)
            return WarningLevel.Critical;

        if (ExceedsThreshold(func, t))
            return WarningLevel.Warning;

        return WarningLevel.None;
    }

    public static WarningLevel GetFileWarningLevel(FileAggregateMetric file, UserAnalysisSettings t)
    {
        if (file.MaxCyclomaticComplexity >= t.WarnCyclomaticComplexity * 2
            || file.MaxCognitiveComplexity >= t.WarnCognitiveComplexity * 2
            || file.MaxNestingDepth >= t.WarnMaxNestingDepth * 2
            || file.MaxFanOut >= t.WarnFanOut * 2
            || file.MinMaintenanceIndex < t.WarnMaintenanceIndex * 0.6
            || file.TodoDensityPer100Lines >= t.WarnTodoDensityPer100Lines * 3)
            return WarningLevel.Critical;

        if (ExceedsFileThreshold(file, t))
            return WarningLevel.Warning;

        return WarningLevel.None;
    }
}
