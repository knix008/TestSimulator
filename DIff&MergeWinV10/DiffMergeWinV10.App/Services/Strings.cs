using DiffMergeWinV10.App.Core;

namespace DiffMergeWinV10.App.Services;

/// <summary>
/// UI strings for Korean and English. Default language is Korean.
/// </summary>
public static class Strings
{
    public static AppLanguage Language { get; set; } = AppLanguage.Korean;

    public static string AppTitle => T("Diff & Merge", "Diff & Merge");
    public static string WindowTitleFormat => T("Diff & Merge - {0}", "Diff & Merge - {0}");

    public static string MenuFile => T("파일", "File");
    public static string MenuEdit => T("편집", "Edit");
    public static string MenuView => T("보기", "View");
    public static string MenuHelp => T("도움말", "Help");

    public static string OpenThreeFiles => T("Base/Local/Remote 열기...", "Open Base/Local/Remote...");
    public static string OpenConflictedFile => T("충돌 파일 열기...", "Open Conflicted File...");
    public static string Save => T("저장", "Save");
    public static string SaveAs => T("다른 이름으로 저장...", "Save As...");
    public static string Preferences => T("환경 설정...", "Preferences...");
    public static string Exit => T("종료", "Exit");

    public static string TakeBase => T("Base 사용", "Take Base");
    public static string TakeLocal => T("Local 사용", "Take Local");
    public static string TakeRemote => T("Remote 사용", "Take Remote");
    public static string TakeBoth => T("둘 다 사용", "Take Both");
    public static string PreviousConflict => T("이전 충돌", "Previous Conflict");
    public static string NextConflict => T("다음 충돌", "Next Conflict");
    public static string Copy => T("복사", "Copy");
    public static string WordWrap => T("자동 줄 바꿈", "Word Wrap");
    public static string About => T("Diff & Merge 정보", "About Diff & Merge");

    public static string TsbOpenThree => T("Base/Local/Remote 열기", "Open Base/Local/Remote");
    public static string TsbOpenConflicted => T("충돌 파일 열기", "Open Conflicted");
    public static string TsbPrevConflict => T("이전 충돌", "Prev Conflict");
    public static string TsbNextConflict => T("다음 충돌", "Next Conflict");
    public static string TsbInfo => T("정보", "Info");
    public static string FontSizeLabel => T("글꼴 크기:", "Font size:");

    public static string PaneBase => T("Base (공통 조상)", "Base (common ancestor)");
    public static string PaneLocal => T("Local (우리)", "Local (ours)");
    public static string PaneRemote => T("Remote (상대)", "Remote (theirs)");
    public static string PaneResult => T("결과 (편집 가능)", "Result (editable)");
    public static string PaneConflicts => T("충돌", "Conflicts");

    public static string TipOpenThreeFiles => T(
        "별도의 BASE, LOCAL, REMOTE 파일을 불러와 비교합니다",
        "Load separate BASE, LOCAL and REMOTE files and diff them");
    public static string TipOpenConflictedFile => T(
        "이미 <<<<<<< 충돌 표식이 포함된 파일을 엽니다",
        "Open a file that already contains <<<<<<< conflict markers");
    public static string TipSave => T(
        "병합 결과를 병합 파일 경로에 저장합니다",
        "Save the resolved result to the merged file path");
    public static string TipSaveAs => T(
        "병합 결과를 새 파일로 저장합니다",
        "Save the resolved result to a new file");
    public static string TipTakeBase => T(
        "선택한 충돌을 BASE(공통 조상) 내용으로 해결합니다",
        "Resolve the selected conflict using the BASE (common ancestor) content");
    public static string TipTakeLocal => T(
        "선택한 충돌을 LOCAL(우리) 내용으로 해결합니다",
        "Resolve the selected conflict using the LOCAL (ours) content");
    public static string TipTakeRemote => T(
        "선택한 충돌을 REMOTE(상대) 내용으로 해결합니다",
        "Resolve the selected conflict using the REMOTE (theirs) content");
    public static string TipTakeBoth => T(
        "선택한 충돌을 LOCAL과 REMOTE 내용을 모두 유지하여 해결합니다",
        "Resolve the selected conflict by keeping both LOCAL and REMOTE content");
    public static string TipTakeBaseShort => T(
        "선택한 충돌을 BASE 내용으로 해결합니다",
        "Resolve the selected conflict using the BASE content");
    public static string TipTakeLocalShort => T(
        "선택한 충돌을 LOCAL 내용으로 해결합니다",
        "Resolve the selected conflict using the LOCAL content");
    public static string TipTakeRemoteShort => T(
        "선택한 충돌을 REMOTE 내용으로 해결합니다",
        "Resolve the selected conflict using the REMOTE content");
    public static string TipPrevConflict => T(
        "목록에서 이전 충돌로 이동합니다",
        "Jump to the previous conflict in the list");
    public static string TipNextConflict => T(
        "목록에서 다음 충돌로 이동합니다",
        "Jump to the next conflict in the list");
    public static string TipWordWrap => T(
        "소스 및 결과 패널의 자동 줄 바꿈을 전환합니다",
        "Toggle word wrap in the source and result panes");
    public static string TipPreferences => T(
        "패널 글꼴 크기, 줄 바꿈, 언어 및 마지막 세션 설정을 편집합니다",
        "Edit pane font size, word wrap, language, and the remembered last session");
    public static string TipExit => T("Diff & Merge를 종료합니다", "Close Diff & Merge");
    public static string TipCopyFocused => T(
        "포커스된 패널에서 선택한 텍스트를 복사합니다",
        "Copy the selected text from the focused pane");
    public static string TipCopy => T("선택한 텍스트를 복사합니다", "Copy the selected text");
    public static string TipAbout => T("애플리케이션 정보를 표시합니다", "Show application information");
    public static string TipAboutButton => T("Diff & Merge 정보", "About Diff & Merge");

