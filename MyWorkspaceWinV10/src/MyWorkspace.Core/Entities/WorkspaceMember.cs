using MyWorkspace.Core.Enums;

namespace MyWorkspace.Core.Entities;

public class WorkspaceMember
{
    public int WorkspaceId { get; set; }
    public int UserId { get; set; }
    public WorkspaceMemberRole Role { get; set; } = WorkspaceMemberRole.Viewer;

    public Workspace Workspace { get; set; } = null!;
    public User User { get; set; } = null!;
}
