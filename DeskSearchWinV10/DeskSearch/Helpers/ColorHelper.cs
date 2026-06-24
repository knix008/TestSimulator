using System.Windows.Media;
using DeskSearch.Models;
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

    public static bool IsDark(MediaColor color)
    {
        static double Linear(byte channel)
        {
            var value = channel / 255.0;
            return value <= 0.03928 ? value / 12.92 : Math.Pow((value + 0.055) / 1.055, 2.4);
        }

        var luminance = 0.2126 * Linear(color.R)
                        + 0.7152 * Linear(color.G)
                        + 0.0722 * Linear(color.B);
        return luminance < 0.45;
    }

    public readonly record struct ThemePalette(string TextColor, string SubTextColor, string BorderColor);

    public static ThemePalette GetPaletteForBackground(string backgroundColorHex) =>
        IsDark(ParseColor(backgroundColorHex))
            ? new ThemePalette("#F5F5F5", "#B0BEC5", "#44FFFFFF")
            : new ThemePalette("#222222", "#888888", "#33000000");

    public static ThemePalette ResolveDisplayColors(AppSettings settings)
    {
        var isDark = IsDark(ParseColor(settings.BackgroundColor));
        if (isDark)
        {
            return new ThemePalette(
                IsDark(ParseColor(settings.TextColor)) ? "#F5F5F5" : settings.TextColor,
                IsDark(ParseColor(settings.SubTextColor)) ? "#B0BEC5" : settings.SubTextColor,
                IsLowContrastBorderOnDark(settings.BorderColor) ? "#44FFFFFF" : settings.BorderColor);
        }

        return new ThemePalette(
            !IsDark(ParseColor(settings.TextColor)) ? settings.TextColor : "#222222",
            !IsDark(ParseColor(settings.SubTextColor)) ? settings.SubTextColor : "#888888",
            settings.BorderColor);
    }

    public static void SyncThemeTextColors(AppSettings settings)
    {
        var palette = GetPaletteForBackground(settings.BackgroundColor);
        settings.TextColor = palette.TextColor;
        settings.SubTextColor = palette.SubTextColor;
        settings.BorderColor = palette.BorderColor;
    }

    private static bool IsLowContrastBorderOnDark(string borderHex)
    {
        var color = ParseColor(borderHex);
        return IsDark(color) || color.A < 64;
    }
}
