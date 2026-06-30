using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;
using MyWorkspace.Core.Services;

namespace MyWorkspace.Data.Services;

public sealed class WorkspaceService : IWorkspaceService
{
    private readonly AppDbContext _db;
    private readonly INotificationService? _notifications;

    public WorkspaceService(AppDbContext db, INotificationService? notifications = null)
    {
        _db = db;
        _notifications = notifications;
    }

    public IReadOnlyList<WorkspaceTreeItem> GetWorkspaceTree(User currentUser)
    {
        var accessibleIds = GetAccessibleWorkspaceIds(currentUser);
        if (accessibleIds.Count == 0)
            return Array.Empty<WorkspaceTreeItem>();

        var favoriteIds = GetFavoriteWorkspaceIds(currentUser);
        var workspaces = _db.Workspaces.AsNoTracking()
            .Where(w => accessibleIds.Contains(w.Id))
            .OrderBy(w => w.Name)
            .ToList();

        var pages = _db.Pages.AsNoTracking()
            .Where(p => accessibleIds.Contains(p.WorkspaceId))
            .OrderBy(p => p.Title)
            .ToList();

        var roots = workspaces.Where(w => w.ParentId == null || !accessibleIds.Contains(w.ParentId.Value)).ToList();
        return roots.Select(w => BuildWorkspaceNode(w, workspaces, pages, favoriteIds)).ToList();
    }

    public IReadOnlyList<WorkspaceTreeItem> GetFavoriteWorkspaceTree(User currentUser)
    {
        var favoriteIds = GetFavoriteWorkspaceIds(currentUser);
        if (favoriteIds.Count == 0)
            return Array.Empty<WorkspaceTreeItem>();

        var accessibleIds = GetAccessibleWorkspaceIds(currentUser);
        var validFavoriteIds = favoriteIds.Where(id => accessibleIds.Contains(id) && CanFavoriteWorkspace(currentUser, id)).ToList();
        if (validFavoriteIds.Count == 0)
            return Array.Empty<WorkspaceTreeItem>();

        var workspaces = _db.Workspaces.AsNoTracking()
            .Where(w => accessibleIds.Contains(w.Id))
            .OrderBy(w => w.Name)
            .ToList();

        var pages = _db.Pages.AsNoTracking()
            .Where(p => accessibleIds.Contains(p.WorkspaceId))
            .OrderBy(p => p.Title)
            .ToList();

        return validFavoriteIds
            .Select(id => workspaces.First(w => w.Id == id))
            .OrderBy(w => w.Name)
            .Select(w => BuildWorkspaceNode(w, workspaces, pages, favoriteIds))
            .ToList();
    }

    public bool IsFavorite(User currentUser, int workspaceId) =>
        GetFavoriteWorkspaceIds(currentUser).Contains(workspaceId);

    public void SetFavorite(User currentUser, int workspaceId, bool isFavorite)
    {
        if (!CanFavoriteWorkspace(currentUser, workspaceId))
            throw new InvalidOperationException("등록된 Workspace만 즐겨찾기에 추가할 수 있습니다.");

        var existing = _db.WorkspaceFavorites
            .FirstOrDefault(f => f.UserId == currentUser.Id && f.WorkspaceId == workspaceId);

        if (isFavorite)
        {
            if (existing != null)
                return;

            _db.WorkspaceFavorites.Add(new WorkspaceFavorite
            {
                UserId = currentUser.Id,
                WorkspaceId = workspaceId,
                CreatedAt = DateTime.UtcNow
            });
        }
        else if (existing != null)
        {
            _db.WorkspaceFavorites.Remove(existing);
        }

        _db.SaveChanges();
    }

    public bool CanFavoriteWorkspace(User currentUser, int workspaceId)
    {
        if (!_db.Workspaces.AsNoTracking().Any(w => w.Id == workspaceId))
            return false;

        if (currentUser.Role == UserRole.Admin)
            return CanAccessWorkspace(currentUser, workspaceId);

        var isOwner = _db.Workspaces.AsNoTracking()
            .Any(w => w.Id == workspaceId && w.OwnerId == currentUser.Id);

        var isMember = _db.WorkspaceMembers.AsNoTracking()
            .Any(m => m.WorkspaceId == workspaceId && m.UserId == currentUser.Id);

        return isOwner || isMember;
    }

