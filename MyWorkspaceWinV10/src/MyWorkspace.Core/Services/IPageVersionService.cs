using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Core.Services;

public interface IPageVersionService
{
    IReadOnlyList<PageVersionListItem> GetVersions(User currentUser, int pageId);
    PageVersion? GetVersion(User currentUser, int versionId);
    void SaveVersion(User currentUser, int pageId, string title, string content);
    void RestoreVersion(User currentUser, int versionId);
}
