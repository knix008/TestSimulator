using System.Windows.Media;
using MediaColor = System.Windows.Media.Color;

namespace DeskSearch.Helpers;

public static class ColorHelper
{
    public static MediaColor ParseColor(string hex)
    {
        if (string.IsNullOrWhiteSpace(hex))
            return Colors.White;

        var value = hex.Trim();
        if (!value.StartsWith('#'))
            value = "#" + value;

        return (MediaColor)System.Windows.Media.ColorConverter.ConvertFromString(value)!;
    }

    public static SolidColorBrush ToBrush(string hex, byte? alpha = null)
    {
        var color = ParseColor(hex);
        if (alpha.HasValue)
            color = MediaColor.FromArgb(alpha.Value, color.R, color.G, color.B);

        var brush = new SolidColorBrush(color);
        brush.Freeze();
        return brush;
    }

    public static string ToHex(MediaColor color) =>
        $"#{color.R:X2}{color.G:X2}{color.B:X2}";

    public static MediaColor WithOpacity(MediaColor color, int opacityPercent)
    {
        var alpha = (byte)Math.Clamp(opacityPercent * 255 / 100, 0, 255);
        return MediaColor.FromArgb(alpha, color.R, color.G, color.B);
    }
}
