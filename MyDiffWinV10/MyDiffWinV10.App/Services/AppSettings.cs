namespace MyDiffWinV10.App.Services;

public sealed class LastSessionInfo
{
    public string? LeftPath { get; set; }
    public string? RightPath { get; set; }
}

/// <summary>
/// All persisted MyDiff settings — window placement, pane preferences, and the last
/// working session — collected in one settings file instead of scattered state.
/// </summary>
public sealed class AppSettings
{
    public int WindowX { get; set; } = -1;
    public int WindowY { get; set; } = -1;
    public int WindowWidth { get; set; } = 1200;
    public int WindowHeight { get; set; } = 800;
    public bool Maximized { get; set; }

    public float PaneFontSize { get; set; } = 10f;
    public bool WordWrap { get; set; }
    public AppLanguage Language { get; set; } = AppLanguage.Korean;

    public LastSessionInfo? LastSession { get; set; }
}
