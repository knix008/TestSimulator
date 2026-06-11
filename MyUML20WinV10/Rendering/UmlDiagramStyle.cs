using System.Drawing.Drawing2D;

namespace MyUML20WinV10.Rendering;

public enum UmlThemeKind { Default, Blue, Green, Purple, Warm, Teal, Sunset, Ocean, Rose }

public static class UmlDiagramStyle
{
    public static UmlThemeKind CurrentTheme { get; set; } = UmlThemeKind.Default;

    // When true, DrawStyled* / Fill* methods skip fills and shadows (toolbox silhouette mode).
    public static bool SilhouetteMode { get; set; } = false;

    public static readonly SizeF ShadowOffset = new(3f, 3f);

    public static Color ShadowColor => Color.FromArgb(42, 0, 0, 0);

    public static Color BorderColor => CurrentTheme switch
    {
        UmlThemeKind.Blue   => Color.FromArgb(30, 64, 175),
        UmlThemeKind.Green  => Color.FromArgb(22, 101, 52),
        UmlThemeKind.Purple => Color.FromArgb(126, 34, 206),
        UmlThemeKind.Warm   => Color.FromArgb(180, 83, 9),
        UmlThemeKind.Teal   => Color.FromArgb(15, 118, 110),
        UmlThemeKind.Sunset => Color.FromArgb(185, 50, 30),
        UmlThemeKind.Ocean  => Color.FromArgb(7, 89, 133),
        UmlThemeKind.Rose   => Color.FromArgb(159, 18, 57),
        _                   => Color.FromArgb(72, 72, 72),
    };

    public static Color SelectionBorderColor => Color.FromArgb(30, 136, 229);

    public static Color GradientTop => CurrentTheme switch
    {
        UmlThemeKind.Blue   => Color.FromArgb(238, 244, 255),
        UmlThemeKind.Green  => Color.FromArgb(240, 253, 244),
        UmlThemeKind.Purple => Color.FromArgb(250, 245, 255),
        UmlThemeKind.Warm   => Color.FromArgb(255, 247, 237),
        UmlThemeKind.Teal   => Color.FromArgb(240, 253, 250),
        UmlThemeKind.Sunset => Color.FromArgb(255, 247, 237),
        UmlThemeKind.Ocean  => Color.FromArgb(240, 249, 255),
        UmlThemeKind.Rose   => Color.FromArgb(255, 241, 245),
        _                   => Color.FromArgb(255, 252, 248, 238),
    };

    public static Color GradientBottom => CurrentTheme switch
    {
        UmlThemeKind.Blue   => Color.FromArgb(200, 220, 255),
        UmlThemeKind.Green  => Color.FromArgb(187, 247, 208),
        UmlThemeKind.Purple => Color.FromArgb(233, 213, 255),
        UmlThemeKind.Warm   => Color.FromArgb(254, 215, 170),
        UmlThemeKind.Teal   => Color.FromArgb(153, 246, 228),
        UmlThemeKind.Sunset => Color.FromArgb(253, 186, 116),
        UmlThemeKind.Ocean  => Color.FromArgb(186, 230, 253),
        UmlThemeKind.Rose   => Color.FromArgb(251, 207, 232),
        _                   => Color.FromArgb(232, 220, 198),
    };

    public static Color TextColor => CurrentTheme switch
    {
        UmlThemeKind.Blue   => Color.FromArgb(26, 32, 64),
        UmlThemeKind.Green  => Color.FromArgb(20, 83, 45),
        UmlThemeKind.Purple => Color.FromArgb(59, 7, 100),
        UmlThemeKind.Warm   => Color.FromArgb(120, 53, 15),
        UmlThemeKind.Teal   => Color.FromArgb(19, 78, 74),
        UmlThemeKind.Sunset => Color.FromArgb(124, 45, 18),
        UmlThemeKind.Ocean  => Color.FromArgb(7, 89, 133),
        UmlThemeKind.Rose   => Color.FromArgb(136, 19, 55),
        _                   => Color.FromArgb(32, 32, 32),
    };

    public static Color NoteGradientTop => CurrentTheme switch
    {
        UmlThemeKind.Blue   => Color.FromArgb(239, 246, 255),
        UmlThemeKind.Green  => Color.FromArgb(236, 253, 245),
        UmlThemeKind.Purple => Color.FromArgb(253, 244, 255),
        UmlThemeKind.Warm   => Color.FromArgb(255, 251, 235),
        UmlThemeKind.Teal   => Color.FromArgb(236, 253, 245),
        UmlThemeKind.Sunset => Color.FromArgb(255, 247, 237),
        UmlThemeKind.Ocean  => Color.FromArgb(240, 249, 255),
        UmlThemeKind.Rose   => Color.FromArgb(255, 241, 245),
        _                   => Color.FromArgb(255, 255, 252, 220),
    };

