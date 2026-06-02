namespace CodeAnalyzer.Models;

public sealed class CallGraphNode
{
    public required string Id { get; init; }
    public required string DisplayName { get; init; }
    public required string FullName { get; init; }
    public required string FilePath { get; init; }
    public int LineNumber { get; init; }
}
