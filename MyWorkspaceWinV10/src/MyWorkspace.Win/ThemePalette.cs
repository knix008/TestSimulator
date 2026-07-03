namespace MyWorkspace.Win;

internal sealed class ThemePalette
{
    public required Color Background { get; init; }
    public required Color Surface { get; init; }
    public required Color Sidebar { get; init; }
    public required Color Border { get; init; }
    public required Color BorderLight { get; init; }
    public required Color TextPrimary { get; init; }
    public required Color TextSecondary { get; init; }
    public required Color TextMuted { get; init; }
    public required Color Accent { get; init; }
    public required Color AccentHover { get; init; }
    public required Color AccentPressed { get; init; }
    public required Color AccentHoverButton { get; init; }
    public required Color AccentPressedButton { get; init; }
    public required Color Success { get; init; }
    public required Color Warning { get; init; }
    public required Color Danger { get; init; }
    public required Color EditorBackground { get; init; }
    public required Color EditorText { get; init; }
    public required Color EditorCaret { get; init; }
    public required Color EditorPlaceholder { get; init; }
    public required Color EditorFocusRing { get; init; }
    public required Color EditorCodeBackground { get; init; }
    public required Color PanelHeaderWorkspace { get; init; }
    public required Color PanelHeaderOutline { get; init; }
    public required Color PanelHeaderEditor { get; init; }
    public required Color PanelHeaderPageTitle { get; init; }

    public static ThemePalette Light { get; } = new()
    {
        Background = Color.FromArgb(246, 248, 250),
        Surface = Color.White,
        Sidebar = Color.FromArgb(246, 248, 250),
        Border = Color.FromArgb(154, 163, 176),
        BorderLight = Color.FromArgb(186, 193, 203),
        TextPrimary = Color.FromArgb(31, 35, 40),
        TextSecondary = Color.FromArgb(87, 96, 106),
        TextMuted = Color.FromArgb(140, 149, 159),
        Accent = Color.FromArgb(9, 105, 218),
        AccentHover = Color.FromArgb(218, 232, 252),
        AccentPressed = Color.FromArgb(191, 219, 254),
        AccentHoverButton = Color.FromArgb(7, 90, 186),
        AccentPressedButton = Color.FromArgb(6, 76, 158),
        Success = Color.FromArgb(26, 127, 55),
        Warning = Color.FromArgb(191, 87, 0),
        Danger = Color.FromArgb(207, 34, 46),
        EditorBackground = Color.FromArgb(246, 248, 250),
        EditorText = Color.Black,
        EditorCaret = Color.FromArgb(9, 105, 218),
        EditorPlaceholder = Color.FromArgb(140, 149, 159),
        EditorFocusRing = Color.FromArgb(9, 105, 218),
        EditorCodeBackground = Color.FromArgb(231, 235, 241),
        PanelHeaderWorkspace = Color.FromArgb(219, 234, 254),
        PanelHeaderOutline = Color.FromArgb(209, 250, 229),
        PanelHeaderEditor = Color.FromArgb(237, 233, 254),
        PanelHeaderPageTitle = Color.FromArgb(254, 243, 199)
    };

    public static ThemePalette Dark { get; } = new()
    {
        Background = Color.FromArgb(13, 17, 23),
        Surface = Color.FromArgb(22, 27, 34),
        Sidebar = Color.FromArgb(13, 17, 23),
        Border = Color.FromArgb(48, 54, 61),
        BorderLight = Color.FromArgb(33, 38, 45),
        TextPrimary = Color.FromArgb(230, 237, 243),
        TextSecondary = Color.FromArgb(139, 148, 158),
        TextMuted = Color.FromArgb(110, 118, 129),
        Accent = Color.FromArgb(47, 129, 247),
        AccentHover = Color.FromArgb(38, 56, 82),
        AccentPressed = Color.FromArgb(48, 68, 98),
        AccentHoverButton = Color.FromArgb(56, 139, 253),
        AccentPressedButton = Color.FromArgb(31, 111, 235),
        Success = Color.FromArgb(63, 185, 80),
        Warning = Color.FromArgb(210, 153, 34),
        Danger = Color.FromArgb(248, 81, 73),
        EditorBackground = Color.FromArgb(13, 17, 23),
        EditorText = Color.FromArgb(230, 237, 243),
        EditorCaret = Color.FromArgb(230, 237, 243),
        EditorPlaceholder = Color.FromArgb(110, 118, 129),
        EditorFocusRing = Color.FromArgb(47, 129, 247),
        EditorCodeBackground = Color.FromArgb(33, 38, 45),
        PanelHeaderWorkspace = Color.FromArgb(37, 52, 73),
        PanelHeaderOutline = Color.FromArgb(26, 60, 52),
        PanelHeaderEditor = Color.FromArgb(52, 44, 82),
        PanelHeaderPageTitle = Color.FromArgb(72, 56, 32)
    };
}
