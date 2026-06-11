using System.Drawing.Drawing2D;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlComponentNotation
{
    public const float InterfaceCircleRadius = 7f;
    public const float InterfaceStemLength = 14f;
    public const float MinInterfaceWidth = 72f;
    public const float MinInterfaceHeight = 24f;
    public const float PortSize = 6f;
    private const float AssemblyBallRadius = 5f;

    public static RectangleF GetLabelBounds(RectangleF bounds, UmlNodePresentation presentation)
    {
        if (presentation == UmlNodePresentation.RequiredInterface)
        {
            var socketRight = bounds.Left + InterfaceCircleRadius * 2.2f + 2f;
            return new RectangleF(
                socketRight,
                bounds.Y + 2f,
                Math.Max(20f, bounds.Right - socketRight - 2f),
                bounds.Height - 4f);
        }

        var labelWidth = Math.Max(20f, bounds.Width - InterfaceStemLength - InterfaceCircleRadius * 2f - 6f);
        return new RectangleF(bounds.X + 2f, bounds.Y + 2f, labelWidth, bounds.Height - 4f);
    }

    public static RectangleF GetLabelBounds(RectangleF bounds) =>
        GetLabelBounds(bounds, UmlNodePresentation.ProvidedInterface);

    public static PointF GetProvidedConnectionPoint(RectangleF bounds) =>
        new(bounds.Right - InterfaceCircleRadius, bounds.Top + bounds.Height / 2f);

    public static PointF GetRequiredConnectionPoint(RectangleF bounds) =>
        new(bounds.Left + InterfaceCircleRadius, bounds.Top + bounds.Height / 2f);

    public static PointF GetConnectionPoint(UmlDiagramNode node, RectangleF bounds, PointF aimPoint)
    {
        return node.Presentation switch
        {
            UmlNodePresentation.ProvidedInterface => GetNearestPointOnCircle(GetProvidedConnectionPoint(bounds), aimPoint),
            UmlNodePresentation.RequiredInterface => GetRequiredConnectionPoint(bounds),
            _ => GetBoundsEdgePoint(bounds, aimPoint),
        };
    }

    public static void AddInterfacePath(GraphicsPath path, UmlNodePresentation presentation, RectangleF bounds)
    {
        var label = GetLabelBounds(bounds, presentation);
        path.AddRectangle(label);

        if (presentation == UmlNodePresentation.ProvidedInterface)
        {
            var center = GetProvidedConnectionPoint(bounds);
            path.AddEllipse(center.X - InterfaceCircleRadius, center.Y - InterfaceCircleRadius,
                InterfaceCircleRadius * 2f, InterfaceCircleRadius * 2f);
            AddStemPath(path, new PointF(label.Right, center.Y), new PointF(center.X - InterfaceCircleRadius, center.Y));
            return;
        }

        if (presentation == UmlNodePresentation.RequiredInterface)
        {
            var center = GetRequiredConnectionPoint(bounds);
            path.AddArc(center.X - InterfaceCircleRadius, center.Y - InterfaceCircleRadius,
                InterfaceCircleRadius * 2f, InterfaceCircleRadius * 2f, 90f, 180f);
            AddStemPath(path, new PointF(center.X + InterfaceCircleRadius * 0.15f, center.Y),
                new PointF(label.Right - 1f, center.Y));
        }
    }

    public static void DrawInterfaceSelectionOutline(Graphics g, Pen pen, UmlNodePresentation presentation, RectangleF bounds)
    {
        using var path = new GraphicsPath();
        AddInterfacePath(path, presentation, bounds);
        g.DrawPath(pen, path);
    }

    public static void DrawComponentGlyph(Graphics g, RectangleF bounds, Pen pen, Brush fill)
    {
        var margin = 5f;
        var barW = Math.Clamp(bounds.Width * 0.08f, 5f, 9f);
        var barH = Math.Clamp(bounds.Height * 0.3f, 18f, 34f);
        var barX = bounds.Right - margin - barW;
        var barY = bounds.Y + margin;

        var vertical = new RectangleF(barX, barY, barW, barH);
        var tabH = Math.Max(4f, barH * 0.24f);
        var gap = Math.Max(1.5f, barH * 0.07f);
        var topTabW = barW * 1.65f;
        var bottomTabW = barW * 1.4f;
        var topTab = new RectangleF(vertical.Left - topTabW, vertical.Top, topTabW, tabH);
        var bottomTab = new RectangleF(vertical.Left - bottomTabW, vertical.Top + tabH + gap, bottomTabW, tabH);

        g.FillRectangle(fill, vertical);
        g.FillRectangle(fill, topTab);
        g.FillRectangle(fill, bottomTab);
        g.DrawRectangle(pen, vertical.X, vertical.Y, vertical.Width, vertical.Height);
        g.DrawRectangle(pen, topTab.X, topTab.Y, topTab.Width, topTab.Height);
        g.DrawRectangle(pen, bottomTab.X, bottomTab.Y, bottomTab.Width, bottomTab.Height);
    }

    public static Color ParseFillColor(string? hex, Color fallback) =>
        TryParseFillColor(hex, out var color) ? color : fallback;

    public static bool TryParseFillColor(string? hex, out Color color)
    {
        color = Color.White;
        if (string.IsNullOrWhiteSpace(hex))
            return false;

        var s = hex.Trim();
        if (!s.StartsWith('#'))
            s = "#" + s;

        try
        {
            if (s.Length == 9)
            {
                var a = Convert.ToInt32(s[1..3], 16);
                var r = Convert.ToInt32(s[3..5], 16);
                var g = Convert.ToInt32(s[5..7], 16);
                var b = Convert.ToInt32(s[7..9], 16);
                color = Color.FromArgb(a, r, g, b);
                return true;
            }

            color = ColorTranslator.FromHtml(s);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public static void DrawComponent(Graphics g, RectangleF bounds, UmlComponent component, Pen pen) =>
        DrawComponent(g, bounds, pen, component.Name, showStereotype: true,
            ParseFillColor(component.FillColor, Color.White));

    /// <summary>Toolbox / ghost preview — matches <see cref="UmlDiagramStyle"/> like other diagram tools.</summary>
    public static void DrawComponentPreview(Graphics g, RectangleF bounds, Pen pen)
    {
        UmlDiagramStyle.DrawStyledRectangle(g, bounds, pen);
        using var fill = UmlDiagramStyle.CreateVerticalGradientBrush(bounds);
        DrawComponentGlyph(g, bounds, pen, fill);
    }

    public static void DrawComponent(Graphics g, RectangleF bounds, Pen pen, string? name = null, bool showStereotype = true, Color? fillColor = null)
    {
        var baseFill = fillColor ?? Color.White;
        using var fill = new SolidBrush(baseFill);
        g.FillRectangle(fill, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        g.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        DrawComponentGlyph(g, bounds, pen, fill);

        if (string.IsNullOrWhiteSpace(name) && !showStereotype)
            return;

        using var font = new Font("Segoe UI", 9f, FontStyle.Bold);
        using var italicFont = new Font("Segoe UI", 8f, FontStyle.Italic);
        using var brush = new SolidBrush(Color.Black);
        var glyphReserve = Math.Clamp(bounds.Width * 0.14f, 14f, 28f);
        var textArea = new RectangleF(bounds.X + 6f, bounds.Y + 8f, Math.Max(24f, bounds.Width - glyphReserve - 10f), bounds.Height - 16f);
        var y = textArea.Y;

        if (showStereotype && textArea.Height >= 24f)
        {
            var stereoSize = g.MeasureString("«component»", italicFont);
            g.DrawString("«component»", italicFont, brush, textArea.X + (textArea.Width - stereoSize.Width) / 2f, y);
            y += stereoSize.Height + 2f;
        }

        if (!string.IsNullOrWhiteSpace(name))
        {
            var nameSize = g.MeasureString(name, font);
            g.DrawString(name, font, brush, textArea.X + (textArea.Width - nameSize.Width) / 2f, y);
        }
    }

    public static void DrawProvidedInterface(Graphics g, RectangleF bounds, string name, Pen pen)
    {
        using var font = new Font("Segoe UI", 8.5f);
        using var brush = new SolidBrush(Color.Black);
        var label = GetLabelBounds(bounds, UmlNodePresentation.ProvidedInterface);
        if (!string.IsNullOrWhiteSpace(name))
            g.DrawString(name, font, brush, label.X, label.Y + (label.Height - font.Height) / 2f);

        var center = GetProvidedConnectionPoint(bounds);
        var stemStart = new PointF(label.Right + 2f, center.Y);
        g.DrawLine(pen, stemStart.X, stemStart.Y, center.X - InterfaceCircleRadius, center.Y);
        using var fill = new SolidBrush(Color.White);
        g.FillEllipse(fill, center.X - InterfaceCircleRadius, center.Y - InterfaceCircleRadius,
            InterfaceCircleRadius * 2f, InterfaceCircleRadius * 2f);
        g.DrawEllipse(pen, center.X - InterfaceCircleRadius, center.Y - InterfaceCircleRadius,
            InterfaceCircleRadius * 2f, InterfaceCircleRadius * 2f);
    }

    public static void DrawRequiredInterface(Graphics g, RectangleF bounds, string name, Pen pen)
    {
        using var font = new Font("Segoe UI", 8.5f);
        using var brush = new SolidBrush(Color.Black);
        var label = GetLabelBounds(bounds, UmlNodePresentation.RequiredInterface);
        var center = GetRequiredConnectionPoint(bounds);
        g.DrawArc(pen, center.X - InterfaceCircleRadius, center.Y - InterfaceCircleRadius,
            InterfaceCircleRadius * 2f, InterfaceCircleRadius * 2f, 90f, 180f);

        if (!string.IsNullOrWhiteSpace(name))
            g.DrawString(name, font, brush, label.X, label.Y + (label.Height - font.Height) / 2f);

        var stemEnd = new PointF(label.Right - 1f, center.Y);
        g.DrawLine(pen, center.X + InterfaceCircleRadius * 0.15f, center.Y, stemEnd.X, stemEnd.Y);
    }

    public static void DrawPort(Graphics g, PointF center, Pen pen)
    {
        var half = PortSize / 2f;
        var rect = new RectangleF(center.X - half, center.Y - half, PortSize, PortSize);
        using var fill = new SolidBrush(Color.White);
        g.FillRectangle(fill, rect);
        g.DrawRectangle(pen, rect.X, rect.Y, rect.Width, rect.Height);
    }

    public static void DrawPortInterface(Graphics g, PointF center, Pen pen, UmlComponentInterfaceKind? kind, string interfaceName)
    {
        if (string.IsNullOrWhiteSpace(interfaceName))
            return;

        var stemStart = new PointF(center.X + PortSize / 2f + 1f, center.Y);
        var stemEnd = new PointF(stemStart.X + InterfaceStemLength, center.Y);
        g.DrawLine(pen, stemStart, stemEnd);

        if (kind == UmlComponentInterfaceKind.Required)
        {
            g.DrawArc(pen, stemEnd.X - InterfaceCircleRadius, stemEnd.Y - InterfaceCircleRadius,
                InterfaceCircleRadius * 2f, InterfaceCircleRadius * 2f, -90f, 180f);
        }
        else
        {
            g.DrawEllipse(pen, stemEnd.X - InterfaceCircleRadius, stemEnd.Y - InterfaceCircleRadius,
                InterfaceCircleRadius * 2f, InterfaceCircleRadius * 2f);
        }

        using var font = new Font("Segoe UI", 7f);
        using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
        g.DrawString(interfaceName, font, brush, stemEnd.X + InterfaceCircleRadius + 2f, stemEnd.Y - 6f);
    }

    public static void DrawAssemblyConnector(
        Graphics g,
        Pen pen,
        PointF start,
        PointF end,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        IReadOnlyList<(float T, PointF Pt)> crossings,
        UmlDiagramNode? sourceNode,
        UmlDiagramNode? targetNode,
        UmlAssembly assembly)
    {
        var sourceIsComponent = sourceNode?.Presentation == UmlNodePresentation.Component;
        var targetIsComponent = targetNode?.Presentation == UmlNodePresentation.Component;
        var targetIsProvided = targetNode?.Presentation == UmlNodePresentation.ProvidedInterface;
        var sourceIsRequired = sourceNode?.Presentation == UmlNodePresentation.RequiredInterface;
        var sourceIsProvided = sourceNode?.Presentation == UmlNodePresentation.ProvidedInterface;

        var drawSocketAtStart = false;
        var drawLollipopAtEnd = false;
        var trimEnd = 0f;

        if (sourceIsComponent && targetIsComponent)
        {
            drawSocketAtStart = true;
            drawLollipopAtEnd = true;
            trimEnd = AssemblyBallRadius + 1.5f;
        }
        else if (sourceIsComponent && targetIsProvided)
        {
            drawSocketAtStart = assembly.SourceIsRequirer;
            trimEnd = InterfaceCircleRadius + 1f;
        }
        else if (sourceIsRequired && targetIsProvided)
        {
            drawSocketAtStart = true;
            drawLollipopAtEnd = true;
            trimEnd = AssemblyBallRadius + 1.5f;
        }
        else if (sourceIsRequired && targetIsComponent)
        {
            drawSocketAtStart = true;
            drawLollipopAtEnd = true;
            trimEnd = AssemblyBallRadius + 1.5f;
        }
        else if (sourceIsProvided && targetIsComponent)
        {
            drawLollipopAtEnd = true;
            trimEnd = AssemblyBallRadius + 1.5f;
        }
        else
        {
            drawSocketAtStart = true;
            drawLollipopAtEnd = true;
            trimEnd = AssemblyBallRadius + 1.5f;
        }

        if (sourceIsComponent)
            DrawPort(g, start, pen);
        if (targetIsComponent)
            DrawPort(g, end, pen);

        UmlEdgeRouting.DrawRoutedPathSegment(g, pen, pathPoints, routingKind, crossings, trimEnd);

        if (drawLollipopAtEnd)
        {
            var direction = UmlEdgeRouting.GetPathEndDirection(pathPoints, routingKind);
            var ballCenter = new PointF(
                end.X - direction.X * AssemblyBallRadius,
                end.Y - direction.Y * AssemblyBallRadius);
            using var fill = new SolidBrush(Color.White);
            g.FillEllipse(fill, ballCenter.X - AssemblyBallRadius, ballCenter.Y - AssemblyBallRadius,
                AssemblyBallRadius * 2f, AssemblyBallRadius * 2f);
            g.DrawEllipse(pen, ballCenter.X - AssemblyBallRadius, ballCenter.Y - AssemblyBallRadius,
                AssemblyBallRadius * 2f, AssemblyBallRadius * 2f);
        }

        if (drawSocketAtStart)
        {
            g.DrawArc(pen, start.X - InterfaceCircleRadius * 0.65f, start.Y - InterfaceCircleRadius * 0.65f,
                InterfaceCircleRadius * 1.3f, InterfaceCircleRadius * 1.3f, -90f, 180f);
        }
    }

    private static void AddStemPath(GraphicsPath path, PointF start, PointF end)
    {
        var left = Math.Min(start.X, end.X);
        var right = Math.Max(start.X, end.X);
        if (right - left < 0.5f)
            return;

        path.AddRectangle(new RectangleF(left, start.Y - 1f, right - left, 2f));
    }

    private static PointF GetNearestPointOnCircle(PointF center, PointF aimPoint)
    {
        var dx = aimPoint.X - center.X;
        var dy = aimPoint.Y - center.Y;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 0.001f)
            return new PointF(center.X + InterfaceCircleRadius, center.Y);

        return new PointF(center.X + dx / len * InterfaceCircleRadius, center.Y + dy / len * InterfaceCircleRadius);
    }

    private static PointF GetBoundsEdgePoint(RectangleF bounds, PointF aimPoint)
    {
        var cx = bounds.Left + bounds.Width / 2f;
        var cy = bounds.Top + bounds.Height / 2f;
        var dx = aimPoint.X - cx;
        var dy = aimPoint.Y - cy;
        if (Math.Abs(dx) < 0.001f && Math.Abs(dy) < 0.001f)
            return new PointF(cx, bounds.Top);

        var scale = 1f;
        if (Math.Abs(dx) > 0.001f)
            scale = Math.Min(scale, bounds.Width / 2f / Math.Abs(dx));
        if (Math.Abs(dy) > 0.001f)
            scale = Math.Min(scale, bounds.Height / 2f / Math.Abs(dy));

        return new PointF(cx + dx * scale, cy + dy * scale);
    }
}
