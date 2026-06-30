using MyWorkspace.Core.Enums;

namespace MyWorkspace.Core.Models;

public sealed class WorkspaceTreeItem
{
    public TreeNodeKind Kind { get; init; }
    public int Id { get; init; }
    public string Name { get; init; } = string.Empty;
    public int? ParentWorkspaceId { get; init; }
    public bool IsFavorite { get; init; }
    public List<WorkspaceTreeItem> Children { get; init; } = new();
}
