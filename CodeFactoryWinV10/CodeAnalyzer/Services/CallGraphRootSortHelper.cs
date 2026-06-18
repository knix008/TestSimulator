using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

/// <summary>콜 그래프 진입점 탭을 서브그래프 크기(깊이·폭) 순으로 정렬합니다.</summary>
internal static class CallGraphRootSortHelper
{
    internal sealed record SubtreeMetrics(int MaxDepth, int MaxWidth, int ReachableNodeCount);

    public static List<string> SortRootIdsBySubtreeSize(
        CallGraphResult graph,
        IReadOnlyList<string> rootIds)
    {
        if (rootIds.Count <= 1)
        {
            return rootIds.ToList();
        }

        return rootIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Where(id => graph.NodeMap.ContainsKey(id))
            .Select(id => (Id: id, Metrics: ComputeSubtreeMetrics(graph, id)))
            .OrderByDescending(entry => entry.Metrics.MaxDepth)
            .ThenByDescending(entry => entry.Metrics.MaxWidth)
            .ThenByDescending(entry => entry.Metrics.ReachableNodeCount)
            .ThenBy(entry => graph.NodeMap[entry.Id].FullName, StringComparer.OrdinalIgnoreCase)
            .Select(entry => entry.Id)
            .ToList();
    }

    private static SubtreeMetrics ComputeSubtreeMetrics(CallGraphResult graph, string rootId)
    {
        var depthById = new Dictionary<string, int>(StringComparer.Ordinal);
        var queue = new Queue<string>();
        depthById[rootId] = 0;
        queue.Enqueue(rootId);

        while (queue.Count > 0)
        {
            var currentId = queue.Dequeue();
            var depth = depthById[currentId];
            if (depth >= AnalysisScaleLimits.MaxCallGraphVisualDepth)
            {
                continue;
            }

            if (!graph.Outgoing.TryGetValue(currentId, out var children) || children.Count == 0)
            {
                continue;
            }

            foreach (var childId in children)
            {
                if (!graph.NodeMap.ContainsKey(childId) || depthById.ContainsKey(childId))
                {
                    continue;
                }

                depthById[childId] = depth + 1;
                queue.Enqueue(childId);
            }
        }

        var maxLayerWidth = depthById.Values
            .GroupBy(depth => depth)
            .Select(group => group.Count())
            .DefaultIfEmpty(1)
            .Max();

        var maxPathDepth = ComputeMaxPathDepth(graph, rootId);
        return new SubtreeMetrics(maxPathDepth, maxLayerWidth, depthById.Count);
    }

    private static int ComputeMaxPathDepth(CallGraphResult graph, string rootId)
    {
        var maxDepth = 0;
        var path = new HashSet<string>(StringComparer.Ordinal) { rootId };
        DfsMaxPathDepth(graph, rootId, 0, path, ref maxDepth);
        return maxDepth;
    }

    private static void DfsMaxPathDepth(
        CallGraphResult graph,
        string nodeId,
        int depth,
        HashSet<string> path,
        ref int maxDepth)
    {
        if (depth > AnalysisScaleLimits.MaxCallGraphVisualDepth)
        {
            return;
        }

        maxDepth = Math.Max(maxDepth, depth);
        if (!graph.Outgoing.TryGetValue(nodeId, out var children) || children.Count == 0)
        {
            return;
        }

        foreach (var childId in children)
        {
            if (!graph.NodeMap.ContainsKey(childId) || path.Contains(childId))
            {
                continue;
            }

            path.Add(childId);
            DfsMaxPathDepth(graph, childId, depth + 1, path, ref maxDepth);
            path.Remove(childId);
        }
    }
}
