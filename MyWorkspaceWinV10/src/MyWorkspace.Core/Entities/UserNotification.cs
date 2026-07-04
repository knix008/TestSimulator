using MyWorkspace.Core.Enums;

namespace MyWorkspace.Core.Entities;

public class UserNotification
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int ActorUserId { get; set; }
    public string ActorUsername { get; set; } = string.Empty;
    public AppNotificationKind Kind { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public int WorkspaceId { get; set; }
    public int? PageId { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsRead { get; set; }

    public User User { get; set; } = null!;
}
