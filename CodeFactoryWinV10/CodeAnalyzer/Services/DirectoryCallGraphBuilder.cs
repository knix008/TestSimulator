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
        int maxDepth = AnalysisScaleLimits.DefaultViewTraversalDepth)
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
        int maxDepth = AnalysisScaleLimits.DefaultViewTraversalDepth)
    {
        if (graph.Directories.Count == 0 || directoryRootIds.Count == 0)
        {
            return graph;
        }

        var validRoots = directoryRootIds
            .Where(rootId => graph.DirectoryMap.ContainsKey(rootId))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (validRoots.Count == 0)
        {
            return graph;
        }

        var included = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var queue = new Queue<(string Id, int Depth)>();

        foreach (var rootId in validRoots)
        {
            if (included.Add(rootId))
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

    public static DirectoryRelationGraphResult EnrichWithAncestorDirectories(
        DirectoryRelationGraphResult graph,
        string? projectRootPath)
    {
        if (string.IsNullOrWhiteSpace(projectRootPath) || graph.Directories.Count == 0)
        {
            return graph;
        }

        var projectRoot = FileCallGraphBuilder.NormalizePath(projectRootPath);
        var directoryMap = graph.DirectoryMap.ToDictionary(
            pair => pair.Key,
            pair => pair.Value,
            StringComparer.OrdinalIgnoreCase);
        var edgeCounts = graph.Edges.ToDictionary(
            edge => (edge.FromDirectoryId, edge.ToDirectoryId),
            edge => edge.CallCount);

        foreach (var directory in graph.Directories)
        {
            EnsureAncestorChain(directoryMap, directory.DirectoryPath, projectRoot);
        }

        foreach (var edge in graph.Edges)
        {
            if (!directoryMap.TryGetValue(edge.FromDirectoryId, out var fromDirectory))
            {
                continue;
            }

            RollUpEdgeCounts(
                directoryMap,
                edgeCounts,
                fromDirectory.DirectoryPath,
                edge.ToDirectoryId,
                edge.CallCount,
                projectRoot);
        }

        return RebuildGraph(directoryMap, edgeCounts);
    }

    public static bool TryGetProjectRootDirectoryId(
        DirectoryRelationGraphResult graph,
        string projectRootPath,
        out string directoryId)
    {
        directoryId = ToDirectoryId(FileCallGraphBuilder.NormalizePath(projectRootPath));
        return graph.DirectoryMap.ContainsKey(directoryId);
    }

    public static IReadOnlyList<string> FindSourceDirectoryIds(DirectoryRelationGraphResult graph)
    {
        if (graph.Directories.Count == 0)
        {
            return [];
        }

        var incoming = graph.Directories.ToDictionary(
            directory => directory.Id,
            _ => 0,
            StringComparer.OrdinalIgnoreCase);

        foreach (var edge in graph.Edges)
        {
            if (incoming.ContainsKey(edge.ToDirectoryId))
            {
                incoming[edge.ToDirectoryId]++;
            }
        }

        return incoming
            .Where(pair => pair.Value == 0)
            .Select(pair => pair.Key)
            .ToList();
    }

    public static string? ResolvePrimaryLayoutRoot(
        DirectoryRelationGraphResult graph,
        CallGraphResult? callGraph,
        IReadOnlyList<string> functionRootIds,
        IReadOnlyList<string> directoryRootOverride,
        string? projectRootPath)
    {
        if (directoryRootOverride.Count > 0
            && graph.DirectoryMap.ContainsKey(directoryRootOverride[0]))
        {
            return directoryRootOverride[0];
        }

        if (!string.IsNullOrWhiteSpace(projectRootPath)
            && TryGetProjectRootDirectoryId(graph, projectRootPath, out var projectRootId))
        {
            return projectRootId;
        }

        foreach (var directoryId in ResolveDirectoryRoots(callGraph ?? new CallGraphResult(), functionRootIds))
        {
            if (graph.DirectoryMap.ContainsKey(directoryId))
            {
                return directoryId;
            }
        }

        var sources = FindSourceDirectoryIds(graph);
        if (sources.Count > 0)
        {
            return sources
                .OrderBy(id => graph.DirectoryMap[id].FullName, StringComparer.OrdinalIgnoreCase)
                .First();
        }

        return graph.Directories.FirstOrDefault()?.Id;
    }

    public static Dictionary<string, int> ComputePathLayoutDepths(
        DirectoryRelationGraphResult graph,
        string projectRootPath,
        string? pinRootId)
    {
        var projectRoot = FileCallGraphBuilder.NormalizePath(projectRootPath);
        var depths = graph.Directories.ToDictionary(
            directory => directory.Id,
            directory => GetPathDepthFromRoot(projectRoot, directory.DirectoryPath),
            StringComparer.OrdinalIgnoreCase);

        if (string.IsNullOrWhiteSpace(pinRootId)
            || !depths.TryGetValue(pinRootId, out var pinDepth))
        {
            return depths;
        }

        foreach (var directoryId in depths.Keys.ToList())
        {
            depths[directoryId] = Math.Max(0, depths[directoryId] - pinDepth);
        }

        return depths;
    }

    public static int GetPathDepthFromRoot(string projectRootPath, string directoryPath)
    {
        var projectRoot = FileCallGraphBuilder.NormalizePath(projectRootPath);
        var directory = FileCallGraphBuilder.NormalizePath(directoryPath);
        if (directory.Length < projectRoot.Length
            || !directory.StartsWith(projectRoot, StringComparison.OrdinalIgnoreCase))
        {
            return 0;
        }

        if (string.Equals(directory, projectRoot, StringComparison.OrdinalIgnoreCase))
        {
            return 0;
        }

        var relative = directory[projectRoot.Length..].TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (string.IsNullOrWhiteSpace(relative))
        {
            return 0;
        }

        return relative.Split([Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar], StringSplitOptions.RemoveEmptyEntries).Length;
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

    private static void EnsureAncestorChain(
        Dictionary<string, DirectoryRelationNode> directoryMap,
        string directoryPath,
        string projectRoot)
    {
        var currentPath = FileCallGraphBuilder.NormalizePath(directoryPath);
        while (true)
        {
            if (currentPath.Length < projectRoot.Length
                || !currentPath.StartsWith(projectRoot, StringComparison.OrdinalIgnoreCase))
            {
                break;
            }

            var currentId = ToDirectoryId(currentPath);
            if (!directoryMap.ContainsKey(currentId))
            {
                directoryMap[currentId] = CreatePlaceholderDirectory(currentPath);
            }

            if (string.Equals(currentPath, projectRoot, StringComparison.OrdinalIgnoreCase))
            {
                break;
            }

            var parentPath = Path.GetDirectoryName(currentPath);
            if (string.IsNullOrWhiteSpace(parentPath))
            {
                break;
            }

            currentPath = FileCallGraphBuilder.NormalizePath(parentPath);
        }
    }

    private static void RollUpEdgeCounts(
        Dictionary<string, DirectoryRelationNode> directoryMap,
        Dictionary<(string From, string To), int> edgeCounts,
        string fromDirectoryPath,
        string toDirectoryId,
        int callCount,
        string projectRoot)
    {
        var currentPath = FileCallGraphBuilder.NormalizePath(fromDirectoryPath);
        while (true)
        {
            if (currentPath.Length < projectRoot.Length
                || !currentPath.StartsWith(projectRoot, StringComparison.OrdinalIgnoreCase))
            {
                break;
            }

            var parentPath = Path.GetDirectoryName(currentPath);
            if (string.IsNullOrWhiteSpace(parentPath))
            {
                break;
            }

            parentPath = FileCallGraphBuilder.NormalizePath(parentPath);
            if (parentPath.Length < projectRoot.Length
                || !parentPath.StartsWith(projectRoot, StringComparison.OrdinalIgnoreCase))
            {
                break;
            }

            EnsureAncestorChain(directoryMap, currentPath, projectRoot);
            EnsureAncestorChain(directoryMap, parentPath, projectRoot);

            var parentId = ToDirectoryId(parentPath);
            var key = (parentId, toDirectoryId);
            edgeCounts[key] = edgeCounts.GetValueOrDefault(key) + callCount;

            if (string.Equals(parentPath, projectRoot, StringComparison.OrdinalIgnoreCase))
            {
                break;
            }

            currentPath = parentPath;
        }
    }

    private static DirectoryRelationGraphResult RebuildGraph(
        Dictionary<string, DirectoryRelationNode> directoryMap,
        Dictionary<(string From, string To), int> edgeCounts)
    {
        var directories = directoryMap.Values
            .OrderBy(directory => directory.FullName, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var edges = edgeCounts
            .Select(pair => new DirectoryRelationEdge
            {
                FromDirectoryId = pair.Key.From,
                ToDirectoryId = pair.Key.To,
                CallCount = pair.Value
            })
            .OrderBy(edge => directoryMap[edge.FromDirectoryId].DisplayName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(edge => directoryMap[edge.ToDirectoryId].DisplayName, StringComparer.OrdinalIgnoreCase)
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
}
