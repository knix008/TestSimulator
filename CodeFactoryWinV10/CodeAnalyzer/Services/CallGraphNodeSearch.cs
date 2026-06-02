using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class CallGraphNodeSearch
{
    public static IReadOnlyList<CallGraphNode> FindNodes(CallGraphResult? graph, string query)
    {
        if (graph is null || string.IsNullOrWhiteSpace(query))
        {
            return [];
        }

        return graph.Nodes
            .Where(node => Matches(node, query))
            .OrderBy(node => node.FullName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static bool Matches(CallGraphNode node, string query)
    {
        return node.DisplayName.Contains(query, StringComparison.OrdinalIgnoreCase)
            || node.FullName.Contains(query, StringComparison.OrdinalIgnoreCase)
            || Path.GetFileName(node.FilePath).Contains(query, StringComparison.OrdinalIgnoreCase)
            || node.FilePath.Contains(query, StringComparison.OrdinalIgnoreCase);
    }
}
