using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

internal static class CallGraphExpandHelper
{
    /// <summary>대형 그래프 초기 로딩 시 1단계만 펼칩니다(하위는 접음). 전체 펼치기는 툴바에서 실행.</summary>
    public static void ApplyInitialCollapse(
        CallGraphResult? graph,
        IReadOnlyList<string> rootNodeIds,
        ISet<string> collapsedNodeIds)
    {
        if (graph is null || graph.Nodes.Count <= AnalysisScaleLimits.CallGraphShallowExpandNodeThreshold)
        {
            return;
        }

        foreach (var rootId in rootNodeIds)
        {
            if (!graph.NodeMap.ContainsKey(rootId))
            {
                continue;
            }

            CollapseBeyondDepth(
                graph,
                rootId,
                AnalysisScaleLimits.CallGraphInitialExpandDepth,
                collapsedNodeIds);
        }
    }

    private static void CollapseBeyondDepth(
        CallGraphResult graph,
        string rootId,
        int maxExpandedDepth,
        ISet<string> collapsedNodeIds)
    {
        var queue = new Queue<(string NodeId, int Depth)>();
        queue.Enqueue((rootId, 0));
        var visited = new HashSet<string>(StringComparer.Ordinal) { rootId };

        while (queue.Count > 0)
        {
            var (nodeId, depth) = queue.Dequeue();
            if (!graph.Outgoing.TryGetValue(nodeId, out var children) || children.Count == 0)
            {
                continue;
            }

            if (depth >= maxExpandedDepth)
            {
                collapsedNodeIds.Add(nodeId);
                continue;
            }

            foreach (var childId in children)
            {
                if (visited.Add(childId))
                {
                    queue.Enqueue((childId, depth + 1));
                }
            }
        }
    }
}
