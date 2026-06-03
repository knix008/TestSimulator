namespace CodeAnalyzer.Models;

public sealed class CircularCallChain
{
    public required string DisplayText { get; init; }
    public IReadOnlyList<string> NodeIds { get; init; } = [];
}
