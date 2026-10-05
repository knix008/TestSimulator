import type { AppLanguage } from "../core/settings";

type Entry = [korean: string, english: string];

/** Every UI string in Korean and English. Korean is the default, as in the WinForms build. */
const STRINGS = {
  appTitle: ["MyDiff", "MyDiff"],

  menuFile: ["파일", "File"],
  menuView: ["보기", "View"],
  menuGit: ["Git", "Git"],
  menuHelp: ["도움말", "Help"],

  tabGit: ["Git 변경", "Git Changes"],
  tabFile: ["파일 비교", "File Compare"],
  tabDirectory: ["디렉터리 비교", "Directory Compare"],

  openLeft: ["왼쪽 파일 열기...", "Open Left File..."],
  openRight: ["오른쪽 파일 열기...", "Open Right File..."],
  reload: ["다시 비교", "Reload"],
  preferences: ["환경 설정...", "Preferences..."],
  exit: ["종료", "Exit"],
  about: ["MyDiff 정보", "About MyDiff"],
  usersGuide: ["사용자 가이드", "User's Guide"],

  prevDiff: ["이전 차이", "Previous Difference"],
  nextDiff: ["다음 차이", "Next Difference"],
  wordWrap: ["자동 줄 바꿈", "Word Wrap"],
  wordHighlight: ["단어 단위 강조", "Highlight Changed Words"],
  copyLeft: ["왼쪽 복사", "Copy Left"],
  copyRight: ["오른쪽 복사", "Copy Right"],
  fontSize: ["글꼴 크기", "Font size"],
  theme: ["테마", "Theme"],
  themeLight: ["밝은 테마", "Light"],
  themeDark: ["어두운 테마", "Dark"],
  unifiedDiff: ["통합 diff 보기", "Unified diff"],

  tipOpenLeft: ["왼쪽에 표시할 파일을 엽니다", "Open the file to show on the left"],
  tipOpenRight: ["오른쪽에 표시할 파일을 엽니다", "Open the file to show on the right"],
  tipReload: ["두 쪽을 다시 읽어 비교합니다", "Re-read both sides and diff again"],
  tipPrevDiff: ["이전 차이로 이동합니다 (Shift+F3)", "Jump to the previous difference (Shift+F3)"],
  tipNextDiff: ["다음 차이로 이동합니다 (F3)", "Jump to the next difference (F3)"],
  tipWordWrap: ["좌우 패널의 자동 줄 바꿈을 전환합니다", "Toggle word wrap in both panes"],
  tipWordHighlight: ["변경된 줄에서 바뀐 단어만 진하게 표시합니다", "Highlight only the words that changed in a modified line"],
  tipFontSize: ["패널 글꼴 크기 (Ctrl+마우스 휠)", "Pane font size (Ctrl+mouse wheel)"],
  tipPreferences: ["글꼴, 줄 바꿈, 패널 색, 언어, 테마를 설정합니다", "Font, word wrap, pane colors, language and theme"],
  tipTheme: ["밝은 테마와 어두운 테마를 전환합니다", "Switch between the light and dark theme"],
  tipAbout: ["애플리케이션 정보를 표시합니다", "Show application information"],
  tipCopy: ["보이는 영역의 내용을 클립보드로 복사합니다", "Copy the visible rows to the clipboard"],
  tipUnified: ["git이 만든 통합 diff 텍스트를 함께 표시합니다", "Also show the unified diff text produced by git"],

  paneLeft: ["왼쪽", "Left"],
  paneRight: ["오른쪽", "Right"],

  statusNoSession: [
    "비교할 대상을 선택하세요 — Git 변경 목록에서 파일을 고르거나, 파일/디렉터리를 직접 열 수 있습니다.",
    "Pick something to compare — choose a file from the Git change list, or open files/folders directly.",
  ],
  statusIdentical: ["두 쪽이 동일합니다.", "The two sides are identical."],
  statusBinary: ["바이너리", "binary"],
  statusAdded: ["추가", "added"],
  statusRemoved: ["삭제", "removed"],
  statusModified: ["변경", "modified"],
  statusBytesDiffer: ["바이트 다름", "byte(s) differ"],
  statusRows: ["행", "rows"],
  statusLoading: ["불러오는 중...", "Loading..."],

  gitOpenRepo: ["저장소 열기...", "Open Repository..."],
  gitRepository: ["저장소", "Repository"],
  gitRecent: ["최근 저장소", "Recent repositories"],
  gitNoRepo: ["Git 저장소를 열면 변경된 파일 목록이 여기에 표시됩니다.", "Open a git repository to see its changed files here."],
  gitNotInstalled: ["git 명령을 찾을 수 없습니다. git을 설치한 뒤 다시 시도하세요.", "The git command was not found. Install git and try again."],
  gitBranch: ["브랜치", "Branch"],
  gitDetached: ["분리된 HEAD", "detached HEAD"],
  gitAhead: ["앞선 커밋", "ahead"],
  gitBehind: ["뒤처진 커밋", "behind"],
  gitViewWork: ["작업 트리", "Working tree"],
  gitViewCommits: ["커밋", "Commits"],
  gitViewRange: ["리비전 비교", "Compare revisions"],
  gitRefresh: ["새로 고침", "Refresh"],
  gitAutoRefresh: ["자동 새로 고침", "Auto refresh"],
  gitStaged: ["스테이지됨", "Staged"],
  gitUnstaged: ["스테이지 안 됨", "Not staged"],
  gitUntracked: ["추적 안 됨", "Untracked"],
  gitConflicted: ["충돌", "Conflicted"],
  gitCommitFiles: ["커밋에서 변경된 파일", "Files in this commit"],
  gitRangeFiles: ["리비전 간 변경된 파일", "Files changed between revisions"],
  gitNoChanges: ["변경된 파일이 없습니다.", "No changed files."],
  gitFrom: ["기준", "From"],
  gitTo: ["대상 (비우면 작업 트리)", "To (empty = working tree)"],
  gitCompare: ["비교", "Compare"],
  gitLoadMore: ["더 불러오기", "Load more"],
  gitDiffToolTitle: ["git difftool로 등록", "Register as a git difftool"],
  gitDiffToolBody: [
    "등록하면 git difftool -t mydiff 명령이나 MyGit의 외부 diff 도구에서 MyDiff가 열립니다.",
    "Once registered, `git difftool -t mydiff` and MyGit's external diff tool open MyDiff.",
  ],
  gitDiffToolRegister: ["등록", "Register"],
  gitDiffToolUnregister: ["등록 해제", "Unregister"],
  gitDiffToolRegistered: ["등록됨", "Registered"],
  gitDiffToolNotRegistered: ["등록되지 않음", "Not registered"],
  gitDiffToolCopy: ["명령 복사", "Copy command"],
  gitStatusLine: ["{0} · {1} · 변경 {2}개", "{0} · {1} · {2} change(s)"],

  dirLeft: ["왼쪽 디렉터리", "Left directory"],
  dirRight: ["오른쪽 디렉터리", "Right directory"],
  dirSelectLeft: ["왼쪽 디렉터리...", "Left Directory..."],
  dirSelectRight: ["오른쪽 디렉터리...", "Right Directory..."],
  dirCompare: ["비교", "Compare"],
  dirSelectBoth: ["왼쪽과 오른쪽 디렉터리를 모두 선택하세요.", "Select both the left and right directory first."],
  dirSummary: ["동일 {0} / 다름 {1} / 왼쪽만 {2} / 오른쪽만 {3}", "Same {0} / Diff {1} / Left only {2} / Right only {3}"],
  dirStatusSame: ["동일", "Same"],
  dirStatusDifferent: ["다름", "Different"],
  dirStatusLeftOnly: ["왼쪽만", "Left only"],
  dirStatusRightOnly: ["오른쪽만", "Right only"],
  dirFilter: ["필터", "Filter"],
  dirExcludes: ["제외할 폴더 이름 (쉼표로 구분)", "Folder names to skip (comma separated)"],
  dirEmpty: ["비교할 두 디렉터리를 선택하세요.", "Select the two directories to compare."],
  dirNoEntries: ["표시할 항목이 없습니다.", "Nothing to show."],
  dirTruncated: ["항목이 너무 많아 일부만 표시합니다.", "Too many entries; only the first ones are shown."],
  dirOpenHint: ["항목을 더블 클릭하면 파일 비교로 열립니다.", "Double-click an entry to open it in the file panes."],
  dirColumnPath: ["경로", "Path"],
  dirColumnStatus: ["상태", "Status"],
  dirColumnLeft: ["왼쪽 크기", "Left size"],
  dirColumnRight: ["오른쪽 크기", "Right size"],

  prefTitle: ["환경 설정", "Preferences"],
  prefFontSize: ["패널 글꼴 크기", "Pane font size"],
  prefWordWrap: ["좌우 패널 자동 줄 바꿈", "Word wrap in both panes"],
  prefWordHighlight: ["변경된 단어 강조", "Highlight changed words"],
  prefLanguage: ["언어", "Language"],
  prefTheme: ["테마", "Theme"],
  prefLeftHeader: ["왼쪽 패널 타이틀 바 색", "Left pane title bar color"],
  prefRightHeader: ["오른쪽 패널 타이틀 바 색", "Right pane title bar color"],
  prefExcludes: ["디렉터리 비교에서 제외", "Skip in directory compare"],
  prefAutoRefresh: ["Git 변경 목록 자동 새로 고침", "Auto refresh the git change list"],
  prefSettingsPath: ["설정 파일", "Settings file"],
  prefReset: ["기본값으로", "Restore defaults"],
  languageKorean: ["한국어", "한국어"],
  languageEnglish: ["English", "English"],
  ok: ["확인", "OK"],
  cancel: ["취소", "Cancel"],
  close: ["닫기", "Close"],
  copy: ["복사", "Copy"],
  copied: ["복사됨", "Copied"],

  pickFile: ["파일 선택", "Select a file"],
  pickDirectory: ["디렉터리 선택", "Select a folder"],
  pickUp: ["상위 폴더", "Parent folder"],
  pickPath: ["경로", "Path"],
  pickSelect: ["선택", "Select"],
  pickNoEntries: ["폴더가 비어 있습니다.", "This folder is empty."],

  errorTitle: ["오류", "Error"],
  errorCopy: ["내용 복사", "Copy Details"],
  errorCode: ["코드", "Code"],
  errorMessage: ["메시지", "Message"],
  errorDetail: ["상세", "Detail"],

  aboutBody: [
    "디렉터리 비교, 2-way 줄 단위 diff, 바이너리 hex diff를 제공하는 Git 연동 diff 뷰어입니다.\nWeb · Windows · macOS · Linux에서 같은 코드로 동작합니다.",
    "A git-aware diff viewer with directory compare, 2-way line diff and binary hex diff.\nOne codebase for Web, Windows, macOS and Linux.",
  ],
  aboutVersion: ["버전", "Version"],
  aboutBuild: ["빌드", "Build"],
  aboutCopyright: ["Copyright (c) SHKWON(knix008@naver.com)", "Copyright (c) SHKWON(knix008@naver.com)"],
} satisfies Record<string, Entry>;

