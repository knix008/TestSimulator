namespace MyWorkspace.Core.Models;

public sealed class PageSearchResult
{
    public int PageId { get; init; }
    public string PageTitle { get; init; } = string.Empty;
    public string WorkspaceName { get; init; } = string.Empty;
    public string Snippet { get; init; } = string.Empty;
    public bool MatchInContent { get; init; }
}
