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
}
