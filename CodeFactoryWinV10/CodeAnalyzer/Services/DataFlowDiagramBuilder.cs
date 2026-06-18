using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class DataFlowDiagramBuilder
{
    public static DataFlowDiagramResult Build(
        CallGraphResult callGraph,
        string? rootNodeId,
        int maxDepth = AnalysisScaleLimits.DefaultViewTraversalDepth) =>
        string.IsNullOrWhiteSpace(rootNodeId) || !callGraph.NodeMap.ContainsKey(rootNodeId)
            ? new DataFlowDiagramResult()
            : BuildFromRoots(callGraph, [rootNodeId], maxDepth);

    public static DataFlowDiagramResult BuildFromRoots(
        CallGraphResult callGraph,
        IReadOnlyList<string> rootNodeIds,
        int maxDepth = AnalysisScaleLimits.DefaultViewTraversalDepth)
    {
        var validRoots = rootNodeIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Where(id => callGraph.NodeMap.ContainsKey(id))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (validRoots.Count == 0)
        {
            return new DataFlowDiagramResult();
        }

        var included = new HashSet<string>(StringComparer.Ordinal);
        var depthById = new Dictionary<string, int>(StringComparer.Ordinal);
        var queue = new Queue<(string Id, int Depth)>();

        foreach (var rootId in validRoots)
        {
            if (!included.Add(rootId))
            {
                continue;
            }

            depthById[rootId] = 0;
            queue.Enqueue((rootId, 0));
        }

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
                if (!callGraph.NodeMap.ContainsKey(childId))
                {
                    continue;
                }

                var nextDepth = depth + 1;
                if (included.Add(childId))
                {
                    depthById[childId] = nextDepth;
                    queue.Enqueue((childId, nextDepth));
                    continue;
                }

                if (depthById.TryGetValue(childId, out var existingDepth) && nextDepth < existingDepth)
                {
                    depthById[childId] = nextDepth;
                    queue.Enqueue((childId, nextDepth));
                }
            }
        }

        var nodes = included
            .Select(id => callGraph.NodeMap[id])
            .OrderBy(node => node.FullName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var edges = new List<DataFlowEdge>();
        foreach (var nodeId in included)
        {
            if (!callGraph.Outgoing.TryGetValue(nodeId, out var children))
            {
                continue;
            }

            foreach (var childId in children)
            {
                if (!included.Contains(childId))
                {
                    continue;
                }

                edges.Add(new DataFlowEdge
                {
                    FromId = nodeId,
                    ToId = childId,
                    Label = "데이터/제어 흐름"
                });
            }
        }

        var outgoing = nodes.ToDictionary(
            node => node.Id,
            node => callGraph.Outgoing.TryGetValue(node.Id, out var list)
                ? list.Where(included.Contains).ToList()
                : [],
            StringComparer.Ordinal);

        return new DataFlowDiagramResult
        {
            RootIds = validRoots,
            Nodes = nodes,
            Edges = edges,
            NodeMap = nodes.ToDictionary(node => node.Id, StringComparer.Ordinal),
            Outgoing = outgoing,
            DepthById = depthById
        };
    }
}
