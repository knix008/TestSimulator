using MyWorkspace.Core.Enums;

namespace MyWorkspace.Core.Models;

public sealed class UserNotificationListItem
{
    public int Id { get; set; }
    public AppNotificationKind Kind { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public string ActorUsername { get; set; } = string.Empty;
    public int WorkspaceId { get; set; }
    public int? PageId { get; set; }
    public DateTime CreatedAt { get; set; }
    public bool IsRead { get; set; }
}
