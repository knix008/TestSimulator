using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core;
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
        var workspaces = NameSortHelper.OrderByName(
            _db.Workspaces.AsNoTracking()
                .Include(w => w.LockedByUser)
                .Where(w => accessibleIds.Contains(w.Id))
                .ToList(),
            w => w.Name);

        var pages = NameSortHelper.OrderByName(
            _db.Pages.AsNoTracking()
                .Include(p => p.LockedByUser)
                .Where(p => accessibleIds.Contains(p.WorkspaceId))
                .ToList(),
            p => p.Title);

        var roots = workspaces.Where(w => w.ParentId == null || !accessibleIds.Contains(w.ParentId.Value)).ToList();
        return roots.Select(w => BuildWorkspaceNode(w, workspaces, pages, favoriteIds, ancestorLocked: false)).ToList();
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

        var workspaces = NameSortHelper.OrderByName(
            _db.Workspaces.AsNoTracking()
                .Include(w => w.LockedByUser)
                .Where(w => accessibleIds.Contains(w.Id))
                .ToList(),
            w => w.Name);

        var pages = NameSortHelper.OrderByName(
            _db.Pages.AsNoTracking()
                .Include(p => p.LockedByUser)
                .Where(p => accessibleIds.Contains(p.WorkspaceId))
                .ToList(),
            p => p.Title);

        return NameSortHelper.OrderByName(
                validFavoriteIds
                    .Select(id => workspaces.First(w => w.Id == id)),
                w => w.Name)
            .Select(w => BuildWorkspaceNode(w, workspaces, pages, favoriteIds, ancestorLocked: false))
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

        var siblingNames = NameSortHelper.OrderNames(
            _db.Workspaces.AsNoTracking()
                .Where(w => w.ParentId == parentId)
                .Select(w => w.Name)
                .ToList());
        var uniqueName = UniqueNameHelper.MakeUnique(trimmed, siblingNames);

        var now = DateTime.UtcNow;
        var workspace = new Workspace
        {
            Name = uniqueName,
            ParentId = parentId,
            OwnerId = currentUser.Id,
            CreatedAt = now,
            UpdatedAt = now
        };

        if (parentId.HasValue)
        {
            var inheritedLockUserId = GetEffectiveWorkspaceLockUserId(parentId.Value);
            if (inheritedLockUserId.HasValue)
            {
                workspace.LockedByUserId = inheritedLockUserId.Value;
                workspace.LockedAt = now;
            }
        }

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
        EnsureCanEditContent(currentUser, workspaceId);

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
        EnsureCanEditContent(currentUser, workspaceId);

        if (newParentId == workspaceId)
            throw new InvalidOperationException("자기 자신 아래로 이동할 수 없습니다.");

        if (newParentId.HasValue)
        {
            if (!CanAccessWorkspace(currentUser, newParentId.Value))
                throw new InvalidOperationException("대상 Workspace에 접근할 수 없습니다.");

            if (!CanEditWorkspaceContent(currentUser, newParentId.Value))
                throw new InvalidOperationException("대상 Workspace를 관리할 권한이 없습니다.");

            if (IsDescendantOf(newParentId.Value, workspaceId))
                throw new InvalidOperationException("하위 Workspace로는 이동할 수 없습니다.");
        }

        var workspace = _db.Workspaces.First(w => w.Id == workspaceId);
        workspace.ParentId = newParentId;
        workspace.UpdatedAt = DateTime.UtcNow;
        _db.SaveChanges();
    }

    public void DeleteWorkspace(User currentUser, int workspaceId, bool userConfirmed)
    {
        if (!userConfirmed)
            throw new InvalidOperationException("Workspace 삭제는 사용자 확인 후에만 가능합니다.");

        EnsureCanEditContent(currentUser, workspaceId);

        var workspace = _db.Workspaces
            .Include(w => w.Children)
            .FirstOrDefault(w => w.Id == workspaceId)
            ?? throw new InvalidOperationException("Workspace를 찾을 수 없습니다.");

        if (workspace.Children.Count > 0)
            throw new InvalidOperationException("하위 Workspace가 있으면 삭제할 수 없습니다.");

        var pages = _db.Pages.Where(p => p.WorkspaceId == workspaceId).ToList();
        if (pages.Count > 0)
        {
            var now = DateTime.UtcNow;
            foreach (var page in pages)
            {
                _db.PageChangeLogs.Add(new PageChangeLog
                {
                    PageId = page.Id,
                    ChangedByUserId = currentUser.Id,
                    ChangedAt = now,
                    Action = PageChangeAction.Deleted,
                    OldTitle = TruncatePageTitle(page.Title)
                });
                _notifications?.NotifyPageDeleted(currentUser, workspaceId, page.Title);
            }

            _db.Pages.RemoveRange(pages);
        }

        _db.Workspaces.Remove(workspace);
        _db.SaveChanges();
    }

    private static string TruncatePageTitle(string title) =>
        title.Length <= 200 ? title : title[..200];

    public bool CanManageWorkspace(User currentUser, int workspaceId)
    {
        if (currentUser.Role == UserRole.Admin)
            return true;

        return _db.WorkspaceMembers.AsNoTracking()
            .Any(m => m.WorkspaceId == workspaceId
                && m.UserId == currentUser.Id
                && m.Role >= WorkspaceMemberRole.Editor);
    }

    public bool IsWorkspaceLocked(int workspaceId) =>
        IsWorkspaceDirectlyLocked(workspaceId) || HasLockedAncestorWorkspace(workspaceId);

    public bool CanEditWorkspaceContent(User currentUser, int workspaceId)
    {
        if (!CanManageWorkspace(currentUser, workspaceId))
            return false;

        var lockedByUserId = GetEffectiveWorkspaceLockUserId(workspaceId);
        if (!lockedByUserId.HasValue)
            return true;

        if (currentUser.Role == UserRole.Admin)
            return true;

        return lockedByUserId.Value == currentUser.Id;
    }

    public bool CanLockWorkspace(User currentUser, int workspaceId) =>
        CanManageWorkspace(currentUser, workspaceId) && !IsWorkspaceLocked(workspaceId);

    public bool CanUnlockWorkspace(User currentUser, int workspaceId)
    {
        if (!IsWorkspaceDirectlyLocked(workspaceId))
            return false;

        if (HasLockedAncestorWorkspace(workspaceId))
            return false;

        if (currentUser.Role == UserRole.Admin)
            return true;

        var lockedByUserId = _db.Workspaces.AsNoTracking()
            .Where(w => w.Id == workspaceId)
            .Select(w => w.LockedByUserId)
            .FirstOrDefault();

        return lockedByUserId == currentUser.Id;
    }

    public void LockWorkspace(User currentUser, int workspaceId)
    {
        if (!CanLockWorkspace(currentUser, workspaceId))
            throw new InvalidOperationException("Workspace를 잠글 권한이 없습니다.");

        var subtreeWorkspaceIds = GetSubtreeWorkspaceIds(workspaceId);
        var now = DateTime.UtcNow;

        foreach (var id in subtreeWorkspaceIds)
        {
            var workspace = _db.Workspaces.First(w => w.Id == id);
            if (workspace.LockedByUserId.HasValue)
                continue;

            workspace.LockedByUserId = currentUser.Id;
            workspace.LockedAt = now;
            workspace.UpdatedAt = now;
        }

        foreach (var page in _db.Pages.Where(p => subtreeWorkspaceIds.Contains(p.WorkspaceId)))
        {
            if (page.LockedByUserId.HasValue)
                continue;

            page.LockedByUserId = currentUser.Id;
            page.LockedAt = now;
            page.UpdatedAt = now;
        }

        _db.SaveChanges();
    }

    public void UnlockWorkspace(User currentUser, int workspaceId)
    {
        if (!CanUnlockWorkspace(currentUser, workspaceId))
            throw new InvalidOperationException("Workspace 잠금을 해제할 권한이 없습니다.");

        var subtreeWorkspaceIds = GetSubtreeWorkspaceIds(workspaceId);

        foreach (var id in subtreeWorkspaceIds)
        {
            var workspace = _db.Workspaces.First(w => w.Id == id);
            if (!workspace.LockedByUserId.HasValue)
                continue;

            workspace.LockedByUserId = null;
            workspace.LockedAt = null;
            workspace.UpdatedAt = DateTime.UtcNow;
        }

        foreach (var page in _db.Pages.Where(p => subtreeWorkspaceIds.Contains(p.WorkspaceId)))
        {
            if (!page.LockedByUserId.HasValue)
                continue;

            page.LockedByUserId = null;
            page.LockedAt = null;
            page.UpdatedAt = DateTime.UtcNow;
        }

        _db.SaveChanges();
    }

    public string? GetWorkspaceLockHolderUsername(int workspaceId)
    {
        var currentId = workspaceId;
        while (true)
        {
            var workspace = _db.Workspaces.AsNoTracking()
                .Include(w => w.LockedByUser)
                .FirstOrDefault(w => w.Id == currentId);
            if (workspace == null)
                return null;

            if (workspace.LockedByUserId.HasValue)
                return workspace.LockedByUser?.Username;

            if (!workspace.ParentId.HasValue)
                return null;

            currentId = workspace.ParentId.Value;
        }
    }

    public IReadOnlyList<WorkspaceMember> GetMembers(User currentUser, int workspaceId)
    {
        EnsureCanEditContent(currentUser, workspaceId);

        return _db.WorkspaceMembers.AsNoTracking()
            .Include(m => m.User)
            .Where(m => m.WorkspaceId == workspaceId)
            .OrderBy(m => m.User.Username)
            .ToList();
    }

    public void AddMember(User currentUser, int workspaceId, int userId, WorkspaceMemberRole role)
    {
        EnsureCanEditContent(currentUser, workspaceId);

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
        EnsureCanEditContent(currentUser, workspaceId);

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

    public void UpdateMemberRole(User currentUser, int workspaceId, int userId, WorkspaceMemberRole role)
    {
        EnsureCanEditContent(currentUser, workspaceId);

        if (role == WorkspaceMemberRole.Owner)
            throw new InvalidOperationException("Owner 역할은 변경할 수 없습니다.");

        var member = _db.WorkspaceMembers
            .FirstOrDefault(m => m.WorkspaceId == workspaceId && m.UserId == userId)
            ?? throw new InvalidOperationException("멤버를 찾을 수 없습니다.");

        if (member.Role == WorkspaceMemberRole.Owner)
            throw new InvalidOperationException("Owner 역할은 변경할 수 없습니다.");

        if (member.Role == role)
            return;

        member.Role = role;
        _db.SaveChanges();
    }

    public bool CanAccessWorkspace(User currentUser, int workspaceId) =>
        GetAccessibleWorkspaceIds(currentUser).Contains(workspaceId);

    public IReadOnlyCollection<int> GetAccessibleWorkspaceIds(User currentUser) =>
        GetAccessibleWorkspaceIdsInternal(currentUser);

    public bool HasPages(int workspaceId) =>
        _db.Pages.AsNoTracking().Any(p => p.WorkspaceId == workspaceId);

    public int GetPageCountInWorkspace(int workspaceId) =>
        _db.Pages.AsNoTracking().Count(p => p.WorkspaceId == workspaceId);

    public bool HasChildWorkspaces(int workspaceId) =>
        _db.Workspaces.AsNoTracking().Any(w => w.ParentId == workspaceId);

    private HashSet<int> GetFavoriteWorkspaceIds(User currentUser) =>
        _db.WorkspaceFavorites.AsNoTracking()
            .Where(f => f.UserId == currentUser.Id)
            .Select(f => f.WorkspaceId)
            .ToHashSet();

    private HashSet<int> GetAccessibleWorkspaceIdsInternal(User currentUser)
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

    private void EnsureCanEditContent(User currentUser, int workspaceId)
    {
        if (!CanEditWorkspaceContent(currentUser, workspaceId))
            throw new InvalidOperationException("Workspace가 잠겨 있거나 편집 권한이 없습니다.");
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
        IReadOnlySet<int> favoriteIds,
        bool ancestorLocked)
    {
        var selfLocked = workspace.LockedByUserId.HasValue;
        var effectivelyLocked = ancestorLocked || selfLocked;

        var node = new WorkspaceTreeItem
        {
            Kind = TreeNodeKind.Workspace,
            Id = workspace.Id,
            Name = workspace.Name,
            ParentWorkspaceId = workspace.ParentId,
            IsFavorite = favoriteIds.Contains(workspace.Id),
            IsLocked = effectivelyLocked,
            LockedByUserId = selfLocked ? workspace.LockedByUserId : null,
            LockedByUsername = selfLocked ? workspace.LockedByUser?.Username : null
        };

        var childWorkspaces = allWorkspaces
            .Where(w => w.ParentId == workspace.Id)
            .OrderBy(w => w.Name, NameSortHelper.Comparer);

        foreach (var child in childWorkspaces)
            node.Children.Add(BuildWorkspaceNode(child, allWorkspaces, allPages, favoriteIds, effectivelyLocked));

        foreach (var page in allPages
                     .Where(p => p.WorkspaceId == workspace.Id)
                     .OrderBy(p => p.Title, NameSortHelper.Comparer))
        {
            var pageSelfLocked = page.LockedByUserId.HasValue;
            node.Children.Add(new WorkspaceTreeItem
            {
                Kind = TreeNodeKind.Page,
                Id = page.Id,
                Name = page.Title,
                ParentWorkspaceId = workspace.Id,
                IsLocked = effectivelyLocked || pageSelfLocked,
                LockedByUserId = pageSelfLocked ? page.LockedByUserId : null,
                LockedByUsername = pageSelfLocked ? page.LockedByUser?.Username : null
            });
        }

        return node;
    }

    private bool IsWorkspaceDirectlyLocked(int workspaceId) =>
        _db.Workspaces.AsNoTracking().Any(w => w.Id == workspaceId && w.LockedByUserId != null);

    private bool HasLockedAncestorWorkspace(int workspaceId)
    {
        var current = _db.Workspaces.AsNoTracking()
            .Where(w => w.Id == workspaceId)
            .Select(w => w.ParentId)
            .FirstOrDefault();

        while (current.HasValue)
        {
            var parent = _db.Workspaces.AsNoTracking()
                .Where(w => w.Id == current.Value)
                .Select(w => new { w.ParentId, w.LockedByUserId })
                .FirstOrDefault();

            if (parent == null)
                return false;

            if (parent.LockedByUserId.HasValue)
                return true;

            current = parent.ParentId;
        }

        return false;
    }

    private int? GetEffectiveWorkspaceLockUserId(int workspaceId)
    {
        var currentId = workspaceId;
        while (true)
        {
            var workspace = _db.Workspaces.AsNoTracking()
                .Where(w => w.Id == currentId)
                .Select(w => new { w.ParentId, w.LockedByUserId })
                .FirstOrDefault();

            if (workspace == null)
                return null;

            if (workspace.LockedByUserId.HasValue)
                return workspace.LockedByUserId;

            if (!workspace.ParentId.HasValue)
                return null;

            currentId = workspace.ParentId.Value;
        }
    }

    private List<int> GetSubtreeWorkspaceIds(int rootWorkspaceId)
    {
        var all = _db.Workspaces.AsNoTracking()
            .Select(w => new { w.Id, w.ParentId })
            .ToList();

        var result = new List<int> { rootWorkspaceId };
        var queue = new Queue<int>();
        queue.Enqueue(rootWorkspaceId);

        while (queue.Count > 0)
        {
            var id = queue.Dequeue();
            foreach (var child in all.Where(w => w.ParentId == id))
            {
                result.Add(child.Id);
                queue.Enqueue(child.Id);
            }
        }

        return result;
    }
}
