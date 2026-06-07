namespace CodeAnalyzer.Models;

public sealed class MetricsNavigationRequest
{
    public string? CallGraphNodeId { get; init; }
    public IReadOnlyList<string>? HighlightCallGraphNodeIds { get; init; }
    public string? FilePath { get; init; }
    public int LineNumber { get; init; } = 1;
    public GlobalVariableItem? ShowGlobalVariableAccessGraph { get; init; }
}
