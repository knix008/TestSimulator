namespace MyWorkspace.Core.Entities;

public class PageAsset
{
    public int Id { get; set; }
    public int PageId { get; set; }
    public string FileName { get; set; } = string.Empty;
    public byte[] Content { get; set; } = [];
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Page Page { get; set; } = null!;
}
