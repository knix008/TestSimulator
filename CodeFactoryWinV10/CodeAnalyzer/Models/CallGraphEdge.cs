namespace CodeAnalyzer.Models;

public sealed class CallGraphEdge
{
    public required string CallerId { get; init; }
    public required string CalleeId { get; init; }
}
