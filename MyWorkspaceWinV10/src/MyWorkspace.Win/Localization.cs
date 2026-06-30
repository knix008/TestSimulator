namespace MyWorkspace.Win;

internal static class Localization
{
    private static readonly Dictionary<string, string> ServiceMessageIndex = ServiceMessages.BuildIndex();
    private static readonly Dictionary<string, Dictionary<AppLanguage, string>> Strings = BuildStrings();
    private static AppLanguage _current = AppLanguage.Korean;

    public static AppLanguage Current => _current;

    public static event Action? Changed;

    public static void SetLanguage(AppLanguage language)
    {
        if (_current == language)
            return;

        _current = language;
        Changed?.Invoke();
    }

    public static string Get(string key) =>
        Strings.TryGetValue(key, out var map) && map.TryGetValue(_current, out var value)
            ? value
            : key;

    public static string Format(string key, params object[] args) =>
        string.Format(Get(key), args);

    public static string TranslateServiceMessage(string? message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return message ?? string.Empty;

        var trimmed = message.Trim();
        if (ServiceMessageIndex.TryGetValue(trimmed, out var key))
            return Get(key);

        const string unsupportedDbPrefixKo = "지원하지 않는 DB 유형입니다:";
        const string unsupportedDbPrefixEn = "Unsupported database provider:";
        if (trimmed.StartsWith(unsupportedDbPrefixKo, StringComparison.Ordinal))
            return Format(K.ErrUnsupportedDbProvider, trimmed[unsupportedDbPrefixKo.Length..].Trim());

        if (trimmed.StartsWith(unsupportedDbPrefixEn, StringComparison.Ordinal))
            return Format(K.ErrUnsupportedDbProvider, trimmed[unsupportedDbPrefixEn.Length..].Trim());

        return message;
    }

