namespace FileMasterWinV10.Helpers;

public static class LocalizationService
{
    private static readonly Dictionary<string, (string Ko, string En)> Strings = new()
    {
        ["Menu_File"] = ("파일(&F)", "File (&F)"),
        ["Menu_Edit"] = ("편집(&E)", "Edit (&E)"),
        ["Menu_View"] = ("보기(&V)", "View (&V)"),
        ["Menu_Bookmark"] = ("즐겨찾기(&B)", "Bookmarks (&B)"),
        ["Menu_Settings"] = ("설정(&S)", "Settings (&S)"),
        ["Menu_Language"] = ("언어", "Language"),
        ["Menu_Theme"] = ("테마", "Theme"),
        ["Menu_Korean"] = ("한국어", "Korean"),
        ["Menu_English"] = ("영어", "English"),
        ["Menu_Light"] = ("Light", "Light"),
        ["Menu_Dark"] = ("Dark", "Dark"),
        ["NewFolder"] = ("새 폴더", "New Folder"),
        ["NewFile"] = ("새 파일", "New File"),
        ["CopyRight"] = ("→ 복사", "→ Copy"),
        ["MoveRight"] = ("→ 이동", "→ Move"),
        ["Rename"] = ("이름 바꾸기", "Rename"),
        ["Delete"] = ("삭제", "Delete"),
        ["Refresh"] = ("새로고침", "Refresh"),
        ["Search"] = ("검색", "Search"),
        ["Preview"] = ("미리보기", "Preview"),
        ["About"] = ("정보", "About"),
        ["About_Title"] = ("프로그램 정보", "About"),
        ["About_Creator"] = ("제작자", "Creator"),
        ["About_Copyright"] = ("Copyright © 2026 SHKWON. All rights reserved.", "Copyright © 2026 SHKWON. All rights reserved."),
        ["Ready"] = ("Command Center 준비 완료", "Command Center ready"),
        ["Search_Title"] = ("파일 검색", "File Search"),
        ["Search_FileName"] = ("파일 이름:", "File name:"),
        ["Search_Content"] = ("내용 검색:", "Content:"),
        ["Search_Case"] = ("대소문자 구분", "Case sensitive"),
        ["Search_Regex"] = ("정규식", "Regex"),
        ["Search_Folders"] = ("폴더 포함", "Include folders"),
        ["Search_Sort"] = ("정렬:", "Sort:"),
        ["Search_Start"] = ("검색 시작", "Search"),
        ["Search_Clear"] = ("결과 지우기", "Clear"),
        ["Close"] = ("닫기", "Close"),
        ["Search_Hint"] = ("파일 이름을 입력하세요. 와일드카드(*, ?), AND(*), OR(+)를 지원합니다.", "Enter a file name. Wildcards (*, ?), AND (*), and OR (+) are supported."),
        ["Search_Working"] = ("검색 중...", "Searching..."),
        ["Search_Canceled"] = ("검색이 취소되었습니다.", "Search canceled."),
        ["Search_Cleared"] = ("결과가 지워졌습니다.", "Results cleared."),
        ["Sort_MatchQuality"] = ("일치도", "Match quality"),
        ["Sort_NameAsc"] = ("이름 오름차순", "Name ascending"),
        ["Sort_NameDesc"] = ("이름 내림차순", "Name descending"),
        ["Sort_PathAsc"] = ("경로 오름차순", "Path ascending"),
        ["Sort_PathDesc"] = ("경로 내림차순", "Path descending"),
        ["Sort_ModifiedDesc"] = ("수정일 최신순", "Newest modified"),

        // ── 리스트 뷰 / 패널 ──
        ["Col_Name"] = ("이름", "Name"),
        ["Col_Path"] = ("경로", "Path"),
        ["Col_Size"] = ("크기", "Size"),
        ["Col_Type"] = ("종류", "Type"),
        ["Col_Modified"] = ("수정된 날짜", "Date modified"),
        ["Side_Left"] = ("왼쪽", "Left"),
        ["Side_Right"] = ("오른쪽", "Right"),
        ["Type_Folder"] = ("폴더", "Folder"),
        ["Type_FileSuffix"] = ("{0} 파일", "{0} File"),
        ["Type_File"] = ("파일", "File"),
        ["Status_Summary"] = ("폴더 {0}개, 파일 {1}개  |  합계 {2}", "{0} folders, {1} files  |  Total {2}"),
        ["Status_Selected"] = ("{0} 선택됨  |  {1}", "{0} selected  |  {1}"),
        ["Sel_Folders"] = ("폴더 {0}개", "{0} folders"),
        ["Sel_Files"] = ("파일 {0}개", "{0} files"),
        ["Panel_ActiveLeft"] = ("왼쪽 패널 활성  |  {0}", "Left panel active  |  {0}"),
        ["Panel_ActiveRight"] = ("오른쪽 패널 활성  |  {0}", "Right panel active  |  {0}"),
        ["Status_NoAccess"] = ("접근 권한이 없습니다.", "Access denied."),
        ["Status_Error"] = ("오류: {0}", "Error: {0}"),

        // ── 컨텍스트 메뉴 ──
        ["Cm_Open"] = ("열기", "Open"),
        ["Cm_OpenWith"] = ("연결 프로그램으로 열기", "Open with..."),
        ["Cm_Compress"] = ("압축하기...", "Compress..."),
        ["Cm_Extract"] = ("압축 해제...", "Extract..."),
        ["Cm_CopyOther"] = ("→ 다른 패널로 복사", "→ Copy to other panel"),
        ["Cm_MoveOther"] = ("→ 다른 패널로 이동", "→ Move to other panel"),
        ["Cm_Cut"] = ("잘라내기", "Cut"),
        ["Cm_Copy"] = ("복사", "Copy"),
        ["Cm_Paste"] = ("붙여넣기", "Paste"),
        ["Cm_Rename"] = ("이름 바꾸기", "Rename"),
        ["Cm_Delete"] = ("삭제", "Delete"),
        ["Cm_NewFolder"] = ("새 폴더 만들기", "New folder"),
        ["Cm_NewFile"] = ("새 파일 만들기", "New file"),
        ["Cm_Properties"] = ("속성", "Properties"),

        // ── 즐겨찾기 ──
        ["Bm_AddLeft"] = ("현재 폴더 추가 (왼쪽)", "Add current folder (left)"),
        ["Bm_AddRight"] = ("현재 폴더 추가 (오른쪽)", "Add current folder (right)"),
        ["Bm_Manage"] = ("즐겨찾기 관리...", "Manage bookmarks..."),
        ["Bm_Added"] = ("'{0}' 즐겨찾기에 추가됨", "'{0}' added to bookmarks"),
        ["Bm_Exists"] = ("이미 즐겨찾기에 있습니다.", "Already in bookmarks."),

        // ── 메뉴(추가 항목) ──
        ["Menu_Exit"] = ("종료(&X)", "Exit (&X)"),
        ["Menu_SelectAll"] = ("모두 선택 (Ctrl+A)", "Select All (Ctrl+A)"),
        ["Menu_ShowPreview"] = ("미리보기 패널 표시", "Show preview panel"),
        ["Menu_SearchLeft"] = ("왼쪽 패널 검색", "Search left panel"),
        ["Menu_SearchRight"] = ("오른쪽 패널 검색", "Search right panel"),
        ["Menu_Refresh_Sc"] = ("새로고침 (F5)", "Refresh (F5)"),
        ["Status_PreviewShown"] = ("미리보기 패널 표시됨", "Preview panel shown"),
        ["Status_PreviewHidden"] = ("미리보기 패널 숨김", "Preview panel hidden"),
        ["Status_Refreshed"] = ("새로고침 완료", "Refreshed"),
        ["Status_MoveLeft"] = ("왼쪽 이동: {0}", "Left moved to: {0}"),
        ["Status_MoveRight"] = ("오른쪽 이동: {0}", "Right moved to: {0}"),

        // ── 미리보기 ──
        ["Preview_Empty"] = ("파일을 선택하면 미리보기가 표시됩니다.", "Select a file to preview."),

        // ── 검색 인덱스 ──
        ["Menu_SearchTop"] = ("검색(&R)", "Search (&R)"),
        ["Menu_Reindex"] = ("검색 인덱스 다시 만들기", "Rebuild search index"),
        ["Index_Building"] = ("검색 인덱스 생성 중...", "Building search index..."),
        ["Index_Ready"] = ("검색 인덱스 준비 완료 ({0:N0}개 항목)", "Search index ready ({0:N0} items)"),
        ["Index_Status_Building"] = ("🔍 색인 생성 중: {0:N0}", "🔍 Indexing: {0:N0}"),
        ["Index_Status_Ready"] = ("🔍 색인 완료: {0:N0}", "🔍 Indexed: {0:N0}"),
        ["Index_Status_NotBuilt"] = ("🔍 색인 없음", "🔍 No index"),
        ["Search_Indexing"] = ("검색 인덱스를 만드는 중입니다. 잠시 후 다시 시도하세요.", "The search index is still building. Please try again shortly."),
        ["Search_Result"] = ("검색 결과: {0}", "Search result: {0}"),
    };

    public static AppLanguage CurrentLanguage { get; set; } = AppLanguage.Korean;

    public static string T(string key) =>
        Strings.TryGetValue(key, out var value)
            ? CurrentLanguage == AppLanguage.English ? value.En : value.Ko
            : key;
}