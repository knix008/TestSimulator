namespace MyWorkspace.Core.Models;

public sealed class PageSearchSelection
{
    public int PageId { get; init; }
    public string Query { get; init; } = string.Empty;
    public bool MatchInContent { get; init; }
}
