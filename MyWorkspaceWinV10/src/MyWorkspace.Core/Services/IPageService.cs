using MyWorkspace.Core.Entities;

namespace MyWorkspace.Core.Services;

public interface IPageService
{
    Page? GetById(User currentUser, int pageId);
    Page CreatePage(User currentUser, int workspaceId, string title, string content);
    void UpdatePage(User currentUser, int pageId, string title, string content);
    void MovePage(User currentUser, int pageId, int targetWorkspaceId);
    void DeletePage(User currentUser, int pageId);
}
