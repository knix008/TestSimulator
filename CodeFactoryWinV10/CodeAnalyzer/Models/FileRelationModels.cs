namespace CodeAnalyzer.Models;

public sealed class FileRelationNode
{
    public required string Id { get; init; }
    public required string FilePath { get; init; }
    public required string DisplayName { get; init; }
    public required string FullName { get; init; }
    public int FunctionCount { get; init; }
}

public sealed class FileRelationEdge
{
    public required string FromFileId { get; init; }
    public required string ToFileId { get; init; }
    public int CallCount { get; init; }

    public string Label => RelationEdgeLabels.FormatCallCount(CallCount);
}

public sealed class FileRelationGraphResult
{
    public IReadOnlyList<FileRelationNode> Files { get; init; } = [];
    public IReadOnlyList<FileRelationEdge> Edges { get; init; } = [];

    public IReadOnlyDictionary<string, FileRelationNode> FileMap { get; init; }
        = new Dictionary<string, FileRelationNode>(StringComparer.Ordinal);

    public IReadOnlyDictionary<string, List<string>> Outgoing { get; init; }
        = new Dictionary<string, List<string>>(StringComparer.Ordinal);
}
