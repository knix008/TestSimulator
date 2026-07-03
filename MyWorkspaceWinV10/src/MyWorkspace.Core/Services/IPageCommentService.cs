using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Core.Services;

public interface IPageCommentService
{
    IReadOnlyList<PageCommentListItem> GetComments(User currentUser, int pageId);

    PageCommentListItem AddComment(User currentUser, int pageId, string content, string? quotedText = null);

    PageCommentListItem UpdateComment(User currentUser, int commentId, string content);

    void DeleteComment(User currentUser, int commentId);
}
