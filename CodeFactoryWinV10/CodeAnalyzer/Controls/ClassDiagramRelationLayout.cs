using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

/// <summary>클래스 다이어그램에서 연관 타입을 인접하게 배치하기 위한 순서·컴포넌트 계산.</summary>
internal static class ClassDiagramRelationLayout
{
    public static Dictionary<string, List<string>> BuildUndirectedAdjacency(
        IEnumerable<string> nodeIds,
        IReadOnlyList<DiagramEdge> edges)
    {
        var adjacency = nodeIds.ToDictionary(
            id => id,
            _ => new List<string>(),
            StringComparer.Ordinal);

        foreach (var edge in edges)
        {
            if (!adjacency.ContainsKey(edge.FromId) || !adjacency.ContainsKey(edge.ToId))
            {
                continue;
            }

            AddNeighbor(adjacency, edge.FromId, edge.ToId);
            AddNeighbor(adjacency, edge.ToId, edge.FromId);
        }

        return adjacency;
    }

    public static List<List<DiagramBoxNode>> PartitionConnectedComponents(
        IReadOnlyList<DiagramBoxNode> nodes,
        IReadOnlyDictionary<string, List<string>> adjacency)
    {
        var nodeMap = nodes.ToDictionary(node => node.Id, StringComparer.Ordinal);
        var remaining = new HashSet<string>(nodeMap.Keys, StringComparer.Ordinal);
        var components = new List<List<DiagramBoxNode>>();

        while (remaining.Count > 0)
        {
            var start = remaining
                .OrderByDescending(id => adjacency.TryGetValue(id, out var neighbors) ? neighbors.Count : 0)
                .ThenBy(id => id, StringComparer.Ordinal)
                .First();

            var component = new List<DiagramBoxNode>();
            var queue = new Queue<string>();
            queue.Enqueue(start);
            remaining.Remove(start);

            while (queue.Count > 0)
            {
                var id = queue.Dequeue();
                if (!nodeMap.TryGetValue(id, out var node))
                {
                    continue;
                }

                component.Add(node);

                if (!adjacency.TryGetValue(id, out var neighbors))
                {
                    continue;
                }

                foreach (var neighbor in neighbors.OrderBy(n => n, StringComparer.Ordinal))
                {
                    if (remaining.Remove(neighbor))
                    {
                        queue.Enqueue(neighbor);
                    }
                }
            }

            components.Add(component);
        }

        return components
            .OrderByDescending(component => component.Count)
            .ThenBy(component => component[0].Title, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    /// <summary>깊이(계층)별 노드 순서를 관계 이웃에 맞게 정렬합니다.</summary>
    public static Dictionary<int, List<DiagramBoxNode>> OrderLayersByRelation(
        IReadOnlyList<DiagramBoxNode> componentNodes,
        IReadOnlyDictionary<string, int> depthById,
        IReadOnlyDictionary<string, List<string>> adjacency)
    {
        var layers = componentNodes
            .GroupBy(node => depthById.TryGetValue(node.Id, out var depth) ? depth : 0)
            .ToDictionary(
                group => group.Key,
                group => group.ToList(),
                comparer: EqualityComparer<int>.Default);

        foreach (var depth in layers.Keys.ToList())
        {
            layers[depth] = GreedyChainOrder(layers[depth], adjacency);
        }

        RefineWithBarycenter(layers, adjacency);
        return layers;
    }

    private static List<DiagramBoxNode> GreedyChainOrder(
        IReadOnlyList<DiagramBoxNode> nodes,
        IReadOnlyDictionary<string, List<string>> adjacency)
    {
        if (nodes.Count <= 1)
        {
            return nodes.ToList();
        }

        var remaining = new HashSet<string>(nodes.Select(node => node.Id), StringComparer.Ordinal);
        var nodeMap = nodes.ToDictionary(node => node.Id, StringComparer.Ordinal);
        var order = new List<DiagramBoxNode>(nodes.Count);

        var start = remaining
            .OrderByDescending(id => adjacency.TryGetValue(id, out var neighbors) ? neighbors.Count : 0)
            .ThenBy(id => id, StringComparer.Ordinal)
            .First();

        order.Add(nodeMap[start]);
        remaining.Remove(start);

        while (remaining.Count > 0)
        {
            var anchor = order[^1].Id;
            string? next = null;

            if (adjacency.TryGetValue(anchor, out var anchorNeighbors))
            {
                next = anchorNeighbors.FirstOrDefault(id => remaining.Contains(id));
            }

            if (next is null)
            {
                foreach (var placed in order)
                {
                    if (!adjacency.TryGetValue(placed.Id, out var neighbors))
                    {
                        continue;
                    }

                    next = neighbors.FirstOrDefault(id => remaining.Contains(id));
                    if (next is not null)
                    {
                        break;
                    }
                }
            }

            next ??= remaining
                .OrderByDescending(id => adjacency.TryGetValue(id, out var neighbors) ? neighbors.Count : 0)
                .ThenBy(id => id, StringComparer.Ordinal)
                .First();

            order.Add(nodeMap[next]);
            remaining.Remove(next);
        }

        return order;
    }

    private static void RefineWithBarycenter(
        Dictionary<int, List<DiagramBoxNode>> layers,
        IReadOnlyDictionary<string, List<string>> adjacency)
    {
        if (layers.Count <= 1)
        {
            return;
        }

        var depths = layers.Keys.OrderBy(depth => depth).ToList();

        for (var pass = 0; pass < 4; pass++)
        {
            foreach (var depth in depths)
            {
                var nodes = layers[depth];
                if (nodes.Count <= 1)
                {
                    continue;
                }

                var indexMaps = layers.ToDictionary(
                    pair => pair.Key,
                    pair => pair.Value
                        .Select((node, index) => (node.Id, index))
                        .ToDictionary(entry => entry.Id, entry => entry.index, StringComparer.Ordinal));

                var scored = nodes
                    .Select(node =>
                    {
                        var positions = new List<double>();
                        CollectNeighborPositions(node.Id, depth - 1, adjacency, indexMaps, positions);
                        CollectNeighborPositions(node.Id, depth + 1, adjacency, indexMaps, positions);

                        var score = positions.Count > 0
                            ? positions.Average()
                            : indexMaps[depth].TryGetValue(node.Id, out var selfIndex) ? selfIndex : 0;
                        return (node, score);
                    })
                    .OrderBy(entry => entry.score)
                    .ThenBy(entry => entry.node.Title, StringComparer.OrdinalIgnoreCase)
                    .Select(entry => entry.node)
                    .ToList();

                layers[depth] = scored;
            }
        }
    }

    private static void CollectNeighborPositions(
        string nodeId,
        int neighborDepth,
        IReadOnlyDictionary<string, List<string>> adjacency,
        IReadOnlyDictionary<int, Dictionary<string, int>> indexMaps,
        List<double> positions)
    {
        if (!indexMaps.TryGetValue(neighborDepth, out var indexMap))
        {
            return;
        }

        if (!adjacency.TryGetValue(nodeId, out var neighbors))
        {
            return;
        }

        foreach (var neighbor in neighbors)
        {
            if (indexMap.TryGetValue(neighbor, out var index))
            {
                positions.Add(index);
            }
        }
    }

    private static void AddNeighbor(Dictionary<string, List<string>> adjacency, string fromId, string toId)
    {
        if (!adjacency.TryGetValue(fromId, out var list))
        {
            return;
        }

        if (!list.Contains(toId, StringComparer.Ordinal))
        {
            list.Add(toId);
        }
    }
}
