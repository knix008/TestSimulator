using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Services.Metrics;

public static class ArchitectureMetricsBuilder
{
    private const int MaxCycleSearchDepth = 64;

    public static IReadOnlyList<CircularCallChain> FindCircularCallChains(CallGraphResult callGraph, int maxChains = 20)
    {
        if (callGraph.NodeMap.Count == 0
            || callGraph.NodeMap.Count > AnalysisScaleLimits.MaxNodesForCircularCallDetection)
        {
            return [];
        }

        var cycles = new List<CircularCallChain>();
        var visited = new HashSet<string>(StringComparer.Ordinal);
        var stack = new HashSet<string>(StringComparer.Ordinal);
        var path = new List<string>();
        var reportedKeys = new HashSet<string>(StringComparer.Ordinal);

        foreach (var nodeId in callGraph.NodeMap.Keys.OrderBy(id => id, StringComparer.Ordinal))
        {
            if (visited.Contains(nodeId))
            {
                continue;
            }

            Dfs(nodeId, 0);
            if (cycles.Count >= maxChains)
            {
                break;
            }
        }

        return cycles;

        void Dfs(string nodeId, int depth)
        {
            if (cycles.Count >= maxChains)
            {
                return;
            }

            visited.Add(nodeId);
            stack.Add(nodeId);
            path.Add(nodeId);

            if (depth < MaxCycleSearchDepth
                && callGraph.Outgoing.TryGetValue(nodeId, out var children))
            {
                foreach (var child in children.OrderBy(id => id, StringComparer.Ordinal))
                {
                    if (stack.Contains(child))
                    {
                        var cycleStart = path.IndexOf(child);
                        if (cycleStart >= 0)
                        {
                            var cycleIds = path.Skip(cycleStart).Append(child).ToList();
                            var key = string.Join("|", cycleIds);
                            if (reportedKeys.Add(key))
                            {
                                cycles.Add(new CircularCallChain
                                {
                                    DisplayText = string.Join(" → ", cycleIds.Select(FormatNode)),
                                    NodeIds = cycleIds
                                });
                            }
                        }

                        continue;
                    }

                    if (!visited.Contains(child))
                    {
                        Dfs(child, depth + 1);
                        if (cycles.Count >= maxChains)
                        {
                            break;
                        }
                    }
                }
            }

            stack.Remove(nodeId);
            path.RemoveAt(path.Count - 1);
        }

        string FormatNode(string id)
        {
            if (callGraph.NodeMap.TryGetValue(id, out var node))
            {
                return node.DisplayName;
            }

            return id;
        }
    }
}
