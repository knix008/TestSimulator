using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;
using MyWorkspace.Core.Services;

namespace MyWorkspace.Data.Services;

public sealed class UserNotificationService : IUserNotificationService
{
    private const int MaxNotificationsPerUser = 200;

    private readonly AppDbContext _db;

    public UserNotificationService(AppDbContext db) => _db = db;

    public IReadOnlyList<UserNotificationListItem> GetRecent(User currentUser, int limit = 50)
    {
        limit = Math.Clamp(limit, 1, 100);

        return _db.UserNotifications.AsNoTracking()
            .Where(n => n.UserId == currentUser.Id)
            .OrderByDescending(n => n.CreatedAt)
            .ThenByDescending(n => n.Id)
            .Take(limit)
            .Select(n => new UserNotificationListItem
            {
                Id = n.Id,
                Kind = n.Kind,
                Title = n.Title,
                Body = n.Body,
                ActorUsername = n.ActorUsername,
                WorkspaceId = n.WorkspaceId,
                PageId = n.PageId,
                CreatedAt = n.CreatedAt,
                IsRead = n.IsRead
            })
            .ToList();
    }

    public int GetUnreadCount(User currentUser) =>
        _db.UserNotifications.AsNoTracking()
            .Count(n => n.UserId == currentUser.Id && !n.IsRead);

    public void MarkRead(User currentUser, int notificationId)
    {
        var notification = _db.UserNotifications
            .FirstOrDefault(n => n.Id == notificationId && n.UserId == currentUser.Id);
        if (notification == null || notification.IsRead)
            return;

        notification.IsRead = true;
        _db.SaveChanges();
    }

    public void MarkAllRead(User currentUser)
    {
        var unread = _db.UserNotifications
            .Where(n => n.UserId == currentUser.Id && !n.IsRead)
            .ToList();
        if (unread.Count == 0)
            return;

        foreach (var notification in unread)
            notification.IsRead = true;

        _db.SaveChanges();
    }

    public void Delete(User currentUser, int notificationId)
    {
        var notification = _db.UserNotifications
            .FirstOrDefault(n => n.Id == notificationId && n.UserId == currentUser.Id);
        if (notification == null)
            return;

        _db.UserNotifications.Remove(notification);
        _db.SaveChanges();
    }

    public void DeleteAll(User currentUser)
    {
        var notifications = _db.UserNotifications
            .Where(n => n.UserId == currentUser.Id)
            .ToList();
        if (notifications.Count == 0)
            return;

        _db.UserNotifications.RemoveRange(notifications);
        _db.SaveChanges();
    }

    public void NotifyWorkspaceMembers(
        User actor,
        int workspaceId,
        AppNotificationKind kind,
        string title,
        string body,
        int? pageId = null)
    {
        var recipientIds = GetWorkspaceMemberUserIds(workspaceId, actor.Id);
        if (recipientIds.Count == 0)
            return;

        var now = DateTime.UtcNow;
        foreach (var userId in recipientIds)
        {
            _db.UserNotifications.Add(new UserNotification
            {
                UserId = userId,
                ActorUserId = actor.Id,
                ActorUsername = actor.Username,
                Kind = kind,
                Title = title,
                Body = body,
                WorkspaceId = workspaceId,
                PageId = pageId,
                CreatedAt = now,
                IsRead = false
            });
        }

        _db.SaveChanges();
        TrimOldNotifications(recipientIds);
    }

    private HashSet<int> GetWorkspaceMemberUserIds(int workspaceId, int actorUserId)
    {
        var workspace = _db.Workspaces.AsNoTracking().FirstOrDefault(w => w.Id == workspaceId);
        if (workspace == null)
            return [];

        var memberUserIds = _db.WorkspaceMembers.AsNoTracking()
            .Where(m => m.WorkspaceId == workspaceId)
            .Select(m => m.UserId)
            .ToHashSet();
        memberUserIds.Add(workspace.OwnerId);
        memberUserIds.Remove(actorUserId);
        return memberUserIds;
    }

    private void TrimOldNotifications(IEnumerable<int> userIds)
    {
        foreach (var userId in userIds.Distinct())
        {
            var excess = _db.UserNotifications
                .Where(n => n.UserId == userId)
                .OrderByDescending(n => n.CreatedAt)
                .ThenByDescending(n => n.Id)
                .Skip(MaxNotificationsPerUser)
                .ToList();
            if (excess.Count == 0)
                continue;

            _db.UserNotifications.RemoveRange(excess);
        }

        _db.SaveChanges();
    }
}
