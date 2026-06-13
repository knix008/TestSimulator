using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.CallGraph.Roots;

public static class CallGraphRootDiscoveryRegistry
{
    private static readonly IReadOnlyDictionary<string, ICallGraphRootDiscovery> ByLanguageId =
        new ICallGraphRootDiscovery[]
        {
            new CSharpCallGraphRootDiscovery(),
            new VisualBasicCallGraphRootDiscovery(),
            new PythonCallGraphRootDiscovery(),
            new JavaCallGraphRootDiscovery(),
            new JavaScriptCallGraphRootDiscovery(),
            new GoCallGraphRootDiscovery(),
            new RustCallGraphRootDiscovery(),
            new SwiftCallGraphRootDiscovery(),
            new RubyCallGraphRootDiscovery(),
            new PhpCallGraphRootDiscovery(),
            new CppCallGraphRootDiscovery()
        }.ToDictionary(discovery => discovery.LanguageId, StringComparer.Ordinal);

    public static ICallGraphRootDiscovery? Get(string languageId) =>
        ByLanguageId.TryGetValue(languageId, out var discovery) ? discovery : null;

    public static IReadOnlyList<CallGraphNode> DiscoverAllRoots(
        CallGraphResult graph,
        CallGraphRootDiscoveryKind kind)
    {
        if (graph.Nodes.Count == 0)
        {
            return Array.Empty<CallGraphNode>();
        }

        var roots = new List<CallGraphNode>();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        foreach (var languageGroup in graph.Nodes.GroupBy(GetLanguageId, StringComparer.Ordinal))
        {
            var languageId = languageGroup.Key;
            var languageNodes = languageGroup.ToList();
            var context = new CallGraphRootDiscoveryContext
            {
                Graph = graph,
                LanguageId = languageId,
                LanguageNodes = languageNodes
            };

            var discovered = CallGraphRootDiscoveryRegistry.Get(languageId) is { } discovery
                ? discovery.DiscoverRoots(context, kind)
                : DiscoverFallbackRoots(context, kind);

            foreach (var node in discovered)
            {
                if (seen.Add(node.Id))
                {
                    roots.Add(node);
                }
            }
        }

        return roots
            .OrderBy(node => node.FullName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static IReadOnlyList<CallGraphNode> DiscoverFallbackRoots(
        CallGraphRootDiscoveryContext context,
        CallGraphRootDiscoveryKind kind)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var roots = new List<CallGraphNode>();

        CallGraphRootDiscoverySupport.AddConventionEntryPoints(context, seen, roots, ["main", "Main"]);

        if (kind == CallGraphRootDiscoveryKind.Comprehensive)
        {
            CallGraphRootDiscoverySupport.AddFanInZeroNodes(context, seen, roots);
            CallGraphRootDiscoverySupport.AddCycleComponentRoots(context, seen, roots);
        }

        return CallGraphRootDiscoverySupport.SortRoots(roots);
    }

    private static string GetLanguageId(CallGraphNode node)
    {
        var separator = node.Id.IndexOf(':');
        return separator > 0 ? node.Id[..separator] : "unknown";
    }
}
