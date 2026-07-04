namespace MyWorkspace.Win.Forms;

public partial class MainForm
{
    private SplitContainer commentsEditorSplit = null!;
    private Panel pnlCommentsSidebar = null!;
    private PageCommentsPanel pageCommentsPanel = null!;
    private ToolStripButton? _toolbarCommentsButton;
    private int _savedCommentsWidth = CommentsDefaultWidth;

    private const int CommentsDefaultWidth = 300;

    private ToolStripMenuItem? _menuComments;
    private ToolStripMenuItem? _menuCommentsNavRoot;

    private void EnsureCommentsMenuItem()
    {
        if (_menuComments != null)
            return;

        _menuCommentsNavRoot = new ToolStripMenuItem
        {
            Name = "menuCommentsNavRoot",
            Visible = false
        };

        _menuComments = new ToolStripMenuItem
        {
            Name = "menuComments"
        };
        _menuComments.Click += (_, _) => BeginInvoke(ToggleCommentsPanel);
        _menuCommentsNavRoot.DropDownItems.Add(_menuComments);
    }

    private void InitializeCommentsPanel()
    {
        commentsEditorSplit = new LiveResizeSplitContainer
        {
            Dock = DockStyle.Fill,
            Name = "commentsEditorSplit",
            Panel2Collapsed = true,
            FixedPanel = FixedPanel.Panel2
        };

        pnlEditorColumn.Controls.Remove(editorAreaSplit);
        editorAreaSplit.Dock = DockStyle.Fill;
        commentsEditorSplit.Panel1.Controls.Add(editorAreaSplit);

        pnlCommentsSidebar = new Panel
        {
            Dock = DockStyle.Fill,
            Name = "pnlCommentsSidebar",
            Padding = Padding.Empty,
            Margin = Padding.Empty
        };

        pageCommentsPanel = new PageCommentsPanel
        {
            Dock = DockStyle.Fill,
            Name = "pageCommentsPanel"
        };
        pageCommentsPanel.CloseRequested += (_, _) => BeginInvoke(CollapseCommentsPanel);
        pageCommentsPanel.CommentsChanged += (_, _) =>
        {
            if (_currentPageId.HasValue)
                PageCommentAssetSync.SyncForPage(_currentPageId.Value);
        };

        pnlCommentsSidebar.Controls.Add(pageCommentsPanel);
        commentsEditorSplit.Panel2.Controls.Add(pnlCommentsSidebar);
        pnlEditorColumn.Controls.Add(commentsEditorSplit);
        commentsEditorSplit.BringToFront();
        AppTheme.StyleGrabSplitContainer(commentsEditorSplit);

        commentsEditorSplit.SplitterMoved += (_, _) =>
        {
            if (!commentsEditorSplit.Panel2Collapsed)
                _savedCommentsWidth = commentsEditorSplit.Panel2.Width;
        };
    }

    private void ToggleCommentsPanel()
    {
        if (commentsEditorSplit.Panel2Collapsed)
        {
            ExpandCommentsPanel();
            return;
        }

        CollapseCommentsPanel();
    }

    internal void ExpandCommentsPanel()
    {
        if (!commentsEditorSplit.Panel2Collapsed)
            return;

        ApplyCommentsSplitConstraints(includeCommentsPanel: true);
        commentsEditorSplit.Panel2Collapsed = false;
        BeginInvoke(() =>
        {
            if (_savedCommentsWidth < CommentsMinWidth)
                _savedCommentsWidth = CommentsDefaultWidth;

            var distance = commentsEditorSplit.Width - _savedCommentsWidth - commentsEditorSplit.SplitterWidth;
            if (distance < commentsEditorSplit.Panel1MinSize)
                distance = Math.Max(0, commentsEditorSplit.Width - CommentsMinWidth - commentsEditorSplit.SplitterWidth);

            commentsEditorSplit.SplitterDistance = Math.Max(commentsEditorSplit.Panel1MinSize, distance);
            UpdateLayoutConstraints(includeOutlinePanel: !editorAreaSplit.Panel1Collapsed, includeCommentsPanel: true, includeWorkspacePanel: !outerSplit.Panel1Collapsed);
            UpdateCommentsToolbarTooltip();
        });
    }

    private void CollapseCommentsPanel()
    {
        _savedCommentsWidth = commentsEditorSplit.Panel2.Width;
        commentsEditorSplit.Panel2Collapsed = true;
        UpdateLayoutConstraints(includeOutlinePanel: !editorAreaSplit.Panel1Collapsed, includeCommentsPanel: false, includeWorkspacePanel: !outerSplit.Panel1Collapsed);
        UpdateCommentsToolbarTooltip();
    }

    internal void CommentOnEditorSelection(string selectedText)
    {
        if (string.IsNullOrWhiteSpace(selectedText) || !_currentPageId.HasValue || pageCommentsPanel == null)
            return;

        ExpandCommentsPanel();
        pageCommentsPanel.BeginComposeWithQuote(selectedText);
        BeginInvoke(() => pageCommentsPanel.FocusCompose());
    }

    private async Task RefreshCommentsPanelAsync()
    {
        if (pageCommentsPanel == null)
            return;

        await pageCommentsPanel.LoadPageAsync(_currentPageId);
    }

    private void ApplyCommentsLocalization()
    {
        pageCommentsPanel?.ApplyLocalization();
        if (_menuComments != null)
        {
            _menuComments.Text = Localization.Get(K.MenuComments);
            _menuComments.Image = AppIcons.LoadMenuIcon("quote");
        }

        UpdateCommentsToolbarTooltip();
    }

    private void ApplyCommentsTheme()
    {
        pageCommentsPanel?.ApplyTheme();
        AppTheme.StyleGrabSplitContainer(commentsEditorSplit);
    }

    private void UpdateCommentsToolbarTooltip()
    {
        if (_toolbarCommentsButton == null)
            return;

        _toolbarCommentsButton.ToolTipText = commentsEditorSplit.Panel2Collapsed
            ? Localization.Get(K.TipToolbarShowComments)
            : Localization.Get(K.TipToolbarHideComments);
    }
}