    private static Dictionary<string, Dictionary<AppLanguage, string>> BuildStrings()
    {
        var d = new Dictionary<string, Dictionary<AppLanguage, string>>(StringComparer.Ordinal);
        void Add(string key, string ko, string en) =>
            d[key] = new Dictionary<AppLanguage, string>
            {
                [AppLanguage.Korean] = ko,
                [AppLanguage.English] = en
            };

        Add(K.AppName, "MyWorkspace", "MyWorkspace");
        Add(K.AppTitleLoggedOut, "MyWorkspace", "MyWorkspace");
        Add(K.AppTitleLoggedIn, "MyWorkspace - {0}", "MyWorkspace - {0}");
        Add(K.StatusLoginRequired, "로그인이 필요합니다", "Sign-in required");
        Add(K.StatusAdmin, "관리자", "Administrator");
        Add(K.StatusUser, "사용자", "User");
        Add(K.StatusPage, "Page: {0}", "Page: {0}");
        Add(K.SaveStatusModified, "수정됨", "Modified");
        Add(K.SaveStatusSaved, "저장됨", "Saved");
        Add(K.SaveStatusAutoSaved, "자동 저장됨", "Auto-saved");
        Add(K.SaveStatusFailed, "저장 실패", "Save failed");

        Add(K.MenuFile, "파일(&F)", "&File");
        Add(K.MenuSavePage, "Page 저장(&S)", "&Save Page");
        Add(K.MenuPageHistory, "버전 이력(&H)", "Page &History");
        Add(K.MenuRefreshTree, "트리 새로고침(&R)", "&Refresh Tree");
        Add(K.MenuPreferences, "환경 설정(&P)...", "&Preferences...");
        Add(K.MenuLogin, "로그인(&L)...", "&Sign In...");
        Add(K.MenuLogout, "로그아웃(&L)", "Sign &Out");
        Add(K.MenuAbout, "프로그램 정보(&A)...", "&About...");
        Add(K.MenuExit, "종료(&X)", "E&xit");
        Add(K.MenuWorkspace, "Workspace(&W)", "&Workspace");
        Add(K.MenuNewRootWorkspace, "새 Workspace", "New Workspace");
        Add(K.MenuNewSubWorkspace, "하위 Workspace", "New Sub-workspace");
        Add(K.MenuNewPage, "새 Page (양식)...", "New Page (Template)...");
        Add(K.MenuRename, "이름 변경", "Rename");
        Add(K.MenuDelete, "삭제", "Delete");
        Add(K.MenuWorkspaceMembers, "멤버 관리", "Manage Members");
        Add(K.MenuView, "보기(&V)", "&View");
        Add(K.MenuDocumentStructure, "문서 구조", "Document Outline");
        Add(K.MenuAdmin, "관리(&A)", "&Admin");
        Add(K.MenuAdminUsers, "사용자 관리", "User Management");
        Add(K.MenuAdminDatabase, "DB 연결 설정...", "Database Settings...");
        Add(K.MenuAdminEmail, "이메일 서버 설정", "Email Server Settings");
        Add(K.MenuAccount, "계정(&C)", "&Account");
        Add(K.MenuEditProfile, "프로필 수정", "Edit Profile");
        Add(K.MenuChangePassword, "비밀번호 변경", "Change Password");
        Add(K.MenuNotificationSettings, "알림 설정", "Notification Settings");

        Add(K.CtxNewSubWorkspace, "하위 Workspace 추가", "Add Sub-workspace");
        Add(K.CtxNewPage, "새 Page (양식)...", "New Page (Template)...");
        Add(K.CtxRename, "이름 변경", "Rename");
        Add(K.CtxDelete, "삭제", "Delete");
        Add(K.CtxToggleFavoriteAdd, "즐겨찾기 추가", "Add to Favorites");
        Add(K.CtxToggleFavoriteRemove, "즐겨찾기 제거", "Remove from Favorites");
        Add(K.CtxMembers, "멤버 관리", "Manage Members");

        Add(K.LabelTitle, "제목", "Title");
        Add(K.LabelOutline, "문서 구조", "Outline");
        Add(K.OutlineCollapse, "◀ 접기", "◀ Collapse");
        Add(K.OutlineExpand, "▶ 펼치기", "▶ Expand");
        Add(K.FavoritesRoot, "즐겨찾기", "Favorites");
        Add(K.OutlineUntitled, "(제목 없음)", "(Untitled)");
        Add(K.UntitledPageTitle, "제목 없음", "Untitled");

        Add(K.ToolbarHeading1, "제목 1", "Heading 1");
        Add(K.ToolbarHeading2, "제목 2", "Heading 2");
        Add(K.ToolbarHeading3, "제목 3", "Heading 3");
        Add(K.ToolbarHeading4, "제목 4", "Heading 4");
        Add(K.ToolbarHeading5, "제목 5", "Heading 5");
        Add(K.ToolbarHeading6, "제목 6", "Heading 6");
        Add(K.ToolbarBold, "굵게 (Ctrl+B)", "Bold (Ctrl+B)");
        Add(K.ToolbarItalic, "기울임 (Ctrl+I)", "Italic (Ctrl+I)");
        Add(K.ToolbarStrike, "취소선", "Strikethrough");
        Add(K.ToolbarInlineCode, "인라인 코드", "Inline Code");
        Add(K.ToolbarCodeBlock, "코드 블록", "Code Block");
        Add(K.ToolbarLink, "링크", "Link");
        Add(K.ToolbarImage, "이미지", "Image");
        Add(K.ToolbarBulletList, "글머리 목록", "Bullet List");
        Add(K.ToolbarNumberList, "번호 목록", "Numbered List");
        Add(K.ToolbarQuote, "인용", "Quote");
        Add(K.ToolbarHorizontalRule, "구분선", "Horizontal Rule");
        Add(K.ToolbarTable, "표", "Table");
        Add(K.ToolbarDocumentStructure, "문서 구조", "Document Outline");
        Add(K.ToolbarAbout, "프로그램 정보", "About");
        Add(K.AboutTitle, "프로그램 정보", "About");
        Add(K.AboutDescription, "Notion 스타일의 Workspace·Page 관리 데스크톱 애플리케이션입니다.", "A Notion-style desktop app for managing workspaces and pages.");
        Add(K.AboutVersionFormat, "버전 {0}", "Version {0}");
        Add(K.AboutCopyrightFormat, "Copyright © {0} SHKWON(knix008@naver.com)", "Copyright © {0} SHKWON(knix008@naver.com)");

        Add(K.EditorCut, "잘라내기", "Cut");
        Add(K.EditorCopy, "복사", "Copy");
        Add(K.EditorPaste, "붙여넣기", "Paste");
        Add(K.EditorSelectAll, "모두 선택", "Select All");
        Add(K.EditorBold, "굵게", "Bold");
        Add(K.EditorItalic, "기울임", "Italic");

        Add(K.LoginTitle, "MyWorkspace", "MyWorkspace");
        Add(K.LoginWindowTitle, "MyWorkspace - 로그인", "MyWorkspace - Sign In");
        Add(K.LoginUsername, "사용자 ID", "User ID");
        Add(K.LoginPassword, "비밀번호", "Password");
        Add(K.LoginSubmit, "로그인", "Sign In");
        Add(K.LoginCancel, "취소", "Cancel");

        Add(K.PreferencesTitle, "환경 설정", "Preferences");
        Add(K.PreferencesAppearance, "모양", "Appearance");
        Add(K.PreferencesTheme, "테마", "Theme");
        Add(K.PreferencesLanguage, "언어", "Language");
        Add(K.ThemeLight, "밝게", "Light");
        Add(K.ThemeDark, "어둡게", "Dark");
        Add(K.LanguageKorean, "한국어", "Korean");
        Add(K.LanguageEnglish, "English", "English");
        Add(K.ButtonOk, "확인", "OK");
        Add(K.ButtonCancel, "취소", "Cancel");
        Add(K.PreferencesRestartHint, "일부 변경 사항은 열려 있는 대화상자를 다시 열면 반영됩니다.", "Some changes apply when you reopen dialogs.");

        Add(K.EditorPlaceholder, "여기에 내용을 입력하세요. 툴바로 서식을 적용할 수 있습니다.", "Start typing here. Use the toolbar to apply formatting.");
        Add(K.EditorInitFailed, "편집기 초기화 실패", "Editor initialization failed");
        Add(K.EditorClearFailed, "편집기 초기화 실패", "Editor reset failed");
        Add(K.PageLoadFailed, "Page를 불러올 수 없습니다.", "Unable to load the page.");
        Add(K.PageLoadFailedTitle, "Page 불러오기 실패", "Page load failed");
        Add(K.SaveFailed, "저장 실패", "Save failed");
        Add(K.SelectPage, "Page를 선택하세요.", "Select a page.");
        Add(K.SelectPageToSave, "저장할 Page를 선택하세요.", "Select a page to save.");
        Add(K.SelectWorkspace, "Workspace를 선택하세요.", "Select a workspace.");
        Add(K.SelectWorkspaceOrPage, "Workspace 또는 Page를 선택하세요.", "Select a workspace or page.");
        Add(K.SelectWorkspaceForPage, "Page를 추가할 Workspace를 선택하세요.", "Select a workspace to add a page.");
        Add(K.SelectWorkspaceForSub, "Workspace를 선택하세요.\nPage 아래에는 하위 Workspace를 만들 수 없습니다.", "Select a workspace.\nSub-workspaces cannot be created under a page.");
        Add(K.NewWorkspace, "새 Workspace", "New Workspace");
        Add(K.NewSubWorkspace, "하위 Workspace", "Sub-workspace");
        Add(K.WorkspaceNamePrompt, "Workspace 이름:", "Workspace name:");
        Add(K.RenameWorkspaceTitle, "Workspace 이름 변경", "Rename Workspace");
        Add(K.RenamePageTitle, "Page 제목 변경", "Rename Page");
        Add(K.NewNamePrompt, "새 이름:", "New name:");
        Add(K.NewTitlePrompt, "새 제목:", "New title:");
        Add(K.ConfirmDeletePage, "선택한 Page를 삭제할까요?", "Delete the selected page?");
        Add(K.ConfirmDeleteWorkspace, "선택한 Workspace를 삭제할까요?", "Delete the selected workspace?");
        Add(K.Confirm, "확인", "Confirm");
        Add(K.DialogLinkTitle, "링크", "Link");
        Add(K.DialogImageTitle, "이미지", "Image");
        Add(K.DialogUrlPrompt, "URL:", "URL:");
        Add(K.DialogInputRequired, "값을 입력하세요.", "Enter a value.");
        Add(K.DefaultCodeText, "코드", "code");
        Add(K.DefaultImageAlt, "이미지", "image");
        Add(K.TableHeader1, "열1", "Col 1");
        Add(K.TableHeader2, "열2", "Col 2");
        Add(K.ErrorTitle, "오류", "Error");
        Add(K.SessionLoginRequired, "로그인이 필요합니다.", "Sign-in is required.");

        Add(K.ButtonSave, "저장", "Save");
        Add(K.ButtonClose, "닫기", "Close");
        Add(K.ButtonAdd, "추가", "Add");
        Add(K.ButtonEdit, "수정", "Edit");
        Add(K.ButtonDelete, "삭제", "Delete");
        Add(K.ButtonCreate, "만들기", "Create");
        Add(K.ButtonChange, "변경", "Change");
        Add(K.ButtonRestore, "복원", "Restore");
        Add(K.ButtonCopy, "복사", "Copy");
        Add(K.ButtonCopied, "복사됨", "Copied");
        Add(K.ButtonTestConnection, "연결 테스트", "Test Connection");
        Add(K.ButtonBrowse, "찾아보기...", "Browse...");
        Add(K.ButtonReload, "새로고침", "Refresh");
        Add(K.ButtonOpenTemplateFolder, "양식 폴더 열기", "Open Template Folder");
        Add(K.ButtonAddMember, "멤버 추가", "Add Member");
        Add(K.ButtonRemoveMember, "멤버 제거", "Remove Member");
        Add(K.ButtonExit, "종료", "Exit");

        Add(K.LabelUsername, "사용자 ID", "User ID");
        Add(K.LabelPassword, "비밀번호", "Password");
        Add(K.LabelRole, "역할", "Role");
        Add(K.LabelServer, "서버", "Server");
        Add(K.LabelPort, "포트", "Port");
        Add(K.LabelDatabase, "데이터베이스", "Database");
        Add(K.LabelUser, "사용자", "User");
        Add(K.LabelEmail, "이메일", "Email");
        Add(K.LabelInput, "입력", "Input");
        Add(K.LabelPreview, "미리보기", "Preview");
        Add(K.LabelProvider, "DB 종류", "Provider");
        Add(K.LabelSqliteFile, "SQLite 파일", "SQLite File");
        Add(K.LabelSmtpHost, "SMTP 서버", "SMTP Server");
        Add(K.LabelFromAddress, "발신 주소", "From Address");
        Add(K.LabelFromDisplayName, "발신 이름", "From Display Name");
        Add(K.LabelTemplate, "양식 선택", "Template");
        Add(K.LabelTemplateDesc, "양식 설명", "Description");
        Add(K.LabelTemplateFolderPrefix, "사용자 양식 폴더:", "User template folder:");
        Add(K.LabelSavedVersions, "저장된 버전", "Saved Versions");
        Add(K.LabelRegisteredMembers, "등록된 멤버", "Members");
        Add(K.LabelAddUser, "사용자", "User");
        Add(K.LabelCurrentPassword, "현재 비밀번호", "Current Password");
        Add(K.LabelNewPassword, "새 비밀번호", "New Password");
        Add(K.LabelConfirmPassword, "새 비밀번호 확인", "Confirm New Password");
        Add(K.LabelCreatedAt, "생성일", "Created");

        Add(K.RoleAdmin, "관리자", "Administrator");
        Add(K.RoleUser, "사용자", "User");
        Add(K.MemberRoleViewer, "보기", "Viewer");
        Add(K.MemberRoleEditor, "편집", "Editor");

        Add(K.SelectUser, "사용자를 선택하세요.", "Select a user.");
        Add(K.ConfirmDeleteUser, "'{0}' 사용자를 삭제할까요?", "Delete user '{0}'?");
        Add(K.UserAddTitle, "사용자 추가", "Add User");
        Add(K.UserEditTitle, "사용자 수정", "Edit User");
        Add(K.PasswordNewOptional, "새 비밀번호 (변경 시만)", "New password (optional)");

        Add(K.ChangePasswordAllFieldsRequired, "모든 항목을 입력하세요.", "Fill in all fields.");
        Add(K.ChangePasswordMismatch, "새 비밀번호가 일치하지 않습니다.", "New passwords do not match.");
        Add(K.ChangePasswordInvalidCurrent, "현재 비밀번호가 올바르지 않습니다.", "Current password is incorrect.");
        Add(K.ChangePasswordSuccess, "비밀번호가 변경되었습니다.", "Password changed.");

        Add(K.DbSetupWizardTitle, "초기 데이터베이스 설정", "Initial Database Setup");
        Add(K.DbSettingsTitle, "데이터베이스 연결 설정", "Database Connection Settings");
        Add(K.DbTestingConnection, "연결 테스트 중...", "Testing connection...");
        Add(K.DbConnectionSuccess, "연결 성공", "Connection successful");
        Add(K.DbConnectionSuccessCreated, "연결 성공 (DB 생성됨)", "Connection successful (database created)");
        Add(K.DbConnectionFailed, "연결 실패", "Connection failed");
        Add(K.DbConnectionFailedMsg, "연결에 실패했습니다.", "Connection failed.");
        Add(K.DbEnterServerDatabase, "서버와 데이터베이스 이름을 입력하세요.", "Enter server and database name.");
        Add(K.DbEnterSqlitePath, "SQLite 파일 경로를 입력하세요.", "Enter SQLite file path.");
        Add(K.DbSaved, "데이터베이스 설정이 저장되었습니다.", "Database settings saved.");
        Add(K.DbSavedWizard, "데이터베이스 설정이 저장되었습니다.\n\n사용자·관리자 계정은 DB에서 관리됩니다.\n최초 실행 시 기본 관리자({0} / {1})가 DB에 등록됩니다.", "Database settings saved.\n\nUsers and administrators are managed in the database.\nOn first run, the default admin ({0} / {1}) is registered.");
        Add(K.SqliteFileDialogTitle, "SQLite 데이터베이스 파일 선택", "Select SQLite Database File");

        Add(K.EmailSettingsHint, "이메일 서버 설정은 선택 사항입니다. 설정하지 않아도 애플리케이션을 사용할 수 있습니다.", "Email server settings are optional. The app works without them.");
        Add(K.EmailEnabled, "이메일 알림 사용", "Enable email notifications");
        Add(K.EmailSavedEnabled, "이메일 서버 설정이 저장되었습니다.", "Email server settings saved.");
        Add(K.EmailSavedDisabled, "이메일 알림이 비활성화되었습니다.\n애플리케이션은 이메일 없이 정상 운영됩니다.", "Email notifications disabled.\nThe app continues to work without email.");
        Add(K.EmailSmtpRequired, "SMTP 서버와 발신 주소를 입력하세요.", "Enter SMTP server and from address.");
        Add(K.EmailEnableSsl, "SSL/TLS 사용", "Use SSL/TLS");

        Add(K.NotificationEmailConfigured, "이메일 서버가 설정되어 있습니다. 알림을 받을 수 있습니다.", "Email server is configured. Notifications can be sent.");
        Add(K.NotificationEmailNotConfigured, "이메일 서버가 설정되지 않았습니다. 알림 설정은 저장되며, 서버 설정 후 자동으로 적용됩니다.", "Email server is not configured. Notification preferences are saved and apply after server setup.");
        Add(K.NotifyPageUpdate, "Page 생성·수정·삭제 알림", "Notify on page create, update, and delete");
        Add(K.NotifyWorkspaceChange, "Workspace 변경·멤버 변경 알림", "Notify on workspace and member changes");

        Add(K.SelectUserToAdd, "추가할 사용자를 선택하세요.", "Select a user to add.");
        Add(K.SelectMemberToRemove, "제거할 멤버를 선택하세요.", "Select a member to remove.");

        Add(K.NewPageTitle, "새 Page", "New Page");
        Add(K.NoTemplates, "사용 가능한 Page 양식이 없습니다.\n\n양식 폴더에 .mdtemplate 파일을 추가하세요.", "No page templates available.\n\nAdd .mdtemplate files to the template folder.");
        Add(K.NoTemplatesShort, "사용 가능한 Page 양식이 없습니다.", "No page templates available.");
        Add(K.EnterPageTitle, "Page 제목을 입력하세요.", "Enter a page title.");
        Add(K.DefaultNewPageTitle, "새 Page", "New Page");
        Add(K.TemplateSourceUser, "사용자 양식", "User template");
        Add(K.TemplateSourceBuiltIn, "기본 양식", "Built-in template");

        Add(K.PageHistoryTitleFormat, "버전 이력 - {0}", "Version History - {0}");
        Add(K.ColSavedAt, "저장 시각", "Saved At");
        Add(K.ColSavedBy, "저장자", "Saved By");
        Add(K.ConfirmRestoreVersion, "선택한 버전으로 복원할까요?\n현재 내용은 복원 전 버전으로 저장됩니다.", "Restore the selected version?\nCurrent content will be saved before restore.");

        Add(K.DbConnectionError, "데이터베이스 연결 오류", "Database Connection Error");
        Add(K.LoginError, "로그인 오류", "Sign-in Error");
        Add(K.DbConnectionFailedGeneric, "데이터베이스에 연결할 수 없습니다.", "Unable to connect to the database.");

        Add(K.ErrorDetailTitle, "오류", "Error");
        Add(K.InputDialogDefaultTitle, "입력", "Input");

        ServiceMessages.Register(Add);

        return d;
    }
}

