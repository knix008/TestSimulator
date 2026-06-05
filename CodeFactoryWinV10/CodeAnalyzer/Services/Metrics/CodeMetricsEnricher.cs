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
        UserAnalysisSettings thresholds,
        MetricInspectionKind inspections,
        FileRelationGraphResult? fileRelations = null,
        string? projectRoot = null,
        ProjectStructureResult? structure = null)
    {
        inspections = MetricInspectionScope.Normalize(inspections);

        if (metrics.Functions.Count > AnalysisScaleLimits.MaxFunctionsForFullEnrichment)
        {
            return EnrichLargeProject(metrics, callGraph, duplicates, thresholds, inspections, fileRelations, projectRoot, structure);
        }

        var functions = EnrichFunctions(metrics.Functions, callGraph, inspections);
        var files = metrics.Files;
        var duplicateByFile = MetricInspectionRuntime.RequiresDuplicateScan(inspections)
            ? DuplicateLinesByFileIndex.Build(duplicates)
            : null;
        var fileAggregates = FileMetricsAggregator.Build(files, functions, thresholds, duplicateByFile);
        var packages = MetricInspectionRuntime.IsInspectionEnabled(inspections, MetricInspectionKind.PackageInstability)
            && fileRelations is not null
            ? PackageMetricsBuilder.Build(fileRelations, files, projectRoot)
            : metrics.Packages;
        var summary = BuildSummary(functions, files, callGraph, duplicates, thresholds, inspections, packages, fileRelations, structure);

        return new CodeMetricsResult
        {
            Files = files,
            FileAggregates = fileAggregates,
            Functions = functions,
            Summary = summary,
            FileMap = metrics.FileMap,
            FunctionMap = functions
                .GroupBy(func => func.Id, StringComparer.Ordinal)
                .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal),
            Packages = packages
        };
    }

    private static CodeMetricsResult EnrichLargeProject(
        CodeMetricsResult metrics,
        CallGraphResult callGraph,
        DuplicateCodeResult duplicates,
        UserAnalysisSettings thresholds,
        MetricInspectionKind inspections,
        FileRelationGraphResult? fileRelations,
        string? projectRoot,
        ProjectStructureResult? structure)
    {
        var functions = metrics.Functions;
        var files = metrics.Files;
        IReadOnlyList<FileAggregateMetric> fileAggregates = functions.Count > AnalysisScaleLimits.MaxFunctionsForFullEnrichment / 2
            ? []
            : FileMetricsAggregator.Build(
                files,
                functions,
                thresholds,
                MetricInspectionRuntime.RequiresDuplicateScan(inspections)
                    ? DuplicateLinesByFileIndex.Build(duplicates)
                    : null);
        var packages = MetricInspectionRuntime.IsInspectionEnabled(inspections, MetricInspectionKind.PackageInstability)
            && fileRelations is not null
            ? PackageMetricsBuilder.Build(fileRelations, files, projectRoot)
            : metrics.Packages;
        var summary = BuildSummary(functions, files, callGraph, duplicates, thresholds, inspections, packages, fileRelations, structure);

        return new CodeMetricsResult
        {
            Files = files,
            FileAggregates = fileAggregates,
            Functions = functions,
            Summary = summary,
            FileMap = metrics.FileMap,
            FunctionMap = metrics.FunctionMap,
            Packages = packages
        };
    }

    private static List<FunctionMetric> EnrichFunctions(
        IReadOnlyList<FunctionMetric> functions,
        CallGraphResult callGraph,
        MetricInspectionKind inspections)
    {
        var enrichCallGraph = MetricInspectionRuntime.RequiresCallGraphEnrichment(inspections);
        var markUnused = MetricInspectionRuntime.IsInspectionEnabled(inspections, MetricInspectionKind.PossiblyUnusedCode);
        var result = new List<FunctionMetric>(functions.Count);

        foreach (var func in functions)
        {
            var fanIn = 0;
            var fanOut = 0;
            if (enrichCallGraph)
            {
                fanIn = callGraph.Incoming.TryGetValue(func.Id, out var incoming) ? incoming.Count : 0;
                fanOut = callGraph.Outgoing.TryGetValue(func.Id, out var outgoing) ? outgoing.Count : 0;
            }

            var mi = MetricInspectionRuntime.IsInspectionEnabled(inspections, MetricInspectionKind.MaintenanceIndex)
                ? FunctionComplexityMetrics.ComputeMaintenanceIndex(
                    func.LineCount,
                    func.CyclomaticComplexity,
                    func.CognitiveComplexity,
                    func.ParameterCount)
                : func.MaintenanceIndex;

            var enriched = new FunctionMetric
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
                Precision = func.Precision,
                StatementCount = func.StatementCount,
                SwitchCaseCount = func.SwitchCaseCount,
                EmptyCatchCount = func.EmptyCatchCount,
                BroadCatchCount = func.BroadCatchCount,
                IsAsyncVoid = func.IsAsyncVoid,
                IsPublic = func.IsPublic,
                HalsteadVolume = func.HalsteadVolume,
                WeightedMethodComplexity = func.WeightedMethodComplexity
            };

            if (markUnused)
            {
                enriched = new FunctionMetric
                {
                    Id = enriched.Id,
                    LanguageId = enriched.LanguageId,
                    DisplayName = enriched.DisplayName,
                    FullName = enriched.FullName,
                    FilePath = enriched.FilePath,
                    StartLine = enriched.StartLine,
                    EndLine = enriched.EndLine,
                    LineCount = enriched.LineCount,
                    CyclomaticComplexity = enriched.CyclomaticComplexity,
                    CognitiveComplexity = enriched.CognitiveComplexity,
                    MaxNestingDepth = enriched.MaxNestingDepth,
                    ParameterCount = enriched.ParameterCount,
                    ReturnCount = enriched.ReturnCount,
                    FanIn = enriched.FanIn,
                    FanOut = enriched.FanOut,
                    MagicNumberCount = enriched.MagicNumberCount,
                    MaintenanceIndex = enriched.MaintenanceIndex,
                    Precision = enriched.Precision,
                    StatementCount = enriched.StatementCount,
                    SwitchCaseCount = enriched.SwitchCaseCount,
                    EmptyCatchCount = enriched.EmptyCatchCount,
                    BroadCatchCount = enriched.BroadCatchCount,
                    IsAsyncVoid = enriched.IsAsyncVoid,
                    IsPublic = enriched.IsPublic,
                    IsPossiblyUnused = FunctionQualitySignals.IsPossiblyUnused(enriched),
                    HalsteadVolume = enriched.HalsteadVolume,
                    WeightedMethodComplexity = enriched.WeightedMethodComplexity
                };
            }

            result.Add(enriched);
        }

        return result;
    }

    private static CodeQualitySummary BuildSummary(
        IReadOnlyList<FunctionMetric> functions,
        IReadOnlyList<FileLineMetric> files,
        CallGraphResult callGraph,
        DuplicateCodeResult duplicates,
        UserAnalysisSettings thresholds,
        MetricInspectionKind inspections,
        IReadOnlyList<PackageMetric> packages,
        FileRelationGraphResult? fileRelations,
        ProjectStructureResult? structure)
    {
        var scope = inspections;
        var totalCodeLines = files.Sum(file => file.CodeLines);
        var testCodeLines = files.Where(file => file.IsTestFile).Sum(file => file.CodeLines);
        var testPercent = totalCodeLines > 0
            ? Math.Round(100.0 * testCodeLines / totalCodeLines, 2)
            : 0;

        var duplicateLines = 0;
        var duplicatePercent = 0.0;
        if (MetricInspectionRuntime.RequiresDuplicateScan(scope))
        {
            duplicateLines = duplicates.Groups.Sum(group => group.LineCount * Math.Max(0, group.Fragments.Count - 1));
            duplicatePercent = totalCodeLines > 0
                ? Math.Round(100.0 * duplicateLines / totalCodeLines, 2)
                : 0;
        }

        var cycles = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.CircularCalls)
            ? ArchitectureMetricsBuilder.FindCircularCallChains(callGraph)
            : [];

        return new CodeQualitySummary
        {
            TotalCodeLines = totalCodeLines,
            DuplicateLineCount = duplicateLines,
            ProjectDuplicateLinePercent = duplicatePercent,
            CircularCallChainCount = cycles.Count,
            CircularCallChains = cycles.ToList(),
            HighCyclomaticCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.CyclomaticComplexity)
                ? functions.Count(func => func.CyclomaticComplexity >= thresholds.WarnCyclomaticComplexity)
                : 0,
            HighCognitiveCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.CognitiveComplexity)
                ? functions.Count(func => func.CognitiveComplexity >= thresholds.WarnCognitiveComplexity)
                : 0,
            DeepNestingCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.NestingDepth)
                ? functions.Count(func => func.MaxNestingDepth >= thresholds.WarnMaxNestingDepth)
                : 0,
            HighFanOutCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.FanOut)
                ? functions.Count(func => func.FanOut >= thresholds.WarnFanOut)
                : 0,
            LowMaintenanceIndexCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.MaintenanceIndex)
                ? functions.Count(func => func.MaintenanceIndex < thresholds.WarnMaintenanceIndex)
                : 0,
            HighParameterCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.ParameterCount)
                ? functions.Count(func => func.ParameterCount >= thresholds.WarnParameterCount)
                : 0,
            TotalTodoMarkers = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.TodoDensity)
                ? files.Sum(file => file.TodoMarkerCount)
                : 0,
            HighTodoDensityFileCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.TodoDensity)
                ? files.Count(file => file.TodoDensityPer100Lines >= thresholds.WarnTodoDensityPer100Lines)
                : 0,
            HighReturnCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.ReturnCount)
                ? functions.Count(func => func.ReturnCount >= thresholds.WarnReturnCount)
                : 0,
            HighMagicNumberCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.MagicNumbers)
                ? functions.Count(func => func.MagicNumberCount >= thresholds.WarnMagicNumbers)
                : 0,
            GodFileCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.GodFile)
                ? files.Count(file => file.CodeLines >= thresholds.WarnGodFileCodeLines)
                : 0,
            LowCommentFileCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.LowCommentRatio)
                ? files.Count(file =>
                    file.CodeLines >= FileMetricsAggregator.MinCodeLinesForCommentWarning
                    && file.CommentPercentPer100Code < thresholds.WarnMinCommentPercent)
                : 0,
            HighStatementCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.StatementCount)
                ? functions.Count(func => func.StatementCount >= thresholds.WarnStatementCount)
                : 0,
            HighSwitchCaseCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.SwitchCaseCount)
                ? functions.Count(func => func.SwitchCaseCount >= thresholds.WarnSwitchCaseCount)
                : 0,
            EmptyCatchFunctionCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.CatchQuality)
                ? functions.Count(func => func.EmptyCatchCount > 0)
                : 0,
            BroadCatchFunctionCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.CatchQuality)
                ? functions.Count(func => func.BroadCatchCount > 0)
                : 0,
            AsyncVoidCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.AsyncVoid)
                ? functions.Count(func => func.IsAsyncVoid)
                : 0,
            PossiblyUnusedCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.PossiblyUnusedCode)
                ? functions.Count(func => func.IsPossiblyUnused)
                : 0,
            HighPublicApiFileCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.PublicApiDensity)
                ? files.Count(file => file.PublicApiCount >= thresholds.WarnPublicApiCount)
                : 0,
            TestCodeLinePercent = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.TestCodeRatio)
                ? testPercent
                : 0,
            SecuritySmellFileCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.SecuritySmells)
                ? files.Count(file => file.SecuritySmellCount >= thresholds.WarnSecuritySmellCount)
                : 0,
            HighInstabilityPackageCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.PackageInstability)
                ? packages.Count(package => package.Instability >= thresholds.WarnInstability)
                : 0,
            LayerViolationCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.LayerViolation)
                && fileRelations is not null
                ? LayerViolationDetector.Detect(fileRelations).Count
                : 0,
            LowCohesionTypeCount = ComputeLowCohesionTypeCount(scope, structure, functions, thresholds),
            DeepInheritanceTypeCount = ComputeDeepInheritanceTypeCount(scope, structure, functions, thresholds),
            GitHotspotFileCount = MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.GitHotspot)
                ? files.Count(file => file.GitChangeLineCount >= thresholds.WarnGitChangeLines)
                : 0
        };
    }

    private static int ComputeLowCohesionTypeCount(
        MetricInspectionKind scope,
        ProjectStructureResult? structure,
        IReadOnlyList<FunctionMetric> functions,
        UserAnalysisSettings thresholds)
    {
        if (!MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.TypeCohesion)
            || structure is null
            || structure.Types.Count == 0)
        {
            return 0;
        }

        return TypeMetricsBuilder.Build(structure, functions, thresholds)
            .Count(type => type.LackOfCohesion >= thresholds.WarnLackOfCohesion);
    }

    private static int ComputeDeepInheritanceTypeCount(
        MetricInspectionKind scope,
        ProjectStructureResult? structure,
        IReadOnlyList<FunctionMetric> functions,
        UserAnalysisSettings thresholds)
    {
        if (!MetricInspectionRuntime.IsInspectionEnabled(scope, MetricInspectionKind.InheritanceDepth)
            || structure is null
            || structure.Types.Count == 0)
        {
            return 0;
        }

        return TypeMetricsBuilder.Build(structure, functions, thresholds)
            .Count(type => type.DepthOfInheritance >= thresholds.WarnInheritanceDepth);
    }
}
