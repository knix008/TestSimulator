using System.Drawing.Drawing2D;
using SVGEditorWinV10.Models;

namespace SVGEditorWinV10.Ui;

/// <summary>
/// Hooks owner-draw rendering onto ComboBox controls that display
/// StrokeLineStyle or LineMarkerStyle options visually.
/// </summary>
public static class StrokeComboRenderer
{
    private const int ItemHeight = 26;
    private static readonly Color InkColor = Color.FromArgb(32, 32, 32);

    // ──────────────────────────────────────────────
    // Public setup methods
    // ──────────────────────────────────────────────

    public static void AttachLineStyle(ComboBox combo)
    {
        combo.DrawMode = DrawMode.OwnerDrawFixed;
        combo.ItemHeight = ItemHeight;
        combo.DrawItem += DrawLineStyleItem;
    }

    public static void AttachMarker(ComboBox combo)
    {
        combo.DrawMode = DrawMode.OwnerDrawFixed;
        combo.ItemHeight = ItemHeight;
        combo.DrawItem += DrawMarkerItem;
    }

    // ──────────────────────────────────────────────
    // DrawItem handlers
    // ──────────────────────────────────────────────

    private static void DrawLineStyleItem(object? sender, DrawItemEventArgs e)
    {
        if (e.Index < 0 || sender is not ComboBox combo)
            return;

        e.DrawBackground();

        var style = StrokeLineStyle.Solid;
        var labelText = string.Empty;
        if (combo.Items[e.Index] is ComboOption<StrokeLineStyle> opt)
        {
            style = opt.Value;
            labelText = opt.Label;
        }

        var bounds = e.Bounds;
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;

        const int previewW = 80;
        const int margin = 6;
        var lineY = bounds.Y + bounds.Height / 2f;
        var lineX1 = bounds.X + margin;
        var lineX2 = bounds.X + previewW - margin;

        DrawStylizedLine(g, style, lineX1, lineY, lineX2);

        var textX = bounds.X + previewW + margin;
        var textRect = new Rectangle(textX, bounds.Y, bounds.Width - textX + bounds.X, bounds.Height);
        var textColor = (e.State & DrawItemState.Selected) != 0
            ? SystemColors.HighlightText
            : ModernTheme.TextPrimary;
        TextRenderer.DrawText(g, labelText, ModernTheme.UiFontSmall, textRect, textColor,
            TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.NoPadding);

        e.DrawFocusRectangle();
    }

    private static void DrawMarkerItem(object? sender, DrawItemEventArgs e)
    {
        if (e.Index < 0 || sender is not ComboBox combo)
            return;

        e.DrawBackground();

        var markerStyle = LineMarkerStyle.None;
        var labelText = string.Empty;
        if (combo.Items[e.Index] is ComboOption<LineMarkerStyle> opt)
        {
            markerStyle = opt.Value;
            labelText = opt.Label;
        }

        var bounds = e.Bounds;
        var g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;

        const int previewW = 80;
        const int margin = 6;
        var lineY = bounds.Y + bounds.Height / 2f;
        var lineX1 = bounds.X + margin;
        var lineX2 = bounds.X + previewW - margin;

        DrawMarkerPreview(g, markerStyle, lineX1, lineY, lineX2);

        var textX = bounds.X + previewW + margin;
        var textRect = new Rectangle(textX, bounds.Y, bounds.Width - textX + bounds.X, bounds.Height);
        var textColor = (e.State & DrawItemState.Selected) != 0
            ? SystemColors.HighlightText
            : ModernTheme.TextPrimary;
        TextRenderer.DrawText(g, labelText, ModernTheme.UiFontSmall, textRect, textColor,
            TextFormatFlags.VerticalCenter | TextFormatFlags.Left | TextFormatFlags.NoPadding);

        e.DrawFocusRectangle();
    }

    // ──────────────────────────────────────────────
    // Drawing helpers
    // ──────────────────────────────────────────────

    private static void DrawStylizedLine(Graphics g, StrokeLineStyle style, float x1, float y, float x2)
    {
        using var pen = BuildPen(style, 1.6f);
        g.DrawLine(pen, x1, y, x2, y);
    }