internal static class L
{
    public static string AppName => Localization.Get(K.AppName);
    public static string EditorPlaceholder => Localization.Get(K.EditorPlaceholder);
}

internal static class K
{
    public const string AppName = "AppName";
    public const string AppTitleLoggedOut = "AppTitleLoggedOut";
    public const string AppTitleLoggedIn = "AppTitleLoggedIn";
    public const string StatusLoginRequired = "StatusLoginRequired";
    public const string StatusAdmin = "StatusAdmin";
    public const string StatusUser = "StatusUser";
    public const string StatusPage = "StatusPage";
    public const string SaveStatusModified = "SaveStatusModified";
    public const string SaveStatusSaved = "SaveStatusSaved";
    public const string SaveStatusAutoSaved = "SaveStatusAutoSaved";
    public const string SaveStatusFailed = "SaveStatusFailed";

    public const string MenuFile = "MenuFile";
    public const string MenuSavePage = "MenuSavePage";
    public const string MenuPageHistory = "MenuPageHistory";
    public const string MenuRefreshTree = "MenuRefreshTree";
    public const string MenuPreferences = "MenuPreferences";
    public const string MenuLogin = "MenuLogin";
    public const string MenuLogout = "MenuLogout";
    public const string MenuAbout = "MenuAbout";
    public const string MenuExit = "MenuExit";
    public const string MenuWorkspace = "MenuWorkspace";
    public const string MenuNewRootWorkspace = "MenuNewRootWorkspace";
    public const string MenuNewSubWorkspace = "MenuNewSubWorkspace";
    public const string MenuNewPage = "MenuNewPage";
    public const string MenuRename = "MenuRename";
    public const string MenuDelete = "MenuDelete";
    public const string MenuWorkspaceMembers = "MenuWorkspaceMembers";
    public const string MenuView = "MenuView";
    public const string MenuDocumentStructure = "MenuDocumentStructure";
    public const string MenuAdmin = "MenuAdmin";
    public const string MenuAdminUsers = "MenuAdminUsers";
    public const string MenuAdminDatabase = "MenuAdminDatabase";
    public const string MenuAdminEmail = "MenuAdminEmail";
    public const string MenuAccount = "MenuAccount";
    public const string MenuEditProfile = "MenuEditProfile";
    public const string MenuChangePassword = "MenuChangePassword";
    public const string MenuNotificationSettings = "MenuNotificationSettings";

