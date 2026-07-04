using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Core.Services;

public interface IUserNotificationService
{
    IReadOnlyList<UserNotificationListItem> GetRecent(User currentUser, int limit = 50);
    int GetUnreadCount(User currentUser);
    void MarkRead(User currentUser, int notificationId);
    void MarkAllRead(User currentUser);
    void Delete(User currentUser, int notificationId);
    void DeleteAll(User currentUser);
    void NotifyWorkspaceMembers(
        User actor,
        int workspaceId,
        AppNotificationKind kind,
        string title,
        string body,
        int? pageId = null);
}
