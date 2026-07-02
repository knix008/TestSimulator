namespace MyWorkspace.Core.Models;

public sealed class PageTemplate
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required string DefaultTitle { get; init; }
    public required string Description { get; init; }
    public required string ContentPattern { get; init; }
    public int Order { get; init; } = 100;
    public bool IsUserDefined { get; init; }
    public string? SourcePath { get; init; }
}
