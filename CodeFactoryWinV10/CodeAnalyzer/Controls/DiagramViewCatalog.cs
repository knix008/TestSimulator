using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

/// <summary>
/// 다이어그램 뷰 콤보 순서. <see cref="DiagramViewKind.Summary"/>는 항상 마지막이며,
/// 새 뷰는 Summary 앞에만 추가합니다.
/// </summary>
internal static class DiagramViewCatalog
{
    private static readonly DiagramViewKind[] ComboOrder =
    [
        DiagramViewKind.CallGraph,
        DiagramViewKind.ClassDiagram,
        DiagramViewKind.SequenceDiagram,
        DiagramViewKind.Inheritance,
        DiagramViewKind.DataFlow,
        DiagramViewKind.FileRelations,
        DiagramViewKind.DirectoryRelations,
        DiagramViewKind.CodeMetrics,
        DiagramViewKind.DuplicateCode,
        DiagramViewKind.GlobalVariables,
        DiagramViewKind.DatabaseErd,
        DiagramViewKind.DatabaseTableAccess,
        DiagramViewKind.BugRisk,
        DiagramViewKind.InformationSecurity,
        DiagramViewKind.Summary
    ];

    public static IReadOnlyList<DiagramViewKind> ViewKinds => ComboOrder;

    public static IReadOnlyList<string> ComboLabels { get; } =
        ComboOrder.Select(GetComboLabel).ToList();

    public static bool IsViewVisible(DiagramViewKind kind, MetricInspectionKind inspections)
    {
        if (kind != DiagramViewKind.InformationSecurity)
        {
            return true;
        }

        return MetricInspectionScope.IsEnabled(
            MetricInspectionCatalog.NormalizeScope(inspections),
            MetricInspectionKind.ShowInformationSecurityTab);
    }

    public static IReadOnlyList<DiagramViewKind> GetVisibleViewKinds(MetricInspectionKind inspections) =>
        ComboOrder.Where(kind => IsViewVisible(kind, inspections)).ToArray();

    public static IReadOnlyList<string> GetVisibleComboLabels(MetricInspectionKind inspections) =>
        GetVisibleViewKinds(inspections).Select(GetComboLabel).ToArray();

    public static DiagramViewKind GetViewKind(int comboIndex)
    {
        if (comboIndex < 0 || comboIndex >= ComboOrder.Length)
        {
            return DiagramViewKind.CallGraph;
        }

        return ComboOrder[comboIndex];
    }

    public static int GetComboIndex(DiagramViewKind viewKind)
    {
        for (var i = 0; i < ComboOrder.Length; i++)
        {
            if (ComboOrder[i] == viewKind)
            {
                return i;
            }
        }

        return 0;
    }

    public static bool IsSummaryLast =>
        ComboOrder.Length > 0 && ComboOrder[^1] == DiagramViewKind.Summary;

    internal static string GetComboLabel(DiagramViewKind kind) =>
        kind == DiagramViewKind.BugRisk
            ? "버그 위험 분석(Lint)"
            : DiagramViewDisplayNames.Get(kind);
}
