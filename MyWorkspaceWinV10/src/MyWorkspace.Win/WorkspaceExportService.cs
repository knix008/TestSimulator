using Markdig;
using MyWorkspace.Core.Entities;
using MyWorkspace.Core.Enums;
using MyWorkspace.Core.Models;
using MyWorkspace.Core.Services;
using MyWorkspace.Win.Forms;

namespace MyWorkspace.Win;

internal sealed class WorkspaceExportResult
{
    public int WorkspaceCount { get; init; }
    public int PageCount { get; init; }
    public string OutputFilePath { get; init; } = string.Empty;
}

internal static class WorkspaceExportService
{
    public static async Task<WorkspaceExportResult> ExportAsync(
        User user,
        int workspaceId,
        string outputPath,
        PageExportFormat format,
        MarkdownPipeline pipeline,
        IWorkspaceService workspaces,
        IPageService pages)
    {
        if (!workspaces.CanAccessWorkspace(user, workspaceId))
            throw new InvalidOperationException(Localization.Get(K.WorkspaceAccessRequired));

        var tree = workspaces.GetWorkspaceTree(user);
        var workspaceNode = FindWorkspaceNode(tree, workspaceId)
            ?? throw new InvalidOperationException(Localization.Get(K.ErrWorkspaceNotFound));

        var combinedMarkdown = WorkspaceDocumentBuilder.BuildCombinedMarkdown(workspaceNode, user, pages);
        var title = workspaceNode.Name.Trim();
        var (workspaceCount, pageCount) = CountSubtree(workspaceNode);

        switch (format)
        {
            case PageExportFormat.Markdown:
                PageExportService.ExportCombinedMarkdown(title, combinedMarkdown, outputPath);
                break;
            case PageExportFormat.Word:
                PageExportService.ExportCombinedWord(title, combinedMarkdown, outputPath, pipeline);
                break;
            case PageExportFormat.Pdf:
                await PageExportService.ExportCombinedPdfAsync(title, combinedMarkdown, outputPath, pipeline)
                    .ConfigureAwait(true);
                break;
            default:
                throw new ArgumentOutOfRangeException(nameof(format));
        }

        return new WorkspaceExportResult
        {
            WorkspaceCount = workspaceCount,
            PageCount = pageCount,
            OutputFilePath = outputPath
        };
    }

    internal static WorkspaceTreeItem? FindWorkspaceNode(IEnumerable<WorkspaceTreeItem> nodes, int workspaceId)
    {
        foreach (var node in nodes)
        {
            if (node.Kind == TreeNodeKind.Workspace && node.Id == workspaceId)
                return node;

            var found = FindWorkspaceNode(node.Children, workspaceId);
            if (found != null)
                return found;
        }

        return null;
    }

    private static (int WorkspaceCount, int PageCount) CountSubtree(WorkspaceTreeItem workspaceNode)
    {
        var workspaceCount = 1;
        var pageCount = 0;

        foreach (var child in workspaceNode.Children)
        {
            if (child.Kind == TreeNodeKind.Page)
            {
                pageCount++;
                continue;
            }

            if (child.Kind != TreeNodeKind.Workspace)
                continue;

            var (childWorkspaces, childPages) = CountSubtree(child);
            workspaceCount += childWorkspaces;
            pageCount += childPages;
        }

        return (workspaceCount, pageCount);
    }
}