    public const string CtxNewSubWorkspace = "CtxNewSubWorkspace";
    public const string CtxNewPage = "CtxNewPage";
    public const string CtxRename = "CtxRename";
    public const string CtxDelete = "CtxDelete";
    public const string CtxToggleFavoriteAdd = "CtxToggleFavoriteAdd";
    public const string CtxToggleFavoriteRemove = "CtxToggleFavoriteRemove";
    public const string CtxMembers = "CtxMembers";

    public const string LabelTitle = "LabelTitle";
    public const string LabelOutline = "LabelOutline";
    public const string OutlineCollapse = "OutlineCollapse";
    public const string OutlineExpand = "OutlineExpand";
    public const string FavoritesRoot = "FavoritesRoot";
    public const string OutlineUntitled = "OutlineUntitled";
    public const string UntitledPageTitle = "UntitledPageTitle";

    public const string ToolbarHeading1 = "ToolbarHeading1";
    public const string ToolbarHeading2 = "ToolbarHeading2";
    public const string ToolbarHeading3 = "ToolbarHeading3";
    public const string ToolbarHeading4 = "ToolbarHeading4";
    public const string ToolbarHeading5 = "ToolbarHeading5";
    public const string ToolbarHeading6 = "ToolbarHeading6";
    public const string ToolbarBold = "ToolbarBold";
    public const string ToolbarItalic = "ToolbarItalic";
    public const string ToolbarStrike = "ToolbarStrike";
    public const string ToolbarInlineCode = "ToolbarInlineCode";
    public const string ToolbarCodeBlock = "ToolbarCodeBlock";
    public const string ToolbarLink = "ToolbarLink";
    public const string ToolbarImage = "ToolbarImage";
    public const string ToolbarBulletList = "ToolbarBulletList";
    public const string ToolbarNumberList = "ToolbarNumberList";
    public const string ToolbarQuote = "ToolbarQuote";
    public const string ToolbarHorizontalRule = "ToolbarHorizontalRule";
    public const string ToolbarTable = "ToolbarTable";
    public const string ToolbarDocumentStructure = "ToolbarDocumentStructure";
    public const string ToolbarAbout = "ToolbarAbout";
    public const string AboutTitle = "AboutTitle";
    public const string AboutDescription = "AboutDescription";
    public const string AboutVersionFormat = "AboutVersionFormat";
    public const string AboutCopyrightFormat = "AboutCopyrightFormat";