    private static void DrawMarkerPreview(Graphics g, LineMarkerStyle marker, float x1, float y, float x2)
    {
        using var pen = BuildPen(StrokeLineStyle.Solid, 1.6f);

        if (marker == LineMarkerStyle.None)
        {
            // Draw a short horizontal dash to indicate "none"
            using var mutedPen = new Pen(Color.FromArgb(180, 180, 180), 1f) { DashStyle = DashStyle.Dash };
            g.DrawLine(mutedPen, x1, y, x2, y);
            return;
        }

        g.DrawLine(pen, x1, y, x2, y);
        DrawMarkerAt(g, pen, new PointF(x2, y), new PointF(x1, y), marker);
    }

    private static void DrawMarkerAt(Graphics g, Pen pen, PointF tip, PointF from, LineMarkerStyle style)
    {
        var angle = MathF.Atan2(tip.Y - from.Y, tip.X - from.X);
        var cos = MathF.Cos(angle);
        var sin = MathF.Sin(angle);
        const float size = 9f;

        switch (style)
        {
            case LineMarkerStyle.ArrowOpen:
            {
                var spread = MathF.PI / 5f;
                g.DrawLine(pen, tip, new PointF(tip.X - size * MathF.Cos(angle - spread), tip.Y - size * MathF.Sin(angle - spread)));
                g.DrawLine(pen, tip, new PointF(tip.X - size * MathF.Cos(angle + spread), tip.Y - size * MathF.Sin(angle + spread)));
                break;
            }
            case LineMarkerStyle.ArrowFilled:
            {
                var spread = MathF.PI / 6f;
                var pts = new[]
                {
                    tip,
                    new PointF(tip.X - size * MathF.Cos(angle - spread), tip.Y - size * MathF.Sin(angle - spread)),
                    new PointF(tip.X - size * MathF.Cos(angle + spread), tip.Y - size * MathF.Sin(angle + spread))
                };
                using var brush = new SolidBrush(pen.Color);
                g.FillPolygon(brush, pts);
                break;
            }
            case LineMarkerStyle.Diamond:
            {
                var half = size * 0.42f;
                var pts = new[]
                {
                    tip,
                    new PointF(tip.X - half * cos + half * (-sin), tip.Y - half * sin + half * cos),
                    new PointF(tip.X - size * cos, tip.Y - size * sin),
                    new PointF(tip.X - half * cos - half * (-sin), tip.Y - half * sin - half * cos)
                };
                using var brush = new SolidBrush(pen.Color);
                g.FillPolygon(brush, pts);
                g.DrawPolygon(pen, pts);
                break;
            }
            case LineMarkerStyle.Circle:
            {
                var r = size * 0.36f;
                var cx = tip.X - r * cos;
                var cy = tip.Y - r * sin;
                using var brush = new SolidBrush(pen.Color);
                g.FillEllipse(brush, cx - r, cy - r, r * 2f, r * 2f);
                break;
            }
            case LineMarkerStyle.Square:
            {
                var half = size * 0.32f;
                var pts = new[]
                {
                    new PointF(tip.X + half * (-sin), tip.Y + half * cos),
                    new PointF(tip.X - half * (-sin), tip.Y - half * cos),
                    new PointF(tip.X - size * cos - half * (-sin), tip.Y - size * sin - half * cos),
                    new PointF(tip.X - size * cos + half * (-sin), tip.Y - size * sin + half * cos)
                };
                using var brush = new SolidBrush(pen.Color);
                g.FillPolygon(brush, pts);
                g.DrawPolygon(pen, pts);
                break;
            }
            case LineMarkerStyle.Cross:
            {
                var half = size * 0.45f;
                g.DrawLine(pen,
                    new PointF(tip.X + half * (-sin), tip.Y + half * cos),
                    new PointF(tip.X - half * (-sin), tip.Y - half * cos));
                break;
            }
        }
    }

    private static Pen BuildPen(StrokeLineStyle style, float width)
    {
        var pen = new Pen(InkColor, width)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round
        };

        pen.DashStyle = style switch
        {
            StrokeLineStyle.Dash => DashStyle.Dash,
            StrokeLineStyle.Dot => DashStyle.Dot,
            StrokeLineStyle.DashDot => DashStyle.DashDot,
            StrokeLineStyle.LongDash or StrokeLineStyle.ShortDash => DashStyle.Custom,
            _ => DashStyle.Solid
        };

        if (style == StrokeLineStyle.LongDash)
            pen.DashPattern = [8f, 3f];
        else if (style == StrokeLineStyle.ShortDash)
            pen.DashPattern = [2.5f, 2.5f];

        return pen;
    }
}
