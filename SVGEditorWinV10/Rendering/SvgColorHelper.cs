using System.Globalization;

namespace SVGEditorWinV10.Rendering;

public static class SvgColorHelper
{
    public static float ClampOpacity(float opacity) => Math.Clamp(opacity, 0f, 1f);

    public static Color GetRgbColor(int colorArgb)
    {
        var color = Color.FromArgb(colorArgb);
        return Color.FromArgb(255, color.R, color.G, color.B);
    }

    public static int ToOpaqueArgb(Color color) =>
        Color.FromArgb(255, color.R, color.G, color.B).ToArgb();

    public static Color WithOpacity(int colorArgb, float opacity)
    {
        var rgb = GetRgbColor(colorArgb);
        var alpha = (int)Math.Round(ClampOpacity(opacity) * 255f);
        return Color.FromArgb(alpha, rgb.R, rgb.G, rgb.B);
    }

    public static string GetOpacityAttribute(string attributeName, float opacity)
    {
        if (opacity >= 0.999f)
            return string.Empty;

        return $""" {attributeName}="{opacity.ToString("0.##", CultureInfo.InvariantCulture)}" """;
    }
}
