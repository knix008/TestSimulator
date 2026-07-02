using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Data;

public static class OfflinePageSaveService
{
    public static void SavePage(AppServices offlineServices, User currentUser, OfflinePageContext context, string title, string content)
    {
        MirrorUser(offlineServices.Db, currentUser);
        MirrorWorkspaces(offlineServices.Db, context.Workspaces, currentUser);
        MirrorPage(offlineServices.Db, context, title, content);

        offlineServices.Pages.UpdatePage(currentUser, context.PageId, title, content);
    }

    private static void MirrorUser(AppDbContext db, User user)
    {
        var existing = db.Users.FirstOrDefault(u => u.Id == user.Id);
        if (existing != null)
        {
            existing.Username = user.Username;
            existing.PasswordHash = user.PasswordHash;
            existing.Role = user.Role;
            existing.Email = user.Email;
            existing.NotifyOnPageUpdate = user.NotifyOnPageUpdate;
            existing.NotifyOnWorkspaceChange = user.NotifyOnWorkspaceChange;
            existing.UpdatedAt = DateTime.UtcNow;
            db.SaveChanges();
            return;
        }

        var now = DateTime.UtcNow;
        db.Users.Add(new User
        {
            Id = user.Id,
            Username = user.Username,
            PasswordHash = user.PasswordHash,
            Role = user.Role,
            Email = user.Email,
            NotifyOnPageUpdate = user.NotifyOnPageUpdate,
            NotifyOnWorkspaceChange = user.NotifyOnWorkspaceChange,
            CreatedAt = now,
            UpdatedAt = now
        });
        db.SaveChanges();
        UpdateSqliteSequence(db, "users", user.Id);
    }

    private static void MirrorWorkspaces(AppDbContext db, IReadOnlyList<OfflineWorkspaceSnapshot> workspaces, User currentUser)
    {
        var now = DateTime.UtcNow;

        foreach (var snapshot in workspaces)
        {
            var existing = db.Workspaces.FirstOrDefault(w => w.Id == snapshot.Id);
            if (existing == null)
            {
                db.Workspaces.Add(new Workspace
                {
                    Id = snapshot.Id,
                    ParentId = snapshot.ParentId,
                    Name = snapshot.Name,
                    OwnerId = snapshot.OwnerId,
                    CreatedAt = now,
                    UpdatedAt = now
                });
                db.SaveChanges();
                UpdateSqliteSequence(db, "workspaces", snapshot.Id);
            }
            else
            {
                existing.ParentId = snapshot.ParentId;
                existing.Name = snapshot.Name;
                existing.OwnerId = snapshot.OwnerId;
                existing.UpdatedAt = now;
                db.SaveChanges();
            }

            EnsureWorkspaceMember(db, snapshot.Id, currentUser);
        }
    }

    private static void EnsureWorkspaceMember(AppDbContext db, int workspaceId, User currentUser)
    {
        if (currentUser.Role == UserRole.Admin)
            return;

        var workspace = db.Workspaces.AsNoTracking().First(w => w.Id == workspaceId);
        if (workspace.OwnerId == currentUser.Id)
            return;

        var exists = db.WorkspaceMembers.Any(m => m.WorkspaceId == workspaceId && m.UserId == currentUser.Id);
        if (exists)
            return;

        db.WorkspaceMembers.Add(new WorkspaceMember
        {
            WorkspaceId = workspaceId,
            UserId = currentUser.Id,
            Role = WorkspaceMemberRole.Editor
        });
        db.SaveChanges();
    }

    private static void MirrorPage(AppDbContext db, OfflinePageContext context, string title, string content)
    {
        var now = DateTime.UtcNow;
        var existing = db.Pages.FirstOrDefault(p => p.Id == context.PageId);
        if (existing == null)
        {
            db.Pages.Add(new Page
            {
                Id = context.PageId,
                WorkspaceId = context.WorkspaceId,
                Title = title.Trim(),
                Content = content,
                CreatedAt = now,
                UpdatedAt = now
            });
            db.SaveChanges();
            UpdateSqliteSequence(db, "pages", context.PageId);
            return;
        }

        existing.WorkspaceId = context.WorkspaceId;
        existing.Title = title.Trim();
        existing.Content = content;
        existing.UpdatedAt = now;
        db.SaveChanges();
    }

    private static void UpdateSqliteSequence(AppDbContext db, string tableName, int lastId)
    {
        var provider = db.Database.ProviderName ?? string.Empty;
        if (!provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
            return;

        db.Database.ExecuteSqlRaw(
            """
            INSERT INTO sqlite_sequence(name, seq)
            VALUES ({0}, {1})
            ON CONFLICT(name) DO UPDATE SET seq = MAX(seq, excluded.seq);
            """,
            tableName,
            lastId);
    }
}
