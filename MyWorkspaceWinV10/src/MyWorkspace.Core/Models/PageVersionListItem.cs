namespace MyWorkspace.Core.Models;

public sealed class PageVersionListItem
{
    public int Id { get; init; }
    public int PageId { get; init; }
    public string Title { get; init; } = string.Empty;
    public string SavedByUsername { get; init; } = string.Empty;
    public DateTime SavedAt { get; init; }
}
