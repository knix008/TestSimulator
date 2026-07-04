namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private int _savedWorkspaceWidth = WorkspaceDefaultWidth;

    private void ToggleWorkspacePanel()
    {
        if (outerSplit.Panel1Collapsed)
        {
            outerSplit.Panel1Collapsed = false;
            BeginInvoke(() =>
            {
                if (_savedWorkspaceWidth < WorkspaceMinWidth)
                    _savedWorkspaceWidth = WorkspaceDefaultWidth;
                outerSplit.SplitterDistance = _savedWorkspaceWidth;
                UpdateTitleBarEditorRegion();
            });
        }
        else
        {
            _savedWorkspaceWidth = outerSplit.SplitterDistance;
            outerSplit.Panel1Collapsed = true;
            UpdateTitleBarEditorRegion();
        }

        UpdateWorkspaceToggleButtonText();
        UpdateLayoutConstraints(
            includeOutlinePanel: !editorAreaSplit.Panel1Collapsed,
            includeCommentsPanel: !commentsEditorSplit.Panel2Collapsed,
            includeWorkspacePanel: !outerSplit.Panel1Collapsed);
    }

    private void UpdateWorkspaceToggleButtonText()
    {
        if (_toolbarWorkspaceButton == null)
            return;

        _toolbarWorkspaceButton.ToolTipText = outerSplit.Panel1Collapsed
            ? Localization.Get(K.WorkspacePanelExpand)
            : Localization.Get(K.WorkspacePanelCollapse);

        ApplyToolbarTooltips();
    }
}
