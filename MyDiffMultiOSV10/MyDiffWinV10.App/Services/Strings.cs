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

    public static string TipMenuFile => T("디렉터리/파일 비교, 환경 설정", "Directory/file compare and preferences");
    public static string TipMenuView => T("자동 줄 바꿈, 차이 이동, 복사", "Word wrap, difference navigation, and copy");
    public static string TipMenuHelp => T("애플리케이션 정보", "Application information");
    public static string TipFontSize => T("패널 글꼴 크기를 조절합니다 (Ctrl+마우스 휠)", "Adjust the pane font size (Ctrl+mouse wheel)");

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
    public static string TipPreferences => T("패널 글꼴 크기, 줄 바꿈, 타이틀 바 색, 언어 설정을 편집합니다", "Edit pane font size, word wrap, title bar colors, and language");
    public static string TipExit => T("MyDiff를 종료합니다", "Close MyDiff");
    public static string TipCopyFocused => T("포커스된 패널에서 선택한 텍스트를 복사합니다", "Copy the selected text from the focused pane");
    public static string TipCopy => T("선택한 텍스트를 복사합니다", "Copy the selected text");
    public static string TipAbout => T("애플리케이션 정보를 표시합니다", "Show application information");
    public static string TipAboutButton => T("MyDiff 정보", "About MyDiff");

    public static string StatusNoSession => T(
        "비교할 파일을 선택하세요 (디렉터리 트리에서 파일을 더블 클릭하거나 File > 파일 열기).",
        "Select files to compare (double-click a file in the directory tree, or use File > Open Left/Right File).");
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

    public static string AboutBody => FormatAboutBody(AppVersion.Version, AppVersion.Build);

    public static string FormatAboutBody(string version, string build) =>
        $"{AboutIntro}\n\n{AboutVersionLine(version)}\n{AboutBuildLine(build)}\n\n{AboutCopyright}";

    public static string AboutIntro => T(
        "MyDiff Win V10\n디렉터리 비교 및 2-way 줄 단위 diff 뷰어. git difftool 및 외부 diff 도구로 사용할 수 있습니다.",
        "MyDiff Win V10\nDirectory compare and 2-way line diff viewer. Usable as a git difftool / external diff tool target.");

    public static string AboutVersionLine(string version) => T(
        $"버전 {version}",
        $"Version {version}");

    public static string AboutBuildLine(string build) => T(
        $"빌드 {build}",
        $"Build {build}");

    public static string AboutCopyright => T(
        "Copyright (c) SHKWON(knix008@naver.com)",
        "Copyright (c) SHKWON(knix008@naver.com)");

    public static string UsageError => T(
        "사용법: MyDiffWinV10.App.exe [LEFT RIGHT] | (인수 없음: 디렉터리 비교)",
        "Usage: MyDiffWinV10.App.exe [LEFT RIGHT] | (no args: directory compare)");

    public static string TabDirectoryCompare => T("디렉터리 비교", "Directory Compare");
    public static string TabFileCompare => T("파일 비교", "File Compare");
    public static string DirectoryCompareTitle => T("디렉터리 비교", "Directory Compare");
    public static string SelectLeftDirectory => T("왼쪽 디렉터리...", "Left Directory...");
    public static string SelectRightDirectory => T("오른쪽 디렉터리...", "Right Directory...");
    public static string CompareDirectories => T("비교", "Compare");
    public static string ShowDirectoryCompare => T("디렉터리 비교", "Directory Compare");
    public static string ShowFileCompare => T("파일 비교", "File Compare");
    public static string DialogSelectLeftDirectory => T("왼쪽 디렉터리 선택", "Select the left directory");
    public static string DialogSelectRightDirectory => T("오른쪽 디렉터리 선택", "Select the right directory");
    public static string ErrorSelectBothDirectories => T("왼쪽과 오른쪽 디렉터리를 모두 선택하세요.", "Select both left and right directories first.");
    public static string StatusLeftDirectoryLoaded => T("왼쪽 디렉터리를 불러왔습니다.", "Left directory loaded.");
    public static string StatusRightDirectoryLoaded => T("오른쪽 디렉터리를 불러왔습니다.", "Right directory loaded.");
    public static string StatusDirectoryReady => T("비교할 두 디렉터리를 선택하세요.", "Select the two directories to compare.");
    public static string StatusDirectoryCompareCompleted => T("디렉터리 비교 완료 | {0}", "Directory compare completed | {0}");
    public static string DirectorySummaryFormat => T(
        "동일 {0} / 다름 {1} / 왼쪽만 {2} / 오른쪽만 {3}",
        "Same {0} / Diff {1} / Left only {2} / Right only {3}");
    public static string TipShowDirectoryCompare => T("디렉터리 비교 화면으로 이동합니다", "Switch to the directory compare view");
    public static string TipShowFileCompare => T("파일 비교 화면으로 이동합니다", "Switch to the file compare view");
    public static string TipCompareDirectories => T("선택한 두 디렉터리를 비교합니다", "Compare the selected directories");
    public static string TipSelectLeftDirectory => T("왼쪽 디렉터리를 선택합니다", "Select the left directory");
    public static string TipSelectRightDirectory => T("오른쪽 디렉터리를 선택합니다", "Select the right directory");
    public static string TipDirNodeDoubleClick => T("파일을 더블 클릭하면 파일 비교 화면으로 열립니다", "Double-click a file to open it in the file compare view");

    public static string FormatDirectorySummary(int same, int different, int leftOnly, int rightOnly) =>
        string.Format(DirectorySummaryFormat, same, different, leftOnly, rightOnly);

    public static string FormatDirectoryCompareCompleted(string summary) =>
        string.Format(StatusDirectoryCompareCompleted, summary);

    public static string PreferencesTitle => T("환경 설정", "Preferences");
    public static string PreferencesPaneFontSize => T("패널 글꼴 크기:", "Pane font size:");
    public static string PreferencesWordWrap => T("좌우 패널 자동 줄 바꿈", "Word wrap in both panes");
    public static string PreferencesLanguage => T("언어:", "Language:");
    public static string PreferencesLeftHeaderColor => T("왼쪽 패널 타이틀 바 색:", "Left pane title bar color:");
    public static string PreferencesRightHeaderColor => T("오른쪽 패널 타이틀 바 색:", "Right pane title bar color:");
    public static string PreferencesCustomHeaderColor => T("사용자 지정 색...", "Custom color...");
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
