namespace DeskSearch.Helpers;

internal static class MenuIconColors
{
    public static string ForMenuKey(string key) =>
        key switch
        {
            "Menu_ClearSearch" => "#605E5C",
            "Menu_RefreshIndex" => SettingsIconColors.Indexing,
            "Menu_OpenDesktop" => "#0078D4",
            "Menu_ResetPosition" => SettingsIconColors.Reset,
            "Menu_AboveOthers" => SettingsIconColors.PickBackground,
            "Menu_Settings" => SettingsIconColors.Save,
            "Menu_Hide" => "#5C2E91",
            "Menu_Exit" => SettingsIconColors.Remove,
            "Menu_Open" => "#107C10",
            "Menu_ShowInFolder" => SettingsIconColors.OpenDataFolder,
            "Menu_CopyPath" => "#008272",
            "Menu_CopyFileName" => SettingsIconColors.BrowseFolder,
            "Tray_ShowWindow" => "#0078D4",
            _ => SettingsIconColors.Info
        };

    public static string ForGlyph(string glyph) =>
        glyph switch
        {
            MenuGlyphIcons.ClearSearch => ForMenuKey("Menu_ClearSearch"),
            MenuGlyphIcons.RefreshIndex => ForMenuKey("Menu_RefreshIndex"),
            MenuGlyphIcons.OpenDesktop => ForMenuKey("Menu_OpenDesktop"),
            MenuGlyphIcons.ResetPosition => ForMenuKey("Menu_ResetPosition"),
            MenuGlyphIcons.AlwaysOnTop => ForMenuKey("Menu_AboveOthers"),
            MenuGlyphIcons.Settings => ForMenuKey("Menu_Settings"),
            MenuGlyphIcons.Hide => ForMenuKey("Menu_Hide"),
            MenuGlyphIcons.Exit => ForMenuKey("Menu_Exit"),
            MenuGlyphIcons.Open => ForMenuKey("Menu_Open"),
            MenuGlyphIcons.ShowInFolder => ForMenuKey("Menu_ShowInFolder"),
            MenuGlyphIcons.CopyPath => ForMenuKey("Menu_CopyPath"),
            MenuGlyphIcons.CopyFileName => ForMenuKey("Menu_CopyFileName"),
            MenuGlyphIcons.ShowWindow => ForMenuKey("Tray_ShowWindow"),
            _ => SettingsIconColors.Info
        };
}
