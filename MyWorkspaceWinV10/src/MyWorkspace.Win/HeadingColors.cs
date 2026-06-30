namespace MyWorkspace.Win;

internal static class HeadingColors
{
    // Keep in sync with tools/IconGenerator/IconDrawing.cs heading icon colors.
    public static Color Get(int level) => level switch
    {
        1 => Color.FromArgb(196, 30, 30),
        2 => Color.FromArgb(16, 130, 58),
        3 => Color.FromArgb(24, 82, 200),
        4 => Color.FromArgb(115, 45, 200),
        5 => Color.FromArgb(200, 95, 10),
        6 => Color.FromArgb(75, 85, 99),
        _ => Color.FromArgb(75, 85, 99)
    };

    public static Color GetForDarkToolbar(int level) => level switch
    {
        1 => Color.FromArgb(248, 113, 113),
        2 => Color.FromArgb(74, 222, 128),
        3 => Color.FromArgb(96, 165, 250),
        4 => Color.FromArgb(192, 132, 252),
        5 => Color.FromArgb(251, 146, 60),
        6 => Color.FromArgb(148, 163, 184),
        _ => Color.FromArgb(148, 163, 184)
    };

    public static string ToCss(int level)
    {
        var color = Get(level);
        return $"#{color.R:X2}{color.G:X2}{color.B:X2}";
    }
}
