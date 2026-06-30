namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private ToolStripMenuItem? menuSaveWorkspace;
    private ToolStripMenuItem? menuLoadWorkspace;
    private ToolStripSeparator? menuSepWorkspaceArchive;

    private void EnsureWorkspaceArchiveMenuItems()
    {
        if (menuSaveWorkspace != null)
            return;

        menuSepWorkspaceArchive = new ToolStripSeparator { Name = "menuSepWorkspaceArchive" };
        menuSaveWorkspace = new ToolStripMenuItem
        {
            Name = "menuSaveWorkspace",
            Image = IconAssets.Load(16, "workspace")
        };
        menuLoadWorkspace = new ToolStripMenuItem
        {
            Name = "menuLoadWorkspace",
            Image = IconAssets.Load(16, "folder_plus_workspace")
        };

        menuSaveWorkspace.Click += menuSaveWorkspace_Click;
        menuLoadWorkspace.Click += menuLoadWorkspace_Click;

        var insertIndex = menuFile.DropDownItems.IndexOf(menuRefreshTree) + 1;
        menuFile.DropDownItems.Insert(insertIndex, menuSepWorkspaceArchive);
        menuFile.DropDownItems.Insert(insertIndex + 1, menuSaveWorkspace);
        menuFile.DropDownItems.Insert(insertIndex + 2, menuLoadWorkspace);
    }

    private void menuSaveWorkspace_Click(object? sender, EventArgs e)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        var workspaceId = GetSelectedWorkspaceId();
        if (!workspaceId.HasValue)
        {
            MessageBox.Show(
                Localization.Get(K.SelectWorkspaceToSave),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        if (!AppConfig.Services.Workspaces.CanManageWorkspace(SessionContext.CurrentUser, workspaceId.Value))
        {
            MessageBox.Show(
                Localization.Get(K.WorkspaceManageRequired),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        var workspaceName = treeWorkspace.SelectedNode?.Text?.Trim() ?? "Workspace";
        using var dialog = new SaveFileDialog
        {
            Filter = WorkspaceArchiveFileIO.BuildSaveFileFilter(),
            DefaultExt = "wsp",
            FileName = $"{workspaceName}.wsp",
            Title = Localization.Get(K.MenuSaveWorkspace)
        };
        DialogPathHelper.ApplyExportDirectory(dialog);

        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        DialogPathHelper.RememberExportPath(dialog.FileName);

        try
        {
            SaveCurrentPage(refreshTree: false);
            var document = AppConfig.Services.WorkspaceArchives.ExportWorkspace(
                SessionContext.CurrentUser,
                workspaceId.Value);
            WorkspaceArchiveFileIO.Save(dialog.FileName, document, workspaceId.Value);
            MessageBox.Show(
                Localization.Get(K.WorkspaceSaveSucceeded),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.WorkspaceSaveFailed), ex);
        }
    }

    private void menuLoadWorkspace_Click(object? sender, EventArgs e)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        using var dialog = new OpenFileDialog
        {
            Filter = WorkspaceArchiveFileIO.BuildSaveFileFilter(),
            Title = Localization.Get(K.MenuLoadWorkspace)
        };
        DialogPathHelper.ApplyOpenDirectory(dialog);

        if (dialog.ShowDialog(this) != DialogResult.OK)
            return;

        DialogPathHelper.RememberOpenPath(dialog.FileName);
        ImportWorkspaceFromFile(dialog.FileName);
    }

    private void TryImportPendingWspIfAny()
    {
        if (string.IsNullOrWhiteSpace(_pendingWspImportPath))
            return;

        var path = _pendingWspImportPath;
        _pendingWspImportPath = null;
        ImportWorkspaceFromFile(path);
    }

    private void ImportWorkspaceFromFile(string filePath)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        DialogPathHelper.RememberOpenPath(filePath);

        try
        {
            SaveCurrentPage(refreshTree: false);
            var (document, assets) = WorkspaceArchiveFileIO.Load(filePath);
            var result = AppConfig.Services.WorkspaceArchives.ImportWorkspace(
                SessionContext.CurrentUser,
                document,
                assets,
                PageAssetStore.WriteAssetBytes);

            LoadWorkspaceTree(selectPageId: null, selectWorkspaceId: result.RootWorkspaceId);

            MessageBox.Show(
                string.Format(
                    Localization.Get(K.WorkspaceLoadSucceeded),
                    result.WorkspaceCount,
                    result.PageCount),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.WorkspaceLoadFailed), ex);
        }
    }
}
