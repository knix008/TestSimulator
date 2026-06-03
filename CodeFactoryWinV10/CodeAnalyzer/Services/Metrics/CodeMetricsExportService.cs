using System.Text;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Metrics;

public static class CodeMetricsExportService
{
    public static void SaveToCsv(CodeMetricsResult metrics, string filePath)
    {
        var builder = new StringBuilder();
        builder.AppendLine("=== Functions ===");
        builder.AppendLine(
            "Language,Function,File,StartLine,EndLine,Lines,CC,Cognitive,Nesting,Parameters,Returns,FanIn,FanOut,MagicNumbers,MI,Precision");

        foreach (var func in metrics.Functions)
        {
            builder.AppendLine(string.Join(',',
                Csv(func.LanguageId),
                Csv(func.DisplayName),
                Csv(func.FilePath),
                func.StartLine,
                func.EndLine,
                func.LineCount,
                func.CyclomaticComplexity,
                func.CognitiveComplexity,
                func.MaxNestingDepth,
                func.ParameterCount,
                func.ReturnCount,
                func.FanIn,
                func.FanOut,
                func.MagicNumberCount,
                func.MaintenanceIndex.ToString("F1"),
                Csv(func.Precision.ToString())));
        }

        builder.AppendLine();
        builder.AppendLine("=== Files ===");
        builder.AppendLine(
            "Language,File,CodeLines,Functions,MaxCC,MaxCognitive,MaxNesting,MaxFanOut,MinMI,TodoCount,TodoPer100,WarningFunctions");

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

        foreach (var file in fileRows)
        {
            builder.AppendLine(string.Join(',',
                Csv(file.LanguageId),
                Csv(file.FilePath),
                file.CodeLines,
                file.FunctionCount,
                file.MaxCyclomaticComplexity,
                file.MaxCognitiveComplexity,
                file.MaxNestingDepth,
                file.MaxFanOut,
                file.MinMaintenanceIndex.ToString("F1"),
                file.TodoMarkerCount,
                file.TodoDensityPer100Lines.ToString("F1"),
                file.WarningFunctionCount));
        }

        builder.AppendLine();
        builder.AppendLine("=== Architecture ===");
        builder.AppendLine($"DuplicatePercent,{metrics.Summary.ProjectDuplicateLinePercent:F2}");
        builder.AppendLine($"CircularChains,{metrics.Summary.CircularCallChainCount}");
        foreach (var chain in metrics.Summary.CircularCallChains)
        {
            builder.AppendLine($"Cycle,{Csv(chain.DisplayText)}");
        }

        File.WriteAllText(filePath, builder.ToString(), Encoding.UTF8);
    }

    private static string Csv(string value)
    {
        if (value.Contains('"') || value.Contains(',') || value.Contains('\n'))
        {
            return $"\"{value.Replace("\"", "\"\"", StringComparison.Ordinal)}\"";
        }

        return value;
    }
}
