using MyWorkspace.Core.Enums;

namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private int? GetContextWorkspaceId(TreeNodeData? data) =>
        data?.Kind switch
        {
            TreeNodeKind.Workspace => data.Id,
            TreeNodeKind.Page => data.WorkspaceId,
            _ => null
        };

    private int? GetActiveWorkspaceId()
    {
        if (_currentPageId is int pageId)
        {
            var page = AppConfig.Services.Pages.GetById(SessionContext.CurrentUser, pageId);
            return page?.WorkspaceId;
        }

        return _draftWorkspaceId;
    }

    private bool CanEditWorkspace(int? workspaceId)
    {
        if (!SessionContext.IsLoggedIn || !workspaceId.HasValue)
            return false;

        return AppConfig.Services.Workspaces.CanEditWorkspaceContent(SessionContext.CurrentUser, workspaceId.Value);
    }

    private bool CanEditPage(int pageId)
    {
        if (!SessionContext.IsLoggedIn)
            return false;

        return AppConfig.Services.Pages.CanEditPageContent(SessionContext.CurrentUser, pageId);
    }

    private bool CanEditActivePage()
    {
        if (!CanEditWorkspace(GetActiveWorkspaceId()))
            return false;

        if (_currentPageId is int pageId)
            return CanEditPage(pageId);

        return _draftWorkspaceId.HasValue;
    }

    private void RefreshWorkspaceEditState()
    {
        UpdateEditorChromeEnabled();

        if (_editor == null || (!_currentPageId.HasValue && !_draftWorkspaceId.HasValue))
            return;

        var editable = CanEditActivePage();
        if (_editor.IsReady)
            _ = _editor.SetEditingEnabledAsync(editable);

        if (editable || !SessionContext.IsLoggedIn)
            return;

        if (_currentPageId is int pageId
            && AppConfig.Services.Pages.IsPageLocked(pageId))
        {
            var lockedBy = AppConfig.Services.Pages.GetPageLockHolderUsername(pageId);
            lblStatus.Text = string.IsNullOrWhiteSpace(lockedBy)
                ? Localization.Get(K.CtxLockPage)
                : Localization.Format(K.StatusPageLockedReadOnly, lockedBy);
            return;
        }

        var workspaceId = GetActiveWorkspaceId();
        if (!workspaceId.HasValue || !AppConfig.Services.Workspaces.IsWorkspaceLocked(workspaceId.Value))
            return;

        var workspaceLockedBy = AppConfig.Services.Workspaces.GetWorkspaceLockHolderUsername(workspaceId.Value);
        lblStatus.Text = string.IsNullOrWhiteSpace(workspaceLockedBy)
            ? Localization.Get(K.CtxLockWorkspace)
            : Localization.Format(K.StatusWorkspaceLockedReadOnly, workspaceLockedBy);
    }

    private void ctxToggleWorkspaceLock_Click(object sender, EventArgs e)
    {
        var data = GetSelectedNodeData();
        if (data?.Kind != TreeNodeKind.Workspace)
            return;

        try
        {
            var workspaces = AppConfig.Services.Workspaces;
            if (workspaces.IsWorkspaceLocked(data.Id))
                workspaces.UnlockWorkspace(SessionContext.CurrentUser, data.Id);
            else
                workspaces.LockWorkspace(SessionContext.CurrentUser, data.Id);

            LoadWorkspaceTree(_currentPageId, data.Id);
            RefreshWorkspaceEditState();
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, L.AppName, ex);
        }
    }

    private void ctxTogglePageLock_Click(object sender, EventArgs e)
    {
        var data = GetSelectedNodeData();
        if (data?.Kind != TreeNodeKind.Page)
            return;

        try
        {
            var pages = AppConfig.Services.Pages;
            if (pages.IsPageLocked(data.Id))
                pages.UnlockPage(SessionContext.CurrentUser, data.Id);
            else
                pages.LockPage(SessionContext.CurrentUser, data.Id);

            LoadWorkspaceTree(data.Id, null);
            RefreshWorkspaceEditState();
        }
        catch (Exception ex)
        {
            ErrorDetailForm.Show(this, L.AppName, ex);
        }
    }
}
