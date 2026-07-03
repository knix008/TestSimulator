namespace MyWorkspace.Core.Models;

public sealed class PageCommentListItem
{
    public int Id { get; set; }
    public int PageId { get; set; }
    public int UserId { get; set; }
    public string AuthorUsername { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public bool CanEdit { get; set; }
    public bool CanDelete { get; set; }
}
