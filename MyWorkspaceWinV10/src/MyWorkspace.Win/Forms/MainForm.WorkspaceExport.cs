using MyWorkspace.Core.Enums;

namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private async void menuExportWorkspace_Click(object? sender, EventArgs e)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        var data = GetWorkspaceContextMenuNodeData() ?? GetSelectedNodeData();
        int? workspaceId = data?.Kind == TreeNodeKind.Workspace
            ? data.Id
            : GetSelectedWorkspaceId();

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

        var workspaceNode = WorkspaceExportService.FindWorkspaceNode(
            AppConfig.Services.Workspaces.GetWorkspaceTree(SessionContext.CurrentUser),
            workspaceId.Value);
        if (workspaceNode == null)
        {
            MessageBox.Show(
                Localization.Get(K.ErrWorkspaceNotFound),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
            return;
        }

        using var formatDialog = new ExportPageForm(K.ExportWorkspaceTitle, K.ExportWorkspacePrompt);
        if (formatDialog.ShowDialog(this) != DialogResult.OK)
            return;

        var format = formatDialog.SelectedFormat;
        var extension = format switch
        {
            PageExportFormat.Word => ".docx",
            PageExportFormat.Pdf => ".pdf",
            _ => ".md"
        };

        var defaultFileName = PageDocumentBuilder.SanitizeFileName(workspaceNode.Name) + extension;
        using var saveDialog = new SaveFileDialog
        {
            Title = Localization.Get(K.ExportWorkspaceTitle),
            Filter = BuildWorkspaceExportFileFilter(format),
            DefaultExt = extension.TrimStart('.'),
            FileName = defaultFileName
        };
        DialogPathHelper.ApplyExportDirectory(saveDialog);

        if (saveDialog.ShowDialog(this) != DialogResult.OK)
            return;

        DialogPathHelper.RememberExportPath(saveDialog.FileName);

        try
        {
            await SaveCurrentPageAsync(refreshTree: false);

            var result = await WorkspaceExportService.ExportAsync(
                SessionContext.CurrentUser,
                workspaceId.Value,
                saveDialog.FileName,
                format,
                _pipeline,
                AppConfig.Services.Workspaces,
                AppConfig.Services.Pages);

            MessageBox.Show(
                Localization.Format(
                    K.ExportWorkspaceSucceeded,
                    result.WorkspaceCount,
                    result.PageCount,
                    Path.GetFileName(result.OutputFilePath),
                    Path.GetDirectoryName(result.OutputFilePath) ?? result.OutputFilePath),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.ExportWorkspaceFailed), ex);
        }
    }

    private static string BuildWorkspaceExportFileFilter(PageExportFormat format) =>
        format switch
        {
            PageExportFormat.Word =>
                $"{Localization.Get(K.WordFileFilterLabel)}|*.docx",
            PageExportFormat.Pdf =>
                $"{Localization.Get(K.PdfFileFilterLabel)}|*.pdf",
            _ =>
                $"{Localization.Get(K.MarkdownFileFilterLabel)}|*.md"
        };
}
