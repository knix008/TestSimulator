namespace MyDiagramWinV10.Models;

public sealed class DiagramProject
{
    public string Version { get; set; } = "1.0";
    public string Title { get; set; } = "새 다이어그램";
    public int CanvasBackColorArgb { get; set; } = unchecked((int)0xFFF5F5F5);
    public List<DiagramShape> Shapes { get; set; } = [];
    public List<DiagramConnector> Connectors { get; set; } = [];

    public DiagramProject Clone()
    {
        return new DiagramProject
        {
            Version = Version,
            Title = Title,
            CanvasBackColorArgb = CanvasBackColorArgb,
            Shapes = Shapes.Select(s => s.Clone()).ToList(),
            Connectors = Connectors.Select(c => c.Clone()).ToList()
        };
    }
}
