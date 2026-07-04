namespace MyWorkspace.Win;

public enum AppThemeKind
{
    Light,
    Dark
}

public enum AppLanguage
{
    Korean,
    English
}

public sealed class UiSettings
{
    public AppThemeKind Theme { get; set; } = AppThemeKind.Light;
    public int ColorThemeIndex { get; set; } = 4;
    public bool UseCustomAccentColor { get; set; }
    public int CustomAccentArgb { get; set; } = PastelThemeCatalog.DefaultAccent.ToArgb();
    public AppLanguage Language { get; set; } = AppLanguage.Korean;
    public string LastLoginUsername { get; set; } = string.Empty;
    public bool HasLoggedInOnce { get; set; }
    public int FontScaleStep { get; set; }
    public string LastExportDirectory { get; set; } = string.Empty;
    public string LastOpenDirectory { get; set; } = string.Empty;
    public string LastProjectDirectory { get; set; } = string.Empty;
    public List<string> RecentProjectPaths { get; set; } = new();
    public Dictionary<string, int> LastPageIdsByUserId { get; set; } = new(StringComparer.Ordinal);
    public Dictionary<string, List<int>> OpenPageTabIdsByUserId { get; set; } = new(StringComparer.Ordinal);
    public string LastPageTemplateId { get; set; } = string.Empty;
    public bool ShowTitleBarPageSearch { get; set; } = true;
    public Dictionary<string, bool> WorkspacePanelCollapsedByUserId { get; set; } = new(StringComparer.Ordinal);
    public Dictionary<string, int> WorkspacePanelWidthByUserId { get; set; } = new(StringComparer.Ordinal);

    public const int DefaultWorkspacePanelWidth = 232;
    public const int MinWorkspacePanelWidth = 160;

    public static UiSettings Default { get; } = new();

    public UiSettings Clone() => new()
    {
        Theme = Theme,
        ColorThemeIndex = ColorThemeIndex,
        UseCustomAccentColor = UseCustomAccentColor,
        CustomAccentArgb = CustomAccentArgb,
        Language = Language,
        LastLoginUsername = LastLoginUsername,
        HasLoggedInOnce = HasLoggedInOnce,
        FontScaleStep = FontScaleStep,
        LastExportDirectory = LastExportDirectory,
        LastOpenDirectory = LastOpenDirectory,
        LastProjectDirectory = LastProjectDirectory,
        RecentProjectPaths = new List<string>(RecentProjectPaths),
        LastPageIdsByUserId = new Dictionary<string, int>(LastPageIdsByUserId, StringComparer.Ordinal),
        OpenPageTabIdsByUserId = OpenPageTabIdsByUserId.ToDictionary(
            pair => pair.Key,
            pair => new List<int>(pair.Value),
            StringComparer.Ordinal),
        LastPageTemplateId = LastPageTemplateId,
        ShowTitleBarPageSearch = ShowTitleBarPageSearch,
        WorkspacePanelCollapsedByUserId = new Dictionary<string, bool>(WorkspacePanelCollapsedByUserId, StringComparer.Ordinal),
        WorkspacePanelWidthByUserId = new Dictionary<string, int>(WorkspacePanelWidthByUserId, StringComparer.Ordinal)
    };
}

public enum SaveStatusKind
{
    None,
    Modified,
    Saved,
    AutoSaved,
    OfflineSaved,
    Failed
}
