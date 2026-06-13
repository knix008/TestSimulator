using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.CallGraph.Roots;

public sealed class RustCallGraphRootDiscovery : ICallGraphRootDiscovery
{
    private static readonly string[] ConventionEntryNames = ["main"];

    public string LanguageId => "rust";

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
            CallGraphRootDiscoverySupport.AddCycleComponentRoots(context, seen, roots);
        }

        return CallGraphRootDiscoverySupport.SortRoots(roots);
    }
}
