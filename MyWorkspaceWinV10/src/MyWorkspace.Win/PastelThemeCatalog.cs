namespace MyWorkspace.Win;

internal readonly record struct PastelThemePreset(int Index, string NameKey, Color Accent)
{
    public string GetDisplayName() => Localization.Get(NameKey);
}

internal static class PastelThemeCatalog
{
    public const int Count = 20;

    // Hues spaced ~18° apart on the color wheel; pastels tuned for clear separation.
    private static readonly PastelThemePreset[] Presets =
    [
        new(0, K.PastelRose, Color.FromArgb(255, 168, 178)),
        new(1, K.PastelCoral, Color.FromArgb(255, 168, 148)),
        new(2, K.PastelApricot, Color.FromArgb(255, 196, 140)),
        new(3, K.PastelSand, Color.FromArgb(255, 220, 142)),
        new(4, K.PastelSky, Color.FromArgb(168, 212, 255)),
        new(5, K.PastelLemon, Color.FromArgb(255, 242, 136)),
        new(6, K.PastelButter, Color.FromArgb(240, 255, 140)),
        new(7, K.PastelMeadow, Color.FromArgb(208, 255, 148)),
        new(8, K.PastelSage, Color.FromArgb(178, 255, 164)),
        new(9, K.PastelMint, Color.FromArgb(148, 255, 192)),
        new(10, K.PastelSeafoam, Color.FromArgb(124, 255, 216)),
        new(11, K.PastelAqua, Color.FromArgb(112, 245, 245)),
        new(12, K.PastelPowder, Color.FromArgb(136, 204, 255)),
        new(13, K.PastelPeriwinkle, Color.FromArgb(168, 172, 255)),
        new(14, K.PastelLavender, Color.FromArgb(200, 164, 255)),
        new(15, K.PastelLilac, Color.FromArgb(218, 158, 255)),
        new(16, K.PastelOrchid, Color.FromArgb(240, 158, 255)),
        new(17, K.PastelPink, Color.FromArgb(255, 158, 210)),
        new(18, K.PastelCream, Color.FromArgb(255, 248, 212)),
        new(19, K.PastelPeach, Color.FromArgb(255, 195, 175))
    ];

    public static IReadOnlyList<PastelThemePreset> All => Presets;

    public static PastelThemePreset Get(int index)
    {
        var normalized = NormalizeIndex(index);
        return Presets[normalized];
    }

    public static int NormalizeIndex(int index) =>
        index switch
        {
            < 0 => 0,
            >= Count => Count - 1,
            _ => index
        };

    public static Color DefaultAccent => Presets[4].Accent;
}

internal static class PastelThemeResolver
{
    public static Color ResolveAccent(UiSettings settings)
    {
        if (settings.UseCustomAccentColor)
            return Color.FromArgb(settings.CustomAccentArgb);

        return PastelThemeCatalog.Get(settings.ColorThemeIndex).Accent;
    }
}
