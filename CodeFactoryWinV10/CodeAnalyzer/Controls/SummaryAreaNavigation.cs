using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

internal static class SummaryAreaNavigation
{
    public static DiagramViewKind? GetViewKind(SummaryAreaKind areaKind) => areaKind switch
    {
        SummaryAreaKind.Overview => DiagramViewKind.CodeMetrics,
        SummaryAreaKind.CallGraph => DiagramViewKind.CallGraph,
        SummaryAreaKind.Quality => DiagramViewKind.CodeMetrics,
        SummaryAreaKind.Duplicates => DiagramViewKind.DuplicateCode,
        SummaryAreaKind.Structure => DiagramViewKind.ClassDiagram,
        SummaryAreaKind.Relations => DiagramViewKind.FileRelations,
        SummaryAreaKind.Globals => DiagramViewKind.GlobalVariables,
        SummaryAreaKind.Database => DiagramViewKind.DatabaseTableAccess,
        SummaryAreaKind.BugRisk => DiagramViewKind.BugRisk,
        SummaryAreaKind.Security => DiagramViewKind.InformationSecurity,
        SummaryAreaKind.Issues => DiagramViewKind.CodeMetrics,
        _ => null
    };

    public static DiagramViewKind? GetRadarAxisViewKind(string axisLabel) => axisLabel switch
    {
        "결함·버그 예방" => DiagramViewKind.BugRisk,
        "복잡도·유지보수" => DiagramViewKind.CodeMetrics,
        "견고성·보안" => DiagramViewKind.CodeMetrics,
        "테스트·문서화" => DiagramViewKind.CodeMetrics,
        "호출·구조 안정성" => DiagramViewKind.CallGraph,
        "중복·DRY" => DiagramViewKind.DuplicateCode,
        "설계·응집도" => DiagramViewKind.ClassDiagram,
        "모듈·결합도" => DiagramViewKind.FileRelations,
        "전역 상태 관리" => DiagramViewKind.GlobalVariables,
        "DB 참조 정합성" => DiagramViewKind.DatabaseTableAccess,
        "정보 보호·보안" => DiagramViewKind.InformationSecurity,
        _ => null
    };

    public static string GetViewLabel(DiagramViewKind viewKind) =>
        DiagramViewDisplayNames.Get(viewKind);
}
