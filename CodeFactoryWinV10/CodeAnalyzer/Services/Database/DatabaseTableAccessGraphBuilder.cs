using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Services.Database;

public static class DatabaseTableAccessGraphBuilder
{
    public sealed record DatabaseTableAccessGraph(
        CallGraphResult Graph,
        IReadOnlyList<string> RootNodeIds,
        string TargetNodeId);

    public static DatabaseTableAccessGraph Build(
        DatabaseTable table,
        IReadOnlyList<DatabaseTableAccess> accesses,
        CallGraphResult sourceGraph)
    {
        var nodes = new List<CallGraphNode>();
        var edges = new List<CallGraphEdge>();
        var rootNodeIds = new List<string>();

        var tableNode = new CallGraphNode
        {
            Id = table.Id,
            DisplayName = "[DB] " + table.Name,
            FullName = BuildTableFullName(table),
            FilePath = table.FilePath,
            LineNumber = table.LineNumber
        };
        nodes.Add(tableNode);

        foreach (var access in accesses)
        {
            var functionNode = sourceGraph.NodeMap.TryGetValue(access.FunctionId, out var existing)
                ? existing
                : new CallGraphNode
                {
                    Id = access.FunctionId,
                    DisplayName = access.FunctionDisplayName,
                    FullName = access.FunctionFullName,
                    FilePath = access.FunctionFilePath,
                    LineNumber = access.FunctionLineNumber
                };

            nodes.Add(functionNode);
            edges.Add(new CallGraphEdge
            {
                CallerId = functionNode.Id,
                CalleeId = tableNode.Id
            });

            if (!rootNodeIds.Contains(functionNode.Id, StringComparer.Ordinal))
            {
                rootNodeIds.Add(functionNode.Id);
            }
        }

        if (rootNodeIds.Count == 0)
        {
            rootNodeIds.Add(tableNode.Id);
        }

        rootNodeIds.Sort((left, right) =>
        {
            var leftNode = nodes.FirstOrDefault(node => node.Id == left);
            var rightNode = nodes.FirstOrDefault(node => node.Id == right);
            return string.Compare(
                leftNode?.DisplayName,
                rightNode?.DisplayName,
                StringComparison.OrdinalIgnoreCase);
        });

        return new DatabaseTableAccessGraph(
            CallGraphBuilder.Build(nodes, edges),
            rootNodeIds,
            tableNode.Id);
    }

    private static string BuildTableFullName(DatabaseTable table)
    {
        var qualified = string.IsNullOrWhiteSpace(table.Schema)
            ? table.Name
            : $"{table.Schema}.{table.Name}";
        var entity = string.IsNullOrWhiteSpace(table.EntityTypeName)
            ? string.Empty
            : $" · 엔티티 {table.EntityTypeName}";
        return $"[테이블] {qualified}{entity}";
    }
}