    public const string EditorCut = "EditorCut";
    public const string EditorCopy = "EditorCopy";
    public const string EditorPaste = "EditorPaste";
    public const string EditorSelectAll = "EditorSelectAll";
    public const string EditorBold = "EditorBold";
    public const string EditorItalic = "EditorItalic";

    public const string LoginTitle = "LoginTitle";
    public const string LoginWindowTitle = "LoginWindowTitle";
    public const string LoginUsername = "LoginUsername";
    public const string LoginPassword = "LoginPassword";
    public const string LoginSubmit = "LoginSubmit";
    public const string LoginCancel = "LoginCancel";

    public const string PreferencesTitle = "PreferencesTitle";
    public const string PreferencesAppearance = "PreferencesAppearance";
    public const string PreferencesTheme = "PreferencesTheme";
    public const string PreferencesLanguage = "PreferencesLanguage";
    public const string ThemeLight = "ThemeLight";
    public const string ThemeDark = "ThemeDark";
    public const string LanguageKorean = "LanguageKorean";
    public const string LanguageEnglish = "LanguageEnglish";
    public const string ButtonOk = "ButtonOk";
    public const string ButtonCancel = "ButtonCancel";
    public const string PreferencesRestartHint = "PreferencesRestartHint";

    public const string EditorPlaceholder = "EditorPlaceholder";
    public const string EditorInitFailed = "EditorInitFailed";
    public const string EditorClearFailed = "EditorClearFailed";
    public const string PageLoadFailed = "PageLoadFailed";
    public const string PageLoadFailedTitle = "PageLoadFailedTitle";
    public const string SaveFailed = "SaveFailed";
    public const string SelectPage = "SelectPage";
    public const string SelectPageToSave = "SelectPageToSave";
    public const string SelectWorkspace = "SelectWorkspace";
    public const string SelectWorkspaceOrPage = "SelectWorkspaceOrPage";
    public const string SelectWorkspaceForPage = "SelectWorkspaceForPage";
    public const string SelectWorkspaceForSub = "SelectWorkspaceForSub";
    public const string NewWorkspace = "NewWorkspace";
    public const string NewSubWorkspace = "NewSubWorkspace";
    public const string WorkspaceNamePrompt = "WorkspaceNamePrompt";
    public const string RenameWorkspaceTitle = "RenameWorkspaceTitle";
    public const string RenamePageTitle = "RenamePageTitle";
    public const string NewNamePrompt = "NewNamePrompt";
    public const string NewTitlePrompt = "NewTitlePrompt";
    public const string ConfirmDeletePage = "ConfirmDeletePage";
    public const string ConfirmDeleteWorkspace = "ConfirmDeleteWorkspace";
    public const string Confirm = "Confirm";
    public const string DialogLinkTitle = "DialogLinkTitle";
    public const string DialogImageTitle = "DialogImageTitle";
    public const string DialogUrlPrompt = "DialogUrlPrompt";
    public const string DialogInputRequired = "DialogInputRequired";
    public const string DefaultCodeText = "DefaultCodeText";
    public const string DefaultImageAlt = "DefaultImageAlt";
    public const string TableHeader1 = "TableHeader1";
    public const string TableHeader2 = "TableHeader2";
    public const string ErrorTitle = "ErrorTitle";
    public const string SessionLoginRequired = "SessionLoginRequired";

