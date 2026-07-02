namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private ToolStripMenuItem? menuExportWorkspace;

    private void EnsureWorkspaceExportMenuItems()
    {
        if (menuExportWorkspace != null)
            return;

        menuExportWorkspace = new ToolStripMenuItem
        {
            Name = "menuExportWorkspace",
            Image = IconAssets.LoadMonochrome(16, "export")
        };
        menuExportWorkspace.Click += menuExportWorkspace_Click;

        var insertIndex = menuFile.DropDownItems.IndexOf(menuSavePage) + 1;
        menuFile.DropDownItems.Insert(insertIndex, menuExportWorkspace);
    }

    private async void menuExportWorkspace_Click(object? sender, EventArgs e)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        var workspaceId = GetSelectedWorkspaceId();
        if (!workspaceId.HasValue)
        {
            MessageBox.Show(
                Localization.Get(K.SelectWorkspaceToExport),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        if (!AppConfig.Services.Workspaces.CanAccessWorkspace(SessionContext.CurrentUser, workspaceId.Value))
        {
            MessageBox.Show(
                Localization.Get(K.WorkspaceAccessRequired),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        using var formatDialog = new ExportPageForm(K.ExportWorkspaceTitle, K.ExportWorkspacePrompt);
        if (formatDialog.ShowDialog(this) != DialogResult.OK)
            return;

        using var folderDialog = new FolderBrowserDialog
        {
            Description = Localization.Get(K.ExportWorkspaceChooseFolder),
            UseDescriptionForTitle = true,
            ShowNewFolderButton = true
        };
        DialogPathHelper.ApplyExportDirectory(folderDialog);

        if (folderDialog.ShowDialog(this) != DialogResult.OK)
            return;

        DialogPathHelper.RememberExportPath(folderDialog.SelectedPath);

        try
        {
            await SaveCurrentPageAsync(refreshTree: false);

            var result = await WorkspaceExportService.ExportAsync(
                SessionContext.CurrentUser,
                workspaceId.Value,
                folderDialog.SelectedPath,
                formatDialog.SelectedFormat,
                _pipeline,
                AppConfig.Services.Workspaces,
                AppConfig.Services.Pages);

            MessageBox.Show(
                string.Format(
                    Localization.Get(K.ExportWorkspaceSucceeded),
                    result.WorkspaceCount,
                    result.PageCount,
                    result.OutputDirectory),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.ExportWorkspaceFailed), ex);
        }
    }
}
