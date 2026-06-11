namespace MyUML20WinV10.Rendering;

public readonly struct UmlActorPose
{
    public PointF HeadCenter { get; init; }
    public float HeadRadius { get; init; }
    public PointF ArmShoulder { get; init; }
    public PointF ArmLeft { get; init; }
    public PointF ArmRight { get; init; }
    public PointF BodyBottom { get; init; }
    public PointF FootLeft { get; init; }
    public PointF FootRight { get; init; }
}

public static class UmlActorGeometry
{
    public const float ReferenceWidth = 72f;
    public const float ReferenceHeight = 96f;
    public const float MinWidth = 36f;
    public const float LabelGap = 6f;
    public const float MinLabelHeight = 14f;
    public const float LabelLineHeight = 13f;

    // Canonical stick-figure coordinates in a 72×96 reference box.
    private const float RefHeadRadius = 10.08f; // 72 * 0.14
    private const float RefHeadCenterX = 36f;
    private const float RefHeadCenterY = 14f;
    private const float RefArmShoulderY = RefHeadCenterY + RefHeadRadius * 2.2f;
    private const float RefArmLeftX = 8f;
    private const float RefArmRightX = 64f;
    private const float RefArmY = 52.8f; // 96 * 0.55
    private const float RefBodyBottomY = 72f; // 96 - 24
    private const float RefFootY = 90f; // 96 - 6
    private const float RefFootLeftX = 10f;
    private const float RefFootRightX = 62f;

    public static bool IsActorPresentation(Models.UmlNodePresentation presentation) =>
        presentation == Models.UmlNodePresentation.Actor;

    public static float GetFigureHeight(float nodeWidth) =>
        ReferenceHeight * (nodeWidth / ReferenceWidth);

    public static RectangleF GetFigureBounds(RectangleF nodeBounds)
    {
        var scale = nodeWidthScale(nodeBounds.Width);
        var figureWidth = ReferenceWidth * scale;
        var figureHeight = ReferenceHeight * scale;
        return new RectangleF(
            nodeBounds.Left + (nodeBounds.Width - figureWidth) / 2f,
            nodeBounds.Top,
            figureWidth,
            figureHeight);
    }

    public static RectangleF GetLabelBounds(RectangleF nodeBounds)
    {
        var figure = GetFigureBounds(nodeBounds);
        var top = figure.Bottom + LabelGap;
        return new RectangleF(nodeBounds.Left, top, nodeBounds.Width, Math.Max(0f, nodeBounds.Bottom - top));
    }

    public static float EstimateLabelHeight(string? name, float nodeWidth)
    {
        if (string.IsNullOrWhiteSpace(name))
            return MinLabelHeight;

        var charsPerLine = Math.Max(4f, nodeWidth / 4.5f);
        var lines = Math.Max(1, (int)Math.Ceiling(name.Length / charsPerLine));
        return Math.Max(MinLabelHeight, lines * LabelLineHeight);
    }

    public static float GetMinimumNodeHeight(float nodeWidth, string? name) =>
        GetFigureHeight(nodeWidth) + LabelGap + EstimateLabelHeight(name, nodeWidth) + 2f;

    public static RectangleF GetUniformBounds(RectangleF bounds) => GetFigureBounds(bounds);

    /// <summary>Scales the full stick figure to fit inside a preview tile (toolbox, tree icon).</summary>
    public static RectangleF GetPreviewBounds(RectangleF area, float padding = 2f)
    {
        var inner = new RectangleF(
            area.Left + padding,
            area.Top + padding,
            Math.Max(1f, area.Width - padding * 2f),
            Math.Max(1f, area.Height - padding * 2f));
        var scale = Math.Min(inner.Width / ReferenceWidth, inner.Height / ReferenceHeight);
        var width = ReferenceWidth * scale;
        var height = ReferenceHeight * scale;
        return new RectangleF(
            inner.Left + (inner.Width - width) / 2f,
            inner.Top + (inner.Height - height) / 2f,
            width,
            height);
    }

