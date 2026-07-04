namespace MyDiffWinV10.App.Controls;

using MyDiffWinV10.App.Core;
using MyDiffWinV10.App.Services;

internal static class PaneTheme
{
    public static readonly Color ZebraColor = Color.FromArgb(238, 241, 246);
    public static readonly Color RowColorEven = Color.White;
    public static readonly Color RemovedColor = Color.FromArgb(255, 228, 228);
    public static readonly Color AddedColor = Color.FromArgb(220, 252, 231);
    public static readonly Color ModifiedColor = Color.FromArgb(255, 243, 205);
    public static readonly Color SelectedAccentColor = Color.FromArgb(222, 234, 252);
    public static readonly Color GutterDividerColor = Color.FromArgb(226, 232, 240);
    public static readonly Color GutterTextColor = Color.FromArgb(100, 116, 139);
    public static readonly Color GutterBackgroundColor = Color.FromArgb(248, 250, 252);

    // Saturated variants used by DiffOverviewBar — the pastel pane-row colors above are too
    // faint to read on a 14px-wide strip.
    public static readonly Color RemovedAccent = Color.FromArgb(239, 68, 68);
    public static readonly Color AddedAccent = Color.FromArgb(34, 197, 94);
    public static readonly Color ModifiedAccent = Color.FromArgb(245, 158, 11);
    public static readonly Color BinaryDiffTextColor = Color.FromArgb(185, 28, 28);
    public static readonly Color OverviewBackgroundColor = Color.FromArgb(248, 250, 252);
    public static readonly Color OverviewViewportColor = Color.FromArgb(100, 116, 139);

    public static Color ZebraForLine(int lineIndex) =>
        lineIndex % 2 == 0 ? RowColorEven : ZebraColor;

    public static Color RowBackColor(DiffLineKind kind, int lineIndex) =>
        kind switch
        {
            DiffLineKind.Added => AddedColor,
            DiffLineKind.Removed => RemovedColor,
            DiffLineKind.Modified => ModifiedColor,
            _ => ZebraForLine(lineIndex),
        };

    public static (Color Background, Color Text) HeaderColors(bool isLeft, AppSettings settings)
    {
        Color background = Color.FromArgb(
            isLeft ? settings.LeftPaneHeaderColorArgb : settings.RightPaneHeaderColorArgb);
        return (background, PaneHeaderColorPalette.HeaderTextForBackground(background));
    }
}
