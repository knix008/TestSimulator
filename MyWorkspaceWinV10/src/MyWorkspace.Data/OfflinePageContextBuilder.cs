using Microsoft.EntityFrameworkCore;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Data;

public static class OfflinePageContextBuilder
{
    public static OfflinePageContext? TryBuild(AppServices services, User currentUser, int pageId)
    {
        var page = services.Pages.GetById(currentUser, pageId);
        if (page == null)
            return null;

        var workspaces = BuildWorkspaceChain(services.Db, page.WorkspaceId);
        if (workspaces.Count == 0)
            return null;

        return new OfflinePageContext
        {
            PageId = page.Id,
            WorkspaceId = page.WorkspaceId,
            Workspaces = workspaces
        };
    }

    private static List<OfflineWorkspaceSnapshot> BuildWorkspaceChain(AppDbContext db, int workspaceId)
    {
        var snapshots = new List<OfflineWorkspaceSnapshot>();
        var visited = new HashSet<int>();
        var currentId = workspaceId;

        while (visited.Add(currentId))
        {
            var workspace = db.Workspaces.AsNoTracking().FirstOrDefault(w => w.Id == currentId);
            if (workspace == null)
                break;

            snapshots.Insert(0, new OfflineWorkspaceSnapshot(
                workspace.Id,
                workspace.ParentId,
                workspace.Name,
                workspace.OwnerId));

            if (!workspace.ParentId.HasValue)
                break;

            currentId = workspace.ParentId.Value;
        }

        return snapshots;
    }
}
