using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Services;

namespace MyWorkspace.Data.Services;

public sealed class PageService : IPageService
{
    private readonly AppDbContext _db;
    private readonly IWorkspaceService _workspaceService;
    private readonly IPageVersionService _pageVersionService;
    private readonly IPageChangeLogService _pageChangeLogs;
    private readonly INotificationService? _notifications;

    public PageService(
        AppDbContext db,
        IWorkspaceService workspaceService,
        IPageVersionService pageVersionService,
        IPageChangeLogService pageChangeLogs,
        INotificationService? notifications = null)
    {
        _db = db;
        _workspaceService = workspaceService;
        _pageVersionService = pageVersionService;
        _pageChangeLogs = pageChangeLogs;
        _notifications = notifications;
    }

    public Page? GetById(User currentUser, int pageId)
    {
        var page = _db.Pages.AsNoTracking().FirstOrDefault(p => p.Id == pageId);
        if (page == null || !_workspaceService.CanAccessWorkspace(currentUser, page.WorkspaceId))
            return null;

        return page;
    }

    public Page CreatePage(User currentUser, int workspaceId, string title, string content)
    {
        if (!_workspaceService.CanEditWorkspaceContent(currentUser, workspaceId))
            throw new InvalidOperationException("Page를 생성할 권한이 없습니다.");

        var trimmed = title.Trim();
        if (string.IsNullOrEmpty(trimmed))
            throw new InvalidOperationException("Page 제목을 입력하세요.");

        if (string.IsNullOrWhiteSpace(content))
            throw new InvalidOperationException("Page 내용이 비어 있습니다.");

        var now = DateTime.UtcNow;
        var page = new Page
        {
            WorkspaceId = workspaceId,
            Title = trimmed,
            Content = content,
            CreatedAt = now,
            UpdatedAt = now
        };

        var inheritedLockUserId = GetEffectiveWorkspaceLockUserId(workspaceId);
        if (inheritedLockUserId.HasValue)
        {
            page.LockedByUserId = inheritedLockUserId.Value;
            page.LockedAt = now;
        }

        _db.Pages.Add(page);
        _db.SaveChanges();
        _pageChangeLogs.Append(currentUser, page.Id, PageChangeAction.Created, newTitle: trimmed, newContentLength: content.Length);
        _notifications?.NotifyPageCreated(currentUser, page);
        return page;
    }

    public void UpdatePage(User currentUser, int pageId, string title, string content)
    {
        var page = _db.Pages.FirstOrDefault(p => p.Id == pageId)
            ?? throw new InvalidOperationException("Page를 찾을 수 없습니다.");

        if (!_workspaceService.CanEditWorkspaceContent(currentUser, page.WorkspaceId))
            throw new InvalidOperationException("Page를 수정할 권한이 없습니다.");

        EnsureCanEditPage(currentUser, pageId);

        var trimmed = title.Trim();
        if (string.IsNullOrEmpty(trimmed))
            throw new InvalidOperationException("Page 제목을 입력하세요.");

        if (page.Title != trimmed || page.Content != content)
            _pageVersionService.SaveVersion(currentUser, pageId, page.Title, page.Content);

        var titleChanged = page.Title != trimmed;
        var contentChanged = page.Content != content;
        if (titleChanged || contentChanged)
        {
            _pageChangeLogs.Append(
                currentUser,
                pageId,
                PageChangeLogHelper.ResolveUpdateAction(titleChanged, contentChanged),
                oldTitle: page.Title,
                newTitle: trimmed,
                oldContentLength: page.Content.Length,
                newContentLength: content.Length);
        }

        page.Title = trimmed;
        page.Content = content;
        page.UpdatedAt = DateTime.UtcNow;
        _db.SaveChanges();

        _notifications?.NotifyPageUpdated(currentUser, page, $"{currentUser.Username}님이 Page \"{trimmed}\"을(를) 수정했습니다.");
    }

    public void MovePage(User currentUser, int pageId, int targetWorkspaceId)
    {
        var page = _db.Pages.FirstOrDefault(p => p.Id == pageId)
            ?? throw new InvalidOperationException("Page를 찾을 수 없습니다.");

        if (!_workspaceService.CanEditWorkspaceContent(currentUser, page.WorkspaceId))
            throw new InvalidOperationException("Page를 이동할 권한이 없습니다.");

        EnsureCanEditPage(currentUser, pageId);

        if (!_workspaceService.CanEditWorkspaceContent(currentUser, targetWorkspaceId))
            throw new InvalidOperationException("대상 Workspace를 관리할 권한이 없습니다.");

        if (page.WorkspaceId == targetWorkspaceId)
            return;

        var sourceWorkspace = _db.Workspaces.AsNoTracking().First(w => w.Id == page.WorkspaceId);
        var targetWorkspace = _db.Workspaces.AsNoTracking().First(w => w.Id == targetWorkspaceId);

        page.WorkspaceId = targetWorkspaceId;
        page.UpdatedAt = DateTime.UtcNow;
        _db.SaveChanges();
        _pageChangeLogs.Append(
            currentUser,
            pageId,
            PageChangeAction.Moved,
            note: $"{sourceWorkspace.Name} -> {targetWorkspace.Name}");
    }

