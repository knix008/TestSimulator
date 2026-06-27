namespace DiffMergeWinV10.App.Services;

public enum LastSessionMode
{
    None,
    ThreeFiles,
    Conflicted,
}

public sealed class LastSessionInfo
{
    public LastSessionMode Mode { get; set; } = LastSessionMode.None;
    public string? BasePath { get; set; }
    public string? LocalPath { get; set; }
    public string? RemotePath { get; set; }
    public string? MergedPath { get; set; }
}

/// <summary>
/// All persisted Diff &amp; Merge settings — window placement, pane preferences, and the
/// last working session — collected in one settings file instead of scattered state.
/// </summary>
public sealed class AppSettings
{
    public int WindowX { get; set; } = -1;
    public int WindowY { get; set; } = -1;
    public int WindowWidth { get; set; } = 1200;
    public int WindowHeight { get; set; } = 800;
    public bool Maximized { get; set; }

    public float PaneFontSize { get; set; } = 9.5f;
    public bool WordWrap { get; set; }

    public LastSessionInfo? LastSession { get; set; }
}
