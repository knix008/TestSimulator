using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;
using MyWorkspace.Core.Services;

namespace MyWorkspace.Data.Services;

public sealed class PageVersionService : IPageVersionService
{
    private const int MaxVersionsPerPage = 50;
    private readonly AppDbContext _db;
    private readonly IWorkspaceService _workspaceService;
    private readonly IPageChangeLogService _pageChangeLogs;

    public PageVersionService(
        AppDbContext db,
        IWorkspaceService workspaceService,
        IPageChangeLogService pageChangeLogs)
    {
        _db = db;
        _workspaceService = workspaceService;
        _pageChangeLogs = pageChangeLogs;
    }

    public IReadOnlyList<PageVersionListItem> GetVersions(User currentUser, int pageId)
    {
        EnsurePageAccess(currentUser, pageId);

        return _db.PageVersions.AsNoTracking()
            .Include(v => v.SavedByUser)
            .Where(v => v.PageId == pageId)
            .OrderByDescending(v => v.SavedAt)
            .Select(v => new PageVersionListItem
            {
                Id = v.Id,
                PageId = v.PageId,
                Title = v.Title,
                SavedByUsername = v.SavedByUser.Username,
                SavedAt = v.SavedAt
            })
            .ToList();
    }

    public PageVersion? GetVersion(User currentUser, int versionId)
    {
        var version = _db.PageVersions.AsNoTracking()
            .Include(v => v.SavedByUser)
            .FirstOrDefault(v => v.Id == versionId);

        if (version == null)
            return null;

        EnsurePageAccess(currentUser, version.PageId);
        return version;
    }

    public void SaveVersion(User currentUser, int pageId, string title, string content)
    {
        EnsurePageManage(currentUser, pageId);

        _db.PageVersions.Add(new PageVersion
        {
            PageId = pageId,
            Title = title.Trim(),
            Content = content,
            SavedByUserId = currentUser.Id,
            SavedAt = DateTime.UtcNow
        });
        _db.SaveChanges();
        PruneOldVersions(pageId);
    }

    public void RestoreVersion(User currentUser, int versionId)
    {
        var version = _db.PageVersions
            .Include(v => v.Page)
            .FirstOrDefault(v => v.Id == versionId)
            ?? throw new InvalidOperationException("버전을 찾을 수 없습니다.");

        EnsurePageManage(currentUser, version.PageId);

        var page = version.Page;
        if (page.Title != version.Title || page.Content != version.Content)
            SaveVersionInternal(currentUser, page);

        _pageChangeLogs.Append(
            currentUser,
            version.PageId,
            PageChangeAction.Restored,
            oldTitle: page.Title,
            newTitle: version.Title,
            oldContentLength: page.Content.Length,
            newContentLength: version.Content.Length,
            note: version.SavedAt.ToUniversalTime().ToString("O"));

        page.Title = version.Title;
        page.Content = version.Content;
        page.UpdatedAt = DateTime.UtcNow;
        _db.SaveChanges();
    }

    private void SaveVersionInternal(User currentUser, Page page)
    {
        _db.PageVersions.Add(new PageVersion
        {
            PageId = page.Id,
            Title = page.Title,
            Content = page.Content,
            SavedByUserId = currentUser.Id,
            SavedAt = DateTime.UtcNow
        });
    }

    private void PruneOldVersions(int pageId)
    {
        var excess = _db.PageVersions
            .Where(v => v.PageId == pageId)
            .OrderByDescending(v => v.SavedAt)
            .Skip(MaxVersionsPerPage)
            .ToList();

        if (excess.Count == 0)
            return;

        _db.PageVersions.RemoveRange(excess);
        _db.SaveChanges();
    }

    private void EnsurePageAccess(User currentUser, int pageId)
    {
        var page = _db.Pages.AsNoTracking().FirstOrDefault(p => p.Id == pageId)
            ?? throw new InvalidOperationException("Page를 찾을 수 없습니다.");

        if (!_workspaceService.CanAccessWorkspace(currentUser, page.WorkspaceId))
            throw new InvalidOperationException("Page에 접근할 권한이 없습니다.");
    }

    private void EnsurePageManage(User currentUser, int pageId)
    {
        var page = _db.Pages.AsNoTracking().FirstOrDefault(p => p.Id == pageId)
            ?? throw new InvalidOperationException("Page를 찾을 수 없습니다.");

        if (!_workspaceService.CanManageWorkspace(currentUser, page.WorkspaceId))
            throw new InvalidOperationException("Page를 수정할 권한이 없습니다.");
    }
}
