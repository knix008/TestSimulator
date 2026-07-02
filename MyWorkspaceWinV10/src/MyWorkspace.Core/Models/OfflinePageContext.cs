namespace MyWorkspace.Core.Models;

public sealed class OfflinePageContext
{
    public required int PageId { get; init; }
    public required int WorkspaceId { get; init; }
    public required IReadOnlyList<OfflineWorkspaceSnapshot> Workspaces { get; init; }
}

public sealed class OfflineWorkspaceSnapshot
{
    public OfflineWorkspaceSnapshot(int id, int? parentId, string name, int ownerId)
    {
        Id = id;
        ParentId = parentId;
        Name = name;
        OwnerId = ownerId;
    }

    public int Id { get; }
    public int? ParentId { get; }
    public string Name { get; }
    public int OwnerId { get; }
}

public enum PageSaveResult
{
    Primary,
    LocalSqliteAutoSave,
    OfflineFallback,
    Failed
}
