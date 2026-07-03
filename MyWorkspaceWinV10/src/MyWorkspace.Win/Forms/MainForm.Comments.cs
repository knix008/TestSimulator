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

    private void EnsureCommentsMenuItem()
    {
        if (_menuComments != null)
            return;

        _menuComments = new ToolStripMenuItem
        {
            Name = "menuComments"
        };
        _menuComments.Click += (_, _) => BeginInvoke(ToggleCommentsPanel);
        menuView.DropDownItems.Add(_menuComments);
    }

    private void InitializeCommentsPanel()
    {
        commentsEditorSplit = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Name = "commentsEditorSplit",
            Panel2Collapsed = true,
            FixedPanel = FixedPanel.Panel2,
            Panel2MinSize = CommentsMinWidth
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
        AppTheme.StyleBorderedPanel(pnlCommentsSidebar, PanelEdges.Left);

        pageCommentsPanel = new PageCommentsPanel
        {
            Dock = DockStyle.Fill,
            Name = "pageCommentsPanel"
        };
        pageCommentsPanel.CommentsChanged += (_, _) =>
        {
            if (_currentPageId.HasValue)
                PageCommentAssetSync.SyncForPage(_currentPageId.Value);
        };

        pnlCommentsSidebar.Controls.Add(pageCommentsPanel);
        commentsEditorSplit.Panel2.Controls.Add(pnlCommentsSidebar);
        pnlEditorColumn.Controls.Add(commentsEditorSplit);
        commentsEditorSplit.BringToFront();

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
            commentsEditorSplit.Panel2Collapsed = false;
            BeginInvoke(() =>
            {
                if (_savedCommentsWidth < commentsEditorSplit.Panel2MinSize)
                    _savedCommentsWidth = CommentsDefaultWidth;

                var distance = commentsEditorSplit.Width - _savedCommentsWidth - commentsEditorSplit.SplitterWidth;
                if (distance < commentsEditorSplit.Panel1MinSize)
                    distance = Math.Max(0, commentsEditorSplit.Width - commentsEditorSplit.Panel2MinSize - commentsEditorSplit.SplitterWidth);

                commentsEditorSplit.SplitterDistance = Math.Max(commentsEditorSplit.Panel1MinSize, distance);
                UpdateLayoutConstraints(includeOutlinePanel: !editorAreaSplit.Panel1Collapsed, includeCommentsPanel: true);
                UpdateCommentsToolbarTooltip();
            });
            return;
        }

        _savedCommentsWidth = commentsEditorSplit.Panel2.Width;
        commentsEditorSplit.Panel2Collapsed = true;
        UpdateLayoutConstraints(includeOutlinePanel: !editorAreaSplit.Panel1Collapsed, includeCommentsPanel: false);
        UpdateCommentsToolbarTooltip();
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
        AppTheme.StyleSplitContainer(commentsEditorSplit);
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
