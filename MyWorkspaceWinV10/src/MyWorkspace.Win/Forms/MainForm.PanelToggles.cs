namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private void UpdatePanelToggleStates()
    {
        var workspaceVisible = !outerSplit.Panel1Collapsed;
        var outlineVisible = !editorAreaSplit.Panel1Collapsed;
        var commentsVisible = !commentsEditorSplit.Panel2Collapsed;

        menuWorkspacePanel.Checked = workspaceVisible;
        _menuOutline?.Checked = outlineVisible;
        _menuComments?.Checked = commentsVisible;

        navRail.SetEntryPressed(menuView, workspaceVisible);
        if (_menuOutlineNavRoot != null)
            navRail.SetEntryPressed(_menuOutlineNavRoot, outlineVisible);
        if (_menuCommentsNavRoot != null)
            navRail.SetEntryPressed(_menuCommentsNavRoot, commentsVisible);

        if (_toolbarWorkspaceButton != null)
            _toolbarWorkspaceButton.Checked = workspaceVisible;

        if (_toolbarCommentsButton != null)
            _toolbarCommentsButton.Checked = commentsVisible;

        if (_ctxEditor == null)
            return;

        foreach (ToolStripItem item in _ctxEditor.Items)
        {
            if (item is ToolStripMenuItem menuItem && item.Tag is string key && key == K.ToolbarDocumentStructure)
            {
                menuItem.Checked = outlineVisible;
                break;
            }
        }
    }
}
