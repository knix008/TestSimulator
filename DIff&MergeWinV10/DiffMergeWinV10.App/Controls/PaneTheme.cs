namespace DiffMergeWinV10.App.Controls;

internal static class PaneTheme
{
    public static readonly Color ZebraColor = Color.FromArgb(238, 241, 246);
    public static readonly Color RowColorEven = Color.White;
    public static readonly Color ConflictColor = Color.FromArgb(255, 228, 228);
    public static readonly Color ResolvedColor = Color.FromArgb(220, 252, 231);
    public static readonly Color ConflictListUnresolvedColor = ConflictColor;
    public static readonly Color ConflictListResolvedColor = ResolvedColor;
    public static readonly Color SelectedConflictColor = Color.FromArgb(222, 234, 252);
    public static readonly Color GutterDividerColor = Color.FromArgb(226, 232, 240);
    public static readonly Color GutterTextColor = Color.FromArgb(100, 116, 139);
    public static readonly Color GutterBackgroundColor = Color.FromArgb(248, 250, 252);

    public static Color ZebraForLine(int lineIndex) =>
        lineIndex % 2 == 0 ? RowColorEven : ZebraColor;

    public static Color ColorForConflict(bool unresolved) =>
        unresolved ? ConflictColor : ResolvedColor;

    public static Color PastelHeaderBackground(Color accent) =>
        Color.FromArgb(
            (accent.R + 255 * 4) / 5,
            (accent.G + 255 * 4) / 5,
            (accent.B + 255 * 4) / 5);
}
