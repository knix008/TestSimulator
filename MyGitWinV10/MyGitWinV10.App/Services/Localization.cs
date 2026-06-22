namespace MyGitWinV10.App.Services;

/// <summary>
/// Korean/English string table for the main shell UI (menus, toolbar tooltips, section
/// headings, Preferences dialog). Defaults to Korean; switch via <see cref="Language"/>.
/// </summary>
public static class Localization
{
    public static event Action? LanguageChanged;

    public static AppLanguage Language { get; private set; } = AppLanguage.Korean;

    public static void SetLanguage(AppLanguage language)
    {
        if (Language == language)
        {
            return;
        }

        Language = language;
        LanguageChanged?.Invoke();
    }

    public static string T(string key) =>
        Strings.TryGetValue(key, out var pair) ? (Language == AppLanguage.Korean ? pair.Ko : pair.En) : key;

    private static readonly Dictionary<string, (string Ko, string En)> Strings = new()
    {
        ["Menu.File"] = ("파일", "File"),
        ["Menu.File.Open"] = ("열기...", "&Open..."),
        ["Menu.File.Open.Tip"] = ("로컬 Git 저장소 폴더를 엽니다", "Open a local Git repository folder"),
        ["Menu.File.Clone"] = ("클론...", "&Clone..."),
        ["Menu.File.Clone.Tip"] = ("원격 저장소를 로컬 폴더로 클론합니다", "Clone a remote repository to a local folder"),
        ["Menu.File.BrowseRemote"] = ("원격 저장소 둘러보기...", "&Browse Remote..."),
        ["Menu.File.BrowseRemote.Tip"] = ("로컬에 저장하지 않고 원격 커밋 기록을 둘러봅니다", "Browse remote commit history without saving a local copy"),
        ["Menu.File.Preferences"] = ("환경설정...", "&Preferences..."),
        ["Menu.File.Preferences.Tip"] = ("외부 Diff 도구와 언어를 설정합니다", "Configure the external diff tool and language"),
        ["Menu.File.Exit"] = ("끝내기", "E&xit"),
        ["Menu.File.Exit.Tip"] = ("애플리케이션을 닫습니다", "Close the application"),

        ["Menu.Repository"] = ("저장소", "Repository"),
        ["Menu.Repository.RefreshTree"] = ("트리 새로고침", "Refresh &Tree"),
        ["Menu.Repository.ExportWord"] = ("Word로 내보내기", "Export to &Word"),
        ["Menu.Repository.ExportMarkdown"] = ("Markdown으로 내보내기", "Export to &Markdown"),
        ["Menu.Repository.ExportPdf"] = ("PDF로 내보내기", "Export to &PDF"),

        ["Menu.History"] = ("기록", "History"),
        ["Menu.History.RefreshGraph"] = ("그래프 새로고침", "Refresh &Graph"),
        ["Menu.History.CopySha"] = ("SHA 복사", "Copy &SHA"),
        ["Menu.History.CopyMessage"] = ("메시지 복사", "Copy &Message"),

        ["Menu.Diff"] = ("Diff", "Diff"),
        ["Menu.Diff.CopyPath"] = ("경로 복사", "Copy &Path"),
        ["Menu.Diff.WordWrap"] = ("자동 줄바꿈", "Word &Wrap"),
        ["Menu.Diff.CopyDiff"] = ("Diff 복사", "Copy &Diff"),

        ["Menu.Help"] = ("도움말", "Help"),
        ["Menu.Help.About"] = ("정보", "&About"),

        ["Toolbar.Open.Tip"] = ("로컬 Git 저장소 폴더를 엽니다", "Open a local Git repository folder"),
        ["Toolbar.Clone.Tip"] = ("원격 저장소를 로컬 폴더로 클론합니다", "Clone a remote repository to a local folder"),
        ["Toolbar.BrowseRemote.Tip"] = ("로컬에 저장하지 않고 원격 커밋 기록을 둘러봅니다", "Browse remote commit history without saving a local copy"),
        ["Toolbar.RefreshTree.Tip"] = ("브랜치, 태그, 릴리스를 새로고침합니다", "Reload branches, tags, and releases"),
        ["Toolbar.ExportSummary.Tip"] = ("저장소 요약을 PDF, Word, Markdown으로 내보냅니다", "Export repository summary as PDF, Word, or Markdown"),
        ["Toolbar.RefreshGraph.Tip"] = ("커밋 기록 그래프를 새로고침합니다", "Reload the commit history graph"),
        ["Toolbar.CopySha.Tip"] = ("선택한 커밋의 전체 해시를 클립보드에 복사합니다", "Copy the selected commit's full hash to the clipboard"),
        ["Toolbar.CopyMessage.Tip"] = ("선택한 커밋 메시지를 클립보드에 복사합니다", "Copy the selected commit message to the clipboard"),
        ["Toolbar.CopyFilePath.Tip"] = ("선택한 파일 경로를 클립보드에 복사합니다", "Copy the selected file path to the clipboard"),
        ["Toolbar.WordWrap.Tip"] = ("Diff 보기의 자동 줄바꿈을 켜고 끕니다", "Toggle word wrap for the diff view"),
        ["Toolbar.CopyDiff.Tip"] = ("화면에 보이는 Diff 텍스트를 복사합니다", "Copy the visible diff text to the clipboard"),
        ["Toolbar.Info.Tip"] = ("애플리케이션 정보를 표시합니다", "Show application information"),

        ["Section.Repo.Title"] = ("저장소", "Repository"),
        ["Section.Repo.Tip"] = ("브랜치, 태그, 릴리스가 포함된 로컬 저장소 트리입니다.", "Local repository tree with branches, tags, and releases."),
        ["Section.RepoFiles.Title"] = ("파일", "Files"),
        ["Section.RepoFiles.Tip"] = ("저장소 폴더와 파일입니다. 아이콘이 Git 상태를 표시하며, 노드에 마우스를 올리면 스테이지/작업 트리 세부정보를 볼 수 있습니다.", "Repository folders and files. Icons show Git status; hover a node for staged and work tree details."),
        ["Section.Graph.Title"] = ("커밋 기록", "Commit History"),
        ["Section.Graph.Tip"] = ("브랜치 그래프, 메시지, 메타데이터가 포함된 커밋 로그입니다.", "Commit log with branch graph, messages, and metadata."),
        ["Section.Files.Title"] = ("커밋 상세", "Commit Details"),
        ["Section.Files.Tip"] = ("선택한 커밋의 작성자, 메시지, 변경된 파일입니다.", "Author, message, and files changed in the selected commit."),
        ["Section.Diff.Title"] = ("Diff", "Diff"),
        ["Section.Diff.Tip"] = ("선택한 변경 파일의 통합 Diff입니다.", "Unified diff for the selected changed file."),
        ["Section.ChangedFiles.Title"] = ("변경된 파일", "Changed Files"),
        ["Section.ChangedFiles.Tip"] = ("선택한 커밋에서 수정된 파일 목록입니다.", "List of files modified in the selected commit."),

        ["Menu.Diff.ContextCopy"] = ("복사", "Copy"),
        ["Menu.Diff.ContextWordWrap"] = ("자동 줄바꿈", "Word Wrap"),

        ["Menu.CommitGraph.CopySha"] = ("SHA 복사", "Copy SHA"),
        ["Menu.CommitGraph.CopyMessage"] = ("메시지 복사", "Copy Message"),
        ["Menu.CommitGraph.ExportToFolder"] = ("폴더로 내보내기...", "Export to Folder..."),

        ["Column.RepoFiles.Name"] = ("디렉토리/파일", "Directory/File"),
        ["Column.RepoFiles.Name.Tip"] = ("저장소 트리 내 위치를 들여쓰기로 표시한 파일 또는 디렉토리 이름입니다.", "Name of the file or directory, indented to show its place in the repository tree."),
        ["Column.RepoFiles.Status"] = ("상태", "Status"),
        ["Column.RepoFiles.Status.Tip"] = ("이 파일 또는 디렉토리의 Git 상태입니다 (M=수정, A=추가, D=삭제, R=이름변경, ?=추적되지 않음, !=충돌).", "Git status of this file or directory (M=Modified, A=Added, D=Deleted, R=Renamed, ?=Untracked, !=Conflicted)."),

        ["Column.ChangedFiles.Path"] = ("경로", "Path"),
        ["Column.ChangedFiles.Path.Tip"] = ("저장소 내 변경된 파일의 상대 경로입니다.", "Relative path of the changed file in the repository."),
        ["Column.ChangedFiles.Status"] = ("상태", "Status"),
        ["Column.ChangedFiles.Status.Tip"] = ("변경 종류입니다 (추가, 수정, 삭제, 이름변경 등).", "Kind of change (Added, Modified, Deleted, Renamed, etc.)."),

        ["Menu.ChangedFiles.OpenExternal"] = ("외부 뷰어로 보기", "Open in External Viewer"),
        ["Menu.ChangedFiles.OpenExternal.Tip"] = ("환경설정에 지정한 외부 Diff 도구로 선택한 파일을 엽니다.", "Open the selected file in the external diff tool configured in Preferences."),
        ["Menu.ChangedFiles.ExternalNotConfigured"] = ("설정안됨", "not configured"),
        ["Menu.ChangedFiles.CopyPath"] = ("경로 복사", "Copy Path"),
        ["Menu.ChangedFiles.CopyPath.Tip"] = ("선택한 파일 경로를 클립보드에 복사합니다.", "Copy the selected file path to the clipboard."),

        ["Column.Graph.Graph"] = ("그래프", "Graph"),
        ["Column.Graph.Graph.Tip"] = ("커밋이 레인 사이에서 어떻게 연결되는지 보여주는 브랜치/머지 그래프입니다.", "Branch and merge graph showing how commits connect across lanes."),
        ["Column.Graph.Message"] = ("메시지", "Message"),
        ["Column.Graph.Message.Tip"] = ("커밋 메시지의 첫 줄 요약입니다.", "Short summary of the commit (first line of the commit message)."),
        ["Column.Graph.Sha"] = ("SHA", "SHA"),
        ["Column.Graph.Sha.Tip"] = ("이 리비전을 고유하게 식별하는 축약된 커밋 해시입니다.", "Abbreviated commit hash that uniquely identifies this revision."),
        ["Column.Graph.Author"] = ("작성자", "Author"),
        ["Column.Graph.Author.Tip"] = ("커밋을 작성한 사람입니다.", "Person who authored the commit."),
        ["Column.Graph.Date"] = ("날짜", "Date"),
        ["Column.Graph.Date.Tip"] = ("커밋이 작성된 날짜입니다.", "Date when the commit was authored."),

        ["Preferences.Title"] = ("환경설정", "Preferences"),
        ["Preferences.Diff.Group"] = ("외부 Diff 도구", "External Diff Tool"),
        ["Preferences.Diff.Path"] = ("도구 경로", "Tool Path"),
        ["Preferences.Diff.Browse"] = ("찾아보기...", "Browse..."),
        ["Preferences.Diff.Arguments"] = ("인수", "Arguments"),
        ["Preferences.Diff.Hint"] = ("{left}와 {right}는 비교할 두 임시 파일 경로로 대체됩니다.", "{left} and {right} are replaced with the two temp file paths to compare."),
        ["Preferences.Language.Group"] = ("언어", "Language"),
        ["Preferences.Language.Korean"] = ("한국어", "Korean"),
        ["Preferences.Language.English"] = ("영어", "English"),
        ["Preferences.OK"] = ("확인", "OK"),
        ["Preferences.Cancel"] = ("취소", "Cancel"),
    };
}
