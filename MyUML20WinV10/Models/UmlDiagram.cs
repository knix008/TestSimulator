using System.ComponentModel;
using System.Text.Json.Serialization;

namespace MyUML20WinV10.Models;

public sealed class UmlDiagram : UmlNamedElement
{
    public UmlDiagram()
    {
        Name = UmlDiagramCatalog.GetDiagramKindDisplayName(UmlDiagramKind.ClassDiagram);
    }

    [Category("기본")]
    [DisplayName("다이어그램 종류")]
    public UmlDiagramKind Kind { get; set; } = UmlDiagramKind.ClassDiagram;

    [Category("기본")]
    [DisplayName("노드 수")]
    [JsonIgnore]
    public int NodeCount => Nodes.Count;

    [Category("기본")]
    [DisplayName("연결 수")]
    [JsonIgnore]
    public int EdgeCount => Edges.Count;

    [Browsable(false)]
    public List<UmlDiagramNode> Nodes { get; set; } = [];

    [Browsable(false)]
    public List<UmlDiagramEdge> Edges { get; set; } = [];

    public UmlDiagramNode? FindNode(Guid id) => Nodes.FirstOrDefault(n => n.Id == id);

    public UmlDiagramNode? FindNodeByModelId(Guid modelElementId) =>
        Nodes.FirstOrDefault(n => n.ModelElementId == modelElementId);

    public UmlDiagramEdge? FindEdge(Guid id) => Edges.FirstOrDefault(e => e.Id == id);
}
