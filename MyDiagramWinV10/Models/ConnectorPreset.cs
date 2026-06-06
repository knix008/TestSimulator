namespace MyDiagramWinV10.Models;

public sealed record ConnectorPreset(
    ConnectorKind Kind,
    LineStyle LineStyle,
    ArrowHeadStyle StartArrow,
    ArrowHeadStyle EndArrow
)
{
    public static readonly ConnectorPreset Default =
        new(ConnectorKind.Straight, LineStyle.Solid, ArrowHeadStyle.None, ArrowHeadStyle.Open);
}
