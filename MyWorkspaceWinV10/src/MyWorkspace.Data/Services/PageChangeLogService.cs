using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;
using MyWorkspace.Core.Services;

namespace MyWorkspace.Data.Services;

public sealed class PageChangeLogService : IPageChangeLogService
{
    private const int MaxLogsPerPage = 200;
    private readonly AppDbContext _db;
    private readonly IWorkspaceService _workspaceService;

    public PageChangeLogService(AppDbContext db, IWorkspaceService workspaceService)
    {
        _db = db;
        _workspaceService = workspaceService;
    }

    public IReadOnlyList<PageChangeLogListItem> GetLogs(User currentUser, int pageId)
    {
        EnsurePageAccess(currentUser, pageId);

        return _db.PageChangeLogs.AsNoTracking()
            .Include(l => l.ChangedByUser)
            .Where(l => l.PageId == pageId)
            .OrderByDescending(l => l.ChangedAt)
            .Select(l => new PageChangeLogListItem
            {
                Id = l.Id,
                ChangedAt = l.ChangedAt,
                ChangedByUsername = l.ChangedByUser.Username,
                Action = l.Action,
                OldTitle = l.OldTitle,
                NewTitle = l.NewTitle,
                OldContentLength = l.OldContentLength,
                NewContentLength = l.NewContentLength,
                Note = l.Note
            })
            .ToList();
    }

    public void Append(
        User currentUser,
        int pageId,
        PageChangeAction action,
        string? oldTitle = null,
        string? newTitle = null,
        int? oldContentLength = null,
        int? newContentLength = null,
        string? note = null)
    {
        _db.PageChangeLogs.Add(new PageChangeLog
        {
            PageId = pageId,
            ChangedByUserId = currentUser.Id,
            ChangedAt = DateTime.UtcNow,
            Action = action,
            OldTitle = Truncate(oldTitle, 200),
            NewTitle = Truncate(newTitle, 200),
            OldContentLength = oldContentLength,
            NewContentLength = newContentLength,
            Note = Truncate(note, 500)
        });
        _db.SaveChanges();
        PruneOldLogs(pageId);
    }

    private void PruneOldLogs(int pageId)
    {
        var excess = _db.PageChangeLogs
            .Where(l => l.PageId == pageId)
            .OrderByDescending(l => l.ChangedAt)
            .Skip(MaxLogsPerPage)
            .ToList();

        if (excess.Count == 0)
            return;

        _db.PageChangeLogs.RemoveRange(excess);
        _db.SaveChanges();
    }

    private static string? Truncate(string? value, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var trimmed = value.Trim();
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    private void EnsurePageAccess(User currentUser, int pageId)
    {
        var page = _db.Pages.AsNoTracking().FirstOrDefault(p => p.Id == pageId)
            ?? throw new InvalidOperationException("Page를 찾을 수 없습니다.");

        if (!_workspaceService.CanAccessWorkspace(currentUser, page.WorkspaceId))
            throw new InvalidOperationException("Page에 접근할 권한이 없습니다.");
    }
}
