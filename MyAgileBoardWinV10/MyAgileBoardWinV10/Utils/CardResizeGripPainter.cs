using System.Drawing.Drawing2D;

namespace MyAgileBoardWinV10.Utils;

/// <summary>카드 우측 하단 크기 조절 그립(대각선 줄무늬)을 그립니다.</summary>
public static class CardResizeGripPainter
{
    private const float LineStrength = 0.24f;

    public static void Paint(Graphics g, Rectangle bounds, Color cardColor)
    {
        if (bounds.Width < 8 || bounds.Height < 8) return;

        g.SmoothingMode = SmoothingMode.AntiAlias;

        using (var fill = new SolidBrush(cardColor))
            g.FillRectangle(fill, bounds);

        using var pen = new Pen(GetContrastColor(cardColor, LineStrength), 1f);
        int pad = 4;
        int step = 4;
        for (int i = 0; i < 3; i++)
        {
            int offset = pad + i * step;
            g.DrawLine(pen,
                bounds.Right - offset, bounds.Bottom - pad,
                bounds.Right - pad, bounds.Bottom - offset);
        }

        g.SmoothingMode = SmoothingMode.None;
    }

    private static Color GetContrastColor(Color cardColor, float strength)
    {
        bool light = GetLuminance(cardColor) > 0.55;
        return BlendColors(cardColor, light ? Color.Black : Color.White, strength);
    }

    private static double GetLuminance(Color color)
        => (0.299 * color.R + 0.587 * color.G + 0.114 * color.B) / 255.0;

    private static Color BlendColors(Color a, Color b, float t)
    {
        t = Math.Clamp(t, 0f, 1f);
        return Color.FromArgb(
            (int)(a.R + (b.R - a.R) * t),
            (int)(a.G + (b.G - a.G) * t),
            (int)(a.B + (b.B - a.B) * t));
    }
}
