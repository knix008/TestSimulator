using MyWorkspace.Core.Enums;

namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private void ImportMarkdownFilesFromDrop(string[] paths, DragEventArgs e)
    {
        var workspaceId = GetWorkspaceIdFromDropPoint(e);
        if (!workspaceId.HasValue)
            return;

        SaveCurrentPage(refreshTree: false);

        int? lastImportedPageId = null;
        var importedCount = 0;

        foreach (var path in paths)
        {
            if (string.IsNullOrWhiteSpace(path) || Directory.Exists(path))
                continue;

            if (!path.EndsWith(".md", StringComparison.OrdinalIgnoreCase) &&
                !path.EndsWith(".markdown", StringComparison.OrdinalIgnoreCase))
                continue;

            try
            {
                lastImportedPageId = ImportMarkdownFileIntoWorkspace(path, workspaceId.Value);
                importedCount++;
            }
            catch (Exception ex)
            {
                ErrorDetailForm.Show(this, Path.GetFileName(path), ex);
            }
        }

        if (importedCount == 0)
            return;

        if (lastImportedPageId.HasValue)
        {
            LoadWorkspaceTree(selectPageId: lastImportedPageId.Value);
            SelectPageInTree(lastImportedPageId.Value);
            _ = LoadPageAsync(lastImportedPageId.Value);
            return;
        }

        LoadWorkspaceTree(selectWorkspaceId: workspaceId);
    }

    private int ImportMarkdownFileIntoWorkspace(string markdownFilePath, int workspaceId)
    {
        var prepared = PageMarkdownImporter.ReadFile(markdownFilePath);
        var initialContent = PageTitleHelper.EnsureTitleHeading(prepared.Title, prepared.Body);

        var page = AppConfig.Services.Pages.CreatePage(
            SessionContext.CurrentUser,
            workspaceId,
            prepared.Title,
            initialContent);

        var pageTitle = page.Title;
        var finalContent = PageMarkdownImporter.ImportLocalAssets(prepared.Body, markdownFilePath, page.Id);
        finalContent = PageTitleHelper.EnsureTitleHeading(pageTitle, finalContent);

        if (!string.Equals(page.Content, finalContent, StringComparison.Ordinal))
        {
            AppConfig.Services.Pages.UpdatePage(
                SessionContext.CurrentUser,
                page.Id,
                pageTitle,
                finalContent);
        }

        return page.Id;
    }

    private int? GetWorkspaceIdFromDropPoint(DragEventArgs e)
    {
        var clientPoint = treeWorkspace.PointToClient(new Point(e.X, e.Y));
        var targetNode = treeWorkspace.GetNodeAt(clientPoint);
        if (targetNode?.Tag is not TreeNodeData targetData)
            return null;

        return targetData.Kind switch
        {
            TreeNodeKind.Workspace => targetData.Id,
            TreeNodeKind.Page => targetData.WorkspaceId,
            _ => null
        };
    }

    private bool IsMarkdownFileDrag(DragEventArgs e)
    {
        if (e.Data?.GetDataPresent(DataFormats.FileDrop) != true)
            return false;

        if (e.Data.GetData(DataFormats.FileDrop) is not string[] paths)
            return false;

        return paths.Any(static path =>
            !string.IsNullOrWhiteSpace(path) &&
            !Directory.Exists(path) &&
            (path.EndsWith(".md", StringComparison.OrdinalIgnoreCase) ||
             path.EndsWith(".markdown", StringComparison.OrdinalIgnoreCase)));
    }

    private bool CanAcceptMarkdownFileDrop(DragEventArgs e)
    {
        if (!SessionContext.IsLoggedIn || !IsMarkdownFileDrag(e))
            return false;

        var workspaceId = GetWorkspaceIdFromDropPoint(e);
        if (!workspaceId.HasValue)
            return false;

        return AppConfig.Services.Workspaces.CanEditWorkspaceContent(SessionContext.CurrentUser, workspaceId.Value);
    }
}
