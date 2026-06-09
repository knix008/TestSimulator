using System.ComponentModel;
using System.Text.Json.Serialization;
using MyUML20WinV10.Serialization;

namespace MyUML20WinV10.Models;

public sealed class UmlDiagramEdge
{
    [Browsable(false)]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Browsable(false)]
    public Guid ModelElementId { get; set; }

    [Browsable(false)]
    public Guid SourceNodeId { get; set; }

    [Browsable(false)]
    public Guid TargetNodeId { get; set; }

    /// <summary>Sequence diagram message horizontal line Y (canvas coordinates).</summary>
    [Browsable(false)]
    public float SequenceY { get; set; }

    [Category("연결")]
    [DisplayName("연결 방식")]
    [JsonConverter(typeof(UmlEdgeRoutingKindJsonConverter))]
    public UmlEdgeRoutingKind RoutingKind { get; set; } = UmlEdgeRoutingKind.Straight;

    /// <summary>Bent routing: horizontal segment X when routing horizontal-first.</summary>
    [Browsable(false)]
    public float? OrthoMidX { get; set; }

    /// <summary>Bent routing: vertical segment Y when routing vertical-first.</summary>
    [Browsable(false)]
    public float? OrthoMidY { get; set; }
}
