using MyWorkspace.Core.Enums;

namespace MyWorkspace.Core.Models;

public sealed class PageChangeLogListItem
{
    public int Id { get; init; }
    public DateTime ChangedAt { get; init; }
    public string ChangedByUsername { get; init; } = string.Empty;
    public PageChangeAction Action { get; init; }
    public string? OldTitle { get; init; }
    public string? NewTitle { get; init; }
    public int? OldContentLength { get; init; }
    public int? NewContentLength { get; init; }
    public string? Note { get; init; }
}
