namespace CodeAnalyzer.Services.CallGraph.Roots;

public enum CallGraphRootDiscoveryKind
{
    /// <summary>Main/main 등 관례적 진입점만.</summary>
    ConventionEntryPoints,

    /// <summary>진입점 + fan-in 0 + 순환 컴포넌트 + 언어별 프레임워크 후보.</summary>
    Comprehensive
}
