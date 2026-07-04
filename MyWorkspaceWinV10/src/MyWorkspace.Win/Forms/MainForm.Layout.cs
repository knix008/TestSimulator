namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private const int NavRailWidth = 56;
    private const int NavWorkspaceGap = 8;
    private const int WorkspaceTopGap = 8;
    private const int WorkspaceMinWidth = 200;
    private const int WorkspaceDefaultWidth = 232;
    private const int ToolbarMinWidth = 52;
    private const int EditorMinWidth = 560;
    private const int OutlineMinWidth = 200;
    private const int OutlineDefaultWidth = 219;
    private const int CommentsMinWidth = 280;
    private const int MainContentMinHeight = 480;
    private const int WindowMinClientWidth = 1024;

    private void ApplyLayoutConstraints() =>
        UpdateLayoutConstraints(
            includeOutlinePanel: !editorAreaSplit.Panel1Collapsed,
            includeCommentsPanel: pageCommentsPanel != null && !commentsEditorSplit.Panel2Collapsed,
            includeWorkspacePanel: !outerSplit.Panel1Collapsed);

    private void UpdateLayoutConstraints(
        bool includeOutlinePanel,
        bool includeCommentsPanel = false,
        bool includeWorkspacePanel = true)
    {
        navRail.MinimumSize = new Size(NavRailWidth, 0);
        toolStripMarkdown.MinimumSize = new Size(ToolbarMinWidth, 0);

        var editorAreaMinWidth = EditorMinWidth;
        if (includeOutlinePanel)
            editorAreaMinWidth += OutlineMinWidth + editorAreaSplit.SplitterWidth;
        if (includeCommentsPanel)
            editorAreaMinWidth += CommentsMinWidth + commentsEditorSplit.SplitterWidth;

        var outerPanel1Min = includeWorkspacePanel ? WorkspaceMinWidth : 0;
        var outerPanel2Min = ToolbarMinWidth + editorAreaMinWidth;
        TryApplyVerticalSplitMinSizes(outerSplit, outerPanel1Min, outerPanel2Min);

        TryApplyVerticalSplitMinSizes(editorAreaSplit, OutlineMinWidth, EditorMinWidth);

        ApplyCommentsSplitConstraints(includeCommentsPanel);

        var clientMinWidth = NavRailWidth
            + NavWorkspaceGap
            + (includeWorkspacePanel ? WorkspaceMinWidth + outerSplit.SplitterWidth : 0)
            + editorAreaMinWidth
            + ToolbarMinWidth;
        clientMinWidth = Math.Max(clientMinWidth, WindowMinClientWidth);

        var statusHeight = statusStrip1.PreferredSize.Height > 0
            ? statusStrip1.PreferredSize.Height
            : 22;
        const int titleBarHeight = 36;
        var resizeInset = FramelessWindowHelper.ResizeBorder * 2;
        var clientMinHeight = MainContentMinHeight + statusHeight + titleBarHeight + resizeInset;

        var nonClient = new Size(Width - ClientSize.Width, Height - ClientSize.Height);
        MinimumSize = new Size(
            clientMinWidth + resizeInset + nonClient.Width,
            clientMinHeight + nonClient.Height);
    }

    private static bool TryApplyVerticalSplitMinSizes(
        SplitContainer split,
        int panel1MinSize,
        int panel2MinSize)
    {
        if (!split.IsHandleCreated || split.Width <= 0)
            return false;

        try
        {
            split.Panel1MinSize = 0;
            split.Panel2MinSize = 0;

            if (!split.Panel1Collapsed && !split.Panel2Collapsed)
            {
                var maxDistance = split.Width - split.SplitterWidth - panel2MinSize;
                if (maxDistance >= panel1MinSize)
                    split.SplitterDistance = Math.Clamp(split.SplitterDistance, panel1MinSize, maxDistance);
            }

            split.Panel1MinSize = panel1MinSize;
            split.Panel2MinSize = panel2MinSize;
            return true;
        }
        catch (InvalidOperationException)
        {
            return false;
        }
    }

    private void TryApplyCommentsSplitterDistance()
    {
        if (commentsEditorSplit.Panel2Collapsed || commentsEditorSplit.Width <= 0)
            return;

        if (_savedCommentsWidth < CommentsMinWidth)
            _savedCommentsWidth = CommentsDefaultWidth;

        var panel1Min = commentsEditorSplit.Panel1MinSize;
        var panel2Min = commentsEditorSplit.Panel2MinSize;
        var maxDistance = commentsEditorSplit.Width - commentsEditorSplit.SplitterWidth - panel2Min;
        if (maxDistance < panel1Min)
            return;

        var desired = commentsEditorSplit.Width - _savedCommentsWidth - commentsEditorSplit.SplitterWidth;
        try
        {
            commentsEditorSplit.SplitterDistance = Math.Clamp(desired, panel1Min, maxDistance);
        }
        catch (InvalidOperationException)
        {
            // Constraints will be reconciled on the next layout pass.
        }
    }

    private void ConfigureSplitterLiveResize()
    {
        SplitContainerLiveResizeHelper.SetCallbacks(
            outerSplit,
            duringDrag: _ => UpdateTitleBarEditorRegion(),
            dragCompleted: _ =>
            {
                if (!outerSplit.Panel1Collapsed)
                {
                    _savedWorkspaceWidth = outerSplit.SplitterDistance;
                    RecordWorkspacePanelStateForSession();
                }
                UpdateTitleBarEditorRegion();
            });

        SplitContainerLiveResizeHelper.SetCallbacks(
            editorAreaSplit,
            dragCompleted: _ =>
            {
                if (!editorAreaSplit.Panel1Collapsed)
                    _savedOutlineWidth = editorAreaSplit.SplitterDistance;
            });

        if (pageCommentsPanel == null)
            return;

        SplitContainerLiveResizeHelper.SetCallbacks(
            commentsEditorSplit,
            dragCompleted: _ =>
            {
                if (!commentsEditorSplit.Panel2Collapsed)
                    _savedCommentsWidth = commentsEditorSplit.Panel2.Width;
            });
    }

    private void ApplyCommentsSplitConstraints(bool includeCommentsPanel)
    {
        if (pageCommentsPanel == null || !commentsEditorSplit.IsHandleCreated)
            return;

        if (commentsEditorSplit.Width <= 0)
            return;

        var panel2Min = includeCommentsPanel ? CommentsMinWidth : 0;
        TryApplyVerticalSplitMinSizes(commentsEditorSplit, EditorMinWidth, panel2Min);
    }
}
