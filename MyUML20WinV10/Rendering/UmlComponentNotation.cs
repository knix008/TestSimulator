using System.Drawing.Drawing2D;
using MyUML20WinV10.Models;

namespace MyUML20WinV10.Rendering;

public static class UmlComponentNotation
{
    public const float InterfaceCircleRadius = 7f;
    public const float InterfaceStemLength = 14f;
    public const float MinInterfaceWidth = 72f;
    public const float MinInterfaceHeight = 24f;
    public const float InterfacePortSize = 16f;
    public const float DefaultPortSize = InterfacePortSize;
    public const float MinPortSize = InterfacePortSize;
    public const float DefaultPortNodeSize = 28f;
    public const float DefaultComponentWidth = 260f;
    public const float DefaultComponentHeight = 150f;
    public const float MinComponentWidth = 120f;
    public const float MinComponentHeight = 100f;
    /// <summary>컴포넌트 외곽 — 가로가 세로보다 길어야 하는 최소 비율 (width / height).</summary>
    public const float ComponentBoundsWidthHeightRatio = 2.0f;
    /// <summary>클릭 배치·호버 실루엣에 쓰는 최소 배치 크기 (비율 포함).</summary>
    public static float PlacementComponentWidth =>
        Math.Max(MinComponentWidth, MinComponentHeight * ComponentBoundsWidthHeightRatio);
    public const float PlacementComponentHeight = MinComponentHeight;
    /// <summary>도구 상자·미리보기 외곽 비율 (width / height).</summary>
    public const float ComponentToolboxAspect = DefaultComponentWidth / DefaultComponentHeight;
    private const float GlyphMargin = 6f;
    // UML 2.5 컴포넌트 기호 비율 (전체는 정사각형에 가깝게, 세로 막대는 넓은 직사각형)
    private const float GlyphScaleMin = 17f;
    private const float GlyphScaleMax = 30f;
    private const float GlyphScaleFactor = 0.21f;
    /// <summary>내부 기호 크기 — 외곽 높이와 무관하게 고정합니다.</summary>
    private const float GlyphScaleReferenceHeight = 100f;
    private const float GlyphBarHeightToWidth = 1.12f;
    private const float GlyphTabWidthOfBar = 0.50f;
    private const float GlyphTabWidthToHeight = 2.0f;
    private const float GlyphTabOverlap = 0.5f;
    private const float GlyphTabGapOfHeight = 0.82f;
    private const float GlyphTabStackOfBar = 0.56f;
    private const float AssemblyBallRadius = 5f;

    public static string GetComponentDisplayName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return "Component";

