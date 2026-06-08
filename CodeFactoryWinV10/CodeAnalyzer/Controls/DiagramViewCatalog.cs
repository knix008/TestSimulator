using CodeAnalyzer.Models;

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

    private static string GetComboLabel(DiagramViewKind kind) =>
        kind == DiagramViewKind.BugRisk
            ? "버그 위험 분석(Lint)"
            : DiagramViewDisplayNames.Get(kind);
}