    public void DeletePage(User currentUser, int pageId)
    {
        var page = _db.Pages.FirstOrDefault(p => p.Id == pageId);
        if (page == null)
            return;

        if (!_workspaceService.CanEditWorkspaceContent(currentUser, page.WorkspaceId))
            throw new InvalidOperationException("Page를 삭제할 권한이 없습니다.");

        EnsureCanEditPage(currentUser, pageId);

        var workspaceId = page.WorkspaceId;
        var pageTitle = page.Title;
        _pageChangeLogs.Append(currentUser, pageId, PageChangeAction.Deleted, oldTitle: pageTitle);
        _db.Pages.Remove(page);
        _db.SaveChanges();
        _notifications?.NotifyPageDeleted(currentUser, workspaceId, pageTitle);
    }

    public bool IsPageLocked(int pageId)
    {
        var page = _db.Pages.AsNoTracking()
            .Where(p => p.Id == pageId)
            .Select(p => new { p.LockedByUserId, p.WorkspaceId })
            .FirstOrDefault();

        if (page == null)
            return false;

        if (page.LockedByUserId.HasValue)
            return true;

        return _workspaceService.IsWorkspaceLocked(page.WorkspaceId);
    }

    public bool CanEditPageContent(User currentUser, int pageId)
    {
        var page = _db.Pages.AsNoTracking().FirstOrDefault(p => p.Id == pageId);
        if (page == null)
            return false;

        if (!_workspaceService.CanEditWorkspaceContent(currentUser, page.WorkspaceId))
            return false;

        var lockedByUserId = GetEffectivePageLockUserId(pageId);
        if (!lockedByUserId.HasValue)
            return true;

        if (currentUser.Role == UserRole.Admin)
            return true;

        return lockedByUserId.Value == currentUser.Id;
    }

    public bool CanLockPage(User currentUser, int pageId)
    {
        var page = _db.Pages.AsNoTracking().FirstOrDefault(p => p.Id == pageId);
        if (page == null)
            return false;

        return _workspaceService.CanManageWorkspace(currentUser, page.WorkspaceId) && !IsPageLocked(pageId);
    }

    public bool CanUnlockPage(User currentUser, int pageId)
    {
        var page = _db.Pages.AsNoTracking()
            .Where(p => p.Id == pageId)
            .Select(p => new { p.LockedByUserId, p.WorkspaceId })
            .FirstOrDefault();

        if (page == null || !page.LockedByUserId.HasValue)
            return false;

        if (_workspaceService.IsWorkspaceLocked(page.WorkspaceId))
            return false;

        if (currentUser.Role == UserRole.Admin)
            return true;

        return page.LockedByUserId.Value == currentUser.Id;
    }

    public void LockPage(User currentUser, int pageId)
    {
        if (!CanLockPage(currentUser, pageId))
            throw new InvalidOperationException("Page를 잠글 권한이 없습니다.");

        var page = _db.Pages.First(p => p.Id == pageId);
        if (page.LockedByUserId.HasValue)
            return;

        var now = DateTime.UtcNow;
        page.LockedByUserId = currentUser.Id;
        page.LockedAt = now;
        page.UpdatedAt = now;
        _db.SaveChanges();
    }

    public void UnlockPage(User currentUser, int pageId)
    {
        if (!CanUnlockPage(currentUser, pageId))
            throw new InvalidOperationException("Page 잠금을 해제할 권한이 없습니다.");

        var page = _db.Pages.First(p => p.Id == pageId);
        if (!page.LockedByUserId.HasValue)
            return;

        page.LockedByUserId = null;
        page.LockedAt = null;
        page.UpdatedAt = DateTime.UtcNow;
        _db.SaveChanges();
    }

    public string? GetPageLockHolderUsername(int pageId)
    {
        var page = _db.Pages.AsNoTracking()
            .Where(p => p.Id == pageId)
            .Select(p => new { p.LockedByUserId, p.WorkspaceId })
            .FirstOrDefault();

        if (page == null)
            return null;

        if (page.LockedByUserId.HasValue)
        {
            return _db.Pages.AsNoTracking()
                .Include(p => p.LockedByUser)
                .Where(p => p.Id == pageId)
                .Select(p => p.LockedByUser!.Username)
                .FirstOrDefault();
        }

        return _workspaceService.GetWorkspaceLockHolderUsername(page.WorkspaceId);
    }

    private int? GetEffectiveWorkspaceLockUserId(int workspaceId)
    {
        var workspace = _db.Workspaces.AsNoTracking()
            .Where(w => w.Id == workspaceId)
            .Select(w => new { w.ParentId, w.LockedByUserId })
            .FirstOrDefault();

        if (workspace == null)
            return null;

        var currentId = workspaceId;
        while (true)
        {
            var current = _db.Workspaces.AsNoTracking()
                .Where(w => w.Id == currentId)
                .Select(w => new { w.ParentId, w.LockedByUserId })
                .FirstOrDefault();

            if (current == null)
                return null;

            if (current.LockedByUserId.HasValue)
                return current.LockedByUserId;

            if (!current.ParentId.HasValue)
                return null;

            currentId = current.ParentId.Value;
        }
    }

    private int? GetEffectivePageLockUserId(int pageId)
    {
        var page = _db.Pages.AsNoTracking()
            .Where(p => p.Id == pageId)
            .Select(p => new { p.LockedByUserId, p.WorkspaceId })
            .FirstOrDefault();

        if (page == null)
            return null;

        if (page.LockedByUserId.HasValue)
            return page.LockedByUserId;

        return GetEffectiveWorkspaceLockUserId(page.WorkspaceId);
    }

    private void EnsureCanEditPage(User currentUser, int pageId)
    {
        if (!CanEditPageContent(currentUser, pageId))
            throw new InvalidOperationException("Page가 잠겨 있거나 편집 권한이 없습니다.");
    }
}
