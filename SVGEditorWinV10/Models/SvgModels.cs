namespace SVGEditorWinV10.Models;

public enum SvgElementKind
{
    Rectangle,
    RoundedRectangle,
    Ellipse,
    Triangle,
    Diamond,
    Hexagon,
    Parallelogram,
    Star,
    Line,
    Text,
    Image
}

public enum EditorTool
{
    Select,
    Rectangle,
    RoundedRectangle,
    Ellipse,
    Triangle,
    Diamond,
    Hexagon,
    Parallelogram,
    Star,
    Line,
    Text,
    Image
}

public sealed class SvgDocument
{
    public float Width { get; set; } = 800f;
    public float Height { get; set; } = 600f;
    public int BackgroundColorArgb { get; set; } = Color.White.ToArgb();
    public List<SvgElement> Elements { get; set; } = [];

    public SvgDocument Clone()
    {
        return new SvgDocument
        {
            Width = Width,
            Height = Height,
            BackgroundColorArgb = BackgroundColorArgb,
            Elements = Elements.Select(e => e.Clone()).ToList()
        };
    }
}

public sealed class SvgElement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public SvgElementKind Kind { get; set; }
    public RectangleF Bounds { get; set; }
    public PointF Start { get; set; }
    public PointF End { get; set; }
    public float CornerRadius { get; set; }
    public int FillColorArgb { get; set; } = Color.FromArgb(219, 234, 254).ToArgb();
    public FillPattern FillPattern { get; set; } = FillPattern.Solid;
    public float FillOpacity { get; set; } = 1f;
    public int StrokeColorArgb { get; set; } = Color.FromArgb(37, 99, 235).ToArgb();
    public float StrokeOpacity { get; set; } = 1f;
    public float StrokeWidth { get; set; } = 2f;
    public StrokeLineStyle StrokeLineStyle { get; set; } = StrokeLineStyle.Solid;
    public LineMarkerStyle StartMarker { get; set; } = LineMarkerStyle.None;
    public LineMarkerStyle EndMarker { get; set; } = LineMarkerStyle.None;
    public string TextContent { get; set; } = "텍스트";
    public string FontName { get; set; } = "Segoe UI";
    public float FontSize { get; set; } = 16f;
    public bool FontBold { get; set; }
    public bool FontItalic { get; set; }
    public bool TextBoundsManuallySized { get; set; }
    public string? ImageDataUri { get; set; }
    public string? ImageSourcePath { get; set; }

    public bool IsText => Kind == SvgElementKind.Text;
    public bool IsImage => Kind == SvgElementKind.Image;

    public Color FillColor
    {
        get => Rendering.SvgColorHelper.GetRgbColor(FillColorArgb);
        set => FillColorArgb = Rendering.SvgColorHelper.ToOpaqueArgb(value);
    }

    public Color StrokeColor
    {
        get => Rendering.SvgColorHelper.GetRgbColor(StrokeColorArgb);
        set => StrokeColorArgb = Rendering.SvgColorHelper.ToOpaqueArgb(value);
    }

    public SvgElement Clone()
    {
        return new SvgElement
        {
            Id = Id,
            Kind = Kind,
            Bounds = Bounds,
            Start = Start,
            End = End,
            CornerRadius = CornerRadius,
            FillColorArgb = FillColorArgb,
            FillPattern = FillPattern,
            FillOpacity = FillOpacity,
            StrokeColorArgb = StrokeColorArgb,
            StrokeOpacity = StrokeOpacity,
            StrokeWidth = StrokeWidth,
            StrokeLineStyle = StrokeLineStyle,
            StartMarker = StartMarker,
            EndMarker = EndMarker,
            TextContent = TextContent,
            FontName = FontName,
            FontSize = FontSize,
            FontBold = FontBold,
            FontItalic = FontItalic,
            TextBoundsManuallySized = TextBoundsManuallySized,
            ImageDataUri = ImageDataUri,
            ImageSourcePath = ImageSourcePath
        };
    }

    public RectangleF GetBounds()
    {
        if (Kind == SvgElementKind.Line)
        {
            var markerPadding = Math.Max(MarkerPadding(StartMarker), MarkerPadding(EndMarker));
            return ExpandLineBounds(Start, End, StrokeWidth + markerPadding + 6f);
        }

        if (Kind == SvgElementKind.Text)
            return Rendering.SvgTextRenderer.GetTextBounds(this);

        if (Kind == SvgElementKind.Image)
            return Bounds;

        return Bounds;
    }

    public bool HitTest(PointF point) => Rendering.SvgShapeRenderer.HitTest(this, point);

    private static float MarkerPadding(LineMarkerStyle marker) => marker switch
    {
        LineMarkerStyle.None => 0f,
        LineMarkerStyle.ArrowOpen or LineMarkerStyle.ArrowFilled => 12f,
        LineMarkerStyle.Circle or LineMarkerStyle.Diamond or LineMarkerStyle.Square => 10f,
        LineMarkerStyle.Cross => 8f,
        _ => 0f
    };

    private static RectangleF ExpandLineBounds(PointF start, PointF end, float padding)
    {
        var left = Math.Min(start.X, end.X) - padding;
        var top = Math.Min(start.Y, end.Y) - padding;
        var right = Math.Max(start.X, end.X) + padding;
        var bottom = Math.Max(start.Y, end.Y) + padding;
        return RectangleF.FromLTRB(left, top, right, bottom);
    }
}
