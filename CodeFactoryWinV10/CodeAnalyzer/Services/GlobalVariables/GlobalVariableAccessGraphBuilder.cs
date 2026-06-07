using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Services.GlobalVariables;

public static class GlobalVariableAccessGraphBuilder
{
    public sealed record GlobalVariableAccessGraph(
        CallGraphResult Graph,
        IReadOnlyList<string> RootNodeIds,
        string TargetNodeId);

    public static GlobalVariableAccessGraph Build(
        GlobalVariableItem variable,
        IReadOnlyList<GlobalVariableAccess> accesses,
        CallGraphResult sourceGraph)
    {
        var nodes = new List<CallGraphNode>();
        var edges = new List<CallGraphEdge>();
        var rootNodeIds = new List<string>();

        var globalNode = new CallGraphNode
        {
            Id = variable.Id,
            DisplayName = "[G] " + variable.Name,
            FullName = BuildGlobalFullName(variable),
            FilePath = variable.FilePath,
            LineNumber = variable.LineNumber
        };
        nodes.Add(globalNode);

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
                CalleeId = globalNode.Id
            });

            if (!rootNodeIds.Contains(functionNode.Id, StringComparer.Ordinal))
            {
                rootNodeIds.Add(functionNode.Id);
            }
        }

        if (rootNodeIds.Count == 0)
        {
            rootNodeIds.Add(globalNode.Id);
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

        return new GlobalVariableAccessGraph(
            CallGraphBuilder.Build(nodes, edges),
            rootNodeIds,
            globalNode.Id);
    }

    private static string BuildGlobalFullName(GlobalVariableItem variable)
    {
        var scope = string.IsNullOrWhiteSpace(variable.ContainingScope)
            ? variable.Name
            : $"{variable.ContainingScope}.{variable.Name}";
        return $"[전역] {scope}";
    }
}
