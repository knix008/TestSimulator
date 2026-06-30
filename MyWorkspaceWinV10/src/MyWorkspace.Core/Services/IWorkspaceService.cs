using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;

namespace MyWorkspace.Core.Services;

public interface IWorkspaceService
{
    IReadOnlyList<WorkspaceTreeItem> GetWorkspaceTree(User currentUser);
    Workspace CreateWorkspace(User currentUser, string name, int? parentId);
    void RenameWorkspace(User currentUser, int workspaceId, string name);
    void MoveWorkspace(User currentUser, int workspaceId, int? newParentId);
    void DeleteWorkspace(User currentUser, int workspaceId);
    bool CanManageWorkspace(User currentUser, int workspaceId);
    IReadOnlyList<WorkspaceMember> GetMembers(User currentUser, int workspaceId);
    void AddMember(User currentUser, int workspaceId, int userId, WorkspaceMemberRole role);
    void RemoveMember(User currentUser, int workspaceId, int userId);
    void UpdateMemberRole(User currentUser, int workspaceId, int userId, WorkspaceMemberRole role);
    bool CanAccessWorkspace(User currentUser, int workspaceId);
    bool HasPages(int workspaceId);
    bool CanFavoriteWorkspace(User currentUser, int workspaceId);
    bool IsFavorite(User currentUser, int workspaceId);
    void SetFavorite(User currentUser, int workspaceId, bool isFavorite);
    IReadOnlyList<WorkspaceTreeItem> GetFavoriteWorkspaceTree(User currentUser);
}