    public static Color NoteGradientBottom => CurrentTheme switch
    {
        UmlThemeKind.Blue   => Color.FromArgb(191, 219, 254),
        UmlThemeKind.Green  => Color.FromArgb(167, 243, 208),
        UmlThemeKind.Purple => Color.FromArgb(245, 208, 254),
        UmlThemeKind.Warm   => Color.FromArgb(253, 230, 138),
        UmlThemeKind.Teal   => Color.FromArgb(167, 243, 208),
        UmlThemeKind.Sunset => Color.FromArgb(253, 186, 116),
        UmlThemeKind.Ocean  => Color.FromArgb(186, 230, 253),
        UmlThemeKind.Rose   => Color.FromArgb(251, 207, 232),
        _                   => Color.FromArgb(255, 238, 170),
    };

    public static Color CanvasBackground => CurrentTheme switch
    {
        UmlThemeKind.Blue   => Color.FromArgb(240, 244, 255),
        UmlThemeKind.Green  => Color.FromArgb(240, 255, 244),
        UmlThemeKind.Purple => Color.FromArgb(250, 245, 255),
        UmlThemeKind.Warm   => Color.FromArgb(255, 248, 240),
        UmlThemeKind.Teal   => Color.FromArgb(240, 253, 250),
        UmlThemeKind.Sunset => Color.FromArgb(255, 246, 236),
        UmlThemeKind.Ocean  => Color.FromArgb(236, 248, 255),
        UmlThemeKind.Rose   => Color.FromArgb(255, 240, 245),
        _                   => Color.FromArgb(245, 245, 245),
    };

    public static Color GridMinorColor => Color.FromArgb(22, 0, 0, 0);

    public static Color GridMajorColor => Color.FromArgb(46, 0, 0, 0);

    public static Color PreviewFillColor => CurrentTheme switch
    {
        UmlThemeKind.Blue   => Color.FromArgb(219, 234, 254),
        UmlThemeKind.Green  => Color.FromArgb(209, 250, 229),
        UmlThemeKind.Purple => Color.FromArgb(243, 232, 255),
        UmlThemeKind.Warm   => Color.FromArgb(254, 235, 200),
        UmlThemeKind.Teal   => Color.FromArgb(204, 251, 241),
        UmlThemeKind.Sunset => Color.FromArgb(254, 215, 170),
        UmlThemeKind.Ocean  => Color.FromArgb(186, 230, 253),
        UmlThemeKind.Rose   => Color.FromArgb(251, 207, 232),
        _                   => Color.FromArgb(237, 233, 254),
    };

    public static Color PreviewStrokeColor => CurrentTheme switch
    {
        UmlThemeKind.Blue   => Color.FromArgb(29, 78, 216),
        UmlThemeKind.Green  => Color.FromArgb(5, 150, 105),
        UmlThemeKind.Purple => Color.FromArgb(147, 51, 234),
        UmlThemeKind.Warm   => Color.FromArgb(194, 65, 12),
        UmlThemeKind.Teal   => Color.FromArgb(13, 148, 136),
        UmlThemeKind.Sunset => Color.FromArgb(185, 50, 30),
        UmlThemeKind.Ocean  => Color.FromArgb(7, 89, 133),
        UmlThemeKind.Rose   => Color.FromArgb(159, 18, 57),
        _                   => Color.FromArgb(79, 70, 229),
    };

    public static string GetThemeDisplayName(UmlThemeKind theme) => theme switch
    {
        UmlThemeKind.Blue   => "블루",
        UmlThemeKind.Green  => "그린",
        UmlThemeKind.Purple => "퍼플",
        UmlThemeKind.Warm   => "웜",
        UmlThemeKind.Teal   => "틸",
        UmlThemeKind.Sunset => "선셋",
        UmlThemeKind.Ocean  => "오션",
        UmlThemeKind.Rose   => "로즈",
        _                   => "기본",
    };

    public const float BorderWidthNormal = 1f;
    public const float EdgeWidthNormal = 1.25f;
    public const float SelectionBorderWidth = 2f;
    public const float PreviewPenWidth = 1.5f;
    public const float PreviewPenWidthBold = 1.6f;

    public static Pen CreateBorderPen(bool selected, float width = BorderWidthNormal) =>
        new(selected ? SelectionBorderColor : BorderColor, selected ? SelectionBorderWidth : width);

    public static Pen CreateEdgePen(bool selected) =>
        new(selected ? SelectionBorderColor : BorderColor, selected ? SelectionBorderWidth : EdgeWidthNormal);

