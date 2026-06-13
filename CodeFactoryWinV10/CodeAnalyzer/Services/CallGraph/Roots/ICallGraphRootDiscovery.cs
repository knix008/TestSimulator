using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.CallGraph.Roots;

/// <summary>
/// 언어별 호출 그래프 루트(시작 함수) 탐색. 구현체는 서로 독립적이며 한 언어의 변경이 다른 언어에 영향을 주지 않습니다.
/// </summary>
public interface ICallGraphRootDiscovery
{
    string LanguageId { get; }

    IReadOnlyList<CallGraphNode> DiscoverRoots(
        CallGraphRootDiscoveryContext context,
        CallGraphRootDiscoveryKind kind);
}
