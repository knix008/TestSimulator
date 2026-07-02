namespace MyWorkspace.Win;

internal readonly record struct PastelThemePreset(int Index, string NameKey, Color Accent)
{
    public string GetDisplayName() => Localization.Get(NameKey);
}

internal static class PastelThemeCatalog
{
    public const int Count = 10;

    private static readonly PastelThemePreset[] Presets =
    [
        new(0, K.PastelRose, Color.FromArgb(255, 179, 186)),
        new(1, K.PastelPeach, Color.FromArgb(255, 223, 186)),
        new(2, K.PastelLemon, Color.FromArgb(255, 255, 186)),
        new(3, K.PastelMint, Color.FromArgb(186, 255, 201)),
        new(4, K.PastelSky, Color.FromArgb(186, 225, 255)),
        new(5, K.PastelLavender, Color.FromArgb(212, 186, 255)),
        new(6, K.PastelCoral, Color.FromArgb(255, 186, 186)),
        new(7, K.PastelSage, Color.FromArgb(201, 255, 186)),
        new(8, K.PastelAqua, Color.FromArgb(186, 255, 225)),
        new(9, K.PastelPeriwinkle, Color.FromArgb(186, 201, 255))
    ];

    // Maps indices from the former 20-color catalog to the nearest preset above.
    private static readonly int[] LegacyIndexMap =
    [
        0,  // Rose
        1,  // Peach
        2,  // Lemon
        3,  // Mint
        4,  // Sky
        5,  // Lavender
        5,  // Lilac -> Lavender
        6,  // Coral
        1,  // Apricot -> Peach
        2,  // Butter -> Lemon
        7,  // Sage
        8,  // Aqua
        9,  // Periwinkle
        0,  // Pink -> Rose
        1,  // Sand -> Peach
        8,  // Seafoam -> Aqua
        5,  // Orchid -> Lavender
        3,  // Meadow -> Mint
        9,  // Powder -> Periwinkle
        2   // Cream -> Lemon
    ];

    public static IReadOnlyList<PastelThemePreset> All => Presets;

    public static PastelThemePreset Get(int index)
    {
        var normalized = NormalizeIndex(index);
        return Presets[normalized];
    }

    public static int NormalizeIndex(int index)
    {
        if (index < 0)
            return 0;

        if (index < LegacyIndexMap.Length)
            return LegacyIndexMap[index];

        return Count - 1;
    }

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
