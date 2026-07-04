using MyWorkspace.Core.Enums;

namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private string? FindWorkspaceNameInTree(int workspaceId)
    {
        var node = FindNode(treeWorkspace.Nodes, TreeNodeKind.Workspace, workspaceId);
        return node?.Text;
    }

    private void SelectPageInTree(int pageId)
    {
        var node = FindNode(treeWorkspace.Nodes, TreeNodeKind.Page, pageId);
        if (node == null)
            return;

        _suppressWorkspaceSelection = true;
        try
        {
            node.EnsureVisible();
            if (node.Parent != null)
                node.Parent.Expand();
            treeWorkspace.SelectedNode = node;
        }
        finally
        {
            _suppressWorkspaceSelection = false;
        }
    }

    private void SelectWorkspaceInTree(int workspaceId)
    {
        var node = FindNode(treeWorkspace.Nodes, TreeNodeKind.Workspace, workspaceId);
        if (node == null)
            return;

        _suppressWorkspaceSelection = true;
        try
        {
            node.EnsureVisible();
            node.Expand();
            treeWorkspace.SelectedNode = node;
        }
        finally
        {
            _suppressWorkspaceSelection = false;
        }
    }

    private async Task NavigateToPageFromLinkAsync(int pageId)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        if (AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId) == null)
        {
            ThemedMessageBox.Show(
                Localization.Get(K.PageLoadFailed),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        await OpenPageTabAsync(pageId);
    }

    private async Task NavigateToWorkspaceFromLinkAsync(
        int workspaceId,
        string? workspaceTitle = null,
        bool fromTreeSelection = false)
    {
        if (!SessionContext.IsLoggedIn)
            return;

        if (!AppConfig.Services.Workspaces.CanAccessWorkspace(SessionContext.CurrentUser, workspaceId))
        {
            ThemedMessageBox.Show(
                Localization.Get(K.OpenResourceFailed),
                L.AppName,
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            return;
        }

        var title = workspaceTitle ?? FindWorkspaceNameInTree(workspaceId) ?? Localization.Get(K.LabelWorkspace);
        if (!fromTreeSelection)
            SelectWorkspaceInTree(workspaceId);

        await SaveCurrentPageAsync(refreshTree: false, force: false);

        _currentPageId = null;
        _draftWorkspaceId = null;
        _currentPageTitle = string.Empty;
        _offlinePageContext = null;
        _isLoadingPage = true;

        try
        {
            if (_editor != null)
                await _editor.ClearAsync(_pipeline);
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, Localization.Get(K.EditorClearFailed), ex);
        }
        finally
        {
            _isLoadingPage = false;
            _isDirty = false;
            SetSaveStatus(SaveStatusKind.None);
            treeOutline.Nodes.Clear();
            UpdateEditorEmptySurface();
            UpdateEditorChromeEnabled();
            RefreshWorkspaceEditState();
            lblStatus.Text = Localization.Format(K.StatusWorkspace, title);
        }
    }
}
