namespace MemoPadV10;

/// <summary>지원 언어.</summary>
public enum AppLanguage
{
    Korean,
    English
}

/// <summary>
/// 간단한 한국어/영어 문자열 테이블. 설정 창에서 <see cref="Language"/>를 바꾸면
/// 이후 <see cref="T"/>로 조회하는 모든 문자열이 해당 언어로 반환됩니다.
/// </summary>
internal static class Loc
{
    public static AppLanguage Language { get; set; } = AppLanguage.Korean;

    public static AppLanguage Parse(string? code) =>
        string.Equals(code, "en", StringComparison.OrdinalIgnoreCase) ? AppLanguage.English : AppLanguage.Korean;

    public static string Code(AppLanguage language) => language == AppLanguage.English ? "en" : "ko";

    private static readonly Dictionary<string, (string Ko, string En)> Map = new()
    {
        // 설정 창
        ["settings.title"] = ("폰트 및 표시 설정", "Font & Display Settings"),
        ["settings.hint"] = ("범위 선택 후 서식 적용. (마우스로 텍스트 선택 가능)", "Pick a scope, then apply formatting. (You can select text with the mouse.)"),
        ["settings.scope"] = ("적용 범위", "Apply to"),
        ["settings.scope.selection"] = ("선택 영역", "Selection"),
        ["settings.scope.whole"] = ("전체 문서", "Whole document"),
        ["settings.font"] = ("글꼴·크기·글자 색…", "Font, size, color…"),
        ["settings.style"] = ("글자 서식", "Text style"),
        ["settings.style.bold"] = ("굵게", "Bold"),
        ["settings.style.italic"] = ("기울임", "Italic"),
        ["settings.style.underline"] = ("밑줄", "Underline"),
        ["settings.style.strike"] = ("취소선", "Strikethrough"),
        ["settings.back"] = ("배경색", "Background color"),
        ["settings.back.custom"] = ("사용자 지정 색…", "Custom color…"),
        ["settings.language"] = ("언어 (Language)", "Language (언어)"),
        ["settings.general"] = ("일반", "General"),
        ["settings.autostart"] = ("시스템 시작 시 자동 실행", "Start automatically when Windows starts"),
        ["settings.about"] = ("프로그램 정보", "About"),
        ["settings.author"] = ("작성자", "Author"),
        ["settings.default"] = ("기본값", "Defaults"),
        ["common.ok"] = ("확인", "OK"),
        ["common.cancel"] = ("취소", "Cancel"),
        ["common.info"] = ("알림", "Notice"),
        ["common.error"] = ("오류", "Error"),
        ["common.done"] = ("완료", "Done"),
        ["memo.empty"] = ("메모 내용을 입력해 주세요.", "Please enter memo content."),
        ["memo.added"] = ("메모가 추가되었습니다.", "Memo added."),
        ["memo.saveFailed"] = ("메모 저장에 실패했습니다.", "Failed to save the memo."),

        // 선택 안내
        ["editor.selectFirst"] = ("글자 배경을 바꾸려면 먼저 텍스트를 선택해 주세요.", "Select text first to change its background."),

        // 메모 목록 창
        ["list.title"] = ("메모 목록", "Memo List"),
        ["list.col.no"] = ("번호", "No."),
        ["list.col.preview"] = ("미리보기", "Preview"),
        ["list.load"] = ("불러오기", "Open"),
        ["list.delete"] = ("삭제", "Delete"),
        ["list.empty"] = ("저장된 메모가 없습니다.", "No saved memos."),
        ["list.selectToDelete"] = ("삭제할 메모를 목록에서 선택해 주세요.", "Select a memo from the list to delete."),
        ["list.confirmDelete"] = ("선택한 메모를 삭제하시겠습니까?", "Delete the selected memo?"),
        ["list.confirmDelete.title"] = ("메모 삭제", "Delete Memo"),
        ["list.loadFailed"] = ("메모 목록 파일을 불러오지 못했습니다.", "Failed to load the memo list file."),

        // 시스템 트레이
        ["tray.tooltip"] = ("메모 패드", "Memo Pad"),
        ["tray.show"] = ("열기", "Open"),
        ["tray.exit"] = ("종료", "Exit"),

        // 메인 창 툴바 툴팁
        ["main.add"] = ("새 메모", "New memo"),
        ["main.save"] = ("저장", "Save"),
        ["main.settings"] = ("설정", "Settings"),
        ["main.listBtn"] = ("메모 목록", "Memo list"),
        ["main.close"] = ("닫기", "Close"),
    };

    public static string T(string key)
    {
        if (Map.TryGetValue(key, out (string Ko, string En) v))
        {
            return Language == AppLanguage.English ? v.En : v.Ko;
        }

        return key;
    }
}