export type StringKey = keyof typeof STRINGS;

export type Translate = (key: StringKey, ...args: (string | number)[]) => string;

export function translator(language: AppLanguage): Translate {
  const index = language === "en" ? 1 : 0;
  return (key, ...args) => {
    const entry = STRINGS[key];
    const text = entry ? entry[index] : String(key);
    return args.length === 0
      ? text
      : text.replace(/\{(\d+)\}/g, (match, position) => String(args[Number(position)] ?? match));
  };
}

/**
 * Version badges are produced language-neutral by the core (`working tree`, `index`,
 * `ours`, `theirs`, `none`, or a sha); this translates the known words for the pane title.
 */
export function versionText(version: string | null, language: AppLanguage): string {
  if (!version) return "";
  if (language === "en") return version;
  return version
    .replace(/\bworking tree\b/g, "작업 트리")
    .replace(/\bindex\b/g, "인덱스")
    .replace(/\bours\b/g, "내 쪽")
    .replace(/\btheirs\b/g, "상대 쪽")
    .replace(/\bempty\b/g, "빈 트리")
    .replace(/\bnone\b/g, "없음")
    .replace(/\bfile\b/g, "파일");
}

/** Git status labels come from git in English; these are the display names. */
export function statusText(status: string, language: AppLanguage): string {
  if (language === "en") return status;
  switch (status) {
    case "Modified": return "변경";
    case "Added": return "추가";
    case "Deleted": return "삭제";
    case "Renamed": return "이름 변경";
    case "Copied": return "복사";
    case "Type Changed": return "형식 변경";
    case "Untracked": return "추적 안 됨";
    case "Conflicted": return "충돌";
    default: return status;
  }
}
