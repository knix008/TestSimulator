using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services.CallGraph.Roots;

internal static class CallGraphRootDiscoverySupport
{
    public static IReadOnlyList<CallGraphNode> SortRoots(IEnumerable<CallGraphNode> nodes) =>
        nodes
            .DistinctBy(node => node.Id, StringComparer.Ordinal)
            .OrderBy(node => node.FullName, StringComparer.OrdinalIgnoreCase)
            .ToList();

    public static void AddConventionEntryPoints(
        CallGraphRootDiscoveryContext context,
        HashSet<string> seen,
        List<CallGraphNode> roots,
        IReadOnlyList<string> entryNames)
    {
        if (entryNames.Count == 0)
        {
            return;
        }

        var candidates = context.LanguageNodes
            .Where(node => entryNames.Any(name =>
                string.Equals(node.DisplayName, name, StringComparison.OrdinalIgnoreCase)))
            .OrderByDescending(node => GetOutgoingCount(context.Graph, node.Id))
            .ThenBy(node => node.FilePath, StringComparer.OrdinalIgnoreCase)
            .ThenBy(node => node.LineNumber);

        foreach (var candidate in candidates)
        {
            TryAddRoot(candidate, seen, roots);
        }
    }

    public static void AddFanInZeroNodes(
        CallGraphRootDiscoveryContext context,
        HashSet<string> seen,
        List<CallGraphNode> roots)
    {
        foreach (var node in context.LanguageNodes)
        {
            var fanIn = context.Graph.Incoming.TryGetValue(node.Id, out var incoming) ? incoming.Count : 0;
            if (fanIn == 0)
            {
                TryAddRoot(node, seen, roots);
            }
        }
    }

    public static void AddCycleComponentRoots(
        CallGraphRootDiscoveryContext context,
        HashSet<string> seen,
        List<CallGraphNode> roots)
    {
        var languageNodeIds = context.LanguageNodes
            .Select(node => node.Id)
            .ToHashSet(StringComparer.Ordinal);

        var components = FindStronglyConnectedComponents(context, languageNodeIds);
        foreach (var component in components)
        {
            if (component.Count <= 1)
            {
                continue;
            }

            var hasExternalIncoming = component.Any(nodeId =>
                context.Graph.Incoming.TryGetValue(nodeId, out var incoming)
                && incoming.Any(parent => !component.Contains(parent)));

            if (hasExternalIncoming)
            {
                continue;
            }

            var representative = context.LanguageNodes
                .Where(node => component.Contains(node.Id))
                .OrderBy(node => node.FullName, StringComparer.OrdinalIgnoreCase)
                .First();

            TryAddRoot(representative, seen, roots);
        }
    }

    public static void TryAddRoot(CallGraphNode node, HashSet<string> seen, List<CallGraphNode> roots)
    {
        if (seen.Add(node.Id))
        {
            roots.Add(node);
        }
    }

    public static int GetOutgoingCount(CallGraphResult graph, string nodeId) =>
        graph.Outgoing.TryGetValue(nodeId, out var outgoing) ? outgoing.Count : 0;

    private static List<HashSet<string>> FindStronglyConnectedComponents(
        CallGraphRootDiscoveryContext context,
        HashSet<string> languageNodeIds)
    {
        var index = 0;
        var stack = new Stack<string>();
        var onStack = new HashSet<string>(StringComparer.Ordinal);
        var indices = new Dictionary<string, int>(StringComparer.Ordinal);
        var lowLinks = new Dictionary<string, int>(StringComparer.Ordinal);
        var components = new List<HashSet<string>>();

        foreach (var nodeId in languageNodeIds)
        {
            if (!indices.ContainsKey(nodeId))
            {
                StrongConnect(
                    nodeId,
                    context.Graph,
                    languageNodeIds,
                    ref index,
                    stack,
                    onStack,
                    indices,
                    lowLinks,
                    components);
            }
        }

        return components;
    }

    private static void StrongConnect(
        string nodeId,
        CallGraphResult graph,
        HashSet<string> languageNodeIds,
        ref int index,
        Stack<string> stack,
        HashSet<string> onStack,
        Dictionary<string, int> indices,
        Dictionary<string, int> lowLinks,
        List<HashSet<string>> components)
    {
        indices[nodeId] = index;
        lowLinks[nodeId] = index;
        index++;
        stack.Push(nodeId);
        onStack.Add(nodeId);

        if (graph.Outgoing.TryGetValue(nodeId, out var children))
        {
            foreach (var childId in children.Where(languageNodeIds.Contains))
            {
                if (!indices.ContainsKey(childId))
                {
                    StrongConnect(
                        childId,
                        graph,
                        languageNodeIds,
                        ref index,
                        stack,
                        onStack,
                        indices,
                        lowLinks,
                        components);
                    lowLinks[nodeId] = Math.Min(lowLinks[nodeId], lowLinks[childId]);
                }
                else if (onStack.Contains(childId))
                {
                    lowLinks[nodeId] = Math.Min(lowLinks[nodeId], indices[childId]);
                }
            }
        }

        if (lowLinks[nodeId] != indices[nodeId])
        {
            return;
        }

        var component = new HashSet<string>(StringComparer.Ordinal);
        while (true)
        {
            var member = stack.Pop();
            onStack.Remove(member);
            component.Add(member);
            if (string.Equals(member, nodeId, StringComparison.Ordinal))
            {
                break;
            }
        }

        components.Add(component);
    }
}
