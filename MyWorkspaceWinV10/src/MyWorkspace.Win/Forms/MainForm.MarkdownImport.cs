using MyWorkspace.Core.Enums;



namespace MyWorkspace.Win.Forms;



public partial class MainForm

{

    private void ImportMarkdownFilesFromDrop(string[] paths, DragEventArgs e)

    {

        var normalizedPaths = NormalizeMarkdownImportPaths(paths);

        if (normalizedPaths.Length == 0)

            return;



        var workspaceId = GetWorkspaceIdFromDropPoint(e) ?? _markdownDropTargetWorkspaceId;

        _markdownDropTargetWorkspaceId = null;

        if (!workspaceId.HasValue)

            return;



        _ = ImportMarkdownFilesIntoWorkspaceAsync(normalizedPaths, workspaceId.Value);

    }



    private async Task ImportMarkdownFilesIntoWorkspaceAsync(string[] paths, int workspaceId)

    {

        SaveCurrentPage(refreshTree: false);



        int? lastImportedPageId = null;

        var importedCount = 0;



        foreach (var path in paths)

        {

            try

            {

                lastImportedPageId = ImportMarkdownFileIntoWorkspace(path, workspaceId);

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

            _suppressWorkspaceSelection = true;
            try
            {
                LoadWorkspaceTree(selectPageId: lastImportedPageId.Value);
            }
            finally
            {
                _suppressWorkspaceSelection = false;
            }

            await OpenPageTabAsync(lastImportedPageId.Value);

            return;

        }



        LoadWorkspaceTree(selectWorkspaceId: workspaceId);

    }



    private async Task HandleEditorMarkdownFilesDroppedAsync(string[] paths)

    {

        var normalizedPaths = NormalizeMarkdownImportPaths(paths);

        if (normalizedPaths.Length == 0)

            return;



        var workspaceId = ResolveMarkdownImportWorkspaceId();

        if (!workspaceId.HasValue)

        {

            MessageBox.Show(

                Localization.Get(K.SelectWorkspaceForPage),

                L.AppName,

                MessageBoxButtons.OK,

                MessageBoxIcon.Information);

            return;

        }



        if (!AppConfig.Services.Workspaces.CanEditWorkspaceContent(SessionContext.CurrentUser, workspaceId.Value))

        {

            MessageBox.Show(

                Localization.Get(K.ErrWorkspaceManageDenied),

                L.AppName,

                MessageBoxButtons.OK,

                MessageBoxIcon.Information);

            return;

        }



        await ImportMarkdownFilesIntoWorkspaceAsync(normalizedPaths, workspaceId.Value);

    }



    private int? ResolveMarkdownImportWorkspaceId()

    {

        if (_markdownDropTargetWorkspaceId.HasValue)

            return _markdownDropTargetWorkspaceId;



        if (_currentPageId is int pageId)

        {

            var page = AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId);

            if (page != null)

                return page.WorkspaceId;

        }



        if (_draftWorkspaceId.HasValue)

            return _draftWorkspaceId;



        return GetSelectedWorkspaceId() ?? GetTargetWorkspaceIdForNewPage();

    }



    private int ImportMarkdownFileIntoWorkspace(string markdownFilePath, int workspaceId)

