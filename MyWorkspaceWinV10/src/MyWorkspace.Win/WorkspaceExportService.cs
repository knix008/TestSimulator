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
    public string OutputDirectory { get; init; } = string.Empty;
}

internal static class WorkspaceExportService
{
    public static async Task<WorkspaceExportResult> ExportAsync(
        User user,
        int workspaceId,
        string destinationRoot,
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

        var rootFolderName = PageDocumentBuilder.SanitizeFileName(workspaceNode.Name);
        var outputRoot = Path.Combine(destinationRoot, rootFolderName);
        Directory.CreateDirectory(outputRoot);

        var entries = new List<WorkspacePageExportEntry>();
        CollectPages(workspaceNode, relativeDirectory: string.Empty, entries);

        var (workspaceCount, pageCount) = CountSubtree(workspaceNode);
        var exportedPages = 0;

        foreach (var entry in entries)
        {
            var page = pages.GetById(user, entry.PageId)
                ?? throw new InvalidOperationException(Localization.Get(K.ErrPageNotFound));

            var targetDirectory = string.IsNullOrEmpty(entry.RelativeDirectory)
                ? outputRoot
                : Path.Combine(outputRoot, entry.RelativeDirectory);
            Directory.CreateDirectory(targetDirectory);

            var baseName = PageDocumentBuilder.SanitizeFileName(page.Title);
            var outputPath = format switch
            {
                PageExportFormat.Markdown => GetUniqueOutputPath(targetDirectory, baseName, ".md"),
                PageExportFormat.Word => GetUniqueOutputPath(targetDirectory, baseName, ".docx"),
                PageExportFormat.Pdf => GetUniqueOutputPath(targetDirectory, baseName, ".pdf"),
                _ => throw new ArgumentOutOfRangeException(nameof(format))
            };

            switch (format)
            {
                case PageExportFormat.Markdown:
                    PageExportService.ExportMarkdown(page.Title, page.Content, outputPath, page.Id);
                    break;
                case PageExportFormat.Word:
                    PageExportService.ExportWord(page.Title, page.Content, outputPath, pipeline, page.Id);
                    break;
                case PageExportFormat.Pdf:
                    await PageExportService.ExportPdfAsync(page.Title, page.Content, outputPath, pipeline, page.Id)
                        .ConfigureAwait(true);
                    break;
            }

            exportedPages++;
        }

        return new WorkspaceExportResult
        {
            WorkspaceCount = workspaceCount,
            PageCount = exportedPages,
            OutputDirectory = outputRoot
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

    private static void CollectPages(
        WorkspaceTreeItem workspaceNode,
        string relativeDirectory,
        ICollection<WorkspacePageExportEntry> entries)
    {
        foreach (var child in workspaceNode.Children)
        {
            if (child.Kind == TreeNodeKind.Page)
            {
                entries.Add(new WorkspacePageExportEntry(child.Id, relativeDirectory));
                continue;
            }

            if (child.Kind != TreeNodeKind.Workspace)
                continue;

            var childDirectory = string.IsNullOrEmpty(relativeDirectory)
                ? PageDocumentBuilder.SanitizeFileName(child.Name)
                : Path.Combine(relativeDirectory, PageDocumentBuilder.SanitizeFileName(child.Name));
            CollectPages(child, childDirectory, entries);
        }
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

    private static string GetUniqueOutputPath(string directory, string baseName, string extension)
    {
        var candidate = Path.Combine(directory, baseName + extension);
        if (!File.Exists(candidate))
            return candidate;

        for (var index = 2; ; index++)
        {
            candidate = Path.Combine(directory, $"{baseName} ({index}){extension}");
            if (!File.Exists(candidate))
                return candidate;
        }
    }

    private sealed record WorkspacePageExportEntry(int PageId, string RelativeDirectory);
}
