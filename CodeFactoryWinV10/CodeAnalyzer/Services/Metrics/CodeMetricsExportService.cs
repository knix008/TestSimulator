using System.Text;
using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.Metrics;

public static class CodeMetricsExportService
{
    public static void SaveToCsv(CodeMetricsResult metrics, string filePath) =>
        SaveToCsv(metrics, globalVariables: null, filePath);

    public static void SaveToCsv(
        CodeMetricsResult metrics,
        GlobalVariableResult? globalVariables,
        string filePath)
    {
        var builder = new StringBuilder();
        AppendFunctionMetrics(builder, metrics);
        AppendFileMetrics(builder, metrics);
        AppendArchitectureSummary(builder, metrics);
        AppendGlobalVariables(builder, globalVariables);
        File.WriteAllText(filePath, builder.ToString(), Encoding.UTF8);
    }

    private static void AppendFunctionMetrics(StringBuilder builder, CodeMetricsResult metrics)
    {
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
    }

    private static void AppendFileMetrics(StringBuilder builder, CodeMetricsResult metrics)
    {
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
    }

    private static void AppendArchitectureSummary(StringBuilder builder, CodeMetricsResult metrics)
    {
        builder.AppendLine("=== Architecture ===");
        builder.AppendLine($"DuplicatePercent,{metrics.Summary.ProjectDuplicateLinePercent:F2}");
        builder.AppendLine($"CircularChains,{metrics.Summary.CircularCallChainCount}");
        foreach (var chain in metrics.Summary.CircularCallChains)
        {
            builder.AppendLine($"Cycle,{Csv(chain.DisplayText)}");
        }

        builder.AppendLine();
    }

    private static void AppendGlobalVariables(StringBuilder builder, GlobalVariableResult? globalVariables)
    {
        if (globalVariables is null || globalVariables.Variables.Count == 0)
        {
            return;
        }

        builder.AppendLine("=== Global Variables ===");
        builder.AppendLine(
            "Id,Name,Language,Scope,Type,ContainingScope,File,Line,AccessModifier,ReadOnly,AccessorCount");

        foreach (var variable in globalVariables.Variables)
        {
            builder.AppendLine(string.Join(',',
                Csv(variable.Id),
                Csv(variable.Name),
                Csv(variable.LanguageId),
                Csv(variable.Scope.ToString()),
                Csv(variable.TypeName),
                Csv(variable.ContainingScope),
                Csv(variable.FilePath),
                variable.LineNumber,
                Csv(variable.AccessModifier),
                variable.IsReadOnly ? "Y" : "N",
                globalVariables.GetAccessesFor(variable.Id).Count));
        }

        builder.AppendLine();
        builder.AppendLine("=== Global Variable Accesses ===");
        builder.AppendLine(
            "GlobalVariableId,GlobalVariableName,FunctionId,Function,FunctionFile,FunctionLine,AccessKind,FunctionFullName");

        foreach (var variable in globalVariables.Variables)
        {
            foreach (var access in globalVariables.GetAccessesFor(variable.Id))
            {
                builder.AppendLine(string.Join(',',
                    Csv(access.GlobalVariableId),
                    Csv(variable.Name),
                    Csv(access.FunctionId),
                    Csv(access.FunctionDisplayName),
                    Csv(access.FunctionFilePath),
                    access.FunctionLineNumber,
                    Csv(access.Kind.ToString()),
                    Csv(access.FunctionFullName)));
            }
        }
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