    public const string ButtonSave = "ButtonSave";
    public const string ButtonClose = "ButtonClose";
    public const string ButtonAdd = "ButtonAdd";
    public const string ButtonEdit = "ButtonEdit";
    public const string ButtonDelete = "ButtonDelete";
    public const string ButtonCreate = "ButtonCreate";
    public const string ButtonChange = "ButtonChange";
    public const string ButtonRestore = "ButtonRestore";
    public const string ButtonCopy = "ButtonCopy";
    public const string ButtonCopied = "ButtonCopied";
    public const string ButtonTestConnection = "ButtonTestConnection";
    public const string ButtonBrowse = "ButtonBrowse";
    public const string ButtonReload = "ButtonReload";
    public const string ButtonOpenTemplateFolder = "ButtonOpenTemplateFolder";
    public const string ButtonAddMember = "ButtonAddMember";
    public const string ButtonRemoveMember = "ButtonRemoveMember";
    public const string ButtonExit = "ButtonExit";

    public const string LabelUsername = "LabelUsername";
    public const string LabelPassword = "LabelPassword";
    public const string LabelRole = "LabelRole";
    public const string LabelServer = "LabelServer";
    public const string LabelPort = "LabelPort";
    public const string LabelDatabase = "LabelDatabase";
    public const string LabelUser = "LabelUser";
    public const string LabelEmail = "LabelEmail";
    public const string LabelInput = "LabelInput";
    public const string LabelPreview = "LabelPreview";
    public const string LabelProvider = "LabelProvider";
    public const string LabelSqliteFile = "LabelSqliteFile";
    public const string LabelSmtpHost = "LabelSmtpHost";
    public const string LabelFromAddress = "LabelFromAddress";
    public const string LabelFromDisplayName = "LabelFromDisplayName";
    public const string LabelTemplate = "LabelTemplate";
    public const string LabelTemplateDesc = "LabelTemplateDesc";
    public const string LabelTemplateFolderPrefix = "LabelTemplateFolderPrefix";
    public const string LabelSavedVersions = "LabelSavedVersions";
    public const string LabelRegisteredMembers = "LabelRegisteredMembers";
    public const string LabelAddUser = "LabelAddUser";
    public const string LabelCurrentPassword = "LabelCurrentPassword";
    public const string LabelNewPassword = "LabelNewPassword";
    public const string LabelConfirmPassword = "LabelConfirmPassword";
    public const string LabelCreatedAt = "LabelCreatedAt";

