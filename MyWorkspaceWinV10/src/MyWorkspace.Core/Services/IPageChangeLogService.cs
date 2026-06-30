using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Core.Services;

public interface IPageChangeLogService
{
    IReadOnlyList<PageChangeLogListItem> GetLogs(User currentUser, int pageId);

    void Append(
        User currentUser,
        int pageId,
        PageChangeAction action,
        string? oldTitle = null,
        string? newTitle = null,
        int? oldContentLength = null,
        int? newContentLength = null,
        string? note = null);
}
