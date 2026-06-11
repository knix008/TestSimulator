using System.Drawing.Drawing2D;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlPackageNotation
{
    public const float TabHeightMax = 18f;
    public const float ContentLineHeight = 16f;
    private const float TabHeightRatio = 0.17f;
    private const float ContentPadding = 8f;
    private const float IconWidth = 14f;
    private const float IconGap = 4f;

    public enum PackageContentIcon
    {
        Classifier,
        NestedPackage,
        Component,
    }

    public readonly record struct PackageContentLine(string Label, PackageContentIcon Icon);

    public static float GetTabHeight(RectangleF bounds) =>
        Math.Clamp(bounds.Height * TabHeightRatio, 3f, TabHeightMax);

    public static float GetTabWidth(RectangleF bounds)
    {
        var tabHeight = GetTabHeight(bounds);
        var minWide = tabHeight * 2.4f;
        var preferred = bounds.Width * 0.62f;
        return Math.Clamp(Math.Max(minWide, preferred), minWide, Math.Max(minWide, bounds.Width - 2f));
    }

    public static RectangleF GetTabBounds(RectangleF bounds)
    {
        var tabHeight = GetTabHeight(bounds);
        return new(bounds.X, bounds.Y, GetTabWidth(bounds), tabHeight);
    }

    public static RectangleF GetBodyBounds(RectangleF bounds)
    {
        var tabHeight = GetTabHeight(bounds);
        return new(bounds.X, bounds.Y + tabHeight, bounds.Width, Math.Max(1f, bounds.Height - tabHeight));
    }

    public static GraphicsPath CreateSilhouettePath(RectangleF bounds)
    {
        var path = new GraphicsPath();
        path.AddRectangle(GetTabBounds(bounds));
        path.AddRectangle(GetBodyBounds(bounds));
        return path;
    }

    public static IReadOnlyList<PackageContentLine> GetContentLines(UmlPackage? package)
    {
        if (package is null)
            return [];

        var lines = new List<PackageContentLine>();
        foreach (var classifier in package.Classifiers)
            lines.Add(new PackageContentLine($"+ {classifier.Name}", PackageContentIcon.Classifier));
        foreach (var nested in package.NestedPackages)
            lines.Add(new PackageContentLine($"+ {nested.Name}", PackageContentIcon.NestedPackage));
        foreach (var component in package.Components)
            lines.Add(new PackageContentLine($"+ {component.Name}", PackageContentIcon.Component));
        return lines;
    }

    private const float MinBodyHeight = 16f;

    public static float MeasureHeight(UmlPackage? package, bool showContents, float width, float minHeight = 120f)
    {
        var bounds = new RectangleF(0, 0, Math.Max(80f, width), minHeight);
        var contentLines = showContents ? GetContentLines(package).Count : 0;
        var contentHeight = contentLines > 0
            ? ContentPadding + contentLines * ContentLineHeight + 6f
            : MinBodyHeight;
        var height = GetTabHeight(bounds) + contentHeight;
        return Math.Max(minHeight, height);
    }

    /// <summary>Toolbox / tree icon — tab + body only, no label.</summary>
    public static void DrawPackagePreview(Graphics g, RectangleF bounds, Pen pen) =>
        DrawPackage(g, bounds, pen, package: null, showContents: false, drawName: false);

    public static void DrawPackage(Graphics g, RectangleF bounds, Pen pen, UmlPackage? package = null, bool showContents = false, bool drawName = true, string? nestingFromLabel = null)
    {
        var tab = GetTabBounds(bounds);
        var body = GetBodyBounds(bounds);
        var name = package?.Name;
        var contentLines = showContents ? GetContentLines(package) : [];

        using var silhouette = CreateSilhouettePath(bounds);
        UmlDiagramStyle.DrawShadowPath(g, silhouette);
        UmlDiagramStyle.FillGradientRectangle(g, tab);
        UmlDiagramStyle.FillGradientRectangle(g, body);
        g.DrawRectangle(pen, body.X, body.Y, body.Width, body.Height);
        g.DrawRectangle(pen, tab.X, tab.Y, tab.Width, tab.Height);

        using var contentFont = new Font("Segoe UI", Math.Clamp(bounds.Height * 0.2f, 5f, 8.25f));
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);

        if (drawName)
        {
            var display = !string.IsNullOrWhiteSpace(package?.Stereotype)
                ? $"«{package!.Stereotype}» {name}"
                : name;
            if (!string.IsNullOrWhiteSpace(display))
            {
                var nameFontSize = Math.Clamp(tab.Height * 0.62f, 4f, 9f);
                using var nameFont = new Font("Segoe UI", nameFontSize, FontStyle.Bold);
                DrawNameInTab(g, display!, tab, nameFont, brush);
            }
        }

        if (!string.IsNullOrWhiteSpace(nestingFromLabel))
        {
            using var fromFont = new Font("Segoe UI", Math.Clamp(bounds.Height * 0.16f, 5f, 8f), FontStyle.Italic);
            g.DrawString($"(from {nestingFromLabel})", fromFont, brush, body.X + ContentPadding, body.Y + 4f);
        }

        if (contentLines.Count == 0)
            return;

        var y = body.Y + ContentPadding;
        foreach (var line in contentLines)
        {
            DrawContentIcon(g, body.X + ContentPadding, y + 2f, line.Icon, pen);
            g.DrawString(line.Label, contentFont, brush, body.X + ContentPadding + IconWidth + IconGap, y + 1f);
            y += ContentLineHeight;
        }
    }

    public static void DrawPackage(Graphics g, RectangleF bounds, Pen pen, Brush? fill, string? name = null)
    {
        var package = string.IsNullOrWhiteSpace(name) ? null : new UmlPackage { Name = name };
        DrawPackage(g, bounds, pen, package, showContents: false);
    }

    private static void DrawNameInTab(Graphics g, string name, RectangleF tab, Font font, Brush brush)
    {
        const float padding = 2f;
        var area = new RectangleF(tab.X + padding, tab.Y, Math.Max(1f, tab.Width - padding * 2f), tab.Height);
        using var format = new StringFormat
        {
            Alignment = StringAlignment.Near,
            LineAlignment = StringAlignment.Center,
            Trimming = StringTrimming.EllipsisCharacter,
            FormatFlags = StringFormatFlags.NoWrap,
        };
        g.DrawString(name, font, brush, area, format);
    }

    private static void DrawContentIcon(Graphics g, float x, float y, PackageContentIcon icon, Pen pen)
    {
        switch (icon)
        {
            case PackageContentIcon.NestedPackage:
                DrawNestedPackageIcon(g, x, y, pen);
                break;
            case PackageContentIcon.Component:
                DrawComponentIcon(g, x, y, pen);
                break;
            default:
                DrawClassifierIcon(g, x, y, pen);
                break;
        }
    }

    private static void DrawClassifierIcon(Graphics g, float x, float y, Pen pen)
    {
        var rect = new RectangleF(x, y, IconWidth - 2f, 11f);
        UmlDiagramStyle.FillGradientRectangle(g, rect, Color.FromArgb(255, 248, 252, 255), Color.FromArgb(255, 220, 232, 248));
        g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
        g.DrawLine(pen, rect.Left, rect.Top + 3.5f, rect.Right, rect.Top + 3.5f);
        g.DrawLine(pen, rect.Left, rect.Top + 7.5f, rect.Right, rect.Top + 7.5f);
    }

    private static void DrawNestedPackageIcon(Graphics g, float x, float y, Pen pen)
    {
        var bounds = new RectangleF(x, y, IconWidth - 2f, 11f);
        var miniTabH = 3.5f;
        var miniTab = new RectangleF(bounds.X, bounds.Y, bounds.Width * 0.62f, miniTabH);
        var miniBody = new RectangleF(bounds.X, bounds.Y + miniTabH, bounds.Width, bounds.Height - miniTabH);
        UmlDiagramStyle.FillGradientRectangle(g, miniBody, Color.FromArgb(255, 255, 244, 196), Color.FromArgb(255, 245, 220, 150));
        UmlDiagramStyle.FillGradientRectangle(g, miniTab, Color.FromArgb(255, 255, 248, 210), Color.FromArgb(255, 250, 230, 170));
        g.DrawRectangle(pen, miniBody.X, miniBody.Y, miniBody.Width, miniBody.Height);
        g.DrawRectangle(pen, miniTab.X, miniTab.Y, miniTab.Width, miniTab.Height);
    }

    private static void DrawComponentIcon(Graphics g, float x, float y, Pen pen)
    {
        var rect = new RectangleF(x, y, IconWidth - 2f, 11f);
        UmlDiagramStyle.FillGradientRectangle(g, rect, Color.FromArgb(255, 248, 252, 255), Color.FromArgb(255, 220, 232, 248));
        g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
        using var fill = new SolidBrush(Color.FromArgb(255, 248, 252, 255));
        UmlComponentNotation.DrawComponentGlyph(g, rect, pen, fill);
    }
}
