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
        LastPageIdsByUserId = new Dictionary<string, int>(LastPageIdsByUserId, StringComparer.Ordinal)
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
