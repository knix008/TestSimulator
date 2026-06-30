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
    public AppLanguage Language { get; set; } = AppLanguage.Korean;
    public string LastLoginUsername { get; set; } = string.Empty;
    public bool HasLoggedInOnce { get; set; }
    public int FontScaleStep { get; set; }
    public string LastExportDirectory { get; set; } = string.Empty;
    public string LastOpenDirectory { get; set; } = string.Empty;

    public static UiSettings Default { get; } = new();

    public UiSettings Clone() => new()
    {
        Theme = Theme,
        Language = Language,
        LastLoginUsername = LastLoginUsername,
        HasLoggedInOnce = HasLoggedInOnce,
        FontScaleStep = FontScaleStep,
        LastExportDirectory = LastExportDirectory,
        LastOpenDirectory = LastOpenDirectory
    };
}

public enum SaveStatusKind
{
    None,
    Modified,
    Saved,
    AutoSaved,
    Failed
}
