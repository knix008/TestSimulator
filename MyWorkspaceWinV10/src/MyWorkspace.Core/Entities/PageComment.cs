namespace MyWorkspace.Core.Entities;

public class PageComment
{
    public int Id { get; set; }
    public int PageId { get; set; }
    public int UserId { get; set; }
    public string Content { get; set; } = string.Empty;
    public string? QuotedText { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Page Page { get; set; } = null!;
    public User User { get; set; } = null!;
}