    {

        var sourcePath = NormalizeExistingMarkdownPath(markdownFilePath)

            ?? throw new FileNotFoundException("Markdown file not found.", markdownFilePath);



        var prepared = PageMarkdownImporter.ReadFile(sourcePath);

        var importTitle = PageMarkdownImporter.GetImportTitle(sourcePath, prepared);

        var initialContent = PageTitleHelper.EnsureTitleHeading(importTitle, prepared.Body);



        var page = AppConfig.Services.Pages.CreatePage(

            SessionContext.CurrentUser,

            workspaceId,

            importTitle,

            initialContent);



        var pageTitle = page.Title;

        var finalContent = PageMarkdownImporter.ImportLocalAssets(prepared.Body, sourcePath, page.Id);

        finalContent = PageTitleHelper.ReplaceFirstHeadingTitle(finalContent, pageTitle);



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



    private void UpdateMarkdownDropTarget(DragEventArgs e)

    {

        if (!IsMarkdownFileDrag(e))

        {

            _markdownDropTargetWorkspaceId = null;

            return;

        }



        var targetNode = GetTreeNodeFromDragEvent(e);

        _markdownDropTargetWorkspaceId = ResolveWorkspaceIdFromTreeNode(targetNode) ?? GetSelectedWorkspaceId();



        if (targetNode == null || ReferenceEquals(treeWorkspace.SelectedNode, targetNode))

            return;



        _suppressWorkspaceSelection = true;

        try

        {

            treeWorkspace.SelectedNode = targetNode;

        }

        finally

        {

            _suppressWorkspaceSelection = false;

        }

    }



    private int? GetWorkspaceIdFromDropPoint(DragEventArgs e) =>

        ResolveWorkspaceIdFromTreeNode(GetTreeNodeFromDragEvent(e)) ?? GetSelectedWorkspaceId();



    private static int? ResolveWorkspaceIdFromTreeNode(TreeNode? targetNode)

    {

        if (targetNode?.Tag is not TreeNodeData targetData)

            return null;



        return targetData.Kind switch

        {

            TreeNodeKind.Workspace => targetData.Id,

            TreeNodeKind.Page => targetData.WorkspaceId,

            _ => null

        };

    }



    private TreeNode? GetTreeNodeFromDragEvent(DragEventArgs e) =>

        treeWorkspace.GetNodeAtClientPoint(new Point(e.X, e.Y));



    private static string[] ExtractDroppedPaths(DragEventArgs e)

    {

        if (e.Data?.GetDataPresent(DataFormats.FileDrop, autoConvert: true) != true)

            return Array.Empty<string>();



        return e.Data.GetData(DataFormats.FileDrop, autoConvert: true) switch

        {

            string[] paths => paths,

            string single => new[] { single },

            _ => Array.Empty<string>()

        };

    }



    private static string[] NormalizeMarkdownImportPaths(IEnumerable<string> paths)

    {

        var normalized = new List<string>();

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);



        foreach (var path in paths)

        {

            var fullPath = NormalizeExistingMarkdownPath(path);

            if (fullPath == null || !seen.Add(fullPath))

                continue;



            normalized.Add(fullPath);

        }



        return normalized.ToArray();

    }



    private static string? NormalizeExistingMarkdownPath(string path)

    {

        if (string.IsNullOrWhiteSpace(path))

            return null;



        try

        {

            var trimmed = path.Trim().Trim('"');

            if (!IsMarkdownFilePath(trimmed))

                return null;



            var fullPath = Path.GetFullPath(trimmed);

            return File.Exists(fullPath) ? fullPath : null;

        }

        catch

        {

            return null;

        }

    }



    private static bool IsMarkdownFilePath(string path) =>

        !string.IsNullOrWhiteSpace(path) &&

        !Directory.Exists(path) &&

        (path.EndsWith(".md", StringComparison.OrdinalIgnoreCase) ||

         path.EndsWith(".markdown", StringComparison.OrdinalIgnoreCase));



    private bool IsMarkdownFileDrag(DragEventArgs e) =>

        ExtractDroppedPaths(e).Any(IsMarkdownFilePath);



    private bool CanAcceptMarkdownFileDrop(DragEventArgs e)

    {

        if (!SessionContext.IsLoggedIn || !IsMarkdownFileDrag(e))

            return false;



        var workspaceId = GetWorkspaceIdFromDropPoint(e) ?? _markdownDropTargetWorkspaceId;

        if (!workspaceId.HasValue)

            return false;



        return AppConfig.Services.Workspaces.CanEditWorkspaceContent(SessionContext.CurrentUser, workspaceId.Value);

    }

}


