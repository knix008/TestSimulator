using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class DirectoryCallGraphBuilder
{
    public static DirectoryRelationGraphResult Build(CallGraphResult callGraph)
    {
        if (callGraph.Nodes.Count == 0)
        {
            return new DirectoryRelationGraphResult();
        }

        var functionsByDirectory = callGraph.Nodes
            .Where(node => !string.IsNullOrWhiteSpace(node.FilePath))
            .GroupBy(node => GetDirectoryPath(node.FilePath), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);

        var directoryNodes = new Dictionary<string, DirectoryRelationNode>(StringComparer.OrdinalIgnoreCase);
        foreach (var (directoryPath, functions) in functionsByDirectory)
        {
            var id = ToDirectoryId(directoryPath);
            var fileCount = functions
                .Select(node => FileCallGraphBuilder.NormalizePath(node.FilePath))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Count();

            directoryNodes[id] = new DirectoryRelationNode
            {
                Id = id,
                DirectoryPath = directoryPath,
                DisplayName = Path.GetFileName(directoryPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)),
                FullName = directoryPath,
                FileCount = fileCount,
                FunctionCount = functions.Count
            };
        }

        var edgeCounts = new Dictionary<(string From, string To), int>();

        foreach (var edge in callGraph.Edges)
        {
            if (!callGraph.NodeMap.TryGetValue(edge.CallerId, out var caller)
                || !callGraph.NodeMap.TryGetValue(edge.CalleeId, out var callee))
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(caller.FilePath) || string.IsNullOrWhiteSpace(callee.FilePath))
            {
                continue;
            }

            var fromDir = GetDirectoryPath(caller.FilePath);
            var toDir = GetDirectoryPath(callee.FilePath);
            if (string.Equals(fromDir, toDir, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var fromId = ToDirectoryId(fromDir);
            var toId = ToDirectoryId(toDir);
            directoryNodes.TryAdd(fromId, CreatePlaceholderDirectory(fromDir));
            directoryNodes.TryAdd(toId, CreatePlaceholderDirectory(toDir));

            var key = (fromId, toId);
            edgeCounts[key] = edgeCounts.GetValueOrDefault(key) + 1;
        }

        var edges = edgeCounts
            .Select(pair => new DirectoryRelationEdge
            {
                FromDirectoryId = pair.Key.From,
                ToDirectoryId = pair.Key.To,
                CallCount = pair.Value
            })
            .OrderBy(edge => directoryNodes[edge.FromDirectoryId].DisplayName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(edge => directoryNodes[edge.ToDirectoryId].DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var outgoing = directoryNodes.Keys.ToDictionary(
            id => id,
            _ => new List<string>(),
            StringComparer.OrdinalIgnoreCase);

        foreach (var edge in edges)
        {
            outgoing[edge.FromDirectoryId].Add(edge.ToDirectoryId);
        }

        foreach (var key in outgoing.Keys.ToList())
        {
            outgoing[key] = outgoing[key].Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }

        var directories = directoryNodes.Values
            .OrderBy(directory => directory.FullName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new DirectoryRelationGraphResult
        {
            Directories = directories,
            Edges = edges,
            DirectoryMap = directories.ToDictionary(directory => directory.Id, StringComparer.OrdinalIgnoreCase),
            Outgoing = outgoing
        };
    }

    public static DirectoryRelationGraphResult BuildSubgraph(
        DirectoryRelationGraphResult graph,
        CallGraphResult functionGraph,
        IReadOnlyList<string> functionRootIds,
        int maxDepth = 10)
    {
        if (graph.Directories.Count == 0)
        {
            return graph;
        }

        var directoryRootIds = ResolveDirectoryRoots(functionGraph, functionRootIds);
        if (directoryRootIds.Count == 0)
        {
            return graph;
        }

        return BuildSubgraphFromDirectoryRoots(graph, directoryRootIds, maxDepth);
    }

    public static DirectoryRelationGraphResult BuildSubgraphFromDirectoryRoots(
        DirectoryRelationGraphResult graph,
        IReadOnlyList<string> directoryRootIds,
        int maxDepth = 10)
    {
        if (graph.Directories.Count == 0 || directoryRootIds.Count == 0)
        {
            return graph;
        }

        var included = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var queue = new Queue<(string Id, int Depth)>();

        foreach (var rootId in directoryRootIds)
        {
            if (graph.DirectoryMap.ContainsKey(rootId) && included.Add(rootId))
            {
                queue.Enqueue((rootId, 0));
            }
        }

        while (queue.Count > 0)
        {
            var (currentId, depth) = queue.Dequeue();
            if (depth >= maxDepth)
            {
                continue;
            }

            if (!graph.Outgoing.TryGetValue(currentId, out var children))
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

        return FilterGraph(graph, included);
    }

    public static IReadOnlyList<string> ResolveDirectoryRoots(
        CallGraphResult functionGraph,
        IReadOnlyList<string> functionRootIds)
    {
        var roots = new List<string>();
        foreach (var functionId in functionRootIds)
        {
            if (!functionGraph.NodeMap.TryGetValue(functionId, out var node)
                || string.IsNullOrWhiteSpace(node.FilePath))
            {
                continue;
            }

            var directoryId = ToDirectoryId(GetDirectoryPath(node.FilePath));
            if (!roots.Contains(directoryId, StringComparer.OrdinalIgnoreCase))
            {
                roots.Add(directoryId);
            }
        }

        return roots;
    }

    public static string ToDirectoryId(string directoryPath) => "dir:" + directoryPath;

    public static string GetDirectoryPath(string filePath)
    {
        var normalizedFile = FileCallGraphBuilder.NormalizePath(filePath);
        var directory = Path.GetDirectoryName(normalizedFile);
        if (string.IsNullOrWhiteSpace(directory))
        {
            return normalizedFile;
        }

        return FileCallGraphBuilder.NormalizePath(directory);
    }

    private static DirectoryRelationGraphResult FilterGraph(DirectoryRelationGraphResult graph, HashSet<string> included)
    {
        if (included.Count == 0)
        {
            return new DirectoryRelationGraphResult();
        }

        var directories = graph.Directories.Where(directory => included.Contains(directory.Id)).ToList();
        var edges = graph.Edges
            .Where(edge => included.Contains(edge.FromDirectoryId) && included.Contains(edge.ToDirectoryId))
            .ToList();

        var outgoing = directories.ToDictionary(
            directory => directory.Id,
            directory => edges
                .Where(edge => edge.FromDirectoryId == directory.Id)
                .Select(edge => edge.ToDirectoryId)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList(),
            StringComparer.OrdinalIgnoreCase);

        return new DirectoryRelationGraphResult
        {
            Directories = directories,
            Edges = edges,
            DirectoryMap = directories.ToDictionary(directory => directory.Id, StringComparer.OrdinalIgnoreCase),
            Outgoing = outgoing
        };
    }

    private static DirectoryRelationNode CreatePlaceholderDirectory(string directoryPath) => new()
    {
        Id = ToDirectoryId(directoryPath),
        DirectoryPath = directoryPath,
        DisplayName = Path.GetFileName(directoryPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)),
        FullName = directoryPath,
        FileCount = 0,
        FunctionCount = 0
    };
}
