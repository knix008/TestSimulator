using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

/// <summary><see cref="MetricInspectionKind"/> 선택에 따라 실행할 분석 파이프라인 단계를 결정합니다.</summary>
public static class AnalysisScopeResolver
{
    public static bool RequiresCallGraph(MetricInspectionKind inspections) =>
        MetricInspectionRuntime.RequiresCallGraph(inspections);

    public static bool RequiresFileLineMetrics(MetricInspectionKind inspections) =>
        MetricInspectionRuntime.RequiresFileLineMetrics(inspections);

    public static bool RequiresFunctionMetrics(MetricInspectionKind inspections) =>
        MetricInspectionRuntime.RequiresFunctionMetrics(inspections);

    public static bool RequiresCodeMetrics(MetricInspectionKind inspections) =>
        MetricInspectionRuntime.RequiresFileLineMetrics(inspections)
        || MetricInspectionRuntime.RequiresFunctionMetrics(inspections);

    public static bool RequiresTypeStructure(MetricInspectionKind inspections) =>
        MetricInspectionRuntime.RequiresTypeStructure(inspections);

    public static bool RequiresDuplicateDetection(MetricInspectionKind inspections) =>
        MetricInspectionRuntime.RequiresDuplicateScan(inspections);

    public static bool RequiresGlobalVariables(MetricInspectionKind inspections) =>
        MetricInspectionRuntime.RequiresGlobalVariables(inspections);

    public static bool RequiresDatabaseSchema(MetricInspectionKind inspections) =>
        MetricInspectionRuntime.RequiresDatabaseSchema(inspections);

    public static bool RequiresSecurityAnalysis(MetricInspectionKind inspections) =>
        MetricInspectionScope.IsEnabled(inspections, MetricInspectionKind.SecuritySmells);

    public static AnalysisScopeKind Resolve(MetricInspectionKind inspections)
    {
        inspections = MetricInspectionScope.Normalize(inspections);

        AnalysisScopeKind scope = 0;

        if (RequiresCallGraph(inspections))
        {
            scope |= AnalysisScopeKind.CallGraph;
        }

        if (RequiresCodeMetrics(inspections))
        {
            scope |= AnalysisScopeKind.CodeMetrics;
        }

        if (RequiresTypeStructure(inspections))
        {
            scope |= AnalysisScopeKind.TypeStructure;
        }

        if (RequiresDuplicateDetection(inspections))
        {
            scope |= AnalysisScopeKind.DuplicateCode;
        }

        if (RequiresGlobalVariables(inspections))
        {
            scope |= AnalysisScopeKind.GlobalVariables;
        }

        if (RequiresDatabaseSchema(inspections))
        {
            scope |= AnalysisScopeKind.DatabaseSchema;
        }

        return scope;
    }
}