    public static LinearGradientBrush CreateVerticalGradientBrush(RectangleF bounds, Color? top = null, Color? bottom = null)
    {
        var rect = Rectangle.Round(NormalizeGradientBounds(bounds));
        return new LinearGradientBrush(rect, top ?? GradientTop, bottom ?? GradientBottom, LinearGradientMode.Vertical);
    }

    public static void DrawShadow(Graphics g, RectangleF bounds)
    {
        if (SilhouetteMode) return;
        var shadow = Offset(bounds, ShadowOffset);
        using var brush = new SolidBrush(ShadowColor);
        g.FillRectangle(brush, shadow.X, shadow.Y, shadow.Width, shadow.Height);
    }

    public static void DrawShadowPath(Graphics g, GraphicsPath path)
    {
        if (SilhouetteMode) return;
        using var matrix = new Matrix();
        matrix.Translate(ShadowOffset.Width, ShadowOffset.Height);
        using var shadowPath = (GraphicsPath)path.Clone();
        shadowPath.Transform(matrix);
        using var brush = new SolidBrush(ShadowColor);
        g.FillPath(brush, shadowPath);
    }

    public static void FillGradientRectangle(Graphics g, RectangleF bounds, Color? top = null, Color? bottom = null)
    {
        if (SilhouetteMode) return;
        if (bounds.Width <= 0f || bounds.Height <= 0f)
            return;

        using var brush = CreateVerticalGradientBrush(bounds, top, bottom);
        g.FillRectangle(brush, bounds);
    }

    public static void FillGradientPath(Graphics g, GraphicsPath path, RectangleF bounds, Color? top = null, Color? bottom = null)
    {
        if (SilhouetteMode) return;
        using var brush = CreateVerticalGradientBrush(bounds, top, bottom);
        g.FillPath(brush, path);
    }

    public static void DrawStyledRectangle(Graphics g, RectangleF bounds, Pen pen, Color? top = null, Color? bottom = null)
    {
        DrawShadow(g, bounds);
        FillGradientRectangle(g, bounds, top, bottom);
        g.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
    }

    public static void DrawStyledRoundedRect(Graphics g, RectangleF bounds, Pen pen, float radius, Color? top = null, Color? bottom = null)
    {
        using var path = CreateRoundedPath(bounds, radius);
        DrawShadowPath(g, path);
        FillGradientPath(g, path, bounds, top, bottom);
        g.DrawPath(pen, path);
    }

    public static void DrawStyledEllipse(Graphics g, RectangleF bounds, Pen pen, Color? top = null, Color? bottom = null)
    {
        if (!SilhouetteMode)
        {
            var shadow = Offset(bounds, ShadowOffset);
            using var shadowBrush = new SolidBrush(ShadowColor);
            g.FillEllipse(shadowBrush, shadow.X, shadow.Y, shadow.Width, shadow.Height);
            using var brush = CreateVerticalGradientBrush(bounds, top, bottom);
            g.FillEllipse(brush, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        }
        g.DrawEllipse(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
    }

    public static Color Lighten(Color color, float amount)
    {
        amount = Math.Clamp(amount, 0f, 1f);
        return Color.FromArgb(
            color.A,
            (int)(color.R + (255 - color.R) * amount),
            (int)(color.G + (255 - color.G) * amount),
            (int)(color.B + (255 - color.B) * amount));
    }

    public static Color Darken(Color color, float amount)
    {
        amount = Math.Clamp(amount, 0f, 1f);
        return Color.FromArgb(
            color.A,
            (int)(color.R * (1f - amount)),
            (int)(color.G * (1f - amount)),
            (int)(color.B * (1f - amount)));
    }

    public static GraphicsPath CreateRoundedPath(RectangleF bounds, float radius)
    {
        var path = new GraphicsPath();
        var r = Math.Max(0f, Math.Min(radius, Math.Min(bounds.Width, bounds.Height) / 2f));
        if (r <= 0.01f)
        {
            path.AddRectangle(bounds);
            return path;
        }

        var d = r * 2f;
        path.AddArc(bounds.Left, bounds.Top, d, d, 180, 90);
        path.AddArc(bounds.Right - d, bounds.Top, d, d, 270, 90);
        path.AddArc(bounds.Right - d, bounds.Bottom - d, d, d, 0, 90);
        path.AddArc(bounds.Left, bounds.Bottom - d, d, d, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static RectangleF Offset(RectangleF bounds, SizeF offset) =>
        new(bounds.X + offset.Width, bounds.Y + offset.Height, bounds.Width, bounds.Height);

    private static RectangleF NormalizeGradientBounds(RectangleF bounds)
    {
        if (bounds.Width < 1f)
            bounds.Width = 1f;
        if (bounds.Height < 1f)
            bounds.Height = 1f;
        return bounds;
    }
}
