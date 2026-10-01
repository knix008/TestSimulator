namespace MyDesktop.Services;

/// <summary>
/// The colours a fence can be painted with, in one place because two different screens offer them:
/// the fence's own menu and the settings window. They used to be written out twice, which is how a
/// colour ends up in one list and not the other.
///
/// Twenty of each, and neither list is a limit: both screens end with a "Custom…" entry that opens
/// the Windows colour picker, so any colour at all is one dialog away. The presets exist to make
/// the common case quick, not to fence the user in.
/// </summary>
public static class Palette
{
    /// <summary>
    /// Fence bodies. All dark, because a fence is a translucent panel laid over a wallpaper and a
    /// light one drowns the icons on it; the transparency setting decides how much of it shows.
    /// </summary>
    public static readonly (string Label, string Value)[] Backgrounds =
    [
        ("Forest", "#132B24"),
        ("Slate", "#1B232B"),
        ("Ink", "#131313"),
        ("Plum", "#251426"),
        ("Sand", "#2A2318"),
        ("Deep sea", "#0F2A2B"),
        ("Midnight", "#101A2E"),
        ("Espresso", "#241A14"),
        ("Moss", "#1A2A16"),
        ("Wine", "#2B1419"),
        ("Harbour", "#122533"),
        ("Aubergine", "#1E1630"),
        ("Charcoal", "#1E1E1E"),
        ("Pine", "#0E2219"),
        ("Rust", "#2E1D12"),
        ("Denim", "#17202F"),
        ("Olive", "#232616"),
        ("Cocoa", "#2A2020"),
        ("Teal night", "#0D2426"),
        ("Graphite", "#262A2D")
    ];

    /// <summary>
    /// The title strip and the border. Light enough to read a fence's name against its body.
    /// </summary>
    public static readonly (string Label, string Value)[] Accents =
    [
        ("Sage", "#A8CE6A"),
        ("Lime", "#D9F078"),
        ("Coral", "#E78F67"),
        ("Sea glass", "#69A9A0"),
        ("Marigold", "#D9B75E"),
        ("Periwinkle", "#8C9BD0"),
        ("Rose", "#D87983"),
        ("Sky", "#7FC4E8"),
        ("Mint", "#86D9AE"),
        ("Butter", "#EBD98B"),
        ("Apricot", "#F0B183"),
        ("Lavender", "#B3A4DE"),
        ("Cherry", "#E2697C"),
        ("Aqua", "#6FD3D0"),
        ("Fern", "#8FC97A"),
        ("Amber", "#E0A54B"),
        ("Orchid", "#CB8FD0"),
        ("Steel", "#9FB2C2"),
        ("Flame", "#E8795A"),
        ("Ice", "#CFE3F2")
    ];
}
