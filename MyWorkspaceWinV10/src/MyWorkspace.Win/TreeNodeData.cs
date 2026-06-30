using MyWorkspace.Core.Enums;

namespace MyWorkspace.Win;

internal sealed class TreeNodeData
{
    public TreeNodeKind Kind { get; init; }
    public int Id { get; init; }
    public int? WorkspaceId { get; init; }
}
