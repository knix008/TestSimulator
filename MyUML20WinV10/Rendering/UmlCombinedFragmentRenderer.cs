using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlCombinedFragmentRenderer
{
    public const float TabHeight = 20f;

    public static bool IsCombinedFragment(UmlProject project, UmlDiagramNode node) =>
        node.Presentation == UmlNodePresentation.Behavior
        && project.FindElement(node.ModelElementId) is UmlBehaviorNode { Kind: UmlBehaviorNodeKind.CombinedFragment };

    public static string GetFragmentLabel(UmlBehaviorNode node)
    {
        var kind = node.CombinedFragmentKind?.ToString().ToLowerInvariant() ?? "loop";
        return string.IsNullOrWhiteSpace(node.Guard) ? kind : $"{kind} [{node.Guard}]";
    }

    public static void Draw(Graphics g, UmlBehaviorNode node, RectangleF bounds, Pen pen, bool selected)
    {
        using var font = new Font("Segoe UI", 8f, FontStyle.Bold);
        using var textBrush = new SolidBrush(Color.Black);
        var label = GetFragmentLabel(node);
        var labelSize = g.MeasureString(label, font);
        var tabHeight = Math.Max(TabHeight, labelSize.Height + 8f);
        var tabWidth = Math.Min(bounds.Width - 8f, labelSize.Width + 14f);

        using var fill = new SolidBrush(Color.FromArgb(selected ? 28 : 12, 120, 170, 230));
        var body = new RectangleF(bounds.X, bounds.Y + tabHeight, bounds.Width, Math.Max(1f, bounds.Height - tabHeight));
        g.FillRectangle(fill, body);

        using var framePen = new Pen(pen.Color, pen.Width);
        g.DrawLine(framePen, bounds.Left, bounds.Top + tabHeight, bounds.Left, bounds.Top);
        g.DrawLine(framePen, bounds.Left, bounds.Top, bounds.Left + tabWidth, bounds.Top);
        g.DrawLine(framePen, bounds.Left + tabWidth, bounds.Top, bounds.Left + tabWidth, bounds.Top + tabHeight);
        g.DrawLine(framePen, bounds.Left + tabWidth, bounds.Top + tabHeight, bounds.Right, bounds.Top + tabHeight);
        g.DrawLine(framePen, bounds.Right, bounds.Top + tabHeight, bounds.Right, bounds.Bottom);
        g.DrawLine(framePen, bounds.Right, bounds.Bottom, bounds.Left, bounds.Bottom);
        g.DrawLine(framePen, bounds.Left, bounds.Bottom, bounds.Left, bounds.Top + tabHeight);

        g.DrawString(label, font, textBrush, bounds.Left + 7f, bounds.Top + (tabHeight - labelSize.Height) / 2f);
    }

    public static void DrawPreview(Graphics g, RectangleF area, Color stroke, string? label = null)
    {
        var bounds = FitPreviewBounds(area);
        using var pen = new Pen(stroke, 1.6f);
        var kind = label switch
        {
            "alt" => UmlCombinedFragmentKind.Alt,
            "opt" => UmlCombinedFragmentKind.Opt,
            "par" => UmlCombinedFragmentKind.Par,
            _ => UmlCombinedFragmentKind.Loop,
        };
        var guard = label is "alt" ? "[cond]" : label is "loop" or null ? "i < n" : string.Empty;
        Draw(g, new UmlBehaviorNode
        {
            Kind = UmlBehaviorNodeKind.CombinedFragment,
            CombinedFragmentKind = kind,
            Guard = guard,
        }, bounds, pen, selected: false);
    }

    public static RectangleF FitPreviewBounds(RectangleF area)
    {
        var w = area.Width * 0.88f;
        var h = area.Height * 0.82f;
        return new RectangleF(
            area.Left + (area.Width - w) / 2f,
            area.Top + (area.Height - h) / 2f,
            w,
            h);
    }
}
