using MyWorkspace.Core.Enums;

namespace MyWorkspace.Core.Entities;

public class PageChangeLog
{
    public int Id { get; set; }
    public int PageId { get; set; }
    public int ChangedByUserId { get; set; }
    public DateTime ChangedAt { get; set; }
    public PageChangeAction Action { get; set; }
    public string? OldTitle { get; set; }
    public string? NewTitle { get; set; }
    public int? OldContentLength { get; set; }
    public int? NewContentLength { get; set; }
    public string? Note { get; set; }

    public Page Page { get; set; } = null!;
    public User ChangedByUser { get; set; } = null!;
}
