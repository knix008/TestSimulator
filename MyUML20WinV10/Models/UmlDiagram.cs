using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlDiagram : UmlNamedElement
{
    public UmlDiagram()
    {
        Name = "Class Diagram";
    }

    [Category("기본")]
    [DisplayName("다이어그램 종류")]
    public UmlDiagramKind Kind { get; set; } = UmlDiagramKind.ClassDiagram;

    [Browsable(false)]
    public List<UmlDiagramNode> Nodes { get; set; } = [];

    [Browsable(false)]
    public List<UmlDiagramEdge> Edges { get; set; } = [];

    public UmlDiagramNode? FindNode(Guid id) => Nodes.FirstOrDefault(n => n.Id == id);

    public UmlDiagramNode? FindNodeByModelId(Guid modelElementId) =>
        Nodes.FirstOrDefault(n => n.ModelElementId == modelElementId);

    public UmlDiagramEdge? FindEdge(Guid id) => Edges.FirstOrDefault(e => e.Id == id);
}
