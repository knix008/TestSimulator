namespace MyDiagramWinV10.Models;

public sealed class DiagramShape : DiagramElement
{
    public ShapeKind Kind { get; set; } = ShapeKind.Rectangle;
    public float X { get; set; }
    public float Y { get; set; }
    public float Width { get; set; } = 120;
    public float Height { get; set; } = 80;
    /// <summary>
    /// Shape's local rotation around the Y axis (vertical axis) in degrees.
    /// Used by 3D view only.
    /// </summary>
    public float RotYawDeg { get; set; }
    public string Text { get; set; } = string.Empty;
    public string? ImagePath { get; set; }
    public string? ImageBase64 { get; set; }
    public int FillColorArgb { get; set; } = unchecked((int)0xFFFFFFFF);
    public int BorderColorArgb { get; set; } = unchecked((int)0xFF000000);
    public int TextColorArgb { get; set; } = unchecked((int)0xFF000000);
    public float BorderWidth { get; set; } = 2f;
    public LineStyle BorderStyle { get; set; } = LineStyle.Solid;
    public string FontName { get; set; } = "맑은 고딕";
    public float FontSize { get; set; } = 10f;
    public bool FontBold { get; set; }

    // When true, the shape renders at a fixed collapsed height (title bar only)
    public bool IsCollapsed { get; set; }

    public RectangleF Bounds => new(X, Y, Width, Height);
    public RectangleF EffectiveBounds => IsCollapsed
        ? new RectangleF(X, Y, Width, 26f)
        : Bounds;

    public DiagramShape Clone()
    {
        return new DiagramShape
        {
            Id = Id,
            Kind = Kind,
            X = X,
            Y = Y,
            Width = Width,
            Height = Height,
            RotYawDeg = RotYawDeg,
            Text = Text,
            ImagePath = ImagePath,
            ImageBase64 = ImageBase64,
            FillColorArgb = FillColorArgb,
            BorderColorArgb = BorderColorArgb,
            TextColorArgb = TextColorArgb,
            BorderWidth = BorderWidth,
            BorderStyle = BorderStyle,
            FontName = FontName,
            FontSize = FontSize,
            FontBold = FontBold,
            IsCollapsed = IsCollapsed,
        };
    }
}
