using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public sealed record MetricInspectionOption(MetricInspectionKind Kind, string Group, string Label);

public static class MetricInspectionCatalog
{
    public static IReadOnlyList<MetricInspectionOption> Options { get; } =
    [
        new(MetricInspectionKind.ShowFilesTab, "탭", "파일"),
        new(MetricInspectionKind.ShowFunctionsTab, "탭", "함수"),
        new(MetricInspectionKind.ShowTypesTab, "탭", "타입"),
        new(MetricInspectionKind.ShowArchitectureTab, "탭", "아키텍처"),
        new(MetricInspectionKind.ShowPackagesTab, "탭", "패키지"),

        new(MetricInspectionKind.CyclomaticComplexity, "함수·파일·타입", "순환 복잡도 (CC)"),
        new(MetricInspectionKind.CognitiveComplexity, "함수·파일·타입", "인지 복잡도"),
        new(MetricInspectionKind.NestingDepth, "함수·파일", "중첩 깊이"),
        new(MetricInspectionKind.ParameterCount, "함수", "매개변수 개수"),
        new(MetricInspectionKind.ReturnCount, "함수·파일", "return 개수"),
        new(MetricInspectionKind.MagicNumbers, "함수·파일", "매직 넘버"),
        new(MetricInspectionKind.FanOut, "함수·파일", "Fan-out"),
        new(MetricInspectionKind.MaintenanceIndex, "함수·파일·타입", "유지보수 지수 (MI)"),

        new(MetricInspectionKind.TodoDensity, "파일", "TODO 밀도"),
        new(MetricInspectionKind.GodFile, "파일", "God file (대형 파일)"),
        new(MetricInspectionKind.LowCommentRatio, "파일", "주석 비율 부족"),
        new(MetricInspectionKind.FileDuplicateLines, "파일", "중복 코드 참여 줄"),

        new(MetricInspectionKind.GodType, "타입", "God type (멤버·연산 과다)"),

        new(MetricInspectionKind.CircularCalls, "아키텍처", "순환 호출"),
        new(MetricInspectionKind.FileCoupling, "아키텍처", "파일 결합도"),
        new(MetricInspectionKind.DirectoryCoupling, "아키텍처", "디렉터리 결합도"),
        new(MetricInspectionKind.FanOutHub, "아키텍처", "Fan-out 허브"),
        new(MetricInspectionKind.FanInHub, "아키텍처", "Fan-in 허브"),
        new(MetricInspectionKind.IsolatedFunctions, "아키텍처", "고립 함수"),
        new(MetricInspectionKind.GlobalVariables, "아키텍처", "전역 변수"),
        new(MetricInspectionKind.DatabaseSchema, "아키텍처", "DB 스키마"),
        new(MetricInspectionKind.DuplicateCodeGroups, "아키텍처", "중복 코드 그룹"),
        new(MetricInspectionKind.TypeStructure, "아키텍처", "타입 구조 요약"),

        new(MetricInspectionKind.StatementCount, "함수·파일", "함수 문장 수"),
        new(MetricInspectionKind.SwitchCaseCount, "함수·파일", "switch/case 수"),
        new(MetricInspectionKind.CatchQuality, "함수·파일", "빈 catch / 광범위 catch"),
        new(MetricInspectionKind.AsyncVoid, "함수·파일", "async void"),
        new(MetricInspectionKind.PossiblyUnusedCode, "함수·아키텍처", "미사용 가능 코드"),
        new(MetricInspectionKind.PublicApiDensity, "파일", "public API 수"),
        new(MetricInspectionKind.TestCodeRatio, "파일·아키텍처", "테스트 코드 비율"),
        new(MetricInspectionKind.PackageInstability, "아키텍처", "패키지 불안정성 (I)"),
        new(MetricInspectionKind.LayerViolation, "아키텍처", "계층 위반"),
        new(MetricInspectionKind.TypeCohesion, "타입", "LCOM 응집도"),
        new(MetricInspectionKind.InheritanceDepth, "타입", "상속 깊이 (DIT) · 자식 수 (NOC)"),
        new(MetricInspectionKind.GitHotspot, "파일·아키텍처", "Git 변경 핫스팟"),
        new(MetricInspectionKind.SecuritySmells, "파일·아키텍처", "보안 smell"),
        new(MetricInspectionKind.HalsteadMetrics, "함수·타입", "Halstead · WMC · RFC")
    ];

    public static MetricInspectionKind NormalizeScope(MetricInspectionKind scope) =>
        MetricInspectionScope.Normalize(scope);

    public static bool IsEnabled(MetricInspectionKind scope, MetricInspectionKind flag) =>
        MetricInspectionScope.IsEnabled(scope, flag);

    public static MetricInspectionKind FromCheckedKinds(IEnumerable<MetricInspectionKind> kinds) =>
        MetricInspectionScope.FromCheckedKinds(kinds);
}
