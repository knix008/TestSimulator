using CodeAnalyzer.Models;
using CodeAnalyzer.Services.CallGraph.Roots;

namespace CodeAnalyzer.Services;

public static class CallGraphEntryPointResolver
{
    public static IReadOnlyList<CallGraphNode> FindEntryPoints(CallGraphResult result) =>
        CallGraphRootDiscoveryRegistry.DiscoverAllRoots(result, CallGraphRootDiscoveryKind.ConventionEntryPoints);

    public static IReadOnlyList<CallGraphNode> FindComprehensiveRoots(CallGraphResult result) =>
        CallGraphRootDiscoveryRegistry.DiscoverAllRoots(result, CallGraphRootDiscoveryKind.Comprehensive);

    public static IReadOnlyList<string> GetConventionEntryPointIds(CallGraphResult result)
    {
        if (result.ConventionEntryPointIds.Count > 0)
        {
            return result.ConventionEntryPointIds;
        }

        return FindEntryPoints(result)
            .Select(node => node.Id)
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    public static CallGraphNode? FindFallbackRoot(CallGraphResult result)
    {
        return result.Nodes
            .OrderByDescending(node => result.Outgoing.TryGetValue(node.Id, out var children) ? children.Count : 0)
            .ThenBy(node => node.FullName, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();
    }

}
