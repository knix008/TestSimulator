namespace MyDiffWinV10.App.Services;

/// <summary>
/// UI strings for Korean and English. Default language is Korean.
/// </summary>
public static class Strings
{
    public static AppLanguage Language { get; set; } = AppLanguage.Korean;

    public static string AppTitle => "MyDiff";
    public static string WindowTitleFormat => "MyDiff - {0}";

    public static string MenuFile => T("파일", "File");
    public static string MenuView => T("보기", "View");
    public static string MenuHelp => T("도움말", "Help");

    public static string TipMenuFile => T("파일 열기, 새로 비교, 환경 설정", "Open files, reload, and preferences");
    public static string TipMenuView => T("자동 줄 바꿈, 차이 이동, 복사", "Word wrap, difference navigation, and copy");
    public static string TipMenuHelp => T("애플리케이션 정보", "Application information");
    public static string TipFontSize => T("패널 글꼴 크기를 조절합니다", "Adjust the pane font size");

    public static string OpenLeft => T("왼쪽 파일 열기...", "Open Left File...");
    public static string OpenRight => T("오른쪽 파일 열기...", "Open Right File...");
    public static string Reload => T("다시 비교", "Reload");
    public static string Preferences => T("환경 설정...", "Preferences...");
    public static string Exit => T("종료", "Exit");

    public static string PreviousDiff => T("이전 차이", "Previous Difference");
    public static string NextDiff => T("다음 차이", "Next Difference");
    public static string Copy => T("복사", "Copy");
    public static string WordWrap => T("자동 줄 바꿈", "Word Wrap");
    public static string About => T("MyDiff 정보", "About MyDiff");

    public static string TsbOpenLeft => T("왼쪽 열기", "Open Left");
    public static string TsbOpenRight => T("오른쪽 열기", "Open Right");
    public static string TsbReload => T("다시 비교", "Reload");
    public static string TsbPrevDiff => T("이전 차이", "Prev Diff");
    public static string TsbNextDiff => T("다음 차이", "Next Diff");
    public static string TsbInfo => T("정보", "Info");
    public static string FontSizeLabel => T("글꼴 크기:", "Font size:");

    public static string PaneLeft => T("왼쪽", "Left");
    public static string PaneRight => T("오른쪽", "Right");

    public static string TipOpenLeft => T("왼쪽에 표시할 파일을 엽니다", "Open the file to show on the left");
    public static string TipOpenRight => T("오른쪽에 표시할 파일을 엽니다", "Open the file to show on the right");
    public static string TipReload => T("두 파일을 디스크에서 다시 읽어 비교합니다", "Re-read both files from disk and re-diff");
    public static string TipPrevDiff => T("이전 차이로 이동합니다", "Jump to the previous difference");
    public static string TipNextDiff => T("다음 차이로 이동합니다", "Jump to the next difference");
    public static string TipWordWrap => T("좌우 패널의 자동 줄 바꿈을 전환합니다", "Toggle word wrap in both panes");
    public static string TipPreferences => T("패널 글꼴 크기, 줄 바꿈, 언어 설정을 편집합니다", "Edit pane font size, word wrap, and language");
    public static string TipExit => T("MyDiff를 종료합니다", "Close MyDiff");
    public static string TipCopyFocused => T("포커스된 패널에서 선택한 텍스트를 복사합니다", "Copy the selected text from the focused pane");
    public static string TipCopy => T("선택한 텍스트를 복사합니다", "Copy the selected text");
    public static string TipAbout => T("애플리케이션 정보를 표시합니다", "Show application information");
    public static string TipAboutButton => T("MyDiff 정보", "About MyDiff");

    public static string StatusNoSession => T(
        "비교할 두 파일을 여세요 (File > 왼쪽/오른쪽 파일 열기, 또는 명령줄 인수로 전달).",
        "Open the two files to compare (File > Open Left/Right, or pass them as command-line arguments).");
    public static string StatusFormat => T(
        "{0} ↔ {1}  -  추가 {2} / 삭제 {3} / 변경 {4}",
        "{0} <-> {1}  -  +{2} added / -{3} removed / ~{4} modified");
    public static string StatusIdentical => T("두 파일이 동일합니다.", "The two files are identical.");
    public static string StatusBinaryFormat => T(
        "{0} ↔ {1}  -  바이너리, {2}바이트 다름 (추가 {3} / 삭제 {4} / 변경 {5}줄)",
        "{0} <-> {1}  -  binary, {2} byte(s) differ (+{3} / -{4} / ~{5} lines)");
    public static string StatusBinaryIdentical => T(
        "두 바이너리 파일이 동일합니다.",
        "The two binary files are identical.");

    public static string DialogSelectLeftFile => T("왼쪽 파일 선택", "Select the left file");
    public static string DialogSelectRightFile => T("오른쪽 파일 선택", "Select the right file");

    public static string AboutBody => T(
        "MyDiff Win V10\n2-way 줄 단위 diff 뷰어. git difftool 및 외부 diff 도구로 사용할 수 있습니다.\n\nCopyright (c) SHKWON(knix008@naver.com)",
        "MyDiff Win V10\n2-way line diff viewer. Usable as a git difftool / external diff tool target.\n\nCopyright (c) SHKWON(knix008@naver.com)");

    public static string UsageError => T(
        "사용법: MyDiffWinV10.App.exe [LEFT RIGHT] | (인수 없음: 독립 실행)",
        "Usage: MyDiffWinV10.App.exe [LEFT RIGHT] | (no args for standalone mode)");

    public static string PreferencesTitle => T("환경 설정", "Preferences");
    public static string PreferencesPaneFontSize => T("패널 글꼴 크기:", "Pane font size:");
    public static string PreferencesWordWrap => T("좌우 패널 자동 줄 바꿈", "Word wrap in both panes");
    public static string PreferencesLanguage => T("언어:", "Language:");
    public static string LanguageKorean => "한국어";
    public static string LanguageEnglish => "English";
    public static string Ok => T("확인", "OK");
    public static string Cancel => T("취소", "Cancel");

    public static string ErrorTitle => T("오류", "Error");
    public static string ErrorCopy => T("내용 복사", "Copy Details");
    public static string ErrorCopied => T("복사됨", "Copied");
    public static string ErrorType => T("유형", "Type");
    public static string ErrorMessage => T("메시지", "Message");
    public static string ErrorSource => T("소스", "Source");
    public static string ErrorStackTrace => T("스택 추적", "Stack Trace");
    public static string ErrorOpenFile => T("파일을 열지 못했습니다.", "Could not open the file.");

    public static string LanguageDisplayName(AppLanguage language) => language switch
    {
        AppLanguage.Korean => LanguageKorean,
        AppLanguage.English => LanguageEnglish,
        _ => language.ToString(),
    };

    public static string FormatStatus(string leftPath, string rightPath, int added, int removed, int modified) =>
        string.Format(StatusFormat, Path.GetFileName(leftPath), Path.GetFileName(rightPath), added, removed, modified);

    public static string FormatBinaryStatus(
        string leftPath,
        string rightPath,
        int differentBytes,
        int addedRows,
        int removedRows,
        int modifiedRows) =>
        string.Format(
            StatusBinaryFormat,
            Path.GetFileName(leftPath),
            Path.GetFileName(rightPath),
            differentBytes,
            addedRows,
            removedRows,
            modifiedRows);

    private static string T(string korean, string english) =>
        Language == AppLanguage.Korean ? korean : english;
}
