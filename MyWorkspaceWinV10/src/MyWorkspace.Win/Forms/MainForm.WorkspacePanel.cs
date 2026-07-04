namespace MyWorkspace.Win.Forms;



public partial class MainForm

{

    private int _savedWorkspaceWidth = WorkspaceDefaultWidth;



    private void ToggleWorkspacePanel()

    {

        if (outerSplit.Panel1Collapsed)

        {

            if (outerSplit.Tag is string tag && tag == HideOuterSplitterGripTag)
            {
                outerSplit.Tag = null;
                AppTheme.StyleGrabSplitContainer(outerSplit);
            }

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

        RecordWorkspacePanelStateForSession();

        UpdatePanelToggleStates();
    }



    private void ApplySavedWorkspacePanelState()

    {

        if (!SessionContext.IsLoggedIn)

            return;



        AppTheme.StyleGrabSplitContainer(outerSplit);
        outerSplit.Tag = null;

        var userId = SessionContext.CurrentUser.Id;

        var collapsed = AppConfig.GetWorkspacePanelCollapsed(userId);

        _savedWorkspaceWidth = AppConfig.GetWorkspacePanelWidth(userId);



        if (collapsed)

        {

            if (!outerSplit.Panel1Collapsed)

            {

                outerSplit.Panel1Collapsed = true;

                UpdateTitleBarEditorRegion();

            }

        }

        else

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



        UpdateWorkspaceToggleButtonText();

        UpdateLayoutConstraints(

            includeOutlinePanel: !editorAreaSplit.Panel1Collapsed,

            includeCommentsPanel: !commentsEditorSplit.Panel2Collapsed,

            includeWorkspacePanel: !outerSplit.Panel1Collapsed);

        UpdatePanelToggleStates();
    }



    private void RecordWorkspacePanelStateForSession()

    {

        if (!SessionContext.IsLoggedIn)

            return;



        var width = outerSplit.Panel1Collapsed

            ? _savedWorkspaceWidth

            : outerSplit.SplitterDistance;



        AppConfig.RecordWorkspacePanelState(

            SessionContext.CurrentUser.Id,

            outerSplit.Panel1Collapsed,

            width);

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


