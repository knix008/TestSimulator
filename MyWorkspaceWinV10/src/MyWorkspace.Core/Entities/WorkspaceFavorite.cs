namespace MyWorkspace.Core.Entities;

public class WorkspaceFavorite
{
    public int UserId { get; set; }
    public int WorkspaceId { get; set; }
    public DateTime CreatedAt { get; set; }

    public User User { get; set; } = null!;
    public Workspace Workspace { get; set; } = null!;
}
