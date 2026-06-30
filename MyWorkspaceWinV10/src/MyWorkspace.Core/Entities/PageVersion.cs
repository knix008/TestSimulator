namespace MyWorkspace.Core.Entities;

public class PageVersion
{
    public int Id { get; set; }
    public int PageId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public int SavedByUserId { get; set; }
    public DateTime SavedAt { get; set; }

    public Page Page { get; set; } = null!;
    public User SavedByUser { get; set; } = null!;
}
