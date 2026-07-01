namespace MyWorkspace.Core.Entities;

public class Workspace
{
    public int Id { get; set; }
    public int? ParentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public int OwnerId { get; set; }
    public int? LockedByUserId { get; set; }
    public DateTime? LockedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public Workspace? Parent { get; set; }
    public User Owner { get; set; } = null!;
    public User? LockedByUser { get; set; }
    public ICollection<Workspace> Children { get; set; } = new List<Workspace>();
    public ICollection<Page> Pages { get; set; } = new List<Page>();
    public ICollection<WorkspaceMember> Members { get; set; } = new List<WorkspaceMember>();
}
