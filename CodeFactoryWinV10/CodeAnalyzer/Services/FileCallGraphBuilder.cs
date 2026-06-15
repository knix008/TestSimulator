using CodeAnalyzer.Models;

namespace CodeAnalyzer.Services;

public static class FileCallGraphBuilder
{
    public static FileRelationGraphResult Build(CallGraphResult callGraph)
    {
        if (callGraph.Nodes.Count == 0)
        {
            return new FileRelationGraphResult();
        }

        var functionsByFile = callGraph.Nodes
            .Where(node => !string.IsNullOrWhiteSpace(node.FilePath))
            .GroupBy(node => NormalizePath(node.FilePath), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.ToList(), StringComparer.OrdinalIgnoreCase);

        var fileNodes = new Dictionary<string, FileRelationNode>(StringComparer.OrdinalIgnoreCase);
        foreach (var (path, functions) in functionsByFile)
        {
            var id = ToFileId(path);
            fileNodes[id] = new FileRelationNode
            {
                Id = id,
                FilePath = path,
                DisplayName = Path.GetFileName(path),
                FullName = path,
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

            var fromPath = NormalizePath(caller.FilePath);
            var toPath = NormalizePath(callee.FilePath);
            if (string.Equals(fromPath, toPath, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var fromId = ToFileId(fromPath);
            var toId = ToFileId(toPath);
            fileNodes.TryAdd(fromId, CreatePlaceholderFile(fromPath));
            fileNodes.TryAdd(toId, CreatePlaceholderFile(toPath));

            var key = (fromId, toId);
            edgeCounts[key] = edgeCounts.GetValueOrDefault(key) + 1;
        }

        var edges = edgeCounts
            .Select(pair => new FileRelationEdge
            {
                FromFileId = pair.Key.From,
                ToFileId = pair.Key.To,
                CallCount = pair.Value
            })
            .OrderBy(edge => fileNodes[edge.FromFileId].DisplayName, StringComparer.OrdinalIgnoreCase)
            .ThenBy(edge => fileNodes[edge.ToFileId].DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var outgoing = fileNodes.Keys.ToDictionary(
            id => id,
            _ => new List<string>(),
            StringComparer.OrdinalIgnoreCase);

        foreach (var edge in edges)
        {
            outgoing[edge.FromFileId].Add(edge.ToFileId);
        }

        foreach (var key in outgoing.Keys.ToList())
        {
            outgoing[key] = outgoing[key].Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        }

        var files = fileNodes.Values
            .OrderBy(file => file.FullName, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new FileRelationGraphResult
        {
            Files = files,
            Edges = edges,
            FileMap = files.ToDictionary(file => file.Id, StringComparer.OrdinalIgnoreCase),
            Outgoing = outgoing
        };
    }

    public static FileRelationGraphResult BuildSubgraph(
        FileRelationGraphResult graph,
        CallGraphResult functionGraph,
        IReadOnlyList<string> functionRootIds,
        int maxDepth = AnalysisScaleLimits.DefaultViewTraversalDepth)
    {
        if (graph.Files.Count == 0)
        {
            return graph;
        }

        var fileRootIds = ResolveFileRootsForView(functionGraph, functionRootIds);
        if (fileRootIds.Count == 0)
        {
            return graph;
        }

        var included = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var queue = new Queue<(string Id, int Depth)>();

        foreach (var rootId in fileRootIds)
        {
            if (graph.FileMap.ContainsKey(rootId) && included.Add(rootId))
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

    private static FileRelationGraphResult FilterGraph(FileRelationGraphResult graph, HashSet<string> included)
    {
        if (included.Count == 0)
        {
            return new FileRelationGraphResult();
        }

        var files = graph.Files.Where(file => included.Contains(file.Id)).ToList();
        var edges = graph.Edges
            .Where(edge => included.Contains(edge.FromFileId) && included.Contains(edge.ToFileId))
            .ToList();

        var outgoing = files.ToDictionary(
            file => file.Id,
            file => edges
                .Where(edge => edge.FromFileId == file.Id)
                .Select(edge => edge.ToFileId)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList(),
            StringComparer.OrdinalIgnoreCase);

        return new FileRelationGraphResult
        {
            Files = files,
            Edges = edges,
            FileMap = files.ToDictionary(file => file.Id, StringComparer.OrdinalIgnoreCase),
            Outgoing = outgoing
        };
    }

    public static FileRelationGraphResult BuildSubgraphFromFileRoots(
        FileRelationGraphResult graph,
        IReadOnlyList<string> fileRootIds,
        int maxDepth = AnalysisScaleLimits.DefaultViewTraversalDepth)
    {
        if (graph.Files.Count == 0 || fileRootIds.Count == 0)
        {
            return graph;
        }

        var included = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var queue = new Queue<(string Id, int Depth)>();

        foreach (var rootId in fileRootIds)
        {
            if (graph.FileMap.ContainsKey(rootId) && included.Add(rootId))
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

    public static IReadOnlyList<string> ResolveFileRoots(
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

            var fileId = ToFileId(NormalizePath(node.FilePath));
            if (!roots.Contains(fileId, StringComparer.OrdinalIgnoreCase))
            {
                roots.Add(fileId);
            }
        }

        return roots;
    }

    /// <summary>호출 그래프 진입점이 포함된 파일 ID 목록(파일 관계 뷰 루트).</summary>
    public static IReadOnlyList<string> ResolveFileRootsFromEntryPoints(CallGraphResult functionGraph)
    {
        var entryPointIds = CallGraphEntryPointResolver.GetConventionEntryPointIds(functionGraph);
        return ResolveFileRoots(functionGraph, entryPointIds);
    }

    public static IReadOnlyList<string> ResolveFileRootsForView(
        CallGraphResult functionGraph,
        IReadOnlyList<string> functionRootIds)
    {
        var functionRoots = functionRootIds.Count > 0
            ? functionRootIds
            : CallGraphEntryPointResolver.GetConventionEntryPointIds(functionGraph);

        return ResolveFileRoots(functionGraph, functionRoots);
    }

    /// <summary>진입점 파일에서 BFS 깊이(최소). 진입점 파일은 0열에 배치됩니다.</summary>
    public static Dictionary<string, int> ComputeDepthsFromFileRoots(
        FileRelationGraphResult graph,
        IReadOnlyList<string> rootFileIds)
    {
        var depths = graph.Files.ToDictionary(
            file => file.Id,
            _ => int.MaxValue,
            StringComparer.OrdinalIgnoreCase);

        foreach (var rootId in rootFileIds)
        {
            if (!graph.FileMap.ContainsKey(rootId))
            {
                continue;
            }

            var queue = new Queue<(string Id, int Depth)>();
            queue.Enqueue((rootId, 0));

            while (queue.Count > 0)
            {
                var (currentId, depth) = queue.Dequeue();
                if (depths.TryGetValue(currentId, out var existing) && existing <= depth)
                {
                    continue;
                }

                depths[currentId] = depth;

                if (!graph.Outgoing.TryGetValue(currentId, out var children))
                {
                    continue;
                }

                foreach (var childId in children)
                {
                    if (graph.FileMap.ContainsKey(childId))
                    {
                        queue.Enqueue((childId, depth + 1));
                    }
                }
            }
        }

        var reachableMax = depths.Values.Where(value => value != int.MaxValue).DefaultIfEmpty(0).Max();
        foreach (var file in graph.Files)
        {
            if (depths[file.Id] == int.MaxValue)
            {
                depths[file.Id] = reachableMax + 1;
            }
        }

        return depths;
    }

    public static string ToFileId(string normalizedPath) => "file:" + normalizedPath;

    public static string NormalizePath(string path) =>
        Path.GetFullPath(path).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

    private static FileRelationNode CreatePlaceholderFile(string path) => new()
    {
        Id = ToFileId(path),
        FilePath = path,
        DisplayName = Path.GetFileName(path),
        FullName = path,
        FunctionCount = 0
    };
}
