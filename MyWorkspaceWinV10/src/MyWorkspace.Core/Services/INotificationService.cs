using MyWorkspace.Core.Entities;

namespace MyWorkspace.Core.Services;

public interface INotificationService
{
    bool IsEmailConfigured { get; }

    void NotifyPageUpdated(User actor, Page page, string summary);
    void NotifyPageCreated(User actor, Page page);
    void NotifyPageDeleted(User actor, int workspaceId, string pageTitle);
    void NotifyWorkspaceRenamed(User actor, Workspace workspace, string previousName);
    void NotifyWorkspaceMemberAdded(User actor, int workspaceId, string workspaceName, User member);
    void NotifyWorkspaceMemberRemoved(User actor, int workspaceId, string workspaceName, User member);
}
