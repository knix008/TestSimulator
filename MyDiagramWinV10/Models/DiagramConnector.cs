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
    public string Label { get; set; } = string.Empty;

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
            Label = Label
        };
    }
}
