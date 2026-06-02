using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class DataFlowDiagramBuilder
{
    public static DataFlowDiagramResult Build(CallGraphResult callGraph, string? rootNodeId, int maxDepth = 6)
    {
        if (string.IsNullOrWhiteSpace(rootNodeId) || !callGraph.NodeMap.ContainsKey(rootNodeId))
        {
            return new DataFlowDiagramResult();
        }

        var included = new HashSet<string>(StringComparer.Ordinal) { rootNodeId };
        var queue = new Queue<(string Id, int Depth)>();
        queue.Enqueue((rootNodeId, 0));

        while (queue.Count > 0)
        {
            var (currentId, depth) = queue.Dequeue();
            if (depth >= maxDepth)
            {
                continue;
            }

            if (!callGraph.Outgoing.TryGetValue(currentId, out var children))
            {
                continue;
            }

            foreach (var childId in children)
            {
                if (included.Add(childId))
                {
                    queue.Enqueue((childId, depth + 1));
                }
            }
        }

        var nodes = included
            .Where(id => callGraph.NodeMap.ContainsKey(id))
            .Select(id => callGraph.NodeMap[id])
            .OrderBy(node => node.FullName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var nodeIds = nodes.Select(node => node.Id).ToHashSet(StringComparer.Ordinal);
        var edges = callGraph.Edges
            .Where(edge => nodeIds.Contains(edge.CallerId) && nodeIds.Contains(edge.CalleeId))
            .Select(edge => new DataFlowEdge
            {
                FromId = edge.CallerId,
                ToId = edge.CalleeId,
                Label = "데이터/제어 흐름"
            })
            .ToList();

        var outgoing = nodes.ToDictionary(
            node => node.Id,
            node => callGraph.Outgoing.TryGetValue(node.Id, out var list)
                ? list.Where(nodeIds.Contains).ToList()
                : [],
            StringComparer.Ordinal);

        return new DataFlowDiagramResult
        {
            Nodes = nodes,
            Edges = edges,
            NodeMap = nodes.ToDictionary(node => node.Id, StringComparer.Ordinal),
            Outgoing = outgoing
        };
    }
}
