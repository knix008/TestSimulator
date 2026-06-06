namespace MyDiagramWinV10.Models;

public sealed class DiagramConnector : DiagramElement
{
    public Guid SourceShapeId { get; set; }
    public Guid TargetShapeId { get; set; }
    public ConnectorKind Kind { get; set; } = ConnectorKind.Straight;
    public int LineColorArgb { get; set; } = unchecked((int)0xFF000000);
    public float LineWidth { get; set; } = 2f;
    public LineStyle LineStyle { get; set; } = LineStyle.Solid;
    public bool HasStartArrow { get; set; }
    public bool HasEndArrow { get; set; } = true;
    public ArrowHeadStyle StartArrowStyle { get; set; } = ArrowHeadStyle.Open;
    public ArrowHeadStyle EndArrowStyle { get; set; } = ArrowHeadStyle.Open;
    public string Label { get; set; } = string.Empty;

    // Fixed attachment angles (degrees, GDI+ convention). null = auto-calculated.
    public float? SourceAnchorAngle { get; set; }
    public float? TargetAnchorAngle { get; set; }

    // Orthogonal routing: position of the adjustable middle segment (null = auto midpoint)
    public float? OrthoMidX { get; set; }
    public float? OrthoMidY { get; set; }

    // Curved routing: visual midpoint offset from the straight-line midpoint (null = default S-curve)
    public float? CurveMidOffsetX { get; set; }
    public float? CurveMidOffsetY { get; set; }

    public DiagramConnector Clone()
    {
        return new DiagramConnector
        {
            Id = Id,
            SourceShapeId = SourceShapeId,
            TargetShapeId = TargetShapeId,
            Kind = Kind,
            LineColorArgb = LineColorArgb,
            LineWidth = LineWidth,
            LineStyle = LineStyle,
            HasStartArrow = HasStartArrow,
            HasEndArrow = HasEndArrow,
            StartArrowStyle = StartArrowStyle,
            EndArrowStyle = EndArrowStyle,
            Label = Label,
            SourceAnchorAngle = SourceAnchorAngle,
            TargetAnchorAngle = TargetAnchorAngle,
            OrthoMidX = OrthoMidX,
            OrthoMidY = OrthoMidY,
            CurveMidOffsetX = CurveMidOffsetX,
            CurveMidOffsetY = CurveMidOffsetY,
        };
    }
}
