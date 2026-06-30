namespace MyWorkspace.Core.Models;

public sealed class WorkspaceArchiveDocument
{
    public int FormatVersion { get; init; } = 1;
    public DateTime ExportedAt { get; init; }
    public string ExportedBy { get; init; } = string.Empty;
    public WorkspaceArchiveNode Root { get; init; } = new();
}

public sealed class WorkspaceArchiveNode
{
    public string Name { get; init; } = string.Empty;
    public List<WorkspaceArchivePage> Pages { get; init; } = new();
    public List<WorkspaceArchiveNode> Children { get; init; } = new();
}

public sealed class WorkspaceArchivePage
{
    public string Key { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
}

public sealed class WorkspaceImportResult
{
    public int RootWorkspaceId { get; init; }
    public int WorkspaceCount { get; init; }
    public int PageCount { get; init; }
}
