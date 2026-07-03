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
        Add(K.SaveStatusOfflineSaved, "로컬 SQLite에 저장됨", "Saved to local SQLite");
        Add(K.StatusPageOfflineSaved, "Page: {0} (로컬 SQLite)", "Page: {0} (local SQLite)");
        Add(K.StatusOfflineFallbackMode, "로컬 SQLite 모드 (DB 연결 불가)", "Local SQLite mode (database unavailable)");
        Add(K.OfflineSaveContextMissing, "오프라인 저장에 필요한 Page 정보가 없습니다.", "Page context required for offline save is missing.");
        Add(K.SaveStatusFailed, "저장 실패", "Save failed");

        Add(K.MenuFile, "파일(&F)", "&File");
        Add(K.MenuEdit, "편집(&E)", "&Edit");
        Add(K.MenuUndo, "실행 취소(&U)", "&Undo");
        Add(K.MenuRedo, "다시 실행(&R)", "&Redo");
        Add(K.MenuSavePage, "저장(&S)", "&Save");
        Add(K.MenuSavePageAsMarkdown, "Markdown 파일로 저장(&M)...", "Save Page as &Markdown...");
        Add(K.MenuExportPage, "Page 내보내기(&P)...", "Export &Page...");
        Add(K.MenuExportWorkspace, "Workspace 내보내기(&W)...", "Export &Workspace...");
        Add(K.MenuExport, "내보내기(&E)", "E&xport");
        Add(K.MenuPageHistory, "버전 이력(&H)", "Page &History");
        Add(K.MenuPageLog, "변경 Log(&L)", "Change &Log");
        Add(K.MenuRefreshTree, "트리 새로고침(&R)", "&Refresh Tree");
        Add(K.MenuNewProject, "새 프로젝트(&N)...", "New &Project...");
        Add(K.MenuSaveWorkspace, "프로젝트 저장(&P)...", "Save &Project...");
        Add(K.MenuLoadWorkspace, "프로젝트 열기(&O)...", "Open &Project...");
        Add(K.MenuRecentProjects, "최근 프로젝트", "Recent Projects");
        Add(K.RecentProjectsEmpty, "(최근 프로젝트 없음)", "(No recent projects)");
        Add(K.RecentProjectsClearAll, "최근 목록 모두 지우기", "Clear Recent List");
        Add(K.RecentProjectRemove, "목록에서 제거", "Remove from List");
        Add(K.RecentProjectMissing, "프로젝트 파일을 찾을 수 없습니다.\n{0}\n\n최근 목록에서 제거할까요?", "Project file not found:\n{0}\n\nRemove it from the recent list?");
        Add(K.TipMenuRecentProjects, "최근에 연 .wsp 프로젝트 파일을 엽니다. 항목을 우클릭하면 목록에서 제거할 수 있습니다.", "Open a recently used .wsp project file. Right-click an item to remove it from the list.");
        Add(K.MenuPreferences, "환경 설정(&P)...", "&Preferences...");
        Add(K.MenuLogin, "로그인(&L)...", "&Sign In...");
        Add(K.MenuLogout, "로그아웃(&L)", "Sign &Out");
        Add(K.MenuBarSessionLoggedInFormat, "{0} ({1})", "{0} ({1})");
        Add(K.MenuBarSessionLoggedOut, "로그인되지 않음", "Not signed in");
        Add(K.MenuBarLogin, "로그인", "Sign In");
        Add(K.MenuBarLogout, "로그아웃", "Sign Out");
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
        Add(K.MenuSettings, "설정(&S)", "&Settings");
        Add(K.MenuProfile, "프로필(&P)", "&Profile");
        Add(K.MenuEditProfile, "프로필 수정", "Edit Profile");
        Add(K.MenuChangePassword, "비밀번호 변경", "Change Password");
        Add(K.MenuNotificationSettings, "알림 설정", "Notification Settings");

        Add(K.CtxNewSubWorkspace, "하위 Workspace 추가", "Add Sub-workspace");
        Add(K.CtxNewPage, "새 Page (양식)...", "New Page (Template)...");
        Add(K.CtxRename, "이름 변경", "Rename");
        Add(K.CtxDelete, "삭제", "Delete");
        Add(K.CtxToggleFavoriteAdd, "즐겨찾기 추가", "Add to Favorites");
        Add(K.CtxToggleFavoriteRemove, "즐겨찾기 제거", "Remove from Favorites");
        Add(K.CtxLockWorkspace, "Workspace 잠금", "Lock Workspace");
        Add(K.CtxUnlockWorkspace, "Workspace 잠금 해제", "Unlock Workspace");
        Add(K.CtxLockPage, "Page 잠금", "Lock Page");
        Add(K.CtxUnlockPage, "Page 잠금 해제", "Unlock Page");
        Add(K.WorkspaceLockedSuffix, " 🔒", " 🔒");
        Add(K.CtxMembers, "멤버 관리", "Manage Members");

        Add(K.LabelTitle, "제목", "Title");
        Add(K.LabelWorkspace, "Workspace", "Workspace");
        Add(K.LabelOutline, "문서 구조", "Document Outline");
        Add(K.LabelMarkdownEditor, "Markdown 편집", "Markdown Editor");
        Add(K.OutlineCollapse, "◀ 접기", "◀ Collapse");
        Add(K.OutlineExpand, "▶ 펼치기", "▶ Expand");
        Add(K.FavoritesRoot, "즐겨찾기", "Favorites");
        Add(K.OutlineUntitled, "(제목 없음)", "(Untitled)");
        Add(K.UntitledPageTitle, "제목없음", "Untitled");

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
        Add(K.ToolbarImage, "이미지 불러오기", "Import Image");
        Add(K.ToolbarAttachFile, "파일 불러오기", "Load File");
        Add(K.ToolbarBulletList, "글머리 목록", "Bullet List");
        Add(K.ToolbarNumberList, "번호 목록", "Numbered List");
        Add(K.ToolbarQuote, "인용", "Quote");
        Add(K.ToolbarHorizontalRule, "구분선", "Horizontal Rule");
        Add(K.ToolbarTable, "표", "Table");
        Add(K.ToolbarUndo, "실행 취소 (Ctrl+Z)", "Undo (Ctrl+Z)");
        Add(K.ToolbarRedo, "다시 실행 (Ctrl+Y)", "Redo (Ctrl+Y)");
        Add(K.ToolbarDocumentStructure, "문서 구조", "Document Outline");
        Add(K.ToolbarAbout, "프로그램 정보", "About");
        Add(K.TipToolbarMoreTools, "더 많은 도구 보기", "Show more tools");
        Add(K.ToolbarSave, "저장 (Ctrl+S)", "Save (Ctrl+S)");
        Add(K.TipMenuSavePage, "현재 Page를 설정된 DB에 저장합니다. 프로젝트 파일(.wsp)을 연 상태이면 같은 파일에도 함께 저장합니다. 자동 저장은 SQLite 3에만 기록됩니다.", "Save the current page to the configured database. When a .wsp project file is open, also updates that file. Auto-save writes to SQLite 3 only.");
        Add(K.ToolbarSaveMarkdown, "Markdown 파일로 저장", "Save as Markdown");
        Add(K.ToolbarExport, "Page 내보내기", "Export Page");
        Add(K.ToolbarHistory, "Page 버전 이력", "Page History");
        Add(K.ToolbarPageLog, "Page 변경 Log", "Page Change Log");

        Add(K.TipMenuFile, "파일 저장, 프로젝트, 환경 설정", "Save, projects, and preferences");
        Add(K.TipMenuEdit, "실행 취소, 다시 실행", "Undo and redo");
        Add(K.TipMenuUndo, "실행 취소 (Ctrl+Z)", "Undo (Ctrl+Z)");
        Add(K.TipMenuRedo, "다시 실행 (Ctrl+Y)", "Redo (Ctrl+Y)");
        Add(K.TipMenuWorkspace, "Workspace와 Page 관리", "Manage workspaces and pages");
        Add(K.TipMenuExport, "Page 또는 Workspace를 Markdown, Word, PDF로 내보냅니다.", "Export pages or workspaces as Markdown, Word, or PDF.");
        Add(K.TipMenuView, "보기 및 문서 구조", "View and document outline");
        Add(K.TipMenuAdmin, "사용자 관리 (관리자)", "User management (administrator)");
        Add(K.TipMenuAccount, "계정 및 알림 설정", "Account and notification settings");
        Add(K.TipMenuSettings, "테마·언어 등 환경 설정", "Theme, language, and preferences");
        Add(K.TipMenuProfile, "프로필, 비밀번호, 알림 설정", "Profile, password, and notifications");
        Add(K.TipMenuRefreshTree, "Workspace 트리 새로고침 (F5)", "Refresh workspace tree (F5)");
        Add(K.TipMenuPreferences, "테마·언어 등 환경 설정", "Theme, language, and preferences");
        Add(K.TipAppSettingsMark, "프로그램 설정 (환경 설정, DB·이메일)", "Program settings (preferences, database and email)");
        Add(K.TipMenuLogin, "로그인", "Sign in to your account");
        Add(K.TipMenuLogout, "로그아웃", "Sign out");
        Add(K.TipMenuNewProject, "새 Workspace를 만들고 .wsp 프로젝트 파일로 저장합니다. 이후 Ctrl+S로 DB와 프로젝트 파일에 함께 저장할 수 있습니다.", "Create a new workspace and save it as a .wsp project file. Use Ctrl+S later to save to the database and project file together.");
        Add(K.TipMenuSaveProject, "선택한 Workspace 전체(하위 Workspace·Page·첨부 파일)를 .wsp 프로젝트 파일로 로컬에 저장합니다. 자동 저장은 SQLite 3 DB에만 적용됩니다.", "Save the selected workspace tree (sub-workspaces, pages, attachments) as a local .wsp project file. Auto-save writes to the SQLite 3 database only.");
        Add(K.TipMenuOpenProject, ".wsp 프로젝트 파일을 열어 Workspace를 DB에 불러옵니다. 마지막으로 사용한 프로젝트 폴더가 다시 열기·저장 대화상자에 사용됩니다.", "Open a .wsp project file to import workspaces into the database. The last project folder is reused for open and save dialogs.");
        Add(K.TipMenuBarLogout, "로그아웃", "Sign out");
        Add(K.TipMenuBarSession, "현재 로그인 계정", "Current signed-in account");
        Add(K.TipMenuExit, "프로그램 종료", "Exit the application");
        Add(K.TipMenuNewRootWorkspace, "최상위 Workspace 생성", "Create a root workspace");
        Add(K.TipMenuNewSubWorkspace, "선택한 Workspace 아래 하위 Workspace 생성", "Create a sub-workspace");
        Add(K.TipMenuNewPage, "양식에서 새 Page 만들기", "Create a new page from a template");
        Add(K.TipMenuRename, "선택한 Workspace 또는 Page 이름 변경", "Rename the selected item");
        Add(K.TipMenuDelete, "선택한 Workspace 또는 Page 삭제", "Delete the selected item");
        Add(K.TipMenuWorkspaceMembers, "Workspace 멤버 관리", "Manage workspace members");
        Add(K.TipMenuAdminUsers, "사용자 계정 관리", "Manage user accounts");
        Add(K.TipMenuAdminDatabase, "데이터베이스 연결 설정", "Configure database connection");
        Add(K.TipMenuAdminEmail, "이메일 서버 설정", "Configure email server");
        Add(K.TipMenuEditProfile, "프로필 정보 수정", "Edit your profile");
        Add(K.TipMenuChangePassword, "비밀번호 변경", "Change your password");
        Add(K.TipMenuNotificationSettings, "알림 수신 설정", "Configure notification preferences");
        Add(K.TipCtxToggleFavoriteAdd, "Workspace를 즐겨찾기에 추가", "Add workspace to favorites");
        Add(K.TipCtxToggleFavoriteRemove, "Workspace를 즐겨찾기에서 제거", "Remove workspace from favorites");
        Add(K.TipCtxLockWorkspace, "다른 사용자의 편집을 막습니다", "Prevent other users from editing");
        Add(K.TipCtxUnlockWorkspace, "Workspace 잠금을 해제합니다", "Release the workspace lock");
        Add(K.TipCtxLockPage, "다른 사용자의 Page 편집을 막습니다", "Prevent other users from editing this page");
        Add(K.TipCtxUnlockPage, "Page 잠금을 해제합니다", "Release the page lock");
        Add(K.StatusWorkspaceLockedReadOnly, "{0}님이 잠근 Workspace입니다. 읽기 전용입니다.", "This workspace is locked by {0}. Read-only.");
        Add(K.StatusPageLockedReadOnly, "{0}님이 잠근 Page입니다. 읽기 전용입니다.", "This page is locked by {0}. Read-only.");
        Add(K.TipEditorCut, "선택 영역 잘라내기 (Ctrl+X)", "Cut selection (Ctrl+X)");
        Add(K.TipEditorCopy, "선택 영역 복사 (Ctrl+C)", "Copy selection (Ctrl+C)");
        Add(K.TipEditorPaste, "클립보드 내용 붙여넣기 (Ctrl+V)", "Paste from clipboard (Ctrl+V)");
        Add(K.TipEditorSelectAll, "전체 선택 (Ctrl+A)", "Select all (Ctrl+A)");
        Add(K.TipEditorBold, "굵게 (Ctrl+B)", "Bold (Ctrl+B)");
        Add(K.TipEditorItalic, "기울임 (Ctrl+I)", "Italic (Ctrl+I)");

        Add(K.AboutTitle, "프로그램 정보", "About");
        Add(K.AboutDescription, "Notion 스타일의 Workspace·Page 관리 데스크톱 애플리케이션입니다.", "A Notion-style desktop app for managing workspaces and pages.");
        Add(K.AboutVersionFormat, "버전 {0}", "Version {0}");
        Add(K.AboutCopyrightFormat, "Copyright © {0} SHKWON(knix008@naver.com)", "Copyright © {0} SHKWON(knix008@naver.com)");

        Add(K.EditorCut, "잘라내기", "Cut");
        Add(K.EditorCopy, "복사", "Copy");
        Add(K.EditorPaste, "붙여넣기", "Paste");
        Add(K.EditorUndo, "실행 취소", "Undo");
        Add(K.EditorRedo, "다시 실행", "Redo");
        Add(K.EditorSelectAll, "모두 선택", "Select All");
        Add(K.EditorBold, "굵게", "Bold");
        Add(K.EditorItalic, "기울임", "Italic");

        Add(K.LoginTitle, "MyWorkspace", "MyWorkspace");
        Add(K.LoginWindowTitle, "MyWorkspace - 로그인", "MyWorkspace - Sign In");
        Add(K.LoginUsername, "사용자 ID", "User ID");
        Add(K.LoginPassword, "비밀번호", "Password");
        Add(K.LoginSubmit, "로그인", "Sign In");
        Add(K.LoginCancel, "취소", "Cancel");
        Add(K.LoginDefaultAdminHint, "기본 관리자: {0} / {1}\n별도 DB 설정이 없으면 로컬 SQLite 3를 자동으로 사용합니다.", "Default administrator: {0} / {1}\nWhen no database is configured, local SQLite 3 is used automatically.");

        Add(K.PreferencesTitle, "환경 설정", "Preferences");
        Add(K.PreferencesAppearance, "모양", "Appearance");
        Add(K.PreferencesTheme, "테마", "Theme");
        Add(K.PreferencesColorTheme, "색상 테마", "Color theme");
        Add(K.PreferencesCustomColor, "사용자 선택색", "Custom color");
        Add(K.PreferencesLanguage, "언어", "Language");
        Add(K.PreferencesFontScale, "글꼴 크기", "Font size");
        Add(K.MenuClosePageTab, "탭 닫기(&C)", "Close &Tab");
        Add(K.ConfirmCloseDirtyPageTab, "변경 내용이 있습니다. 저장하시겠습니까?", "Save changes before closing this tab?");
        Add(K.FontScaleMuchSmaller, "매우 작게", "Much smaller");
        Add(K.FontScaleSmaller, "작게", "Smaller");
        Add(K.FontScaleNormal, "보통 (기본)", "Normal (default)");
        Add(K.FontScaleLarger, "크게", "Larger");
        Add(K.FontScaleMuchLarger, "매우 크게", "Much larger");
        Add(K.ThemeLight, "밝게", "Light");
        Add(K.ThemeDark, "어둡게", "Dark");
        Add(K.PastelRose, "로즈", "Rose");
        Add(K.PastelPeach, "피치", "Peach");
        Add(K.PastelLemon, "레몬", "Lemon");
        Add(K.PastelMint, "민트", "Mint");
        Add(K.PastelSky, "스카이", "Sky");
        Add(K.PastelLavender, "라벤더", "Lavender");
        Add(K.PastelLilac, "라일락", "Lilac");
        Add(K.PastelCoral, "코랄", "Coral");
        Add(K.PastelApricot, "살구", "Apricot");
        Add(K.PastelButter, "버터", "Butter");
        Add(K.PastelSage, "세이지", "Sage");
        Add(K.PastelAqua, "아쿠아", "Aqua");
        Add(K.PastelPeriwinkle, "페리윙클", "Periwinkle");
        Add(K.PastelPink, "핑크", "Pink");
        Add(K.PastelSand, "샌드", "Sand");
        Add(K.PastelSeafoam, "씨폼", "Seafoam");
        Add(K.PastelOrchid, "오키드", "Orchid");
        Add(K.PastelMeadow, "미도", "Meadow");
        Add(K.PastelPowder, "파우더", "Powder");
        Add(K.PastelCream, "크림", "Cream");
        Add(K.LanguageKorean, "한국어", "Korean");
        Add(K.LanguageEnglish, "English", "English");
        Add(K.ButtonOk, "확인", "OK");
        Add(K.ButtonCancel, "취소", "Cancel");
        Add(K.ButtonYes, "예", "Yes");
        Add(K.ButtonNo, "아니오", "No");
        Add(K.ButtonRetry, "다시 시도", "Retry");
        Add(K.StatusWorkspace, "Workspace: {0}", "Workspace: {0}");
        Add(K.PreferencesRestartHint, "변경 사항은 즉시 적용됩니다.", "Changes apply immediately.");

        Add(K.EditorPlaceholder, "제목 1로 페이지 제목을 입력하고 내용을 작성하세요. 툴바로 서식을 적용할 수 있습니다.", "Use Heading 1 for the page title, then write your content. Use the toolbar to apply formatting.");
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
        Add(K.ConfirmDeletePage, "\"{0}\" Page를 삭제할까요?", "Delete page \"{0}\"?");
        Add(K.ConfirmDeleteWorkspace, "\"{0}\" Workspace를 삭제할까요?", "Delete workspace \"{0}\"?");
        Add(K.ConfirmLogout, "로그아웃하시겠습니까?", "Do you want to sign out?");
        Add(K.Confirm, "확인", "Confirm");
        Add(K.DialogLinkTitle, "링크", "Link");
        Add(K.DialogLinkTextPrompt, "표시 이름:", "Display text:");
        Add(K.DialogLinkUrlPrompt, "URL:", "URL:");
        Add(K.DialogLinkUrlRequired, "URL을 입력하세요.", "Enter a URL.");
        Add(K.DialogImageTitle, "이미지", "Image");
        Add(K.DialogImageFilePrompt, "JPEG, PNG, GIF, WebP, AVIF 이미지 파일을 선택하세요.", "Select a JPEG, PNG, GIF, WebP, or AVIF image.");
        Add(K.DialogAttachFilePrompt, "첨부할 파일을 선택하세요.", "Select a file to attach.");
        Add(K.AttachmentRequiresPage, "이미지나 파일을 추가하려면 먼저 Page를 열어 주세요.", "Open a page before inserting images or files.");
        Add(K.OpenResourceFailed, "링크나 파일을 열 수 없습니다.", "Unable to open the link or file.");
        Add(K.ImageFileFilterLabel, "이미지 (JPEG, PNG, GIF, WebP, AVIF, SVG)", "Images (JPEG, PNG, GIF, WebP, AVIF, SVG)");
        Add(K.UnsupportedImageFormat, "지원하지 않는 이미지 형식입니다: {0}", "Unsupported image format: {0}");
        Add(K.AllFilesFilterLabel, "모든 파일", "All Files");
        Add(K.ExportPageTitle, "Page 내보내기", "Export Page");
        Add(K.ExportPagePrompt, "내보낼 형식을 선택하세요.", "Choose an export format.");
        Add(K.ExportFormatMarkdown, "Markdown (.md)", "Markdown (.md)");
        Add(K.ExportFormatWord, "Word (.docx)", "Word (.docx)");
        Add(K.ExportFormatPdf, "PDF (.pdf)", "PDF (.pdf)");
        Add(K.ExportSucceeded, "Page를 내보냈습니다.\n파일: {0}\n폴더: {1}", "Page exported successfully.\nFile: {0}\nFolder: {1}");
        Add(K.ExportWorkspaceTitle, "Workspace 내보내기", "Export Workspace");
        Add(K.ExportWorkspacePrompt, "내보낼 형식을 선택하세요.", "Choose an export format.");
        Add(K.ExportWorkspaceChooseFolder, "Workspace를 내보낼 파일을 저장하세요.", "Choose where to save the exported workspace file.");
        Add(K.ExportWorkspaceSucceeded, "Workspace를 내보냈습니다.\nWorkspace {0}개, Page {1}개\n파일: {2}\n폴더: {3}", "Workspace exported successfully.\n{0} workspace(s), {1} page(s)\nFile: {2}\nFolder: {3}");
        Add(K.ExportWorkspaceFailed, "Workspace 내보내기 실패", "Workspace export failed");
        Add(K.SelectWorkspaceToExport, "내보낼 Workspace를 선택하세요.", "Select a workspace to export.");
        Add(K.WorkspaceAccessRequired, "Workspace에 접근할 수 없습니다.", "You do not have access to this workspace.");
        Add(K.WorkspaceArchiveFileFilterLabel, "MyWorkspace 프로젝트 (*.wsp)", "MyWorkspace Project (*.wsp)");
        Add(K.WorkspaceSaveSucceeded, "프로젝트를 저장했습니다.", "Project saved successfully.");
        Add(K.WorkspaceLoadSucceeded, "프로젝트에서 Workspace {0}개, Page {1}개를 불러왔습니다.", "Loaded {0} workspace(s) and {1} page(s) from the project.");
        Add(K.WorkspaceSaveFailed, "프로젝트 저장 실패", "Project save failed");
        Add(K.WorkspaceLoadFailed, "프로젝트 열기 실패", "Project open failed");
        Add(K.SelectWorkspaceToSave, "프로젝트로 저장할 Workspace를 선택하세요.", "Select a workspace to save as a project.");
        Add(K.NewProjectNamePrompt, "프로젝트 이름", "Project name");
        Add(K.DefaultNewProjectName, "새 프로젝트", "New Project");
        Add(K.NewProjectSucceeded, "새 프로젝트를 만들었습니다.\n{0}", "Created a new project.\n{0}");
        Add(K.NewProjectFailed, "새 프로젝트 만들기 실패", "Failed to create project");
        Add(K.WorkspaceManageRequired, "Workspace를 저장하거나 불러오려면 관리 권한이 필요합니다.", "Manage permission is required to save or load a workspace.");
        Add(K.ExportFailed, "내보내기 실패", "Export failed");
        Add(K.SaveMarkdownSucceeded, "Markdown 파일을 저장했습니다.\n파일: {0}\n폴더: {1}", "Markdown file saved successfully.\nFile: {0}\nFolder: {1}");
        Add(K.SaveMarkdownFailed, "Markdown 저장 실패", "Markdown save failed");
        Add(K.MarkdownFileFilterLabel, "Markdown 파일", "Markdown Files");
        Add(K.WordFileFilterLabel, "Word 문서", "Word Documents");
        Add(K.PdfFileFilterLabel, "PDF 문서", "PDF Documents");
        Add(K.DialogUrlPrompt, "URL:", "URL:");
        Add(K.DialogInputRequired, "값을 입력하세요.", "Enter a value.");
        Add(K.DefaultCodeText, "코드", "code");
        Add(K.DefaultImageAlt, "이미지", "image");
        Add(K.TableHeader1, "열1", "Col 1");
        Add(K.TableHeader2, "열2", "Col 2");
        Add(K.TableInsertTitle, "표 삽입", "Insert Table");
        Add(K.TableInsertHint, "행과 열 크기를 선택하세요.", "Select the table size.");
        Add(K.TableInsertSizeFormat, "{0}행 x {1}열", "{0} rows x {1} columns");
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
        Add(K.ConfirmDiscardMemberChanges, "저장하지 않은 멤버 변경 사항이 있습니다. 취소하시겠습니까?", "You have unsaved member changes. Discard them?");
        Add(K.MemberRoleOwner, "Owner", "Owner");
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
        Add(K.DbSavedReloginRequired, "데이터베이스가 변경되었습니다. 새 DB에 동일한 계정이 없어 다시 로그인해야 합니다.", "The database was changed. Sign in again because your account was not found in the new database.");
        Add(K.DbSavedWizard, "데이터베이스 설정이 저장되었습니다.\n\n사용자·관리자 계정은 DB에서 관리됩니다.\n최초 실행 시 기본 관리자({0} / {1})가 DB에 등록됩니다.", "Database settings saved.\n\nUsers and administrators are managed in the database.\nOn first run, the default admin ({0} / {1}) is registered.");
        Add(K.ButtonDisconnectDatabase, "연결 끊기", "Disconnect");
        Add(K.ConfirmDisconnectDatabase, "데이터베이스 연결을 끊을까요?\n\n연결을 끊으면 로그아웃되며, 다시 사용하려면 DB 연결 설정에서 저장해야 합니다.", "Disconnect from the database?\n\nYou will be signed out. Save database settings again to reconnect.");
        Add(K.DbDisconnected, "데이터베이스 연결이 끊어졌습니다.", "Database connection disconnected.");
        Add(K.DbConnectionDisconnectedStatus, "DB 연결이 끊어진 상태입니다.", "Database connection is disconnected.");
        Add(K.DbConnectionActiveStatus, "DB에 연결되어 있습니다.", "Connected to the database.");
        Add(K.DbConnectionDisconnectedLogin, "데이터베이스에 연결되어 있지 않습니다. 관리자로 로그인한 뒤 제목 표시줄 ||| → [DB 연결 설정]에서 연결하세요.", "Not connected to a database. Sign in as an administrator and connect via the title bar ||| menu → [Database Settings].");
        Add(K.StatusDbDisconnected, "DB 연결 끊김", "Database disconnected");
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
        Add(K.ErrCannotRemoveOwner, "Owner는 제거할 수 없습니다.", "The owner cannot be removed.");
        Add(K.ErrMemberAlreadyAdded, "이미 등록된 멤버입니다.", "This user is already a member.");

        Add(K.NewPageTitle, "새 Page", "New Page");
        Add(K.NoTemplates, "사용 가능한 Page 양식이 없습니다.\n\n양식 폴더에 .mdtemplate 파일을 추가하세요.", "No page templates available.\n\nAdd .mdtemplate files to the template folder.");
        Add(K.NoTemplatesShort, "사용 가능한 Page 양식이 없습니다.", "No page templates available.");
        Add(K.EnterPageTitle, "Page 제목을 입력하세요.", "Enter a page title.");
        Add(K.DefaultNewPageTitle, "새 Page", "New Page");
        Add(K.TemplateSourceUser, "사용자 양식", "User template");
        Add(K.TemplateSourceBuiltIn, "기본 양식", "Built-in template");

        Add(K.PageHistoryTitleFormat, "버전 이력 - {0}", "Version History - {0}");
        Add(K.PageLogTitleFormat, "변경 Log - {0}", "Change Log - {0}");
        Add(K.LabelPageChangeLog, "변경 내역", "Change History");
        Add(K.ColChangedAt, "변경 시각", "Changed At");
        Add(K.ColChangedBy, "변경자", "Changed By");
        Add(K.ColChangeDescription, "변경 내용", "Change");
        Add(K.PageLogActionCreated, "Page 생성 (제목: {0})", "Page created (title: {0})");
        Add(K.PageLogTitleChangedFormat, "제목 변경: \"{0}\" → \"{1}\"", "Title changed: \"{0}\" → \"{1}\"");
        Add(K.PageLogContentChangedFormat, "내용 변경 ({0}자 → {1}자)", "Content changed ({0} → {1} chars)");
        Add(K.PageLogTitleAndContentChangedFormat, "제목·내용 변경: \"{0}\" → \"{1}\" ({2}자 → {3}자)", "Title and content changed: \"{0}\" → \"{1}\" ({2} → {3} chars)");
        Add(K.PageLogRestoredFormat, "이전 버전으로 복원: \"{0}\" → \"{1}\"", "Restored previous version: \"{0}\" → \"{1}\"");
        Add(K.PageLogMovedFormat, "Workspace 이동: {0}", "Moved workspace: {0}");
        Add(K.PageLogActionDeleted, "Page 삭제 (제목: {0})", "Page deleted (title: {0})");
        Add(K.ColSavedAt, "저장 시각", "Saved At");
        Add(K.ColSavedBy, "저장자", "Saved By");
        Add(K.ConfirmRestoreVersion, "선택한 버전으로 복원할까요?\n현재 내용은 복원 전 버전으로 저장됩니다.", "Restore the selected version?\nCurrent content will be saved before restore.");

        Add(K.DbConnectionError, "데이터베이스 연결 오류", "Database Connection Error");
        Add(K.LoginError, "로그인 오류", "Sign-in Error");
        Add(K.DbConnectionFailedGeneric, "데이터베이스에 연결할 수 없습니다.", "Unable to connect to the database.");
        Add(K.DbConnectionRequiresAdmin, "DB 설정은 관리자로 로그인한 뒤 제목 표시줄 ||| → [DB 연결 설정]에서 할 수 있습니다.", "Database settings can be configured after signing in as an administrator via the title bar ||| menu → [Database Settings].");
        Add(K.DbSettingsAdminOnly, "DB 연결 설정은 관리자만 사용할 수 있습니다.", "Database settings are available to administrators only.");

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
    public const string SaveStatusOfflineSaved = "SaveStatusOfflineSaved";
    public const string StatusPageOfflineSaved = "StatusPageOfflineSaved";
    public const string StatusOfflineFallbackMode = "StatusOfflineFallbackMode";
    public const string OfflineSaveContextMissing = "OfflineSaveContextMissing";
    public const string SaveStatusFailed = "SaveStatusFailed";

    public const string MenuFile = "MenuFile";
    public const string MenuEdit = "MenuEdit";
    public const string MenuUndo = "MenuUndo";
    public const string MenuRedo = "MenuRedo";
    public const string MenuSavePage = "MenuSavePage";
    public const string MenuSavePageAsMarkdown = "MenuSavePageAsMarkdown";
    public const string MenuExportPage = "MenuExportPage";
    public const string MenuExportWorkspace = "MenuExportWorkspace";
    public const string MenuExport = "MenuExport";
    public const string MenuPageHistory = "MenuPageHistory";
    public const string MenuPageLog = "MenuPageLog";
    public const string MenuRefreshTree = "MenuRefreshTree";
    public const string MenuNewProject = "MenuNewProject";
    public const string MenuSaveWorkspace = "MenuSaveWorkspace";
    public const string MenuLoadWorkspace = "MenuLoadWorkspace";
    public const string MenuRecentProjects = "MenuRecentProjects";
    public const string RecentProjectsEmpty = "RecentProjectsEmpty";
    public const string RecentProjectsClearAll = "RecentProjectsClearAll";
    public const string RecentProjectRemove = "RecentProjectRemove";
    public const string RecentProjectMissing = "RecentProjectMissing";
    public const string TipMenuRecentProjects = "TipMenuRecentProjects";
    public const string MenuPreferences = "MenuPreferences";
    public const string MenuLogin = "MenuLogin";
    public const string MenuLogout = "MenuLogout";
    public const string MenuBarSessionLoggedInFormat = "MenuBarSessionLoggedInFormat";
    public const string MenuBarSessionLoggedOut = "MenuBarSessionLoggedOut";
    public const string MenuBarLogin = "MenuBarLogin";
    public const string MenuBarLogout = "MenuBarLogout";
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
    public const string MenuSettings = "MenuSettings";
    public const string MenuProfile = "MenuProfile";
    public const string MenuEditProfile = "MenuEditProfile";
    public const string MenuChangePassword = "MenuChangePassword";
    public const string MenuNotificationSettings = "MenuNotificationSettings";

    public const string CtxNewSubWorkspace = "CtxNewSubWorkspace";
    public const string CtxNewPage = "CtxNewPage";
    public const string CtxRename = "CtxRename";
    public const string CtxDelete = "CtxDelete";
    public const string CtxToggleFavoriteAdd = "CtxToggleFavoriteAdd";
    public const string CtxToggleFavoriteRemove = "CtxToggleFavoriteRemove";
    public const string CtxLockWorkspace = "CtxLockWorkspace";
    public const string CtxUnlockWorkspace = "CtxUnlockWorkspace";
    public const string CtxLockPage = "CtxLockPage";
    public const string CtxUnlockPage = "CtxUnlockPage";
    public const string WorkspaceLockedSuffix = "WorkspaceLockedSuffix";
    public const string CtxMembers = "CtxMembers";

    public const string LabelTitle = "LabelTitle";
    public const string LabelWorkspace = "LabelWorkspace";
    public const string LabelOutline = "LabelOutline";
    public const string LabelMarkdownEditor = "LabelMarkdownEditor";
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
    public const string ToolbarAttachFile = "ToolbarAttachFile";
    public const string ToolbarBulletList = "ToolbarBulletList";
    public const string ToolbarNumberList = "ToolbarNumberList";
    public const string ToolbarQuote = "ToolbarQuote";
    public const string ToolbarHorizontalRule = "ToolbarHorizontalRule";
    public const string ToolbarTable = "ToolbarTable";
    public const string ToolbarUndo = "ToolbarUndo";
    public const string ToolbarRedo = "ToolbarRedo";
    public const string ToolbarDocumentStructure = "ToolbarDocumentStructure";
    public const string ToolbarAbout = "ToolbarAbout";
    public const string TipToolbarMoreTools = "TipToolbarMoreTools";
    public const string ToolbarSave = "ToolbarSave";
    public const string ToolbarSaveMarkdown = "ToolbarSaveMarkdown";
    public const string ToolbarExport = "ToolbarExport";
    public const string ToolbarHistory = "ToolbarHistory";
    public const string ToolbarPageLog = "ToolbarPageLog";

    public const string TipMenuFile = "TipMenuFile";
    public const string TipMenuExport = "TipMenuExport";
    public const string TipMenuEdit = "TipMenuEdit";
    public const string TipMenuUndo = "TipMenuUndo";
    public const string TipMenuRedo = "TipMenuRedo";
    public const string TipMenuWorkspace = "TipMenuWorkspace";
    public const string TipMenuView = "TipMenuView";
    public const string TipMenuAdmin = "TipMenuAdmin";
    public const string TipMenuAccount = "TipMenuAccount";
    public const string TipMenuSettings = "TipMenuSettings";
    public const string TipMenuProfile = "TipMenuProfile";
    public const string TipMenuRefreshTree = "TipMenuRefreshTree";
    public const string TipMenuPreferences = "TipMenuPreferences";
    public const string TipAppSettingsMark = "TipAppSettingsMark";
    public const string TipMenuLogin = "TipMenuLogin";
    public const string TipMenuLogout = "TipMenuLogout";
    public const string TipMenuBarLogin = "TipMenuBarLogin";
    public const string TipMenuNewProject = "TipMenuNewProject";
    public const string TipMenuSaveProject = "TipMenuSaveProject";
    public const string TipMenuSavePage = "TipMenuSavePage";
    public const string TipMenuOpenProject = "TipMenuOpenProject";
    public const string TipMenuBarLogout = "TipMenuBarLogout";
    public const string TipMenuBarSession = "TipMenuBarSession";
    public const string TipMenuExit = "TipMenuExit";
    public const string TipMenuNewRootWorkspace = "TipMenuNewRootWorkspace";
    public const string TipMenuNewSubWorkspace = "TipMenuNewSubWorkspace";
    public const string TipMenuNewPage = "TipMenuNewPage";
    public const string TipMenuRename = "TipMenuRename";
    public const string TipMenuDelete = "TipMenuDelete";
    public const string TipMenuWorkspaceMembers = "TipMenuWorkspaceMembers";
    public const string TipMenuAdminUsers = "TipMenuAdminUsers";
    public const string TipMenuAdminDatabase = "TipMenuAdminDatabase";
    public const string TipMenuAdminEmail = "TipMenuAdminEmail";
    public const string TipMenuEditProfile = "TipMenuEditProfile";
    public const string TipMenuChangePassword = "TipMenuChangePassword";
    public const string TipMenuNotificationSettings = "TipMenuNotificationSettings";
    public const string TipCtxToggleFavoriteAdd = "TipCtxToggleFavoriteAdd";
    public const string TipCtxToggleFavoriteRemove = "TipCtxToggleFavoriteRemove";
    public const string TipCtxLockWorkspace = "TipCtxLockWorkspace";
    public const string TipCtxUnlockWorkspace = "TipCtxUnlockWorkspace";
    public const string TipCtxLockPage = "TipCtxLockPage";
    public const string TipCtxUnlockPage = "TipCtxUnlockPage";
    public const string StatusWorkspaceLockedReadOnly = "StatusWorkspaceLockedReadOnly";
    public const string StatusPageLockedReadOnly = "StatusPageLockedReadOnly";
    public const string TipEditorCut = "TipEditorCut";
    public const string TipEditorCopy = "TipEditorCopy";
    public const string TipEditorPaste = "TipEditorPaste";
    public const string TipEditorSelectAll = "TipEditorSelectAll";
    public const string TipEditorBold = "TipEditorBold";
    public const string TipEditorItalic = "TipEditorItalic";

    public const string AboutTitle = "AboutTitle";
    public const string AboutDescription = "AboutDescription";
    public const string AboutVersionFormat = "AboutVersionFormat";
    public const string AboutCopyrightFormat = "AboutCopyrightFormat";

    public const string EditorCut = "EditorCut";
    public const string EditorUndo = "EditorUndo";
    public const string EditorRedo = "EditorRedo";
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
    public const string LoginDefaultAdminHint = "LoginDefaultAdminHint";

    public const string PreferencesTitle = "PreferencesTitle";
    public const string PreferencesAppearance = "PreferencesAppearance";
    public const string PreferencesTheme = "PreferencesTheme";
    public const string PreferencesColorTheme = "PreferencesColorTheme";
    public const string PreferencesCustomColor = "PreferencesCustomColor";
    public const string PreferencesLanguage = "PreferencesLanguage";
    public const string PreferencesFontScale = "PreferencesFontScale";
    public const string FontScaleMuchSmaller = "FontScaleMuchSmaller";
    public const string FontScaleSmaller = "FontScaleSmaller";
    public const string FontScaleNormal = "FontScaleNormal";
    public const string FontScaleLarger = "FontScaleLarger";
    public const string FontScaleMuchLarger = "FontScaleMuchLarger";
    public const string MenuClosePageTab = "MenuClosePageTab";
    public const string ConfirmCloseDirtyPageTab = "ConfirmCloseDirtyPageTab";
    public const string ThemeLight = "ThemeLight";
    public const string ThemeDark = "ThemeDark";
    public const string PastelRose = "PastelRose";
    public const string PastelPeach = "PastelPeach";
    public const string PastelLemon = "PastelLemon";
    public const string PastelMint = "PastelMint";
    public const string PastelSky = "PastelSky";
    public const string PastelLavender = "PastelLavender";
    public const string PastelLilac = "PastelLilac";
    public const string PastelCoral = "PastelCoral";
    public const string PastelApricot = "PastelApricot";
    public const string PastelButter = "PastelButter";
    public const string PastelSage = "PastelSage";
    public const string PastelAqua = "PastelAqua";
    public const string PastelPeriwinkle = "PastelPeriwinkle";
    public const string PastelPink = "PastelPink";
    public const string PastelSand = "PastelSand";
    public const string PastelSeafoam = "PastelSeafoam";
    public const string PastelOrchid = "PastelOrchid";
    public const string PastelMeadow = "PastelMeadow";
    public const string PastelPowder = "PastelPowder";
    public const string PastelCream = "PastelCream";
    public const string LanguageKorean = "LanguageKorean";
    public const string LanguageEnglish = "LanguageEnglish";
    public const string ButtonOk = "ButtonOk";
    public const string ButtonCancel = "ButtonCancel";
    public const string ButtonYes = "ButtonYes";
    public const string ButtonNo = "ButtonNo";
    public const string ButtonRetry = "ButtonRetry";
    public const string StatusWorkspace = "StatusWorkspace";
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
    public const string ConfirmLogout = "ConfirmLogout";
    public const string Confirm = "Confirm";
    public const string DialogLinkTitle = "DialogLinkTitle";
    public const string DialogLinkTextPrompt = "DialogLinkTextPrompt";
    public const string DialogLinkUrlPrompt = "DialogLinkUrlPrompt";
    public const string DialogLinkUrlRequired = "DialogLinkUrlRequired";
    public const string DialogImageTitle = "DialogImageTitle";
    public const string DialogImageFilePrompt = "DialogImageFilePrompt";
    public const string UnsupportedImageFormat = "UnsupportedImageFormat";
    public const string DialogAttachFilePrompt = "DialogAttachFilePrompt";
    public const string AttachmentRequiresPage = "AttachmentRequiresPage";
    public const string OpenResourceFailed = "OpenResourceFailed";
    public const string ImageFileFilterLabel = "ImageFileFilterLabel";
    public const string AllFilesFilterLabel = "AllFilesFilterLabel";
    public const string ExportPageTitle = "ExportPageTitle";
    public const string ExportPagePrompt = "ExportPagePrompt";
    public const string ExportFormatMarkdown = "ExportFormatMarkdown";
    public const string ExportFormatWord = "ExportFormatWord";
    public const string ExportFormatPdf = "ExportFormatPdf";
    public const string ExportSucceeded = "ExportSucceeded";
    public const string ExportWorkspaceTitle = "ExportWorkspaceTitle";
    public const string ExportWorkspacePrompt = "ExportWorkspacePrompt";
    public const string ExportWorkspaceChooseFolder = "ExportWorkspaceChooseFolder";
    public const string ExportWorkspaceSucceeded = "ExportWorkspaceSucceeded";
    public const string ExportWorkspaceFailed = "ExportWorkspaceFailed";
    public const string SelectWorkspaceToExport = "SelectWorkspaceToExport";
    public const string WorkspaceAccessRequired = "WorkspaceAccessRequired";
    public const string WorkspaceArchiveFileFilterLabel = "WorkspaceArchiveFileFilterLabel";
    public const string WorkspaceSaveSucceeded = "WorkspaceSaveSucceeded";
    public const string WorkspaceLoadSucceeded = "WorkspaceLoadSucceeded";
    public const string WorkspaceSaveFailed = "WorkspaceSaveFailed";
    public const string WorkspaceLoadFailed = "WorkspaceLoadFailed";
    public const string SelectWorkspaceToSave = "SelectWorkspaceToSave";
    public const string NewProjectNamePrompt = "NewProjectNamePrompt";
    public const string DefaultNewProjectName = "DefaultNewProjectName";
    public const string NewProjectSucceeded = "NewProjectSucceeded";
    public const string NewProjectFailed = "NewProjectFailed";
    public const string WorkspaceManageRequired = "WorkspaceManageRequired";
    public const string ExportFailed = "ExportFailed";
    public const string SaveMarkdownSucceeded = "SaveMarkdownSucceeded";
    public const string SaveMarkdownFailed = "SaveMarkdownFailed";
    public const string MarkdownFileFilterLabel = "MarkdownFileFilterLabel";
    public const string WordFileFilterLabel = "WordFileFilterLabel";
    public const string PdfFileFilterLabel = "PdfFileFilterLabel";
    public const string DialogUrlPrompt = "DialogUrlPrompt";
    public const string DialogInputRequired = "DialogInputRequired";
    public const string DefaultCodeText = "DefaultCodeText";
    public const string DefaultImageAlt = "DefaultImageAlt";
    public const string TableHeader1 = "TableHeader1";
    public const string TableHeader2 = "TableHeader2";
    public const string TableInsertTitle = "TableInsertTitle";
    public const string TableInsertHint = "TableInsertHint";
    public const string TableInsertSizeFormat = "TableInsertSizeFormat";
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
    public const string ConfirmDiscardMemberChanges = "ConfirmDiscardMemberChanges";
    public const string MemberRoleOwner = "MemberRoleOwner";
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
    public const string DbSavedReloginRequired = "DbSavedReloginRequired";
    public const string DbSavedWizard = "DbSavedWizard";
    public const string ButtonDisconnectDatabase = "ButtonDisconnectDatabase";
    public const string ConfirmDisconnectDatabase = "ConfirmDisconnectDatabase";
    public const string DbDisconnected = "DbDisconnected";
    public const string DbConnectionDisconnectedStatus = "DbConnectionDisconnectedStatus";
    public const string DbConnectionActiveStatus = "DbConnectionActiveStatus";
    public const string DbConnectionDisconnectedLogin = "DbConnectionDisconnectedLogin";
    public const string StatusDbDisconnected = "StatusDbDisconnected";
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
    public const string ErrMemberAlreadyAdded = "ErrMemberAlreadyAdded";

    public const string NewPageTitle = "NewPageTitle";
    public const string NoTemplates = "NoTemplates";
    public const string NoTemplatesShort = "NoTemplatesShort";
    public const string EnterPageTitle = "EnterPageTitle";
    public const string DefaultNewPageTitle = "DefaultNewPageTitle";
    public const string TemplateSourceUser = "TemplateSourceUser";
    public const string TemplateSourceBuiltIn = "TemplateSourceBuiltIn";

    public const string PageHistoryTitleFormat = "PageHistoryTitleFormat";
    public const string PageLogTitleFormat = "PageLogTitleFormat";
    public const string LabelPageChangeLog = "LabelPageChangeLog";
    public const string ColChangedAt = "ColChangedAt";
    public const string ColChangedBy = "ColChangedBy";
    public const string ColChangeDescription = "ColChangeDescription";
    public const string PageLogActionCreated = "PageLogActionCreated";
    public const string PageLogTitleChangedFormat = "PageLogTitleChangedFormat";
    public const string PageLogContentChangedFormat = "PageLogContentChangedFormat";
    public const string PageLogTitleAndContentChangedFormat = "PageLogTitleAndContentChangedFormat";
    public const string PageLogRestoredFormat = "PageLogRestoredFormat";
    public const string PageLogMovedFormat = "PageLogMovedFormat";
    public const string PageLogActionDeleted = "PageLogActionDeleted";
    public const string ColSavedAt = "ColSavedAt";
    public const string ColSavedBy = "ColSavedBy";
    public const string ConfirmRestoreVersion = "ConfirmRestoreVersion";

    public const string DbConnectionError = "DbConnectionError";
    public const string LoginError = "LoginError";
    public const string DbConnectionFailedGeneric = "DbConnectionFailedGeneric";
    public const string DbConnectionRequiresAdmin = "DbConnectionRequiresAdmin";
    public const string DbSettingsAdminOnly = "DbSettingsAdminOnly";

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
    public float FontScaleFactor { get; init; } = 1F;

    public static EditorChromeOptions CreateCurrent() =>
        new()
        {
            Placeholder = L.EditorPlaceholder,
            Palette = AppTheme.CurrentPalette,
            FontScaleFactor = AppTheme.FontScaleFactor
        };
}
