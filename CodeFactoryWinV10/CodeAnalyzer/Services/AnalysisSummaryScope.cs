using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public enum SummaryAreaKind
{
    Overview,
    CallGraph,
    Quality,
    Duplicates,
    Structure,
    Relations,
    Globals,
    Database,
    BugRisk,
    Security,
    Issues
}

internal static class AnalysisSummaryScope
{
    public static bool IsIncluded(SummaryAreaKind area, MetricInspectionKind inspections)
    {
        inspections = MetricInspectionScope.Normalize(inspections);
        return area switch
        {
            SummaryAreaKind.Overview => HasAnyAnalysisScope(inspections),
            SummaryAreaKind.CallGraph => AnalysisScopeResolver.RequiresCallGraph(inspections),
            SummaryAreaKind.Quality => AnalysisScopeResolver.RequiresCodeMetrics(inspections),
            SummaryAreaKind.Duplicates => AnalysisScopeResolver.RequiresDuplicateDetection(inspections),
            SummaryAreaKind.Structure => AnalysisScopeResolver.RequiresTypeStructure(inspections),
            SummaryAreaKind.Relations => AnalysisScopeResolver.RequiresCallGraph(inspections)
                && (MetricInspectionScope.IsEnabled(inspections, MetricInspectionKind.FileCoupling)
                    || MetricInspectionScope.IsEnabled(inspections, MetricInspectionKind.DirectoryCoupling)),
            SummaryAreaKind.Globals => AnalysisScopeResolver.RequiresGlobalVariables(inspections),
            SummaryAreaKind.Database => AnalysisScopeResolver.RequiresDatabaseSchema(inspections),
            SummaryAreaKind.BugRisk => true,
            SummaryAreaKind.Security => AnalysisScopeResolver.RequiresSecurityAnalysis(inspections),
            SummaryAreaKind.Issues => true,
            _ => false
        };
    }

    public static bool HasAnyAnalysisScope(MetricInspectionKind inspections) =>
        IsIncluded(SummaryAreaKind.CallGraph, inspections)
        || IsIncluded(SummaryAreaKind.Quality, inspections)
        || IsIncluded(SummaryAreaKind.Duplicates, inspections)
        || IsIncluded(SummaryAreaKind.Structure, inspections)
        || IsIncluded(SummaryAreaKind.Relations, inspections)
        || IsIncluded(SummaryAreaKind.Globals, inspections)
        || IsIncluded(SummaryAreaKind.Database, inspections)
        || IsIncluded(SummaryAreaKind.BugRisk, inspections)
        || IsIncluded(SummaryAreaKind.Security, inspections);
}
