namespace MyWorkspace.Win;

internal static class ServiceMessages
{
    private static readonly (string Key, string Ko, string En)[] Entries =
    [
        (K.ErrLoginUsernameRequired, "사용자 ID를 입력하세요.", "Enter user ID."),
        (K.ErrLoginPasswordRequired, "비밀번호를 입력하세요.", "Enter password."),
        (K.ErrLoginInvalidCredentials, "ID 또는 비밀번호가 올바르지 않습니다.", "Invalid user ID or password."),
        (K.ErrUsernameRequired, "사용자 ID를 입력하세요.", "Enter user ID."),
        (K.ErrPasswordRequired, "비밀번호를 입력하세요.", "Enter password."),
        (K.ErrUsernameExists, "이미 존재하는 사용자 ID입니다.", "User ID already exists."),
        (K.ErrUserNotFound, "사용자를 찾을 수 없습니다.", "User not found."),
        (K.ErrCannotDeleteLastAdmin, "마지막 관리자 계정은 삭제할 수 없습니다.", "Cannot delete the last administrator account."),
        (K.ErrFavoriteRegisteredOnly, "등록된 Workspace만 즐겨찾기에 추가할 수 있습니다.", "Only registered workspaces can be added to favorites."),
        (K.ErrWorkspaceNameRequired, "Workspace 이름을 입력하세요.", "Enter a workspace name."),
        (K.ErrParentWorkspaceAccessDenied, "상위 Workspace에 접근할 수 없습니다.", "Cannot access the parent workspace."),
        (K.ErrMoveUnderSelf, "자기 자신 아래로 이동할 수 없습니다.", "Cannot move an item under itself."),
        (K.ErrTargetWorkspaceAccessDenied, "대상 Workspace에 접근할 수 없습니다.", "Cannot access the target workspace."),
        (K.ErrTargetWorkspaceManageDenied, "대상 Workspace를 관리할 권한이 없습니다.", "You do not have permission to manage the target workspace."),
        (K.ErrMoveToChildWorkspace, "하위 Workspace로는 이동할 수 없습니다.", "Cannot move an item into its own descendant workspace."),
        (K.ErrWorkspaceNotFound, "Workspace를 찾을 수 없습니다.", "Workspace not found."),
        (K.ErrWorkspaceHasChildren, "하위 Workspace가 있으면 삭제할 수 없습니다.", "Cannot delete a workspace that has sub-workspaces."),
        (K.ErrWorkspaceHasPages, "Page가 있으면 삭제할 수 없습니다. Page를 먼저 삭제하세요.", "Cannot delete a workspace that contains pages. Delete the pages first."),
        (K.ErrOwnerRoleAutoAssigned, "Owner 역할은 Workspace 생성 시 자동으로 지정됩니다.", "The owner role is assigned automatically when a workspace is created."),
        (K.ErrMemberAlreadyExists, "이미 등록된 멤버입니다.", "Member is already registered."),
        (K.ErrCannotRemoveOwner, "Owner는 제거할 수 없습니다.", "The owner cannot be removed."),
        (K.ErrWorkspaceManageDenied, "Workspace를 관리할 권한이 없습니다.", "You do not have permission to manage this workspace."),
        (K.ErrSubWorkspaceWithPagesDenied, "Page가 있는 Workspace에는 하위 Workspace를 만들 수 없습니다.", "Cannot create a sub-workspace under a workspace that contains pages."),
        (K.ErrPageCreateDenied, "Page를 생성할 권한이 없습니다.", "You do not have permission to create a page."),
        (K.ErrPageTitleRequired, "Page 제목을 입력하세요.", "Enter a page title."),
        (K.ErrPageContentEmpty, "Page 내용이 비어 있습니다.", "Page content is empty."),
        (K.ErrPageNotFound, "Page를 찾을 수 없습니다.", "Page not found."),
        (K.ErrPageEditDenied, "Page를 수정할 권한이 없습니다.", "You do not have permission to edit this page."),
        (K.ErrPageMoveDenied, "Page를 이동할 권한이 없습니다.", "You do not have permission to move this page."),
        (K.ErrPageDeleteDenied, "Page를 삭제할 권한이 없습니다.", "You do not have permission to delete this page."),
        (K.ErrPageAccessDenied, "Page에 접근할 권한이 없습니다.", "You do not have permission to access this page."),
        (K.ErrVersionNotFound, "버전을 찾을 수 없습니다.", "Version not found."),
        (K.ErrServerRequired, "서버를 입력하세요.", "Enter server."),
        (K.ErrDatabaseNameRequired, "데이터베이스 이름을 입력하세요.", "Enter database name."),
        (K.ErrNoPageTemplates, "사용 가능한 Page 양식이 없습니다.", "No page templates available."),
        (K.ErrDatabaseConfigRequired, "appsettings.json에 Database 설정이 필요합니다.", "Database settings are required in appsettings.json."),
        (K.ErrDatabaseNameInvalid, "데이터베이스 이름은 영문, 숫자, 밑줄(_)만 사용할 수 있으며 숫자로 시작할 수 없습니다.", "Database name may contain only letters, digits, and underscores, and cannot start with a digit."),
        (K.ErrUnsupportedDbProvider, "지원하지 않는 DB 유형입니다: {0}", "Unsupported database provider: {0}"),
    ];

    public static void Register(Action<string, string, string> add)
    {
        foreach (var (key, ko, en) in Entries)
            add(key, ko, en);
    }

    public static Dictionary<string, string> BuildIndex()
    {
        var index = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (key, ko, en) in Entries)
        {
            index[ko] = key;
            index[en] = key;
        }

        return index;
    }
}
