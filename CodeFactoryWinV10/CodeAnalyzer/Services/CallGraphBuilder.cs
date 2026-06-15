using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

internal static class CallGraphBuilder
{
    public static CallGraphResult Build(IReadOnlyList<CallGraphNode> nodes, IReadOnlyList<CallGraphEdge> edges)
    {
        var nodeMap = nodes
            .GroupBy(node => node.Id, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal);

        var uniqueNodes = nodeMap.Values.OrderBy(node => node.FullName, StringComparer.OrdinalIgnoreCase).ToList();
        var outgoing = uniqueNodes.ToDictionary(node => node.Id, _ => new List<string>(), StringComparer.Ordinal);
        var incoming = uniqueNodes.ToDictionary(node => node.Id, _ => new List<string>(), StringComparer.Ordinal);

        var uniqueEdges = new HashSet<(string CallerId, string CalleeId)>();

        foreach (var edge in edges)
        {
            if (!nodeMap.ContainsKey(edge.CallerId) || !nodeMap.ContainsKey(edge.CalleeId))
            {
                continue;
            }

            if (!uniqueEdges.Add((edge.CallerId, edge.CalleeId)))
            {
                continue;
            }

            outgoing[edge.CallerId].Add(edge.CalleeId);
            incoming[edge.CalleeId].Add(edge.CallerId);
        }

        foreach (var key in outgoing.Keys.ToList())
        {
            outgoing[key] = outgoing[key]
                .Distinct(StringComparer.Ordinal)
                .OrderBy(id => nodeMap[id].DisplayName, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        var built = new CallGraphResult
        {
            Nodes = uniqueNodes,
            Edges = uniqueEdges.Select(edge => new CallGraphEdge
            {
                CallerId = edge.CallerId,
                CalleeId = edge.CalleeId
            }).ToList(),
            NodeMap = nodeMap,
            Outgoing = outgoing,
            Incoming = incoming
        };

        return AttachConventionEntryPoints(built);
    }

    private static CallGraphResult AttachConventionEntryPoints(CallGraphResult result)
    {
        var entryPointIds = CallGraphEntryPointResolver.FindEntryPoints(result)
            .Select(node => node.Id)
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (entryPointIds.Count == 0)
        {
            return result;
        }

        return new CallGraphResult
        {
            Nodes = result.Nodes,
            Edges = result.Edges,
            NodeMap = result.NodeMap,
            Outgoing = result.Outgoing,
            Incoming = result.Incoming,
            ConventionEntryPointIds = entryPointIds
        };
    }

    public static CallGraphResult Merge(IEnumerable<CallGraphResult> results)
    {
        var nodes = new List<CallGraphNode>();
        var edges = new List<CallGraphEdge>();

        foreach (var result in results)
        {
            nodes.AddRange(result.Nodes);
            edges.AddRange(result.Edges);
        }

        return Build(nodes, edges);
    }
}
