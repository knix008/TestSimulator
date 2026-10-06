namespace MyDiffWinV10.App.Services;

/// <summary>
/// Built-in pastel swatches and helpers for pane title bar colors.
/// </summary>
public static class PaneHeaderColorPalette
{
    public static Color DefaultLeftBackground { get; } = Color.FromArgb(220, 245, 210);

    public static Color DefaultRightBackground { get; } = Color.FromArgb(210, 235, 255);

    public static IReadOnlyList<Color> Colors { get; } =
    [
        Color.FromArgb(220, 245, 210),
        Color.FromArgb(210, 235, 255),
        Color.FromArgb(255, 228, 235),
        Color.FromArgb(255, 240, 210),
        Color.FromArgb(232, 224, 255),
        Color.FromArgb(210, 245, 240),
        Color.FromArgb(255, 232, 220),
        Color.FromArgb(240, 230, 255),
        Color.FromArgb(255, 248, 210),
        Color.FromArgb(215, 240, 255),
        Color.FromArgb(225, 250, 225),
        Color.FromArgb(255, 225, 240),
        Color.FromArgb(235, 245, 255),
        Color.FromArgb(245, 235, 220),
        Color.FromArgb(220, 255, 250),
        Color.FromArgb(255, 235, 225),
        Color.FromArgb(230, 255, 220),
        Color.FromArgb(225, 230, 255),
        Color.FromArgb(255, 245, 230),
        Color.FromArgb(200, 240, 255),
    ];

    public static int DefaultLeftArgb => DefaultLeftBackground.ToArgb();

    public static int DefaultRightArgb => DefaultRightBackground.ToArgb();

    public static Color HeaderTextForBackground(Color background) =>
        Color.FromArgb(
            ScaleTextChannel(background.R),
            ScaleTextChannel(background.G),
            ScaleTextChannel(background.B));

    public static bool IsPaletteColor(Color color) =>
        Colors.Any(entry => entry.ToArgb() == color.ToArgb());

    private static int ScaleTextChannel(int channel) =>
        Math.Clamp((channel * 2 + 55) / 3, 0, 255);
}
