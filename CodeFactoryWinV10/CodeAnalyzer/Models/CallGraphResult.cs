namespace CodeAnalyzer.Models;

public sealed class CallGraphResult
{
    public IReadOnlyList<CallGraphNode> Nodes { get; init; } = [];
    public IReadOnlyList<CallGraphEdge> Edges { get; init; } = [];

    public IReadOnlyDictionary<string, CallGraphNode> NodeMap { get; init; }
        = new Dictionary<string, CallGraphNode>();

    public IReadOnlyDictionary<string, List<string>> Outgoing { get; init; }
        = new Dictionary<string, List<string>>();

    public IReadOnlyDictionary<string, List<string>> Incoming { get; init; }
        = new Dictionary<string, List<string>>();

    /// <summary>분석 시점에 발견한 언어별 관례 진입점(Main, main 등). 호출 그래프·시퀀스 다이어그램 공통 기준.</summary>
    public IReadOnlyList<string> ConventionEntryPointIds { get; init; } = [];
}
