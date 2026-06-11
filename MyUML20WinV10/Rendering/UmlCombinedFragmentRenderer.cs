using System.Drawing.Drawing2D;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlCombinedFragmentRenderer
{
    public const float TabHeight = 14f;
    private const float PreviewTabHeightRatio = 0.12f;
    private const float PreviewTabHeightMax = 10f;

    public static bool IsCombinedFragment(UmlProject project, UmlDiagramNode node) =>
        node.Presentation == UmlNodePresentation.Behavior
        && project.FindElement(node.ModelElementId) is UmlBehaviorNode { Kind: UmlBehaviorNodeKind.CombinedFragment };

    public static string GetFragmentLabel(UmlBehaviorNode node)
    {
        if (node.CombinedFragmentKind == UmlCombinedFragmentKind.Ref)
        {
            var refName = string.IsNullOrWhiteSpace(node.ReferencedDiagramName) ? "Diagram" : node.ReferencedDiagramName;
            return $"ref {refName}";
        }

        if (node.CombinedFragmentKind == UmlCombinedFragmentKind.InteractionOccurrence)
        {
            var sdName = string.IsNullOrWhiteSpace(node.ReferencedDiagramName) ? "Interaction" : node.ReferencedDiagramName;
            return $"sd {sdName}";
        }

        var kind = node.CombinedFragmentKind?.ToString().ToLowerInvariant() ?? "loop";
        return string.IsNullOrWhiteSpace(node.Guard) ? kind : $"{kind} [{node.Guard}]";
    }

    public static void AppendFramePath(GraphicsPath path, RectangleF bounds, float tabHeight, float tabWidth)
    {
        var left = bounds.Left;
        var top = bounds.Top;
        var right = bounds.Right;
        var bottom = bounds.Bottom;
        var bodyTop = top + tabHeight;

        path.StartFigure();
        path.AddLine(left, bodyTop, left, top);
        path.AddLine(left, top, left + tabWidth, top);
        path.AddLine(left + tabWidth, top, left + tabWidth, bodyTop);
        path.AddLine(left + tabWidth, bodyTop, right, bodyTop);
        path.AddLine(right, bodyTop, right, bottom);
        path.AddLine(right, bottom, left, bottom);
        path.CloseFigure();
    }

    public static float EstimateTabWidth(RectangleF bounds) =>
        Math.Min(bounds.Width - 8f, Math.Max(56f, bounds.Width * 0.34f));

    public static void DrawFrameOutline(Graphics g, Pen pen, RectangleF bounds, float tabHeight, float tabWidth)
    {
        using var path = new GraphicsPath();
        AppendFramePath(path, bounds, tabHeight, tabWidth);
        g.DrawPath(pen, path);
    }

    public static void Draw(Graphics g, UmlBehaviorNode node, RectangleF bounds, Pen pen, bool selected)
    {
        using var font = new Font("Segoe UI", 8f, FontStyle.Bold);
        using var textBrush = new SolidBrush(UmlDiagramStyle.TextColor);
        var label = GetFragmentLabel(node);
        var labelSize = g.MeasureString(label, font);
        var tabHeight = Math.Max(TabHeight, labelSize.Height + 4f);
        var tabWidth = Math.Min(bounds.Width - 8f, labelSize.Width + 12f);

        DrawFrame(g, bounds, pen, tabHeight, tabWidth);
        g.DrawString(label, font, textBrush, bounds.Left + 7f, bounds.Top + (tabHeight - labelSize.Height) / 2f);

        if (node.CombinedFragmentKind == UmlCombinedFragmentKind.Alt)
        {
            var bodyTop = bounds.Y + tabHeight;
            var dividerY = bodyTop + Math.Max(1f, bounds.Height - tabHeight) / 2f;
            using var dividerPen = new Pen(UmlDiagramStyle.BorderColor, 1f) { DashStyle = DashStyle.Dash };
            g.DrawLine(dividerPen, bounds.Left + 4f, dividerY, bounds.Right - 4f, dividerY);
            using var operandFont = new Font("Segoe UI", 7.5f, FontStyle.Italic);
            g.DrawString("[else]", operandFont, textBrush, bounds.Left + 8f, dividerY + 2f);
        }
        else if ((node.CombinedFragmentKind == UmlCombinedFragmentKind.Ref
                  || node.CombinedFragmentKind == UmlCombinedFragmentKind.InteractionOccurrence)
                 && !string.IsNullOrWhiteSpace(node.ReferencedDiagramName))
        {
            using var refFont = new Font("Segoe UI", 8f);
            var refText = node.ReferencedDiagramName!;
            var refSize = g.MeasureString(refText, refFont);
            g.DrawString(refText, refFont, textBrush,
                bounds.Left + (bounds.Width - refSize.Width) / 2f,
                bounds.Top + tabHeight + (bounds.Height - tabHeight - refSize.Height) / 2f);
        }

        if (node.CombinedFragmentKind == UmlCombinedFragmentKind.InteractionOccurrence)
        {
            var inset = new RectangleF(bounds.X + 4f, bounds.Y + 4f, bounds.Width - 8f, bounds.Height - 8f);
            using var dashPen = new Pen(pen.Color, Math.Max(1f, pen.Width - 0.25f))
            {
                DashStyle = DashStyle.Dash,
            };
            var innerTabHeight = Math.Max(tabHeight - 2f, 10f);
            var innerTabWidth = Math.Max(tabWidth - 4f, tabWidth * 0.9f);
            DrawFrameOutline(g, dashPen, inset, innerTabHeight, innerTabWidth);
        }
    }

    /// <summary>Toolbox / ghost preview — combined-fragment frame only, no label text.</summary>
    public static void DrawPreview(Graphics g, RectangleF area, Color stroke)
    {
        var bounds = FitPreviewBounds(area);
        using var pen = new Pen(stroke, 1.6f);
        var tabHeight = Math.Clamp(bounds.Height * PreviewTabHeightRatio, 3f, PreviewTabHeightMax);
        var rawTabWidth = Math.Max(tabHeight * 2.4f, bounds.Width * 0.4f);
        var tabWidthMin = Math.Min(tabHeight * 2f, bounds.Width - 4f);
        var tabWidthMax = Math.Max(tabWidthMin, bounds.Width - 4f);
        var tabWidth = Math.Clamp(rawTabWidth, tabWidthMin, tabWidthMax);
        DrawFrame(g, bounds, pen, tabHeight, tabWidth);
    }

    private static void DrawFrame(Graphics g, RectangleF bounds, Pen pen, float tabHeight, float tabWidth)
    {
        var body = new RectangleF(bounds.X, bounds.Y + tabHeight, bounds.Width, Math.Max(1f, bounds.Height - tabHeight));
        var tab = new RectangleF(bounds.X, bounds.Y, tabWidth, tabHeight);
        UmlDiagramStyle.DrawShadow(g, body);
        UmlDiagramStyle.FillGradientRectangle(g, body);
        UmlDiagramStyle.FillGradientRectangle(g, tab);

        using var framePen = new Pen(pen.Color, pen.Width);
        g.DrawLine(framePen, bounds.Left, bounds.Top + tabHeight, bounds.Left, bounds.Top);
        g.DrawLine(framePen, bounds.Left, bounds.Top, bounds.Left + tabWidth, bounds.Top);
        g.DrawLine(framePen, bounds.Left + tabWidth, bounds.Top, bounds.Left + tabWidth, bounds.Top + tabHeight);
        g.DrawLine(framePen, bounds.Left + tabWidth, bounds.Top + tabHeight, bounds.Right, bounds.Top + tabHeight);
        g.DrawLine(framePen, bounds.Right, bounds.Top + tabHeight, bounds.Right, bounds.Bottom);
        g.DrawLine(framePen, bounds.Right, bounds.Bottom, bounds.Left, bounds.Bottom);
        g.DrawLine(framePen, bounds.Left, bounds.Bottom, bounds.Left, bounds.Top + tabHeight);
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
