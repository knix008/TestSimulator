using MyWorkspace.Core.Enums;

namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private ToolStripMenuItem? ctxExportPage;
    private ToolStripMenuItem? ctxExportWorkspace;
    private ToolStripSeparator? ctxSepExport;

    private void EnsureExportContextMenuItems()
    {
        if (ctxExportPage != null)
            return;

        ctxSepExport = new ToolStripSeparator { Name = "ctxSepExport" };
        ctxExportPage = new ToolStripMenuItem
        {
            Name = "ctxExportPage",
            Image = IconAssets.Load(16, "export")
        };
        ctxExportPage.Click += ctxExportPage_Click;

        ctxExportWorkspace = new ToolStripMenuItem
        {
            Name = "ctxExportWorkspace",
            Image = IconAssets.Load(16, "export")
        };
        ctxExportWorkspace.Click += menuExportWorkspace_Click;

        var insertIndex = ctxTree.Items.IndexOf(ctxSep2) + 1;
        ctxTree.Items.Insert(insertIndex, ctxSepExport);
        ctxTree.Items.Insert(insertIndex + 1, ctxExportPage);
        ctxTree.Items.Insert(insertIndex + 2, ctxExportWorkspace);
    }

    private void ConfigureExportContextMenu(TreeNodeData? data)
    {
        if (ctxExportPage == null || ctxExportWorkspace == null || ctxSepExport == null)
            return;

        var isWorkspace = data?.Kind == TreeNodeKind.Workspace;
        var isPage = data?.Kind == TreeNodeKind.Page;

        ctxExportPage.Visible = isPage;
        ctxExportWorkspace.Visible = isWorkspace;
        ctxSepExport.Visible = isPage || isWorkspace;

        ctxExportPage.Enabled = isPage && data!.Id > 0;
        ctxExportWorkspace.Enabled = false;

        if (!isWorkspace || data!.Id <= 0)
            return;

        try
        {
            ctxExportWorkspace.Enabled = AppConfig.Services.Workspaces.CanAccessWorkspace(
                SessionContext.CurrentUser,
                data.Id);
        }
        catch
        {
            ctxExportWorkspace.Enabled = false;
        }
    }

    private async void ctxExportPage_Click(object? sender, EventArgs e)
    {
        var data = GetWorkspaceContextMenuNodeData() ?? GetSelectedNodeData();
        if (data?.Kind != TreeNodeKind.Page || data.Id <= 0)
            return;

        await ExportPageAsync(data.Id);
    }
}
