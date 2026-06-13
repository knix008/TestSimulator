using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.CallGraph.Roots;

public sealed class CallGraphRootDiscoveryContext
{
    public required CallGraphResult Graph { get; init; }

    public required string LanguageId { get; init; }

    public required IReadOnlyList<CallGraphNode> LanguageNodes { get; init; }
}
