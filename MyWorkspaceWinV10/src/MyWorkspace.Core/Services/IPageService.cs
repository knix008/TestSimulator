using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Core.Services;

public interface IPageService
{
    Page? GetById(User currentUser, int pageId);
    Page CreatePage(User currentUser, int workspaceId, string title, string content);
    void UpdatePage(User currentUser, int pageId, string title, string content);
    void MovePage(User currentUser, int pageId, int targetWorkspaceId);
    void DeletePage(User currentUser, int pageId);
    bool IsPageLocked(int pageId);
    bool CanEditPageContent(User currentUser, int pageId);
    bool CanLockPage(User currentUser, int pageId);
    bool CanUnlockPage(User currentUser, int pageId);
    void LockPage(User currentUser, int pageId);
    void UnlockPage(User currentUser, int pageId);
    string? GetPageLockHolderUsername(int pageId);
    IReadOnlyList<PageSearchResult> SearchPages(User currentUser, string query, int maxResults = 20);
}