    public static RectangleF UniformFromDrag(RectangleF dragRect) =>
        NodeBoundsFromDrag(dragRect);

    public static RectangleF NodeBoundsFromDrag(RectangleF dragRect, string? label = null)
    {
        var scale = Math.Max(
            Math.Max(dragRect.Width / ReferenceWidth, dragRect.Height / (ReferenceHeight + LabelGap + MinLabelHeight)),
            MinWidth / ReferenceWidth);
        var width = ReferenceWidth * scale;
        var height = GetMinimumNodeHeight(width, label);
        return new RectangleF(
            dragRect.Left + (dragRect.Width - width) / 2f,
            dragRect.Top + (dragRect.Height - height) / 2f,
            width,
            height);
    }

    public static RectangleF NormalizeNodeBounds(RectangleF bounds, string? label)
    {
        var width = Math.Max(bounds.Width, MinWidth);
        var height = Math.Max(bounds.Height, GetMinimumNodeHeight(width, label));
        return new RectangleF(bounds.Left, bounds.Top, width, height);
    }

    public static UmlActorPose ComputePose(RectangleF figureBounds)
    {
        var uniform = GetUniformBounds(figureBounds);
        var scale = uniform.Width / ReferenceWidth;

        PointF Map(float x, float y) =>
            new(uniform.Left + x * scale, uniform.Top + y * scale);

        return new UmlActorPose
        {
            HeadCenter = Map(RefHeadCenterX, RefHeadCenterY),
            HeadRadius = RefHeadRadius * scale,
            ArmShoulder = Map(RefHeadCenterX, RefArmShoulderY),
            ArmLeft = Map(RefArmLeftX, RefArmY),
            ArmRight = Map(RefArmRightX, RefArmY),
            BodyBottom = Map(RefHeadCenterX, RefBodyBottomY),
            FootLeft = Map(RefFootLeftX, RefFootY),
            FootRight = Map(RefFootRightX, RefFootY),
        };
    }

    public static void DrawStickFigure(Graphics g, Pen pen, RectangleF nodeBounds)
    {
        var figureBounds = GetFigureBounds(nodeBounds);
        var pose = ComputePose(figureBounds);
        var head = pose.HeadCenter;
        var r = pose.HeadRadius;

        g.DrawEllipse(pen, head.X - r, head.Y - r, r * 2f, r * 2f);
        g.DrawLine(pen, head.X, head.Y + r, pose.BodyBottom.X, pose.BodyBottom.Y);
        g.DrawLine(pen, pose.ArmShoulder, pose.ArmLeft);
        g.DrawLine(pen, pose.ArmShoulder, pose.ArmRight);
        g.DrawLine(pen, pose.BodyBottom, pose.FootLeft);
        g.DrawLine(pen, pose.BodyBottom, pose.FootRight);
    }

    public static void AddStickFigurePath(System.Drawing.Drawing2D.GraphicsPath path, RectangleF nodeBounds)
    {
        var figureBounds = GetFigureBounds(nodeBounds);
        var pose = ComputePose(figureBounds);
        var head = pose.HeadCenter;
        var r = pose.HeadRadius;
        path.AddEllipse(head.X - r, head.Y - r, r * 2f, r * 2f);
        path.StartFigure();
        path.AddLine(head.X, head.Y + r, pose.BodyBottom.X, pose.BodyBottom.Y);
        path.StartFigure();
        path.AddLine(pose.ArmShoulder, pose.ArmLeft);
        path.StartFigure();
        path.AddLine(pose.ArmShoulder, pose.ArmRight);
        path.StartFigure();
        path.AddLine(pose.BodyBottom, pose.FootLeft);
        path.StartFigure();
        path.AddLine(pose.BodyBottom, pose.FootRight);
    }

    private static float nodeWidthScale(float nodeWidth) => nodeWidth / ReferenceWidth;
}