    public const string RoleAdmin = "RoleAdmin";
    public const string RoleUser = "RoleUser";
    public const string MemberRoleViewer = "MemberRoleViewer";
    public const string MemberRoleEditor = "MemberRoleEditor";

    public const string SelectUser = "SelectUser";
    public const string ConfirmDeleteUser = "ConfirmDeleteUser";
    public const string UserAddTitle = "UserAddTitle";
    public const string UserEditTitle = "UserEditTitle";
    public const string PasswordNewOptional = "PasswordNewOptional";

    public const string ChangePasswordAllFieldsRequired = "ChangePasswordAllFieldsRequired";
    public const string ChangePasswordMismatch = "ChangePasswordMismatch";
    public const string ChangePasswordInvalidCurrent = "ChangePasswordInvalidCurrent";
    public const string ChangePasswordSuccess = "ChangePasswordSuccess";

    public const string DbSetupWizardTitle = "DbSetupWizardTitle";
    public const string DbSettingsTitle = "DbSettingsTitle";
    public const string DbTestingConnection = "DbTestingConnection";
    public const string DbConnectionSuccess = "DbConnectionSuccess";
    public const string DbConnectionSuccessCreated = "DbConnectionSuccessCreated";
    public const string DbConnectionFailed = "DbConnectionFailed";
    public const string DbConnectionFailedMsg = "DbConnectionFailedMsg";
    public const string DbEnterServerDatabase = "DbEnterServerDatabase";
    public const string DbEnterSqlitePath = "DbEnterSqlitePath";
    public const string DbSaved = "DbSaved";
    public const string DbSavedWizard = "DbSavedWizard";
    public const string SqliteFileDialogTitle = "SqliteFileDialogTitle";

    public const string EmailSettingsHint = "EmailSettingsHint";
    public const string EmailEnabled = "EmailEnabled";
    public const string EmailSavedEnabled = "EmailSavedEnabled";
    public const string EmailSavedDisabled = "EmailSavedDisabled";
    public const string EmailSmtpRequired = "EmailSmtpRequired";
    public const string EmailEnableSsl = "EmailEnableSsl";