    public Workspace CreateWorkspace(User currentUser, string name, int? parentId)
    {
        var trimmed = name.Trim();
        if (string.IsNullOrEmpty(trimmed))
            throw new InvalidOperationException("Workspace 이름을 입력하세요.");

        if (parentId.HasValue && !CanAccessWorkspace(currentUser, parentId.Value))
            throw new InvalidOperationException("상위 Workspace에 접근할 수 없습니다.");

        var now = DateTime.UtcNow;
        var workspace = new Workspace
        {
            Name = trimmed,
            ParentId = parentId,
            OwnerId = currentUser.Id,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.Workspaces.Add(workspace);
        _db.SaveChanges();

        _db.WorkspaceMembers.Add(new WorkspaceMember
        {
            WorkspaceId = workspace.Id,
            UserId = currentUser.Id,
            Role = WorkspaceMemberRole.Owner
        });
        _db.SaveChanges();

        return workspace;
    }

    public void RenameWorkspace(User currentUser, int workspaceId, string name)
    {
        EnsureCanManage(currentUser, workspaceId);

        var trimmed = name.Trim();
        if (string.IsNullOrEmpty(trimmed))
            throw new InvalidOperationException("Workspace 이름을 입력하세요.");

        var workspace = _db.Workspaces.First(w => w.Id == workspaceId);
        var previousName = workspace.Name;
        workspace.Name = trimmed;
        workspace.UpdatedAt = DateTime.UtcNow;
        _db.SaveChanges();

        if (previousName != trimmed)
            _notifications?.NotifyWorkspaceRenamed(currentUser, workspace, previousName);
    }

    public void MoveWorkspace(User currentUser, int workspaceId, int? newParentId)
    {
        EnsureCanManage(currentUser, workspaceId);

        if (newParentId == workspaceId)
            throw new InvalidOperationException("자기 자신 아래로 이동할 수 없습니다.");

        if (newParentId.HasValue)
        {
            if (!CanAccessWorkspace(currentUser, newParentId.Value))
                throw new InvalidOperationException("대상 Workspace에 접근할 수 없습니다.");

            if (!CanManageWorkspace(currentUser, newParentId.Value))
                throw new InvalidOperationException("대상 Workspace를 관리할 권한이 없습니다.");

            if (IsDescendantOf(newParentId.Value, workspaceId))
                throw new InvalidOperationException("하위 Workspace로는 이동할 수 없습니다.");
        }

        var workspace = _db.Workspaces.First(w => w.Id == workspaceId);
        workspace.ParentId = newParentId;
        workspace.UpdatedAt = DateTime.UtcNow;
        _db.SaveChanges();
    }

    public void DeleteWorkspace(User currentUser, int workspaceId)
    {
        EnsureCanManage(currentUser, workspaceId);

        var workspace = _db.Workspaces
            .Include(w => w.Children)
            .FirstOrDefault(w => w.Id == workspaceId)
            ?? throw new InvalidOperationException("Workspace를 찾을 수 없습니다.");

        if (workspace.Children.Count > 0)
            throw new InvalidOperationException("하위 Workspace가 있으면 삭제할 수 없습니다.");

        if (_db.Pages.Any(p => p.WorkspaceId == workspaceId))
            throw new InvalidOperationException("Page가 있으면 삭제할 수 없습니다. Page를 먼저 삭제하세요.");

        _db.Workspaces.Remove(workspace);
        _db.SaveChanges();
    }

    public bool CanManageWorkspace(User currentUser, int workspaceId)
    {
        if (currentUser.Role == UserRole.Admin)
            return true;

        return _db.WorkspaceMembers.AsNoTracking()
            .Any(m => m.WorkspaceId == workspaceId
                && m.UserId == currentUser.Id
                && m.Role >= WorkspaceMemberRole.Editor);
    }

    public IReadOnlyList<WorkspaceMember> GetMembers(User currentUser, int workspaceId)
    {
        EnsureCanManage(currentUser, workspaceId);

        return _db.WorkspaceMembers.AsNoTracking()
            .Include(m => m.User)
            .Where(m => m.WorkspaceId == workspaceId)
            .OrderBy(m => m.User.Username)
            .ToList();
    }

    public void AddMember(User currentUser, int workspaceId, int userId, WorkspaceMemberRole role)
    {
        EnsureCanManage(currentUser, workspaceId);

        if (role == WorkspaceMemberRole.Owner)
            throw new InvalidOperationException("Owner 역할은 Workspace 생성 시 자동으로 지정됩니다.");

        if (_db.WorkspaceMembers.Any(m => m.WorkspaceId == workspaceId && m.UserId == userId))
            throw new InvalidOperationException("이미 등록된 멤버입니다.");

        _db.WorkspaceMembers.Add(new WorkspaceMember
        {
            WorkspaceId = workspaceId,
            UserId = userId,
            Role = role
        });
        _db.SaveChanges();

        var workspace = _db.Workspaces.AsNoTracking().First(w => w.Id == workspaceId);
        var member = _db.Users.AsNoTracking().First(u => u.Id == userId);
        _notifications?.NotifyWorkspaceMemberAdded(currentUser, workspaceId, workspace.Name, member);
    }

    public void RemoveMember(User currentUser, int workspaceId, int userId)
    {
        EnsureCanManage(currentUser, workspaceId);

        var member = _db.WorkspaceMembers
            .FirstOrDefault(m => m.WorkspaceId == workspaceId && m.UserId == userId);

        if (member == null)
            return;

        if (member.Role == WorkspaceMemberRole.Owner)
            throw new InvalidOperationException("Owner는 제거할 수 없습니다.");

        var workspace = _db.Workspaces.AsNoTracking().First(w => w.Id == workspaceId);
        var removedUser = _db.Users.AsNoTracking().First(u => u.Id == userId);

        _db.WorkspaceMembers.Remove(member);
        _db.SaveChanges();

        _notifications?.NotifyWorkspaceMemberRemoved(currentUser, workspaceId, workspace.Name, removedUser);
    }

    public bool CanAccessWorkspace(User currentUser, int workspaceId) =>
        GetAccessibleWorkspaceIds(currentUser).Contains(workspaceId);

    public bool HasPages(int workspaceId) =>
        _db.Pages.AsNoTracking().Any(p => p.WorkspaceId == workspaceId);

    private HashSet<int> GetFavoriteWorkspaceIds(User currentUser) =>
        _db.WorkspaceFavorites.AsNoTracking()
            .Where(f => f.UserId == currentUser.Id)
            .Select(f => f.WorkspaceId)
            .ToHashSet();

    private HashSet<int> GetAccessibleWorkspaceIds(User currentUser)
    {
        if (currentUser.Role == UserRole.Admin)
            return _db.Workspaces.AsNoTracking().Select(w => w.Id).ToHashSet();

        var directIds = _db.Workspaces.AsNoTracking()
            .Where(w => w.OwnerId == currentUser.Id)
            .Select(w => w.Id)
            .Union(_db.WorkspaceMembers.AsNoTracking()
                .Where(m => m.UserId == currentUser.Id)
                .Select(m => m.WorkspaceId))
            .ToHashSet();

        if (directIds.Count == 0)
            return directIds;

        var all = _db.Workspaces.AsNoTracking().Select(w => new { w.Id, w.ParentId }).ToList();
        var result = new HashSet<int>(directIds);
        var changed = true;

        while (changed)
        {
            changed = false;
            foreach (var ws in all)
            {
                if (ws.ParentId.HasValue && result.Contains(ws.ParentId.Value) && result.Add(ws.Id))
                    changed = true;
            }
        }

        return result;
    }

    private void EnsureCanManage(User currentUser, int workspaceId)
    {
        if (!CanManageWorkspace(currentUser, workspaceId))
            throw new InvalidOperationException("Workspace를 관리할 권한이 없습니다.");
    }

    private bool IsDescendantOf(int nodeId, int potentialAncestorId)
    {
        var currentId = nodeId;
        while (true)
        {
            var current = _db.Workspaces.AsNoTracking().FirstOrDefault(w => w.Id == currentId);
            if (current == null)
                return false;

            if (current.Id == potentialAncestorId)
                return true;

            if (!current.ParentId.HasValue)
                return false;

            currentId = current.ParentId.Value;
        }
    }

    private static WorkspaceTreeItem BuildWorkspaceNode(
        Workspace workspace,
        IReadOnlyList<Workspace> allWorkspaces,
        IReadOnlyList<Page> allPages,
        IReadOnlySet<int> favoriteIds)
    {
        var node = new WorkspaceTreeItem
        {
            Kind = TreeNodeKind.Workspace,
            Id = workspace.Id,
            Name = workspace.Name,
            ParentWorkspaceId = workspace.ParentId,
            IsFavorite = favoriteIds.Contains(workspace.Id)
        };

        var childWorkspaces = allWorkspaces
            .Where(w => w.ParentId == workspace.Id)
            .OrderBy(w => w.Name);

        foreach (var child in childWorkspaces)
            node.Children.Add(BuildWorkspaceNode(child, allWorkspaces, allPages, favoriteIds));

        foreach (var page in allPages.Where(p => p.WorkspaceId == workspace.Id).OrderBy(p => p.Title))
        {
            node.Children.Add(new WorkspaceTreeItem
            {
                Kind = TreeNodeKind.Page,
                Id = page.Id,
                Name = page.Title,
                ParentWorkspaceId = workspace.Id
            });
        }

        return node;
    }
}
