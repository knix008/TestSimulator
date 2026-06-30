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
    private readonly INotificationService? _notifications;

    public PageService(
        AppDbContext db,
        IWorkspaceService workspaceService,
        IPageVersionService pageVersionService,
        INotificationService? notifications = null)
    {
        _db = db;
        _workspaceService = workspaceService;
        _pageVersionService = pageVersionService;
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
        if (!_workspaceService.CanManageWorkspace(currentUser, workspaceId))
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

        _db.Pages.Add(page);
        _db.SaveChanges();
        _notifications?.NotifyPageCreated(currentUser, page);
        return page;
    }

    public void UpdatePage(User currentUser, int pageId, string title, string content)
    {
        var page = _db.Pages.FirstOrDefault(p => p.Id == pageId)
            ?? throw new InvalidOperationException("Page를 찾을 수 없습니다.");

        if (!_workspaceService.CanManageWorkspace(currentUser, page.WorkspaceId))
            throw new InvalidOperationException("Page를 수정할 권한이 없습니다.");

        var trimmed = title.Trim();
        if (string.IsNullOrEmpty(trimmed))
            throw new InvalidOperationException("Page 제목을 입력하세요.");

        if (page.Title != trimmed || page.Content != content)
            _pageVersionService.SaveVersion(currentUser, pageId, page.Title, page.Content);

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

        if (!_workspaceService.CanManageWorkspace(currentUser, page.WorkspaceId))
            throw new InvalidOperationException("Page를 이동할 권한이 없습니다.");

        if (!_workspaceService.CanManageWorkspace(currentUser, targetWorkspaceId))
            throw new InvalidOperationException("대상 Workspace를 관리할 권한이 없습니다.");

        if (page.WorkspaceId == targetWorkspaceId)
            return;

        page.WorkspaceId = targetWorkspaceId;
        page.UpdatedAt = DateTime.UtcNow;
        _db.SaveChanges();
    }

    public void DeletePage(User currentUser, int pageId)
    {
        var page = _db.Pages.FirstOrDefault(p => p.Id == pageId);
        if (page == null)
            return;

        if (!_workspaceService.CanManageWorkspace(currentUser, page.WorkspaceId))
            throw new InvalidOperationException("Page를 삭제할 권한이 없습니다.");

        var workspaceId = page.WorkspaceId;
        var pageTitle = page.Title;
        _db.Pages.Remove(page);
        _db.SaveChanges();
        _notifications?.NotifyPageDeleted(currentUser, workspaceId, pageTitle);
    }
}
