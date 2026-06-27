namespace DiffMergeWinV10.App.Controls;

internal static class PaneTheme
{
    public static readonly Color ZebraColor = Color.FromArgb(238, 241, 246);
    public static readonly Color RowColorEven = Color.White;
    public static readonly Color ConflictColor = Color.FromArgb(255, 244, 180);
    public static readonly Color ResolvedColor = Color.FromArgb(214, 245, 214);
    public static readonly Color ConflictListUnresolvedColor = Color.FromArgb(254, 226, 226);
    public static readonly Color ConflictListResolvedColor = Color.FromArgb(220, 252, 231);
    public static readonly Color SelectedConflictColor = Color.FromArgb(222, 234, 252);
    public static readonly Color GutterDividerColor = Color.FromArgb(226, 232, 240);
    public static readonly Color GutterTextColor = Color.FromArgb(100, 116, 139);

    public static Color ZebraForLine(int lineIndex) =>
        lineIndex % 2 == 0 ? RowColorEven : ZebraColor;
}