    public static string StatusNoSession => T(
        "Base/Local/Remote 세트 또는 충돌 파일을 열어 시작하세요.",
        "Open a base/local/remote set or a conflicted file to begin.");
    public static string StatusResolvedFormat => T(
        "{1}개 중 {0}개 충돌 해결됨 - {2}",
        "{0} of {1} conflicts resolved - {2}");
    public static string ConflictFormat => T("충돌 #{0} - {1}", "Conflict #{0} - {1}");
    public static string BaseUnavailable => T("(Base 없음)", "(base unavailable)");

    public static string DialogSelectBaseFile => T("BASE(공통 조상) 파일 선택", "Select the BASE (common ancestor) file");
    public static string DialogSelectLocalFile => T("LOCAL(우리) 파일 선택", "Select the LOCAL (ours) file");
    public static string DialogSelectRemoteFile => T("REMOTE(상대) 파일 선택", "Select the REMOTE (theirs) file");
    public static string DialogSelectConflictedFile => T("충돌 파일 선택", "Select the conflicted file");
    public static string DialogSaveMergedAs => T("병합 결과 저장", "Save merged result as");

    public static string CloseWithoutSaving => T(
        "병합 결과가 저장되지 않았습니다. 저장하지 않고 닫으시겠습니까?",
        "The merge has not been saved. Close without saving?");
    public static string SavedToFormat => T("{0}에 저장했습니다.", "Saved to {0}");
    public static string UnresolvedSaveFormat => T(
        "{0}개의 충돌이 아직 해결되지 않았습니다. <<<<<<< 충돌 표식과 함께 저장됩니다. 그래도 저장하시겠습니까?",
        "{0} conflict(s) are still unresolved. They will be saved with <<<<<<< conflict markers. Save anyway?");

    public static string AboutBody => T(
        "Diff & Merge Win V10\nGit 3-way 병합 충돌 해결 도구.\n\nCopyright (c) SHKWON(knix008@naver.com)",
        "Diff & Merge Win V10\nGit 3-way merge conflict resolution tool.\n\nCopyright (c) SHKWON(knix008@naver.com)");

    public static string UsageError => T(
        "사용법: DiffMergeWinV10.App.exe [BASE LOCAL REMOTE MERGED] | [충돌-파일] | (인수 없음: 독립 실행)",
        "Usage: DiffMergeWinV10.App.exe [BASE LOCAL REMOTE MERGED] | [conflicted-file] | (no args for standalone mode)");

    public static string PreferencesTitle => T("환경 설정", "Preferences");
    public static string PreferencesPaneFontSize => T("패널 글꼴 크기:", "Pane font size:");
    public static string PreferencesWordWrap => T("소스/결과 패널 자동 줄 바꿈", "Word wrap in source/result panes");
    public static string PreferencesLanguage => T("언어:", "Language:");
    public static string LanguageKorean => "한국어";
    public static string LanguageEnglish => "English";
    public static string PreferencesForgetSession => T("마지막 세션 지우기", "Forget Last Session");
    public static string PreferencesSessionCleared => T(
        "확인을 누르면 기억된 세션이 지워집니다.",
        "The remembered session will be cleared when you click OK.");
    public static string Ok => T("확인", "OK");
    public static string Cancel => T("취소", "Cancel");

    public static string ErrorTitle => T("오류", "Error");
    public static string ErrorCopy => T("내용 복사", "Copy Details");
    public static string ErrorCopied => T("복사됨", "Copied");
    public static string ErrorType => T("유형", "Type");
    public static string ErrorMessage => T("메시지", "Message");
    public static string ErrorSource => T("소스", "Source");
    public static string ErrorStackTrace => T("스택 추적", "Stack Trace");
    public static string ErrorRestoreSession => T("마지막 세션을 복원하지 못했습니다.", "Could not restore the last session.");
    public static string ErrorSave => T("파일을 저장하지 못했습니다.", "Could not save the file.");

    public static string FormatStatusResolved(int resolved, int total, string path) =>
        string.Format(StatusResolvedFormat, resolved, total, path);

    public static string FormatConflict(int index, ConflictResolution resolution) =>
        string.Format(ConflictFormat, index + 1, ResolutionName(resolution));

    public static string ResolutionName(ConflictResolution resolution) => resolution switch
    {
        ConflictResolution.Unresolved => T("미해결", "Unresolved"),
        ConflictResolution.Base => "Base",
        ConflictResolution.Local => "Local",
        ConflictResolution.Remote => "Remote",
        ConflictResolution.Both => T("둘 다", "Both"),
        _ => resolution.ToString(),
    };

    public static string LanguageDisplayName(AppLanguage language) => language switch
    {
        AppLanguage.Korean => LanguageKorean,
        AppLanguage.English => LanguageEnglish,
        _ => language.ToString(),
    };

    private static string T(string korean, string english) =>
        Language == AppLanguage.Korean ? korean : english;
}