        var trimmed = name.Trim();
        return trimmed.StartsWith(':') ? trimmed[1..].TrimStart() : trimmed;
    }

    public static RectangleF GetLabelBounds(RectangleF bounds, UmlNodePresentation presentation)
    {
        var portReserve = InterfacePortSize + 4f;

        if (presentation == UmlNodePresentation.RequiredInterface)
        {
            var socketRight = bounds.Left + InterfaceCircleRadius * 2.2f + 2f;
            return new RectangleF(
                socketRight,
                bounds.Y + 2f,
                Math.Max(20f, bounds.Right - socketRight - portReserve),
                bounds.Height - 4f);
        }

        var labelWidth = Math.Max(20f, bounds.Width - portReserve - InterfaceStemLength - InterfaceCircleRadius * 2f - 4f);
        return new RectangleF(bounds.X + portReserve, bounds.Y + 2f, labelWidth, bounds.Height - 4f);
    }

    public static RectangleF GetLabelBounds(RectangleF bounds) =>
        GetLabelBounds(bounds, UmlNodePresentation.ProvidedInterface);

    public static PointF GetProvidedConnectionPoint(RectangleF bounds) =>
        GetProvidedCircleCenter(bounds, null);

    public static PointF GetRequiredConnectionPoint(RectangleF bounds)
    {
        var outward = GetOutwardSide(bounds, null, InterfaceOutwardSide.Left);
        return GetSocketStemEndpoint(GetRequiredSocketCenter(bounds, null), outward);
    }

    private static PointF ResolveRequiredConnectionPoint(RectangleF bounds, PointF aimPoint, PointF? portAnchor)
    {
        var outward = GetOutwardSide(bounds, portAnchor, InterfaceOutwardSide.Left);
        var socketCenter = GetRequiredSocketCenter(bounds, portAnchor);
        return ResolveRequiredConnectionPoint(socketCenter, outward, aimPoint);
    }

    private static PointF ResolveRequiredConnectionPoint(PointF socketCenter, InterfaceOutwardSide outward, PointF aimPoint)
    {
        var opening = GetSocketStemEndpoint(socketCenter, outward);
        var arcPoint = GetNearestPointOnCircle(socketCenter, aimPoint);
        var dOpen = (aimPoint.X - opening.X) * (aimPoint.X - opening.X) + (aimPoint.Y - opening.Y) * (aimPoint.Y - opening.Y);
        var dArc = (aimPoint.X - arcPoint.X) * (aimPoint.X - arcPoint.X) + (aimPoint.Y - arcPoint.Y) * (aimPoint.Y - arcPoint.Y);
        return dOpen <= dArc ? opening : arcPoint;
    }

    private static PointF GetProvidedCircleCenter(RectangleF bounds, PointF? portAnchor) =>
        GetOutwardEndpointCenter(bounds, GetOutwardSide(bounds, portAnchor, InterfaceOutwardSide.Right));

    private static PointF GetRequiredSocketCenter(RectangleF bounds, PointF? portAnchor) =>
        GetOutwardEndpointCenter(bounds, GetOutwardSide(bounds, portAnchor, InterfaceOutwardSide.Left));

    public static PointF GetConnectionPoint(UmlDiagramNode node, RectangleF bounds, PointF aimPoint, PointF? portAnchor = null)
    {
        return node.Presentation switch
        {
            UmlNodePresentation.ProvidedInterface =>
                GetNearestPointOnCircle(GetProvidedCircleCenter(bounds, portAnchor), aimPoint),
            UmlNodePresentation.RequiredInterface =>
                ResolveRequiredConnectionPoint(bounds, aimPoint, portAnchor),
            _ => GetBoundsEdgePoint(bounds, aimPoint),
        };
    }

    public static PointF GetConnectionPoint(UmlDiagramNode node, UmlComponentInterfaceGeometry.Layout layout, PointF aimPoint)
    {
        return node.Presentation switch
        {
            UmlNodePresentation.ProvidedInterface =>
                GetNearestPointOnCircle(layout.OutwardCenter, aimPoint),
            UmlNodePresentation.RequiredInterface =>
                ResolveRequiredConnectionPoint(layout.OutwardCenter, layout.OutwardSide, aimPoint),
            _ => layout.OutwardCenter,
        };
    }

    /// <summary>Dependency — Required 소켓·Provided 원의 중심에 연결합니다.</summary>
    public static PointF GetInterfaceDependencyConnectionPoint(UmlComponentInterfaceGeometry.Layout layout) =>
        layout.OutwardCenter;

    public static void AddInterfacePath(GraphicsPath path, UmlNodePresentation presentation, RectangleF bounds)
    {
        var label = GetLabelBounds(bounds, presentation);
        path.AddRectangle(label);

        if (presentation == UmlNodePresentation.ProvidedInterface)
        {
            var outward = GetOutwardSide(bounds, null, InterfaceOutwardSide.Right);
            var portSide = GetOppositeSide(outward);
            var circleCenter = GetProvidedCircleCenter(bounds, null);
            path.AddEllipse(circleCenter.X - InterfaceCircleRadius, circleCenter.Y - InterfaceCircleRadius,
                InterfaceCircleRadius * 2f, InterfaceCircleRadius * 2f);
            AddPortPath(path, bounds, portSide, null);
            var portCenter = GetInterfacePortCenter(bounds, portSide, null);
            var portHalf = InterfacePortSize / 2f;
            var stemStart = OffsetFromPort(portCenter, circleCenter, portCenter, portHalf);
            AddStemPath(path, stemStart, GetCircleEdgeToward(circleCenter, stemStart));
            return;
        }

        if (presentation == UmlNodePresentation.RequiredInterface)
        {
            var outward = GetOutwardSide(bounds, null, InterfaceOutwardSide.Left);
            var portSide = GetOppositeSide(outward);
            var socketCenter = GetRequiredSocketCenter(bounds, null);
            AddPortPath(path, bounds, portSide, null);
            var portCenter = GetInterfacePortCenter(bounds, portSide, null);
            var portHalf = InterfacePortSize / 2f;
            var stemStart = OffsetFromPort(portCenter, socketCenter, portCenter, portHalf);
            var stemEnd = GetSocketStemEndpoint(socketCenter, outward);
            AddStemPath(path, stemStart, stemEnd);
            var (arcStart, arcSweep) = GetSocketArcAngles(outward);
            path.AddArc(socketCenter.X - InterfaceCircleRadius, socketCenter.Y - InterfaceCircleRadius,
                InterfaceCircleRadius * 2f, InterfaceCircleRadius * 2f, arcStart, arcSweep);
        }
    }

    public enum InterfaceOutwardSide { Left, Right, Top, Bottom }

    private static InterfaceOutwardSide GetOutwardSide(
        RectangleF bounds,
        PointF? portAnchor,
        InterfaceOutwardSide defaultSide)
    {
        if (portAnchor is null)
            return defaultSide;

        var pl = Math.Abs(portAnchor.Value.X - bounds.Left);
        var pr = Math.Abs(portAnchor.Value.X - bounds.Right);
        var pt = Math.Abs(portAnchor.Value.Y - bounds.Top);
        var pb = Math.Abs(portAnchor.Value.Y - bounds.Bottom);
        var min = Math.Min(Math.Min(pl, pr), Math.Min(pt, pb));
        if (min == pr)
            return InterfaceOutwardSide.Left;
        if (min == pl)
            return InterfaceOutwardSide.Right;
        if (min == pb)
            return InterfaceOutwardSide.Top;
        return InterfaceOutwardSide.Bottom;
    }

    public static InterfaceOutwardSide GetOppositeSide(InterfaceOutwardSide side) =>
        side switch
        {
            InterfaceOutwardSide.Left => InterfaceOutwardSide.Right,
            InterfaceOutwardSide.Right => InterfaceOutwardSide.Left,
            InterfaceOutwardSide.Top => InterfaceOutwardSide.Bottom,
            _ => InterfaceOutwardSide.Top,
        };

    public static PointF GetOutwardEndpointCenter(RectangleF bounds, InterfaceOutwardSide outward)
    {
        var cx = bounds.Left + bounds.Width / 2f;
        var cy = bounds.Top + bounds.Height / 2f;
        return outward switch
        {
            InterfaceOutwardSide.Right => new(bounds.Right - InterfaceCircleRadius, cy),
            InterfaceOutwardSide.Top => new(cx, bounds.Top + InterfaceCircleRadius),
            InterfaceOutwardSide.Bottom => new(cx, bounds.Bottom - InterfaceCircleRadius),
            _ => new(bounds.Left + InterfaceCircleRadius, cy),
        };
    }

    public static PointF GetCircleEdgeToward(PointF circleCenter, PointF fromPoint)
    {
        var dx = fromPoint.X - circleCenter.X;
        var dy = fromPoint.Y - circleCenter.Y;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 0.001f)
            return new PointF(circleCenter.X - InterfaceCircleRadius, circleCenter.Y);

        return new PointF(
            circleCenter.X + dx / len * InterfaceCircleRadius,
            circleCenter.Y + dy / len * InterfaceCircleRadius);
    }

    public static PointF GetInterfacePortCenter(RectangleF bounds, InterfaceOutwardSide portSide, PointF? attachAnchor)
    {
        if (attachAnchor is PointF anchor)
            return anchor;

        var cx = bounds.Left + bounds.Width / 2f;
        var cy = bounds.Top + bounds.Height / 2f;
        return portSide switch
        {
            InterfaceOutwardSide.Right => new(bounds.Right, cy),
            InterfaceOutwardSide.Left => new(bounds.Left, cy),
            InterfaceOutwardSide.Top => new(cx, bounds.Top),
            _ => new(cx, bounds.Bottom),
        };
    }

    private static void AddPortPath(GraphicsPath path, RectangleF bounds, InterfaceOutwardSide portSide, PointF? attachAnchor)
    {
        var center = GetInterfacePortCenter(bounds, portSide, attachAnchor);
        var half = InterfacePortSize / 2f;
        path.AddRectangle(new RectangleF(center.X - half, center.Y - half, InterfacePortSize, InterfacePortSize));
    }

    private static void DrawRequiredSocket(Graphics g, Pen pen, Brush fill, PointF center, InterfaceOutwardSide outward)
    {
        var r = InterfaceCircleRadius;
        var (start, sweep) = GetSocketArcAngles(outward);
        g.FillPie(fill, center.X - r, center.Y - r, r * 2f, r * 2f, start, sweep);
        g.DrawArc(pen, center.X - r, center.Y - r, r * 2f, r * 2f, start, sweep);
    }

    /// <summary>반원이 볼록한 방향(선 끝 바깥쪽). 평평한 쪽은 포트(안쪽)를 향합니다.</summary>
    private static (float Start, float Sweep) GetSocketArcAngles(InterfaceOutwardSide outward) =>
        outward switch
        {
            InterfaceOutwardSide.Left => (-90f, 180f),
            InterfaceOutwardSide.Right => (90f, 180f),
            InterfaceOutwardSide.Top => (0f, 180f),
            _ => (180f, 180f),
        };

    /// <summary>선이 반원의 평평한 쪽(포트 방향)에 연결되는 끝점.</summary>
    public static PointF GetSocketStemEndpoint(PointF socketCenter, InterfaceOutwardSide outward)
    {
        var inward = GetOppositeSide(outward);
        return inward switch
        {
            InterfaceOutwardSide.Right => new(socketCenter.X + InterfaceCircleRadius, socketCenter.Y),
            InterfaceOutwardSide.Left => new(socketCenter.X - InterfaceCircleRadius, socketCenter.Y),
            InterfaceOutwardSide.Top => new(socketCenter.X, socketCenter.Y - InterfaceCircleRadius),
            _ => new(socketCenter.X, socketCenter.Y + InterfaceCircleRadius),
        };
    }

    public static void DrawInterfaceSelectionOutline(Graphics g, Pen pen, UmlNodePresentation presentation, RectangleF bounds)
    {
        using var path = new GraphicsPath();
        AddInterfacePath(path, presentation, bounds);
        g.DrawPath(pen, path);
    }

    public static void DrawInterfaceLineOutline(Graphics g, Pen pen, UmlComponentInterfaceGeometry.Layout layout, UmlNodePresentation presentation)
    {
        var portHalf = InterfacePortSize / 2f;
        var stemStart = OffsetFromPort(layout.PortCenter, layout.OutwardCenter, layout.PortCenter, portHalf);
        var stemEnd = presentation == UmlNodePresentation.RequiredInterface
            ? GetSocketStemEndpoint(layout.OutwardCenter, layout.OutwardSide)
            : GetCircleEdgeToward(layout.OutwardCenter, stemStart);
        g.DrawLine(pen, stemStart.X, stemStart.Y, stemEnd.X, stemEnd.Y);
        var half = InterfacePortSize / 2f;
        g.DrawRectangle(pen, layout.PortCenter.X - half, layout.PortCenter.Y - half, InterfacePortSize, InterfacePortSize);
        if (presentation == UmlNodePresentation.RequiredInterface)
            g.DrawArc(pen, layout.OutwardCenter.X - InterfaceCircleRadius, layout.OutwardCenter.Y - InterfaceCircleRadius,
                InterfaceCircleRadius * 2f, InterfaceCircleRadius * 2f,
                GetSocketArcAngles(layout.OutwardSide).Start, GetSocketArcAngles(layout.OutwardSide).Sweep);
        else
            g.DrawEllipse(pen, layout.OutwardCenter.X - InterfaceCircleRadius, layout.OutwardCenter.Y - InterfaceCircleRadius,
                InterfaceCircleRadius * 2f, InterfaceCircleRadius * 2f);
    }

    private readonly record struct ComponentGlyphLayout(RectangleF Vertical, RectangleF TopTab, RectangleF BottomTab);

    /// <summary>UML 2.5 컴포넌트 기호 레이아웃 — 정사각형에 가까운 전체 크기, 막대+탭 비율 고정.</summary>
    private static ComponentGlyphLayout LayoutComponentGlyph(RectangleF bounds)
    {
        var margin = Math.Max(3f, Math.Min(GlyphMargin, bounds.Height * 0.08f));
        var glyphH = Math.Clamp(GlyphScaleReferenceHeight * GlyphScaleFactor, GlyphScaleMin, GlyphScaleMax);
        var barH = glyphH;
        var barW = Math.Max(5f, barH / GlyphBarHeightToWidth);

        var tabW = barW * GlyphTabWidthOfBar;
        var tabH = tabW / GlyphTabWidthToHeight;
        var tabGap = tabH * GlyphTabGapOfHeight;
        var tabStack = tabH + tabGap + tabH;

        var maxStack = barH * GlyphTabStackOfBar;
        if (tabStack > maxStack)
        {
            var shrink = maxStack / tabStack;
            tabH *= shrink;
            tabGap *= shrink;
            tabW = tabH * GlyphTabWidthToHeight;
            tabStack = tabH + tabGap + tabH;
        }

        var barX = bounds.Right - margin - barW;
        var barY = bounds.Top + margin;
        var tabX = barX - tabW * GlyphTabOverlap;
        var availableLeft = barX - margin - bounds.Left;
        if (tabW * GlyphTabOverlap > availableLeft)
        {
            tabW = Math.Max(3f, availableLeft / GlyphTabOverlap);
            tabH = tabW / GlyphTabWidthToHeight;
            tabGap = tabH * GlyphTabGapOfHeight;
            tabX = barX - tabW * GlyphTabOverlap;
        }

        var vertical = new RectangleF(barX, barY, barW, barH);
        var endInset = (barH - tabStack) * 0.5f;
        var topTab = new RectangleF(tabX, vertical.Top + endInset, tabW, tabH);
        var bottomTab = new RectangleF(tabX, topTab.Bottom + tabGap, tabW, tabH);
        return new ComponentGlyphLayout(vertical, topTab, bottomTab);
    }

    /// <summary>호버·드래그·생성 미리보기와 실제 배치에 동일하게 쓰는 컴포넌트 크기/위치.</summary>
    public static RectangleF ResolveComponentCreateRect(RectangleF dragRect, float zoom, PointF anchor)
    {
        const float minScreen = 6f;
        var width = Math.Abs(dragRect.Width);
        var height = Math.Abs(dragRect.Height);

        if (width * zoom < minScreen && height * zoom < minScreen)
        {
            var placeW = PlacementComponentWidth;
            var placeH = PlacementComponentHeight;
            return new RectangleF(
                anchor.X - placeW / 2f,
                anchor.Y - placeH / 2f,
                placeW,
                placeH);
        }

        width = Math.Max(width, MinComponentWidth);
        height = Math.Max(height, MinComponentHeight);
        width = Math.Max(width, height * ComponentBoundsWidthHeightRatio);

        return new RectangleF(dragRect.X, dragRect.Y, width, height);
    }

    /// <summary>도구 상자 타일 등 — 세로를 우선 채워 가로로 긴 외곽 사각형을 배치합니다.</summary>
    public static RectangleF FitComponentPreviewRect(RectangleF area)
    {
        const float fillW = 0.90f;
        const float fillH = 0.88f;
        var maxW = area.Width * fillW;
        var maxH = area.Height * fillH;
        var h = maxH;
        var w = h * ComponentToolboxAspect;
        if (w > maxW)
        {
            w = maxW;
            h = w / ComponentToolboxAspect;
        }

        return new RectangleF(
            area.Left + (area.Width - w) / 2f,
            area.Top + (area.Height - h) / 2f,
            w,
            h);
    }

    public static void DrawComponentGlyph(Graphics g, RectangleF bounds, Pen pen, Brush fill)
    {
        if (bounds.Width < 8f || bounds.Height < 8f)
            return;

        var layout = LayoutComponentGlyph(bounds);
        DrawComponentSymbolParts(g, layout.Vertical, pen, fill, layout.TopTab, layout.BottomTab);
    }

    /// <summary>도구 상자 — 컴포넌트 외곽 사각형 + 우측 상단 UML 기호 (텍스트 없음).</summary>
    public static void DrawComponentToolboxIcon(Graphics g, RectangleF bounds, Pen pen)
    {
        if (bounds.Width < 8f || bounds.Height < 8f)
            return;

        using var fill = new SolidBrush(Color.White);
        g.FillRectangle(fill, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        g.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        DrawComponentGlyph(g, bounds, pen, fill);
    }

    /// <summary>도구 상자용 별칭.</summary>
    public static void DrawComponentSymbol(Graphics g, RectangleF bounds, Pen pen) =>
        DrawComponentToolboxIcon(g, bounds, pen);

    /// <summary>캔버스 배치 고스트 — 컴포넌트 사각형 + 우측 상단 기호 + 중앙 라벨.</summary>
    public static void DrawComponentPlacementGhost(Graphics g, RectangleF bounds, Pen pen)
    {
        DrawComponent(g, bounds, pen, "Component", showStereotype: true);
    }

    /// <summary>세로 막대 위에 가로 탭 두 개가 절반만 겹쳐 얹힌 UML 2.5 컴포넌트 기호.</summary>
    private static void DrawComponentSymbolParts(
        Graphics g,
        RectangleF vertical,
        Pen pen,
        Brush fill,
        RectangleF topTab,
        RectangleF bottomTab)
    {
        g.FillRectangle(fill, vertical);
        g.FillRectangle(fill, topTab);
        g.FillRectangle(fill, bottomTab);
        DrawVerticalBarOutlineExcludingTabs(g, pen, vertical, topTab, bottomTab);
        g.DrawRectangle(pen, topTab.X, topTab.Y, topTab.Width, topTab.Height);
        g.DrawRectangle(pen, bottomTab.X, bottomTab.Y, bottomTab.Width, bottomTab.Height);
    }

    /// <summary>탭이 덮는 구간의 좌측 선은 그리지 않아 탭이 막대 위에 놓인 것처럼 보이게 합니다.</summary>
    private static void DrawVerticalBarOutlineExcludingTabs(
        Graphics g,
        Pen pen,
        RectangleF vertical,
        RectangleF topTab,
        RectangleF bottomTab)
    {
        const float eps = 0.5f;
        var left = vertical.Left;
        var right = vertical.Right;
        var top = vertical.Top;
        var bottom = vertical.Bottom;

        g.DrawLine(pen, left, top, right, top);
        g.DrawLine(pen, left, bottom, right, bottom);
        g.DrawLine(pen, right, top, right, bottom);

        if (topTab.Top > top + eps)
            g.DrawLine(pen, left, top, left, topTab.Top);
        if (bottomTab.Top > topTab.Bottom + eps)
            g.DrawLine(pen, left, topTab.Bottom, left, bottomTab.Top);
        if (bottomTab.Bottom < bottom - eps)
            g.DrawLine(pen, left, bottomTab.Bottom, left, bottom);
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

    public static void DrawComponent(Graphics g, RectangleF bounds, Pen pen, string? name = null, bool showStereotype = true, Color? fillColor = null)
    {
        var baseFill = fillColor ?? Color.White;
        using var fill = new SolidBrush(baseFill);
        g.FillRectangle(fill, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        g.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        DrawComponentGlyph(g, bounds, pen, fill);
        DrawComponentLabels(g, bounds, GetComponentDisplayName(name), showStereotype);
    }

    private static void DrawComponentLabels(Graphics g, RectangleF bounds, string displayName, bool showStereotype)
    {
        using var nameFont = new Font("Segoe UI", 9.5f, FontStyle.Bold);
        using var stereoFont = new Font("Segoe UI", 8f, FontStyle.Italic);
        using var brush = new SolidBrush(Color.Black);

        const string stereo = "«component»";
        var stereoSize = showStereotype ? g.MeasureString(stereo, stereoFont) : SizeF.Empty;
        var nameSize = g.MeasureString(displayName, nameFont);
        const float lineGap = 4f;

        var showStereo = showStereotype && bounds.Height >= 28f;
        var blockHeight = (showStereo ? stereoSize.Height + lineGap : 0f) + nameSize.Height;
        var y = bounds.Y + (bounds.Height - blockHeight) / 2f;

        if (showStereo)
        {
            g.DrawString(stereo, stereoFont, brush, bounds.X + (bounds.Width - stereoSize.Width) / 2f, y);
            y += stereoSize.Height + lineGap;
        }

        g.DrawString(displayName, nameFont, brush, bounds.X + (bounds.Width - nameSize.Width) / 2f, y);
    }

    public static void DrawProvidedInterface(
        Graphics g,
        RectangleF bounds,
        string name,
        Pen pen,
        PointF? attachAnchor = null,
        bool hideOutwardSymbol = false)
    {
        var outward = GetOutwardSide(bounds, attachAnchor, InterfaceOutwardSide.Right);
        var portSide = GetOppositeSide(outward);
        var portCenter = GetInterfacePortCenter(bounds, portSide, attachAnchor);
        var outwardCenter = GetOutwardEndpointCenter(bounds, outward);
        var label = GetLabelBounds(bounds, UmlNodePresentation.ProvidedInterface);
        var layout = new UmlComponentInterfaceGeometry.Layout(portCenter, outwardCenter, outward, label);
        DrawProvidedInterface(g, layout, name, pen, hideOutwardSymbol);
    }

    public static void DrawProvidedInterface(
        Graphics g,
        UmlComponentInterfaceGeometry.Layout layout,
        string name,
        Pen pen,
        bool hideOutwardSymbol = false)
    {
        using var font = new Font("Segoe UI", 8.5f);
        using var brush = new SolidBrush(Color.Black);
        using var fill = new SolidBrush(Color.White);
        var portHalf = InterfacePortSize / 2f;
        var circleCenter = layout.OutwardCenter;

        DrawPort(g, layout.PortCenter, pen, InterfacePortSize);

        if (!string.IsNullOrWhiteSpace(name) && !layout.LabelBounds.IsEmpty)
            g.DrawString(name, font, brush, layout.LabelBounds.X,
                layout.LabelBounds.Y + (layout.LabelBounds.Height - font.Height) / 2f);

        if (hideOutwardSymbol)
            return;

        var stemStart = OffsetFromPort(layout.PortCenter, circleCenter, layout.PortCenter, portHalf);
        var stemEnd = GetCircleEdgeToward(circleCenter, stemStart);
        g.DrawLine(pen, stemStart.X, stemStart.Y, stemEnd.X, stemEnd.Y);
        g.FillEllipse(fill, circleCenter.X - InterfaceCircleRadius, circleCenter.Y - InterfaceCircleRadius,
            InterfaceCircleRadius * 2f, InterfaceCircleRadius * 2f);
        g.DrawEllipse(pen, circleCenter.X - InterfaceCircleRadius, circleCenter.Y - InterfaceCircleRadius,
            InterfaceCircleRadius * 2f, InterfaceCircleRadius * 2f);
    }

    /// <summary>도구 상자 — 포트·선·소켓만 (라벨 없음).</summary>
    public static void DrawRequiredInterfaceSymbol(Graphics g, RectangleF bounds, Pen pen) =>
        DrawRequiredInterface(g, bounds, null, pen, showLabel: false);

    public static void DrawRequiredInterface(
        Graphics g,
        RectangleF bounds,
        string? name,
        Pen pen,
        PointF? attachAnchor = null,
        bool showLabel = true,
        bool hideOutwardSymbol = false)
    {
        var outward = GetOutwardSide(bounds, attachAnchor, InterfaceOutwardSide.Left);
        var portSide = GetOppositeSide(outward);
        var portCenter = GetInterfacePortCenter(bounds, portSide, attachAnchor);
        var outwardCenter = GetOutwardEndpointCenter(bounds, outward);
        var label = GetLabelBounds(bounds, UmlNodePresentation.RequiredInterface);
        var layout = new UmlComponentInterfaceGeometry.Layout(portCenter, outwardCenter, outward, label);
        DrawRequiredInterface(g, layout, name, pen, showLabel, hideOutwardSymbol);
    }

    public static void DrawRequiredInterface(
        Graphics g,
        UmlComponentInterfaceGeometry.Layout layout,
        string? name,
        Pen pen,
        bool showLabel = true,
        bool hideOutwardSymbol = false)
    {
        using var font = new Font("Segoe UI", 8.5f);
        using var brush = new SolidBrush(Color.Black);
        using var fill = new SolidBrush(Color.White);
        var socketCenter = layout.OutwardCenter;
        var portHalf = InterfacePortSize / 2f;

        DrawPort(g, layout.PortCenter, pen, InterfacePortSize);

        if (showLabel && !string.IsNullOrWhiteSpace(name) && !layout.LabelBounds.IsEmpty)
            g.DrawString(name, font, brush, layout.LabelBounds.X,
                layout.LabelBounds.Y + (layout.LabelBounds.Height - font.Height) / 2f);

        if (hideOutwardSymbol)
            return;

        var stemStart = OffsetFromPort(layout.PortCenter, socketCenter, layout.PortCenter, portHalf);
        var stemEnd = GetSocketStemEndpoint(socketCenter, layout.OutwardSide);
        g.DrawLine(pen, stemStart.X, stemStart.Y, stemEnd.X, stemEnd.Y);
        DrawRequiredSocket(g, pen, fill, socketCenter, layout.OutwardSide);
    }

    public static float GetPortHalfExtent(RectangleF bounds) =>
        Math.Max(bounds.Width, bounds.Height) / 2f;

    public static PointF OffsetFromPort(PointF portCenter, PointF toward, PointF port, float halfExtent)
    {
        var dx = toward.X - port.X;
        var dy = toward.Y - port.Y;
        var len = MathF.Sqrt(dx * dx + dy * dy);
        if (len < 0.001f)
            return new PointF(port.X + halfExtent, port.Y);

        return new PointF(
            port.X + dx / len * (halfExtent + 0.5f),
            port.Y + dy / len * (halfExtent + 0.5f));
    }

    public static void DrawPort(Graphics g, RectangleF bounds, Pen pen)
    {
        using var fill = new SolidBrush(Color.White);
        g.FillRectangle(fill, bounds.X, bounds.Y, bounds.Width, bounds.Height);
        g.DrawRectangle(pen, bounds.X, bounds.Y, bounds.Width, bounds.Height);
    }

    public static void DrawPort(Graphics g, PointF center, Pen pen, float size = DefaultPortSize)
    {
        var half = size / 2f;
        DrawPort(g, new RectangleF(center.X - half, center.Y - half, size, size), pen);
    }

    /// <summary>포트 이름 라벨 — 컴포넌트 바깥쪽, 부착 변 방향으로 배치합니다.</summary>
    public static PointF GetPortNameLabelPosition(
        Graphics g,
        Font font,
        string name,
        UmlDiagram diagram,
        UmlDiagramNode portNode,
        RectangleF portBounds)
    {
        const float pad = 4f;
        var size = g.MeasureString(name, font);
        var centerY = portBounds.Top + (portBounds.Height - size.Height) / 2f;
        var centerX = portBounds.Left + portBounds.Width / 2f;

        if (!UmlComponentAttachment.IsAttached(portNode)
            || portNode.AttachedComponentNodeId is null
            || diagram.FindNode(portNode.AttachedComponentNodeId.Value) is not UmlDiagramNode component)
        {
            return new PointF(portBounds.Right + pad, centerY);
        }

        var comp = component.Bounds;
        return portNode.AttachmentEdge switch
        {
            UmlComponentAttachmentEdge.Left => new PointF(comp.Left - size.Width - pad, centerY),
            UmlComponentAttachmentEdge.Right => new PointF(comp.Right + pad, centerY),
            UmlComponentAttachmentEdge.Top => new PointF(centerX - size.Width / 2f, comp.Top - size.Height - pad),
            UmlComponentAttachmentEdge.Bottom => new PointF(centerX - size.Width / 2f, comp.Bottom + pad),
            _ => new PointF(portBounds.Right + pad, centerY),
        };
    }

    public static void DrawPortInterface(
        Graphics g,
        PointF center,
        Pen pen,
        UmlComponentInterfaceKind? kind,
        string interfaceName,
        float portHalf = InterfacePortSize / 2f)
    {
        if (string.IsNullOrWhiteSpace(interfaceName))
            return;

        using var fill = new SolidBrush(Color.White);
        var circleCenter = new PointF(
            center.X + portHalf + InterfaceStemLength + InterfaceCircleRadius,
            center.Y);
        var stemStart = OffsetFromPort(center, circleCenter, center, portHalf);

        if (kind == UmlComponentInterfaceKind.Required)
        {
            const InterfaceOutwardSide outward = InterfaceOutwardSide.Left;
            var socketCenter = new PointF(
                center.X - portHalf - InterfaceStemLength - InterfaceCircleRadius,
                center.Y);
            stemStart = OffsetFromPort(center, socketCenter, center, portHalf);
            var requiredStemEnd = GetSocketStemEndpoint(socketCenter, outward);
            g.DrawLine(pen, stemStart.X, stemStart.Y, requiredStemEnd.X, requiredStemEnd.Y);
            DrawRequiredSocket(g, pen, fill, socketCenter, outward);
            using var font = new Font("Segoe UI", 7f);
            using var brush = new SolidBrush(UmlDiagramStyle.TextColor);
            g.DrawString(interfaceName, font, brush, socketCenter.X - InterfaceCircleRadius - 2f, socketCenter.Y - 6f);
            return;
        }

        var stemEnd = GetCircleEdgeToward(circleCenter, stemStart);
        g.DrawLine(pen, stemStart.X, stemStart.Y, stemEnd.X, stemEnd.Y);
        g.FillEllipse(fill, circleCenter.X - InterfaceCircleRadius, circleCenter.Y - InterfaceCircleRadius,
            InterfaceCircleRadius * 2f, InterfaceCircleRadius * 2f);
        g.DrawEllipse(pen, circleCenter.X - InterfaceCircleRadius, circleCenter.Y - InterfaceCircleRadius,
            InterfaceCircleRadius * 2f, InterfaceCircleRadius * 2f);

        using (var font = new Font("Segoe UI", 7f))
        using (var brush = new SolidBrush(UmlDiagramStyle.TextColor))
        {
            g.DrawString(interfaceName, font, brush, circleCenter.X + InterfaceCircleRadius + 2f, circleCenter.Y - 6f);
        }
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

        if (sourceIsRequired && targetIsProvided)
        {
            DrawAssemblyInterfaceJoint(g, pen, start, end, pathPoints, routingKind, crossings);
            return;
        }

        var drawSocketAtStart = false;
        var drawLollipopAtEnd = false;
        var trimEnd = 0f;
        var lollipopRadius = AssemblyBallRadius;

        if (sourceIsComponent && targetIsComponent)
        {
            drawSocketAtStart = true;
            drawLollipopAtEnd = true;
            trimEnd = AssemblyBallRadius + 1.5f;
        }
        else if (sourceIsComponent && targetIsProvided)
        {
            drawSocketAtStart = assembly.SourceIsRequirer;
            drawLollipopAtEnd = false;
            trimEnd = InterfaceCircleRadius + 1f;
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
            DrawAssemblyLollipop(g, pen, end, pathPoints, routingKind, lollipopRadius);

        if (drawSocketAtStart)
            DrawAssemblySocket(g, pen, start, pathPoints, routingKind);
    }

    /// <summary>Required→Provided 조립: 연결선 위에 소켓(⊃)과 롤리팝(○)을 합쳐 그립니다.</summary>
    private static void DrawAssemblyInterfaceJoint(
        Graphics g,
        Pen pen,
        PointF start,
        PointF end,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        IReadOnlyList<(float T, PointF Pt)> crossings)
    {
        var trimEnd = InterfaceCircleRadius + 1f;
        UmlEdgeRouting.DrawRoutedPathSegment(g, pen, pathPoints, routingKind, crossings, trimEnd);
        DrawAssemblySocket(g, pen, start, pathPoints, routingKind);
        DrawAssemblyLollipop(g, pen, end, pathPoints, routingKind, InterfaceCircleRadius);
    }

    private static void DrawAssemblySocket(
        Graphics g,
        Pen pen,
        PointF stemEnd,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind)
    {
        using var fill = new SolidBrush(Color.White);
        var direction = UmlEdgeRouting.GetPathStartDirection(pathPoints, routingKind);
        var socketCenter = new PointF(
            stemEnd.X - direction.X * InterfaceCircleRadius,
            stemEnd.Y - direction.Y * InterfaceCircleRadius);
        var outward = DirectionToOutwardSide(-direction.X, -direction.Y);
        DrawRequiredSocket(g, pen, fill, socketCenter, outward);
    }

    private static void DrawAssemblyLollipop(
        Graphics g,
        Pen pen,
        PointF connectionPoint,
        PointF[] pathPoints,
        UmlEdgeRoutingKind routingKind,
        float radius)
    {
        var direction = UmlEdgeRouting.GetPathEndDirection(pathPoints, routingKind);
        var ballCenter = new PointF(
            connectionPoint.X - direction.X * radius,
            connectionPoint.Y - direction.Y * radius);
        using var fill = new SolidBrush(Color.White);
        g.FillEllipse(fill, ballCenter.X - radius, ballCenter.Y - radius, radius * 2f, radius * 2f);
        g.DrawEllipse(pen, ballCenter.X - radius, ballCenter.Y - radius, radius * 2f, radius * 2f);
    }

    public static InterfaceOutwardSide DirectionToOutwardSide(float dx, float dy)
    {
        if (MathF.Abs(dx) >= MathF.Abs(dy))
            return dx >= 0f ? InterfaceOutwardSide.Right : InterfaceOutwardSide.Left;

        return dy >= 0f ? InterfaceOutwardSide.Bottom : InterfaceOutwardSide.Top;
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
