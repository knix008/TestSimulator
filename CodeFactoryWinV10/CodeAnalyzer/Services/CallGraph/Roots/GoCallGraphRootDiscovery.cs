using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.CallGraph.Roots;

public sealed class GoCallGraphRootDiscovery : ICallGraphRootDiscovery
{
    private static readonly string[] ConventionEntryNames = ["main"];

    public string LanguageId => "go";

    public IReadOnlyList<CallGraphNode> DiscoverRoots(
        CallGraphRootDiscoveryContext context,
        CallGraphRootDiscoveryKind kind)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var roots = new List<CallGraphNode>();

        CallGraphRootDiscoverySupport.AddConventionEntryPoints(context, seen, roots, ConventionEntryNames);

        if (kind == CallGraphRootDiscoveryKind.Comprehensive)
        {
            CallGraphRootDiscoverySupport.AddFanInZeroNodes(context, seen, roots);
            foreach (var node in context.LanguageNodes.Where(n => n.DisplayName.StartsWith("init", StringComparison.Ordinal)))
            {
                CallGraphRootDiscoverySupport.TryAddRoot(node, seen, roots);
            }

            CallGraphRootDiscoverySupport.AddCycleComponentRoots(context, seen, roots);
        }

        return CallGraphRootDiscoverySupport.SortRoots(roots);
    }
}
