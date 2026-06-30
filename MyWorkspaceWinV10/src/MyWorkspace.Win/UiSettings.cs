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

    public static UiSettings Default { get; } = new();

    public UiSettings Clone() => new()
    {
        Theme = Theme,
        Language = Language
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
