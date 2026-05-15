namespace RemoteDesktopWinV10.App;

/// <summary>메뉴·UI 표시 옵션(로컬 JSON).</summary>
public sealed class UiSettings
{
    /// <summary>「보기」메뉴(전체 화면) 표시.</summary>
    public bool ShowViewMenu { get; set; } = true;

    /// <summary>「파일」에 데이터 폴더 열기 항목 표시.</summary>
    public bool ShowOpenDataFolderMenuItem { get; set; }
}
