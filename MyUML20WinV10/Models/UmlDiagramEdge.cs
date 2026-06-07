using System.ComponentModel;

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
}