    public const string NotificationEmailConfigured = "NotificationEmailConfigured";
    public const string NotificationEmailNotConfigured = "NotificationEmailNotConfigured";
    public const string NotifyPageUpdate = "NotifyPageUpdate";
    public const string NotifyWorkspaceChange = "NotifyWorkspaceChange";

    public const string SelectUserToAdd = "SelectUserToAdd";
    public const string SelectMemberToRemove = "SelectMemberToRemove";

    public const string NewPageTitle = "NewPageTitle";
    public const string NoTemplates = "NoTemplates";
    public const string NoTemplatesShort = "NoTemplatesShort";
    public const string EnterPageTitle = "EnterPageTitle";
    public const string DefaultNewPageTitle = "DefaultNewPageTitle";
    public const string TemplateSourceUser = "TemplateSourceUser";
    public const string TemplateSourceBuiltIn = "TemplateSourceBuiltIn";

    public const string PageHistoryTitleFormat = "PageHistoryTitleFormat";
    public const string ColSavedAt = "ColSavedAt";
    public const string ColSavedBy = "ColSavedBy";
    public const string ConfirmRestoreVersion = "ConfirmRestoreVersion";

    public const string DbConnectionError = "DbConnectionError";
    public const string LoginError = "LoginError";
    public const string DbConnectionFailedGeneric = "DbConnectionFailedGeneric";

    public const string ErrorDetailTitle = "ErrorDetailTitle";
    public const string InputDialogDefaultTitle = "InputDialogDefaultTitle";

    public const string ErrLoginUsernameRequired = "ErrLoginUsernameRequired";
    public const string ErrLoginPasswordRequired = "ErrLoginPasswordRequired";
    public const string ErrLoginInvalidCredentials = "ErrLoginInvalidCredentials";
    public const string ErrUsernameRequired = "ErrUsernameRequired";
    public const string ErrPasswordRequired = "ErrPasswordRequired";
    public const string ErrUsernameExists = "ErrUsernameExists";
    public const string ErrUserNotFound = "ErrUserNotFound";
    public const string ErrCannotDeleteLastAdmin = "ErrCannotDeleteLastAdmin";
    public const string ErrFavoriteRegisteredOnly = "ErrFavoriteRegisteredOnly";
    public const string ErrWorkspaceNameRequired = "ErrWorkspaceNameRequired";
    public const string ErrParentWorkspaceAccessDenied = "ErrParentWorkspaceAccessDenied";
    public const string ErrMoveUnderSelf = "ErrMoveUnderSelf";
    public const string ErrTargetWorkspaceAccessDenied = "ErrTargetWorkspaceAccessDenied";
    public const string ErrTargetWorkspaceManageDenied = "ErrTargetWorkspaceManageDenied";
    public const string ErrMoveToChildWorkspace = "ErrMoveToChildWorkspace";
    public const string ErrWorkspaceNotFound = "ErrWorkspaceNotFound";
    public const string ErrWorkspaceHasChildren = "ErrWorkspaceHasChildren";
    public const string ErrWorkspaceHasPages = "ErrWorkspaceHasPages";
    public const string ErrOwnerRoleAutoAssigned = "ErrOwnerRoleAutoAssigned";
    public const string ErrMemberAlreadyExists = "ErrMemberAlreadyExists";
    public const string ErrCannotRemoveOwner = "ErrCannotRemoveOwner";
    public const string ErrWorkspaceManageDenied = "ErrWorkspaceManageDenied";
    public const string ErrSubWorkspaceWithPagesDenied = "ErrSubWorkspaceWithPagesDenied";
    public const string ErrPageCreateDenied = "ErrPageCreateDenied";
    public const string ErrPageTitleRequired = "ErrPageTitleRequired";
    public const string ErrPageContentEmpty = "ErrPageContentEmpty";
    public const string ErrPageNotFound = "ErrPageNotFound";
    public const string ErrPageEditDenied = "ErrPageEditDenied";
    public const string ErrPageMoveDenied = "ErrPageMoveDenied";
    public const string ErrPageDeleteDenied = "ErrPageDeleteDenied";
    public const string ErrPageAccessDenied = "ErrPageAccessDenied";
    public const string ErrVersionNotFound = "ErrVersionNotFound";
    public const string ErrServerRequired = "ErrServerRequired";
    public const string ErrDatabaseNameRequired = "ErrDatabaseNameRequired";
    public const string ErrNoPageTemplates = "ErrNoPageTemplates";
    public const string ErrDatabaseConfigRequired = "ErrDatabaseConfigRequired";
    public const string ErrDatabaseNameInvalid = "ErrDatabaseNameInvalid";
    public const string ErrUnsupportedDbProvider = "ErrUnsupportedDbProvider";
}

internal sealed class EditorChromeOptions
{
    public string Placeholder { get; init; } = string.Empty;
    public ThemePalette Palette { get; init; } = ThemePalette.Light;

    public static EditorChromeOptions CreateCurrent() =>
        new()
        {
            Placeholder = L.EditorPlaceholder,
            Palette = AppTheme.CurrentPalette
        };
}
