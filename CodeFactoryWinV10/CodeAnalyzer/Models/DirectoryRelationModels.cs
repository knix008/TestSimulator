namespace CodeAnalyzer.Models;

public sealed class DirectoryRelationNode
{
    public required string Id { get; init; }
    public required string DirectoryPath { get; init; }
    public required string DisplayName { get; init; }
    public required string FullName { get; init; }
    public int FileCount { get; init; }
    public int FunctionCount { get; init; }
}

public sealed class DirectoryRelationEdge
{
    public required string FromDirectoryId { get; init; }
    public required string ToDirectoryId { get; init; }
    public int CallCount { get; init; }

    public string Label => RelationEdgeLabels.FormatCallCount(CallCount);
}

public sealed class DirectoryRelationGraphResult
{
    public IReadOnlyList<DirectoryRelationNode> Directories { get; init; } = [];
    public IReadOnlyList<DirectoryRelationEdge> Edges { get; init; } = [];

    public IReadOnlyDictionary<string, DirectoryRelationNode> DirectoryMap { get; init; }
        = new Dictionary<string, DirectoryRelationNode>(StringComparer.Ordinal);

    public IReadOnlyDictionary<string, List<string>> Outgoing { get; init; }
        = new Dictionary<string, List<string>>(StringComparer.Ordinal);
}
