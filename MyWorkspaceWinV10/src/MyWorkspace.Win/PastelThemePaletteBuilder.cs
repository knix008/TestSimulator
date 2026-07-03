namespace MyWorkspace.Win;

internal static class PastelThemePaletteBuilder
{
    public static ThemePalette Build(Color pastelAccent, bool dark) =>
        dark ? BuildDark(pastelAccent) : BuildLight(pastelAccent);

    private static ThemePalette BuildLight(Color pastel)
    {
        var accent = DeriveAccent(pastel, dark: false);
        var accentHover = Mix(pastel, Color.White, 0.35f);
        var accentPressed = Mix(accent, Color.Black, 0.12f);
        var sidebar = Mix(pastel, Color.White, 0.72f);

        return new ThemePalette
        {
            Background = Mix(pastel, Color.White, 0.90f),
            Surface = Color.White,
            Sidebar = sidebar,
            Border = Mix(pastel, Color.FromArgb(154, 163, 176), 0.48f),
            BorderLight = Mix(pastel, Color.FromArgb(186, 193, 203), 0.38f),
            TextPrimary = Color.FromArgb(31, 35, 40),
            TextSecondary = Color.FromArgb(87, 96, 106),
            TextMuted = Color.FromArgb(140, 149, 159),
            Accent = accent,
            AccentHover = accentHover,
            AccentPressed = accentPressed,
            AccentHoverButton = Darken(accent, 0.08f),
            AccentPressedButton = Darken(accent, 0.16f),
            Success = Color.FromArgb(26, 127, 55),
            Warning = Color.FromArgb(191, 87, 0),
            Danger = Color.FromArgb(207, 34, 46),
            EditorBackground = sidebar,
            EditorText = Color.Black,
            EditorCaret = accent,
            EditorPlaceholder = Color.FromArgb(140, 149, 159),
            EditorFocusRing = accent,
            EditorCodeBackground = Mix(pastel, Color.FromArgb(231, 235, 241), 0.42f),
            PanelHeaderWorkspace = Mix(pastel, Color.White, 0.45f),
            PanelHeaderOutline = Mix(pastel, Color.FromArgb(209, 250, 229), 0.35f),
            PanelHeaderEditor = Mix(pastel, Color.FromArgb(237, 233, 254), 0.35f),
            PanelHeaderPageTitle = Mix(pastel, Color.FromArgb(254, 243, 199), 0.35f)
        };
    }

    private static ThemePalette BuildDark(Color pastel)
    {
        var accent = DeriveAccent(pastel, dark: true);
        var accentHover = Mix(pastel, Color.FromArgb(22, 27, 34), 0.72f);
        var accentPressed = Mix(accent, Color.Black, 0.18f);
        var background = Mix(pastel, Color.FromArgb(13, 17, 23), 0.88f);
        var surface = Mix(pastel, Color.FromArgb(22, 27, 34), 0.82f);
        var sidebar = Mix(pastel, Color.FromArgb(13, 17, 23), 0.90f);

        return new ThemePalette
        {
            Background = background,
            Surface = surface,
            Sidebar = sidebar,
            Border = Mix(pastel, Color.FromArgb(48, 54, 61), 0.55f),
            BorderLight = Mix(pastel, Color.FromArgb(33, 38, 45), 0.65f),
            TextPrimary = Color.FromArgb(230, 237, 243),
            TextSecondary = Color.FromArgb(139, 148, 158),
            TextMuted = Color.FromArgb(110, 118, 129),
            Accent = accent,
            AccentHover = accentHover,
            AccentPressed = accentPressed,
            AccentHoverButton = Lighten(accent, 0.10f),
            AccentPressedButton = Lighten(accent, 0.18f),
            Success = Color.FromArgb(63, 185, 80),
            Warning = Color.FromArgb(210, 153, 34),
            Danger = Color.FromArgb(248, 81, 73),
            EditorBackground = sidebar,
            EditorText = Color.FromArgb(230, 237, 243),
            EditorCaret = Color.FromArgb(230, 237, 243),
            EditorPlaceholder = Color.FromArgb(110, 118, 129),
            EditorFocusRing = accent,
            EditorCodeBackground = Mix(pastel, Color.FromArgb(33, 38, 45), 0.70f),
            PanelHeaderWorkspace = Mix(pastel, Color.FromArgb(37, 52, 73), 0.55f),
            PanelHeaderOutline = Mix(pastel, Color.FromArgb(26, 60, 52), 0.55f),
            PanelHeaderEditor = Mix(pastel, Color.FromArgb(52, 44, 82), 0.55f),
            PanelHeaderPageTitle = Mix(pastel, Color.FromArgb(72, 56, 32), 0.55f)
        };
    }

    private static Color DeriveAccent(Color pastel, bool dark)
    {
        var (h, s, l) = RgbToHsl(pastel);
        var targetLightness = dark ? 0.68f : 0.42f;
        var targetSaturation = Math.Clamp(s + 0.18f, 0.35f, 0.82f);
        return HslToRgb(h, targetSaturation, targetLightness);
    }

    private static Color Mix(Color a, Color b, float amountB)
    {
        amountB = Math.Clamp(amountB, 0f, 1f);
        var amountA = 1f - amountB;
        return Color.FromArgb(
            255,
            (int)(a.R * amountA + b.R * amountB),
            (int)(a.G * amountA + b.G * amountB),
            (int)(a.B * amountA + b.B * amountB));
    }

    private static Color Darken(Color color, float amount) =>
        Mix(color, Color.Black, Math.Clamp(amount, 0f, 1f));

    private static Color Lighten(Color color, float amount) =>
        Mix(color, Color.White, Math.Clamp(amount, 0f, 1f));

    private static (float H, float S, float L) RgbToHsl(Color color)
    {
        var r = color.R / 255f;
        var g = color.G / 255f;
        var b = color.B / 255f;
        var max = Math.Max(r, Math.Max(g, b));
        var min = Math.Min(r, Math.Min(g, b));
        var l = (max + min) / 2f;

        if (Math.Abs(max - min) < 0.0001f)
            return (0f, 0f, l);

        var d = max - min;
        var s = l > 0.5f ? d / (2f - max - min) : d / (max + min);
        float h;
        if (Math.Abs(max - r) < 0.0001f)
            h = ((g - b) / d + (g < b ? 6f : 0f)) / 6f;
        else if (Math.Abs(max - g) < 0.0001f)
            h = ((b - r) / d + 2f) / 6f;
        else
            h = ((r - g) / d + 4f) / 6f;

        return (h, s, l);
    }

    private static Color HslToRgb(float h, float s, float l)
    {
        if (s <= 0.0001f)
        {
            var gray = (int)(l * 255f);
            return Color.FromArgb(gray, gray, gray);
        }

        float HueToRgb(float p, float q, float t)
        {
            if (t < 0f)
                t += 1f;
            if (t > 1f)
                t -= 1f;
            if (t < 1f / 6f)
                return p + (q - p) * 6f * t;
            if (t < 1f / 2f)
                return q;
            if (t < 2f / 3f)
                return p + (q - p) * (2f / 3f - t) * 6f;
            return p;
        }

        var q = l < 0.5f ? l * (1f + s) : l + s - l * s;
        var p = 2f * l - q;
        var r = HueToRgb(p, q, h + 1f / 3f);
        var g = HueToRgb(p, q, h);
        var b = HueToRgb(p, q, h - 1f / 3f);
        return Color.FromArgb(
            (int)(r * 255f),
            (int)(g * 255f),
            (int)(b * 255f));
    }
}
