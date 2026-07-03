using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Models;
using MyWorkspace.Core.Services;

namespace MyWorkspace.Data.Services;

public sealed class PageCommentService : IPageCommentService
{
    private const int MaxContentLength = 8000;
    private const int MaxQuotedTextLength = 2000;
    private readonly AppDbContext _db;
    private readonly IWorkspaceService _workspaceService;
    private readonly IPageService _pageService;

    public PageCommentService(AppDbContext db, IWorkspaceService workspaceService, IPageService pageService)
    {
        _db = db;
        _workspaceService = workspaceService;
        _pageService = pageService;
    }

    public IReadOnlyList<PageCommentListItem> GetComments(User currentUser, int pageId)
    {
        EnsurePageAccess(currentUser, pageId);

        var canEditPage = _pageService.CanEditPageContent(currentUser, pageId);
        return _db.PageComments.AsNoTracking()
            .Include(c => c.User)
            .Where(c => c.PageId == pageId)
            .OrderBy(c => c.CreatedAt)
            .Select(c => new PageCommentListItem
            {
                Id = c.Id,
                PageId = c.PageId,
                UserId = c.UserId,
                AuthorUsername = c.User.Username,
                Content = c.Content,
                QuotedText = c.QuotedText,
                CreatedAt = c.CreatedAt,
                UpdatedAt = c.UpdatedAt,
                CanEdit = c.UserId == currentUser.Id,
                CanDelete = c.UserId == currentUser.Id || canEditPage
            })
            .ToList();
    }

    public PageCommentListItem AddComment(User currentUser, int pageId, string content, string? quotedText = null)
    {
        EnsurePageAccess(currentUser, pageId);

        var normalized = NormalizeContent(content);
        var normalizedQuote = NormalizeQuotedText(quotedText);
        var now = DateTime.UtcNow;
        var comment = new PageComment
        {
            PageId = pageId,
            UserId = currentUser.Id,
            Content = normalized,
            QuotedText = normalizedQuote,
            CreatedAt = now,
            UpdatedAt = now
        };

        _db.PageComments.Add(comment);
        _db.SaveChanges();
        _db.Entry(comment).Reference(c => c.User).Load();

        return MapItem(comment, currentUser, _pageService.CanEditPageContent(currentUser, pageId));
    }

    public PageCommentListItem UpdateComment(User currentUser, int commentId, string content)
    {
        var comment = _db.PageComments
            .Include(c => c.User)
            .FirstOrDefault(c => c.Id == commentId)
            ?? throw new InvalidOperationException("댓글을 찾을 수 없습니다.");

        EnsurePageAccess(currentUser, comment.PageId);
        if (comment.UserId != currentUser.Id)
            throw new InvalidOperationException("댓글을 수정할 권한이 없습니다.");

        comment.Content = NormalizeContent(content);
        comment.UpdatedAt = DateTime.UtcNow;
        _db.SaveChanges();

        return MapItem(comment, currentUser, _pageService.CanEditPageContent(currentUser, comment.PageId));
    }

    public void DeleteComment(User currentUser, int commentId)
    {
        var comment = _db.PageComments.FirstOrDefault(c => c.Id == commentId)
            ?? throw new InvalidOperationException("댓글을 찾을 수 없습니다.");

        EnsurePageAccess(currentUser, comment.PageId);
        if (comment.UserId != currentUser.Id && !_pageService.CanEditPageContent(currentUser, comment.PageId))
            throw new InvalidOperationException("댓글을 삭제할 권한이 없습니다.");

        _db.PageComments.Remove(comment);
        _db.SaveChanges();
    }

    private static PageCommentListItem MapItem(PageComment comment, User currentUser, bool canEditPage) =>
        new()
        {
            Id = comment.Id,
            PageId = comment.PageId,
            UserId = comment.UserId,
            AuthorUsername = comment.User?.Username ?? currentUser.Username,
            Content = comment.Content,
            QuotedText = comment.QuotedText,
            CreatedAt = comment.CreatedAt,
            UpdatedAt = comment.UpdatedAt,
            CanEdit = comment.UserId == currentUser.Id,
            CanDelete = comment.UserId == currentUser.Id || canEditPage
        };

    private static string NormalizeContent(string content)
    {
        var normalized = (content ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalized))
            throw new InvalidOperationException("댓글 내용을 입력하세요.");

        if (normalized.Length > MaxContentLength)
            normalized = normalized[..MaxContentLength];

        return normalized;
    }

    private static string? NormalizeQuotedText(string? quotedText)
    {
        if (string.IsNullOrWhiteSpace(quotedText))
            return null;

        var normalized = quotedText.Trim();
        if (normalized.Length > MaxQuotedTextLength)
            normalized = normalized[..MaxQuotedTextLength];

        return normalized;
    }

    private void EnsurePageAccess(User currentUser, int pageId)
    {
        var workspaceId = _db.Pages.AsNoTracking()
            .Where(p => p.Id == pageId)
            .Select(p => (int?)p.WorkspaceId)
            .FirstOrDefault();

        if (!workspaceId.HasValue || !_workspaceService.CanAccessWorkspace(currentUser, workspaceId.Value))
            throw new InvalidOperationException("Page에 접근할 수 없습니다.");
    }
}
