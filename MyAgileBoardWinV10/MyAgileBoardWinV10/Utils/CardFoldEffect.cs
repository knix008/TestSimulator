using System.Drawing.Drawing2D;

namespace MyAgileBoardWinV10.Utils;

/// <summary>카드 우측 상단 종이 접힘(도그이어) 효과.</summary>
public static class CardFoldEffect
{
    public const int DefaultFoldSize = 28;

    public static void DrawTopRightFold(Graphics g, Rectangle bounds, Color baseColor, int foldSize = DefaultFoldSize)
    {
        if (bounds.Width < 8 || bounds.Height < 8) return;

        int maxFold = Math.Min(bounds.Width, bounds.Height) / 2;
        if (maxFold < 4) return;

        int fold = Math.Clamp(foldSize, 4, maxFold);
        var previousSmoothing = g.SmoothingMode;
        g.SmoothingMode = SmoothingMode.AntiAlias;

        int xL = bounds.Right - fold;
        int yT = bounds.Top;
        int xR = bounds.Right - 1;
        int yB = bounds.Top + fold;

        // 접힘 영역 전체를 카드색으로 덮어 아래 레이블 글자·배경이 비치지 않게 합니다.
        using (var cornerMask = new SolidBrush(baseColor))
            g.FillRectangle(cornerMask, xL, yT, fold, fold);

        var foldTop = new Point(xL, yT);
        var foldInner = new Point(xL, yB);
        var foldOuter = new Point(xR, yB);
        var cornerTop = new Point(xR, yT);

        using (var peelShadow = new SolidBrush(BlendColors(baseColor, Color.FromArgb(120, 50, 40, 30), 0.6f)))
            g.FillPolygon(peelShadow, [foldTop, cornerTop, foldOuter]);

        var underside = GetUndersideColor(baseColor);
        using (var undersideBrush = new SolidBrush(underside))
            g.FillPolygon(undersideBrush, [foldTop, foldInner, foldOuter]);

        using (var path = new GraphicsPath())
        {
            path.AddPolygon([foldTop, foldInner, foldOuter]);
            using var sheen = new LinearGradientBrush(
                new Rectangle(xL - 1, yT, fold + 2, fold + 2),
                Color.FromArgb(100, 255, 255, 255),
                Color.FromArgb(20, 255, 250, 230),
                LinearGradientMode.ForwardDiagonal);
            g.FillPath(sheen, path);
        }

        using (var creaseDark = new Pen(Color.FromArgb(150, 20, 18, 14), 1.5f))
            g.DrawLine(creaseDark, foldTop, foldOuter);
        using (var creaseLight = new Pen(Color.FromArgb(130, 255, 255, 255), 1.2f))
            g.DrawLine(creaseLight, foldTop.X + 1, foldTop.Y + 1, foldOuter.X - 1, foldOuter.Y - 1);

        using (var edgeShadow = new Pen(Color.FromArgb(110, 30, 28, 24), 1.2f))
            g.DrawLine(edgeShadow, foldInner, foldOuter);
        using (var edgeHi = new Pen(Color.FromArgb(140, 255, 255, 255), 1f))
        {
            g.DrawLine(edgeHi, foldTop, cornerTop);
            g.DrawLine(edgeHi, foldInner.X + 1, foldInner.Y, foldOuter.X, foldOuter.Y - 1);
        }

        g.SmoothingMode = previousSmoothing;
    }

    private static Color GetUndersideColor(Color baseColor)
    {
        var paperBack = Color.FromArgb(248, 232, 190);
        return BlendColors(baseColor, paperBack, 0.65f);
    }

    private static Color BlendColors(Color a, Color b, float t)
    {
        t = Math.Clamp(t, 0f, 1f);
        return Color.FromArgb(
            (int)(a.R + (b.R - a.R) * t),
            (int)(a.G + (b.G - a.G) * t),
            (int)(a.B + (b.B - a.B) * t));
    }
}
