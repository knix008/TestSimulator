namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private const int NavRailWidth = 56;
    private const int NavWorkspaceGap = 8;
    private const int WorkspaceTopGap = 8;
    private const int WorkspaceMinWidth = 160;
    private const int ToolbarMinWidth = 52;
    private const int EditorMinWidth = 420;
    private const int OutlineMinWidth = 180;
    private const int OutlineDefaultWidth = 219;
    private const int CommentsMinWidth = 240;
    private const int MainContentMinHeight = 480;

    private void ApplyLayoutConstraints() =>
        UpdateLayoutConstraints(
            includeOutlinePanel: !editorAreaSplit.Panel1Collapsed,
            includeCommentsPanel: pageCommentsPanel != null && !commentsEditorSplit.Panel2Collapsed);

    private void UpdateLayoutConstraints(bool includeOutlinePanel, bool includeCommentsPanel = false)
    {
        navRail.MinimumSize = new Size(NavRailWidth, 0);
        toolStripMarkdown.MinimumSize = new Size(ToolbarMinWidth, 0);

        var editorAreaMinWidth = EditorMinWidth;
        if (includeOutlinePanel)
            editorAreaMinWidth += OutlineMinWidth + editorAreaSplit.SplitterWidth;
        if (includeCommentsPanel)
            editorAreaMinWidth += CommentsMinWidth + commentsEditorSplit.SplitterWidth;

        // WinForms SplitContainer applies Panel2MinSize more reliably after a reset.
        outerSplit.Panel1MinSize = 0;
        outerSplit.Panel2MinSize = 0;
        outerSplit.Panel1MinSize = WorkspaceMinWidth;
        outerSplit.Panel2MinSize = ToolbarMinWidth + editorAreaMinWidth;

        editorAreaSplit.Panel1MinSize = 0;
        editorAreaSplit.Panel2MinSize = 0;
        editorAreaSplit.Panel1MinSize = OutlineMinWidth;
        editorAreaSplit.Panel2MinSize = EditorMinWidth;

        var clientMinWidth = NavRailWidth
            + NavWorkspaceGap
            + WorkspaceMinWidth
            + outerSplit.SplitterWidth
            + editorAreaMinWidth
            + ToolbarMinWidth;

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
}
