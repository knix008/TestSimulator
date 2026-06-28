using LibGit2Sharp;
using LibGit2Sharp.Handlers;
using MyGitWinV10.App.Controls;
using MyGitWinV10.App.Dialogs;
using MyGitWinV10.App.Services;

namespace MyGitWinV10.App;

public partial class MainForm : Form
{
    private readonly GitRepositoryService _gitService = new();
    private readonly AppSettingsStore _settings = AppSettingsStore.Load();
    private readonly MenuStripRootIconRenderer _menuRenderer = new();
    private Commit? _currentCommit;
    private TreeChanges? _currentCommitChanges;
    private int _commitDetailLoadGeneration;
    private int _diffLoadGeneration;
    private int _pathHistoryLoadGeneration;
    private int _commitGraphLoadGeneration;
    private int _repositoryRefreshGeneration;
    private int _fileTreeStatusRefreshGeneration;
    private bool _repositoryRefreshInProgress;
    private bool _startupLayoutComplete;

    // Seeded from AppSettingsStore (DPAPI-encrypted on disk) and kept up to date after every
    // successful push/pull/fetch so the user isn't asked to retype the PAT every session.
    private string? _gitHubUsername;
    private string? _gitHubToken;

    // True once _gitHubUsername/_gitHubToken are known-good (last push/pull/fetch succeeded
    // with them), so the credentials dialog can be skipped. A failure flips this back to
    // false — the dialog reappears pre-filled with the same values rather than blank, since
    // the credentials themselves (e.g. a valid but SSO-unauthorized PAT) may still be correct.
    private bool _gitCredentialsVerified;

    // Set when viewing a remote repository from cache (Browse Remote); cleared on local open.
    private string? _remoteBrowseUrl;

    private string? _pathHistoryFilter;
    private bool _pathHistoryFilterIsDirectory;
    private bool _suppressFileTreePathLog;

    private readonly List<ToolStripMenuItem> _fileRecentMenuItems = [];

    private readonly List<ToolStripMenuItem> _repositoryGitMenuItems = [];

    private static readonly Dictionary<string, string> GitMenuLocalizationKeys = new(StringComparer.Ordinal)
    {
        ["gitAddContextMenuItem"] = "Menu.Git.Add",
        ["gitResetContextMenuItem"] = "Menu.Git.Reset",
        ["gitDiscardContextMenuItem"] = "Menu.Git.Discard",
        ["gitCommitContextMenuItem"] = "Menu.Git.Commit",
        ["gitFetchContextMenuItem"] = "Menu.Git.Fetch",
        ["gitPullContextMenuItem"] = "Menu.Git.Pull",
        ["gitPushContextMenuItem"] = "Menu.Git.Push",
        ["gitStashContextMenuItem"] = "Menu.Git.Stash",
        ["gitStashPopContextMenuItem"] = "Menu.Git.StashPop",
        ["gitStatusContextMenuItem"] = "Menu.Git.Status",
    };

    private static readonly RepositoryFileNodeTag RepositoryRootTag = new()
    {
        RelativePath = string.Empty,
        IsDirectory = true
    };

    private ToolStripMenuItem repositoryGitMenuItem = null!;

    private ColumnHeader _changedFilesPathColumn = null!;
    private ColumnHeader _changedFilesStatusColumn = null!;

    // In-memory TreeNode data model for repoFilesListView — never shown as a real TreeView
    // (RepositoryFileTreeService just needs somewhere to build/store the TreeNode hierarchy;
    // the ListView renders it with its own indentation and expand/collapse bookkeeping).
    private readonly TreeView _repoFilesTreeModel = new();

    private readonly GitFileTreeImageList _gitFileTreeImages = new();
    private readonly RepositoryWorkingTreeWatcher _workingTreeWatcher;

    private RepositoryPathStatusIndex? _fileTreeStatusIndex;

    private bool _applyingPanelLayout;

    // Designer-configured detailSplitContainer.SplitterDistance (355) over its design-time
    // Size.Height (879) — captured as constants instead of read from the live control, since by
    // the time any Resize/SplitterMoved event fires, docking has already moved the control away
    // from its design-time size and the ratio derived from it would no longer match the Designer.
    private const double DefaultDetailSplitRatio = 355.0 / 879.0;
    private double _detailSplitRatio = DefaultDetailSplitRatio;

    public MainForm()
    {
        InitializeComponent();
        Icon = AppInfo.LoadIcon();
        Text = AppInfo.Title;
        _gitHubUsername = _settings.GitHubUsername;
        _gitHubToken = _settings.GetGitHubToken();
        _gitCredentialsVerified = !string.IsNullOrWhiteSpace(_gitHubUsername) && !string.IsNullOrWhiteSpace(_gitHubToken);
        ConfigureToolbars();
        ConfigureMenuIcons();
        ConfigureChangedFilesListView();
        ConfigureSectionHeadingToolTips();
        Localization.SetLanguage(_settings.Language);
        ApplyLocalizedShellText();
        Localization.LanguageChanged += ApplyLocalizedShellText;
        graphDetailSplitContainer.FixedPanel = FixedPanel.Panel1;
        mainSplitContainer.SplitterMoved += (_, _) => ApplyPanelLayout();
        mainSplitContainer.Panel2.Resize += (_, _) => ApplyPanelLayout();
        // Remember the ratio (Designer-configured or user-dragged) so resizes rescale the
        // split proportionally instead of snapping back to a fixed 50/50 divide.
        detailSplitContainer.SplitterMoved += (_, _) =>
        {
            if (!_applyingPanelLayout)
            {
                _detailSplitRatio = GetDetailSplitRatio();
            }
        };
        detailSplitContainer.Resize += (_, _) =>
        {
            if (_startupLayoutComplete)
            {
                ApplyDetailVerticalLayout();
            }
        };
        Load += (_, _) => StabilizeSplitContainers();
        fileMenuItem.DropDownOpening += (_, _) => RefreshFileRecentMenu();
        _gitFileTreeImages.Attach(repoFilesListView);
        _workingTreeWatcher = new RepositoryWorkingTreeWatcher(this);
        _workingTreeWatcher.Changed += WorkingTreeWatcher_Changed;
        FormClosed += (_, _) =>
        {
            Localization.LanguageChanged -= ApplyLocalizedShellText;
            _workingTreeWatcher.Dispose();
            _gitService.Dispose();
            _gitFileTreeImages.Dispose();
        };
        repoFilesListView.StatusResolver = node =>
            node.Tag is RepositoryFileNodeTag tag && !tag.IsPlaceholder
                ? _fileTreeStatusIndex?.Get(tag.RelativePath, tag.IsDirectory)
                : null;
        Shown += (_, _) =>
        {
            StabilizeSplitContainers();
            ApplyPanelLayout();
            ApplyDetailVerticalLayout();
            // Defer auto-restore until after the first layout pass completes. Opening a
            // repository during Shown races with split-container sizing under DPI scaling
            // and can terminate the process on the first launch only.
            BeginInvoke(CompleteStartupAndRestoreSession);
        };
    }

    private void CompleteStartupAndRestoreSession()
    {
        if (IsDisposed)
        {
            return;
        }

        _startupLayoutComplete = true;
        StabilizeSplitContainers();
        ApplyPanelLayout();
        OpenLastSuccessfulSessionIfAvailable();
    }

    private void StabilizeSplitContainers() =>
        SplitContainerLayoutHelper.Stabilize(
            mainSplitContainer,
            leftSideSplitContainer,
            graphDetailSplitContainer,
            detailSplitContainer);

    private void ApplyPanelLayout()
    {
        ApplyDetailVerticalLayout();
    }

    private double GetDetailSplitRatio()
    {
        int height = detailSplitContainer.ClientSize.Height;
        return height > 0 ? (double)detailSplitContainer.SplitterDistance / height : 0.5;
    }

    private void ApplyDetailVerticalLayout()
    {
        if (_applyingPanelLayout || !IsHandleCreated)
        {
            return;
        }

        int height = detailSplitContainer.ClientSize.Height;
        if (height <= 0)
        {
            return;
        }

        int targetTop = (int)Math.Round(height * _detailSplitRatio);
        int minTop = detailSplitContainer.Panel1MinSize;
        int maxTop = height - detailSplitContainer.Panel2MinSize - detailSplitContainer.SplitterWidth;
        if (maxTop < minTop)
        {
            return;
        }

        _applyingPanelLayout = true;
        try
        {
            SplitContainerLayoutHelper.SafeSetSplitterDistance(
                detailSplitContainer,
                Math.Clamp(targetTop, minTop, maxTop));
        }
        finally
        {
            _applyingPanelLayout = false;
        }
    }

    private void ConfigureToolbars()
    {
        int tb = IconFactory.ToolbarIconSize;

        menuStrip.Dock = DockStyle.Top;
        mainToolStrip.Dock = DockStyle.Top;
        mainToolStrip.AutoSize = false;
        mainToolStrip.ImageScalingSize = new Size(tb, tb);
        mainToolStrip.Padding = new Padding(6, 4, 6, 4);
        mainToolStrip.Height = tb + mainToolStrip.Padding.Vertical + 6;
        mainToolStrip.ShowItemToolTips = true;

        ConfigureToolStripButton(openToolButton, IconFactory.Open(tb, IconFactory.Palette.Open), "Open a local Git repository folder");
        ConfigureToolStripButton(cloneToolButton, IconFactory.Clone(tb, IconFactory.Palette.Clone), "Clone a remote repository to a local folder");
        ConfigureToolStripButton(browseRemoteToolButton, IconFactory.BrowseRemote(tb, IconFactory.Palette.Open), "Browse remote commit history without saving a local copy");
        ConfigureToolStripButton(refreshTreeToolButton, IconFactory.RefreshTree(tb, IconFactory.Palette.Refresh), "Reload branches, tags, and releases");
        ConfigureToolStripDropDownButton(exportSummaryToolButton, IconFactory.Report(tb, IconFactory.Palette.Report), "Export repository summary as PDF, Word, or Markdown");
        exportSummaryToolButton.Enabled = false;
        SetExportSummaryMenuItemsEnabled(false);
        ConfigureToolStripButton(refreshGraphToolButton, IconFactory.RefreshGraph(tb, IconFactory.Palette.History), "Reload the commit history graph");
        ConfigureToolStripButton(copyShaToolButton, IconFactory.Copy(tb, IconFactory.Palette.Copy), "Copy the selected commit's full hash to the clipboard");
        ConfigureToolStripButton(copyMessageToolButton, IconFactory.Message(tb, IconFactory.Palette.Message), "Copy the selected commit message to the clipboard");
        ConfigureToolStripButton(copyFilePathToolButton, IconFactory.File(tb, IconFactory.Palette.File), "Copy the selected file path to the clipboard");
        ConfigureToolStripButton(wordWrapToolButton, IconFactory.WordWrap(tb, IconFactory.Palette.WordWrap), "Toggle word wrap for the diff view");
        wordWrapToolButton.CheckOnClick = false;
        wordWrapToolButton.Checked = false;
        ConfigureToolStripButton(copyDiffToolButton, IconFactory.Diff(tb), "Copy the visible diff text to the clipboard");
        ConfigureToolStripButton(infoToolButton, IconFactory.Info(IconFactory.InfoToolbarIconSize, IconFactory.Palette.Help), "Show application information");
        infoToolButton.Margin = new Padding(2, 1, 2, 1);
    }

    private void ConfigureMenuIcons()
    {
        int root = IconFactory.RootMenuIconSize;
        int bar = IconFactory.MenuBarIconSize;

        menuStrip.ImageScalingSize = new Size(bar, bar);
        menuStrip.ShowItemToolTips = true;
        menuStrip.Padding = new Padding(4, 2, 4, 2);
        menuStrip.Renderer = _menuRenderer;
        menuStrip.AutoSize = false;
        menuStrip.Height = MenuStripRootIconRenderer.RootMenuHeight;

        ConfigureRootMenu(fileMenuItem, IconFactory.Folder(root, IconFactory.Palette.Folder));
        ConfigureRootMenu(repositoryMenuItem, IconFactory.Branch(root, IconFactory.Palette.Branch));
        ConfigureRootMenu(historyMenuItem, IconFactory.History(root, IconFactory.Palette.History));
        ConfigureRootMenu(diffMenuItem, IconFactory.Diff(root));
        ConfigureRootMenu(helpMenuItem, IconFactory.InfoMenu(root, IconFactory.Palette.Help));
        ConfigureDropDownMenu(fileMenuItem);
        ConfigureDropDownMenu(repositoryMenuItem);
        ConfigureDropDownMenu(historyMenuItem);
        ConfigureDropDownMenu(diffMenuItem);
        ConfigureDropDownMenu(helpMenuItem);

        ConfigureMenuItem(openRepositoryMenuItem, IconFactory.Open(bar, IconFactory.Palette.Open), "&Open...", menuBar: true);
        ConfigureMenuItem(cloneRepositoryMenuItem, IconFactory.Clone(bar, IconFactory.Palette.Clone), "&Clone...", menuBar: true);
        ConfigureMenuItem(browseRemoteRepositoryMenuItem, IconFactory.BrowseRemote(bar, IconFactory.Palette.Open), "Browse &Remote...", menuBar: true);
        ConfigureMenuItem(exitMenuItem, IconFactory.Exit(bar, IconFactory.Palette.Exit), "E&xit", menuBar: true);
        ConfigureMenuItem(preferencesMenuItem, IconFactory.Settings(bar, IconFactory.Palette.Settings), "&Preferences...", menuBar: true);
        ConfigureMenuItem(refreshTreeMenuItem, IconFactory.RefreshTree(bar, IconFactory.Palette.Refresh), "Refresh &Tree", menuBar: true);
        ConfigureMenuItem(barExportSummaryWordMenuItem, IconFactory.FileWord(bar), "Export to &Word", menuBar: true);
        ConfigureMenuItem(barExportSummaryMarkdownMenuItem, IconFactory.FileMarkdown(bar), "Export to &Markdown", menuBar: true);
        ConfigureMenuItem(barExportSummaryPdfMenuItem, IconFactory.FilePdf(bar), "Export to &PDF", menuBar: true);
        ConfigureMenuItem(refreshGraphMenuItem, IconFactory.RefreshGraph(bar, IconFactory.Palette.History), "Refresh &Graph", menuBar: true);
        ConfigureMenuItem(copyShaMenuItem, IconFactory.Copy(bar, IconFactory.Palette.Copy), "Copy &SHA", menuBar: true);
        ConfigureMenuItem(copyMessageMenuItem, IconFactory.Message(bar, IconFactory.Palette.Message), "Copy &Message", menuBar: true);
        ConfigureMenuItem(copyPathMenuItem, IconFactory.File(bar, IconFactory.Palette.File), "Copy &Path", menuBar: true);
        ConfigureMenuItem(wordWrapMenuItem, IconFactory.WordWrap(bar, IconFactory.Palette.WordWrap), "Word &Wrap", menuBar: true);
        ConfigureMenuItem(copyDiffMenuItem, IconFactory.Diff(bar), "Copy &Diff", menuBar: true);
        ConfigureMenuItem(aboutMenuItem, IconFactory.InfoToolbar(bar), "&About", menuBar: true);

        ConfigureContextMenu(repoTreeContextMenu,
            (checkoutContextMenuItem, IconFactory.Checkout(), "Checkout"),
            (copyBranchNameContextMenuItem, IconFactory.Branch(), "Copy Name"));
        ConfigureExportSummaryMenu(exportSummaryMenuItem);
        ConfigureExportSummaryMenu(exportSummaryInfoMenuItem);
        ConfigureContextMenu(repoInfoContextMenu);
        ConfigureContextMenu(commitGraphContextMenu,
            (copyShaContextMenuItem, IconFactory.Copy(), "Copy SHA"),
            (copyMessageContextMenuItem, IconFactory.Message(), "Copy Message"),
            (exportCommitContextMenuItem, IconFactory.Folder(), "Export to Folder..."));
        ConfigureContextMenu(changedFilesContextMenu,
            (openExternalDiffContextMenuItem, IconFactory.Diff(), "Open in External Viewer"),
            (copyFilePathContextMenuItem, IconFactory.File(), "Copy Path"));
        ConfigureContextMenu(diffContextMenu,
            (diffCopyContextMenuItem, IconFactory.Copy(), "Copy"),
            (diffWordWrapContextMenuItem, IconFactory.WordWrap(), "Word Wrap"));
        ConfigureContextMenu(repoFilesContextMenu,
            (gitAddContextMenuItem, IconFactory.GitAdd(), "Git Add"),
            (gitResetContextMenuItem, IconFactory.GitReset(), "Git Reset (Unstage)"),
            (gitDiscardContextMenuItem, IconFactory.GitDiscard(), "Git Discard Changes"),
            (resolveConflictContextMenuItem, IconFactory.Diff(), "Resolve Conflict in Merge Tool..."),
            (gitCommitContextMenuItem, IconFactory.GitCommit(), "Git Commit..."),
            (gitFetchContextMenuItem, IconFactory.GitFetch(), "Git Fetch"),
            (gitPullContextMenuItem, IconFactory.GitPull(), "Git Pull"),
            (gitPushContextMenuItem, IconFactory.GitPush(), "Git Push"),
            (gitStashContextMenuItem, IconFactory.GitStash(), "Git Stash"),
            (gitStashPopContextMenuItem, IconFactory.GitStash(), "Git Stash Pop"),
            (gitStatusContextMenuItem, IconFactory.GitStatus(), "Git Status..."),
            (showFileLogContextMenuItem, IconFactory.History(), "Show Log"),
            (createNewFileContextMenuItem, IconFactory.File(), "New File..."),
            (createNewFolderContextMenuItem, IconFactory.Folder(), "New Folder..."),
            (deleteRepoFileContextMenuItem, IconFactory.Delete(), "Delete"),
            (addToGitIgnoreContextMenuItem, IconFactory.GitIgnore(), "Add to .gitignore"),
            (removeFromGitIgnoreContextMenuItem, IconFactory.GitReset(), "Remove from .gitignore"),
            (copyRepoFilePathContextMenuItem, IconFactory.File(), "Copy Path"),
            (clearFileLogFilterContextMenuItem, IconFactory.RefreshGraph(), "Show All Commits"));
        ConfigureRepositoryGitMenu();
    }

    private void ConfigureExportSummaryMenu(ToolStripMenuItem parent, bool menuBar = false)
    {
        int iconSize = menuBar ? IconFactory.MenuBarIconSize : IconFactory.MenuIconSize;
        Image icon = IconFactory.Report(iconSize, menuBar ? IconFactory.Palette.Report : null);
        ConfigureMenuItem(parent, icon, menuBar ? "Export &Summary" : "Export Summary", menuBar);

        if (parent.DropDownItems.Count > 0)
        {
            ConfigureNestedDropDownMenu(parent, menuBar);
        }

        int childIconSize = menuBar ? IconFactory.MenuBarIconSize : IconFactory.MenuIconSize;
        foreach (ToolStripItem child in parent.DropDownItems)
        {
            if (child is ToolStripMenuItem menuItem)
            {
                SetMenuIcon(menuItem, GetExportFormatIcon(menuItem.Tag as string, childIconSize));
                ConfigureDropDownItem(menuItem, menuBar);
            }
        }
    }

    private static Image GetExportFormatIcon(string? formatTag, int size) => formatTag switch
    {
        "pdf" => IconFactory.FilePdf(size),
        "docx" => IconFactory.FileWord(size),
        "md" => IconFactory.FileMarkdown(size),
        _ => IconFactory.File(size),
    };

    private void ConfigureContextMenu(ContextMenuStrip menu, params (ToolStripMenuItem Item, Image Icon, string Text)[] items)
    {
        menu.Renderer = _menuRenderer;
        menu.ShowImageMargin = false;
        menu.AutoSize = true;
        menu.Padding = new Padding(1);
        menu.MinimumSize = new Size(MenuStripRootIconRenderer.ContextMenuDropDownMinWidth, 0);
        WireDropDownWidthAlignment(menu);

        foreach (var (item, icon, text) in items)
        {
            ConfigureMenuItem(item, icon, text);
        }
    }

    // ToolStripDropDownMenu does not stretch each item's Bounds to the popup's full width.
    // Short labels keep a narrower Bounds, so hover/selection only covers part of the row.
    private static void WireDropDownWidthAlignment(ToolStripDropDown dropDown)
    {
        dropDown.Opening += (_, _) => AlignDropDownItemWidths(dropDown);
        dropDown.Opened += (_, _) => AlignDropDownItemWidths(dropDown);
    }

    private static void AlignDropDownItemWidths(ToolStripDropDown dropDown)
    {
        var menuItems = dropDown.Items.OfType<ToolStripMenuItem>().ToList();
        if (menuItems.Count == 0)
        {
            return;
        }

        foreach (var item in menuItems)
        {
            item.AutoSize = false;
        }

        int width = menuItems.Max(item => item.GetPreferredSize(Size.Empty).Width);
        width = Math.Max(width, dropDown.MinimumSize.Width - dropDown.Padding.Horizontal);

        foreach (var item in menuItems)
        {
            bool menuBar = MenuStripRootIconRenderer.IsMenuBarDropDownItem(item);
            int minHeight = MenuStripRootIconRenderer.GetMinDropDownItemHeight(menuBar);
            item.Size = new Size(
                width,
                Math.Max(item.GetPreferredSize(Size.Empty).Height, minHeight));
        }

        dropDown.PerformLayout();

        int clientWidth = dropDown.ClientRectangle.Width;
        if (clientWidth <= 0)
        {
            return;
        }

        foreach (var item in menuItems)
        {
            if (item.Width != clientWidth)
            {
                item.Width = clientWidth;
            }
        }

        foreach (var separator in dropDown.Items.OfType<ToolStripSeparator>())
        {
            separator.AutoSize = false;
            if (separator.Width != clientWidth)
            {
                separator.Width = clientWidth;
            }
        }
    }

    private static void ConfigureMenuItem(ToolStripMenuItem item, Image icon, string text, bool menuBar = false)
    {
        item.Text = text;
        SetMenuIcon(item, icon);
        ConfigureDropDownItem(item, menuBar);
    }

    private void ConfigureDropDownMenu(ToolStripMenuItem menuItem)
    {
        menuItem.DropDown.Renderer = _menuRenderer;
        if (menuItem.DropDown is ToolStripDropDownMenu dropDownMenu)
        {
            dropDownMenu.ShowImageMargin = false;
        }

        menuItem.DropDown.BackColor = Color.White;
        menuItem.DropDown.ForeColor = Color.FromArgb(30, 41, 59);
        menuItem.DropDown.AutoSize = true;
        menuItem.DropDown.Padding = new Padding(1);
        menuItem.DropDown.MinimumSize = new Size(MenuStripRootIconRenderer.MenuBarDropDownMinWidth, 0);
        WireDropDownWidthAlignment(menuItem.DropDown);
    }

    private void ConfigureNestedDropDownMenu(ToolStripMenuItem menuItem, bool menuBar)
    {
        int minWidth = menuBar
            ? MenuStripRootIconRenderer.MenuBarDropDownMinWidth
            : MenuStripRootIconRenderer.ContextMenuDropDownMinWidth;

        menuItem.DropDown.Renderer = _menuRenderer;
        if (menuItem.DropDown is ToolStripDropDownMenu dropDownMenu)
        {
            dropDownMenu.ShowImageMargin = false;
        }

        menuItem.DropDown.BackColor = Color.White;
        menuItem.DropDown.ForeColor = Color.FromArgb(30, 41, 59);
        menuItem.DropDown.AutoSize = true;
        menuItem.DropDown.Padding = new Padding(1);
        menuItem.DropDown.MinimumSize = new Size(minWidth, 0);
        WireDropDownWidthAlignment(menuItem.DropDown);
    }

    private static void ConfigureDropDownItem(ToolStripMenuItem item, bool menuBar = false)
    {
        item.AutoSize = true;
        item.DisplayStyle = ToolStripItemDisplayStyle.Text;
        item.Font = new Font(item.Font.FontFamily, MenuStripRootIconRenderer.DropDownMenuFontSize, FontStyle.Regular);
        item.ForeColor = Color.FromArgb(30, 41, 59);
        item.Padding = MenuStripRootIconRenderer.GetDropDownPadding(menuBar);
        item.Margin = Padding.Empty;
    }

    private static void ConfigureRootMenu(ToolStripMenuItem item, Image icon)
    {
        SetMenuIcon(item, icon);
        item.Font = new Font(item.Font.FontFamily, MenuStripRootIconRenderer.RootMenuFontSize, FontStyle.Regular);
        item.DisplayStyle = ToolStripItemDisplayStyle.Text;
        item.AutoSize = true;
        item.Padding = MenuStripRootIconRenderer.RootMenuPadding;
        item.Margin = Padding.Empty;
    }

    private static void SetMenuIcon(ToolStripItem item, Image icon)
    {
        item.Image = icon;
        item.ImageScaling = ToolStripItemImageScaling.None;
    }

    private void ConfigureChangedFilesListView()
    {
        ListViewStyles.ApplyTableStyle(changedFilesListView);
        _changedFilesPathColumn = ListViewHeaderToolTipBehavior.AddColumn(
            changedFilesListView,
            "Path",
            280,
            "Relative path of the changed file in the repository.");
        _changedFilesStatusColumn = ListViewHeaderToolTipBehavior.AddColumn(
            changedFilesListView,
            "Status",
            100,
            "Kind of change (Added, Modified, Deleted, Renamed, etc.).");
        ListViewHeaderToolTipBehavior.Attach(changedFilesListView);
    }


    private void ConfigureSectionHeadingToolTips()
    {
        toolTip.SetToolTip(repoTitleLabel, "Local repository tree with branches, tags, and releases.");
        toolTip.SetToolTip(repoFilesTitleLabel, "Repository folders and files. Icons show Git status; hover a node for staged and work tree details.");
        toolTip.SetToolTip(graphTitleLabel, "Commit log with branch graph, messages, and metadata.");
        toolTip.SetToolTip(filesTitleLabel, "Author, message, and files changed in the selected commit.");
        toolTip.SetToolTip(diffTitleLabel, "Unified diff for the selected changed file.");
        toolTip.SetToolTip(changedFilesTitleLabel, "List of files modified in the selected commit.");
    }

    // Re-applied whenever the language changes in Preferences — covers the main menu bar,
    // toolbar tooltips, and section headings. Context menus and dialogs keep their English
    // text for now; only the primary shell chrome is localized.
    private void ApplyLocalizedShellText()
    {
        fileMenuItem.Text = Localization.T("Menu.File");
        openRepositoryMenuItem.Text = Localization.T("Menu.File.Open");
        openRepositoryMenuItem.ToolTipText = Localization.T("Menu.File.Open.Tip");
        cloneRepositoryMenuItem.Text = Localization.T("Menu.File.Clone");
        cloneRepositoryMenuItem.ToolTipText = Localization.T("Menu.File.Clone.Tip");
        browseRemoteRepositoryMenuItem.Text = Localization.T("Menu.File.BrowseRemote");
        browseRemoteRepositoryMenuItem.ToolTipText = Localization.T("Menu.File.BrowseRemote.Tip");
        preferencesMenuItem.Text = Localization.T("Menu.File.Preferences");
        preferencesMenuItem.ToolTipText = Localization.T("Menu.File.Preferences.Tip");
        exitMenuItem.Text = Localization.T("Menu.File.Exit");
        exitMenuItem.ToolTipText = Localization.T("Menu.File.Exit.Tip");

        repositoryMenuItem.Text = Localization.T("Menu.Repository");
        refreshTreeMenuItem.Text = Localization.T("Menu.Repository.RefreshTree");
        barExportSummaryWordMenuItem.Text = Localization.T("Menu.Repository.ExportWord");
        barExportSummaryMarkdownMenuItem.Text = Localization.T("Menu.Repository.ExportMarkdown");
        barExportSummaryPdfMenuItem.Text = Localization.T("Menu.Repository.ExportPdf");

        historyMenuItem.Text = Localization.T("Menu.History");
        refreshGraphMenuItem.Text = Localization.T("Menu.History.RefreshGraph");
        copyShaMenuItem.Text = Localization.T("Menu.History.CopySha");
        copyMessageMenuItem.Text = Localization.T("Menu.History.CopyMessage");

        diffMenuItem.Text = Localization.T("Menu.Diff");
        copyPathMenuItem.Text = Localization.T("Menu.Diff.CopyPath");
        wordWrapMenuItem.Text = Localization.T("Menu.Diff.WordWrap");
        copyDiffMenuItem.Text = Localization.T("Menu.Diff.CopyDiff");

        helpMenuItem.Text = Localization.T("Menu.Help");
        aboutMenuItem.Text = Localization.T("Menu.Help.About");

        openToolButton.ToolTipText = Localization.T("Toolbar.Open.Tip");
        cloneToolButton.ToolTipText = Localization.T("Toolbar.Clone.Tip");
        browseRemoteToolButton.ToolTipText = Localization.T("Toolbar.BrowseRemote.Tip");
        refreshTreeToolButton.ToolTipText = Localization.T("Toolbar.RefreshTree.Tip");
        exportSummaryToolButton.ToolTipText = Localization.T("Toolbar.ExportSummary.Tip");
        refreshGraphToolButton.ToolTipText = Localization.T("Toolbar.RefreshGraph.Tip");
        copyShaToolButton.ToolTipText = Localization.T("Toolbar.CopySha.Tip");
        copyMessageToolButton.ToolTipText = Localization.T("Toolbar.CopyMessage.Tip");
        copyFilePathToolButton.ToolTipText = Localization.T("Toolbar.CopyFilePath.Tip");
        wordWrapToolButton.ToolTipText = Localization.T("Toolbar.WordWrap.Tip");
        copyDiffToolButton.ToolTipText = Localization.T("Toolbar.CopyDiff.Tip");
        infoToolButton.ToolTipText = Localization.T("Toolbar.Info.Tip");

        repoTitleLabel.Text = Localization.T("Section.Repo.Title");
        toolTip.SetToolTip(repoTitleLabel, Localization.T("Section.Repo.Tip"));
        repoFilesTitleLabel.Text = Localization.T("Section.RepoFiles.Title");
        toolTip.SetToolTip(repoFilesTitleLabel, Localization.T("Section.RepoFiles.Tip"));
        UpdateGraphTitleLabel();
        toolTip.SetToolTip(graphTitleLabel, Localization.T("Section.Graph.Tip"));
        filesTitleLabel.Text = Localization.T("Section.Files.Title");
        toolTip.SetToolTip(filesTitleLabel, Localization.T("Section.Files.Tip"));
        diffTitleLabel.Text = Localization.T("Section.Diff.Title");
        toolTip.SetToolTip(diffTitleLabel, Localization.T("Section.Diff.Tip"));
        changedFilesTitleLabel.Text = Localization.T("Section.ChangedFiles.Title");
        toolTip.SetToolTip(changedFilesTitleLabel, Localization.T("Section.ChangedFiles.Tip"));

        diffCopyContextMenuItem.Text = Localization.T("Menu.Diff.ContextCopy");
        diffWordWrapContextMenuItem.Text = Localization.T("Menu.Diff.ContextWordWrap");

        copyShaContextMenuItem.Text = Localization.T("Menu.CommitGraph.CopySha");
        copyMessageContextMenuItem.Text = Localization.T("Menu.CommitGraph.CopyMessage");
        exportCommitContextMenuItem.Text = Localization.T("Menu.CommitGraph.ExportToFolder");

        UpdateOpenExternalDiffMenuItemText();
        copyFilePathContextMenuItem.Text = Localization.T("Menu.ChangedFiles.CopyPath");
        copyFilePathContextMenuItem.ToolTipText = Localization.T("Menu.ChangedFiles.CopyPath.Tip");
        openExternalDiffContextMenuItem.ToolTipText = Localization.T("Menu.ChangedFiles.OpenExternal.Tip");

        addToGitIgnoreContextMenuItem.Text = Localization.T("Menu.RepoFiles.AddToGitIgnore");
        addToGitIgnoreContextMenuItem.ToolTipText = Localization.T("Menu.RepoFiles.AddToGitIgnore.Tip");
        removeFromGitIgnoreContextMenuItem.Text = Localization.T("Menu.RepoFiles.RemoveFromGitIgnore");
        removeFromGitIgnoreContextMenuItem.ToolTipText = Localization.T("Menu.RepoFiles.RemoveFromGitIgnore.Tip");

        repoFilesListView.NameColumnText = Localization.T("Column.RepoFiles.Name");
        repoFilesListView.StatusColumnText = Localization.T("Column.RepoFiles.Status");

        _changedFilesPathColumn.Text = Localization.T("Column.ChangedFiles.Path");
        _changedFilesPathColumn.Tag = Localization.T("Column.ChangedFiles.Path.Tip");
        _changedFilesStatusColumn.Text = Localization.T("Column.ChangedFiles.Status");
        _changedFilesStatusColumn.Tag = Localization.T("Column.ChangedFiles.Status.Tip");

        commitGraphView.SetColumnHeaderText(
        [
            (Localization.T("Column.Graph.Graph"), Localization.T("Column.Graph.Graph.Tip")),
            (Localization.T("Column.Graph.Message"), Localization.T("Column.Graph.Message.Tip")),
            (Localization.T("Column.Graph.Sha"), Localization.T("Column.Graph.Sha.Tip")),
            (Localization.T("Column.Graph.Author"), Localization.T("Column.Graph.Author.Tip")),
            (Localization.T("Column.Graph.Date"), Localization.T("Column.Graph.Date.Tip"))
        ]);

        repositoryGitMenuItem.Text = Localization.T("Menu.Git");
        foreach (ToolStripMenuItem item in _repositoryGitMenuItems)
        {
            LocalizeGitMenuItem(item);
        }

        foreach (ToolStripMenuItem item in GetFilesGitMenuItems())
        {
            LocalizeGitMenuItem(item);
        }

        checkoutContextMenuItem.Text = Localization.T("Menu.RepoTree.Checkout");
        copyBranchNameContextMenuItem.Text = Localization.T("Menu.RepoTree.CopyName");
        showFileLogContextMenuItem.Text = Localization.T("Menu.RepoFiles.ShowLog");
        createNewFileContextMenuItem.Text = Localization.T("Menu.RepoFiles.NewFile");
        createNewFolderContextMenuItem.Text = Localization.T("Menu.RepoFiles.NewFolder");
        deleteRepoFileContextMenuItem.Text = Localization.T("Menu.RepoFiles.Delete");
        deleteRepoFileContextMenuItem.ToolTipText = Localization.T("Menu.RepoFiles.Delete.Tip");
        copyRepoFilePathContextMenuItem.Text = Localization.T("Menu.RepoFiles.CopyPath");
        clearFileLogFilterContextMenuItem.Text = Localization.T("Menu.RepoFiles.ClearFilter");
        resolveConflictContextMenuItem.Text = Localization.T("Menu.Files.ResolveConflict");

        ApplyLocalizedExportSummaryMenu(exportSummaryMenuItem, menuBar: false);
        ApplyLocalizedExportSummaryMenu(exportSummaryInfoMenuItem, menuBar: false);
        ApplyLocalizedExportSummaryMenu(exportSummaryToolButton, toolbarButton: true);

        if (_currentCommit is null)
        {
            commitMetaLabel.Text = Localization.T("Commit.SelectPrompt");
        }

        if (_currentCommitChanges is TreeChanges changes)
        {
            PopulateChangedFilesList(changes);
        }

        RefreshFileTreeTooltips();
        UpdateRepoInfoLabel();
        UpdateRepoCounts();
        UpdateGraphTitleLabel();
    }

    private static void LocalizeGitMenuItem(ToolStripMenuItem item)
    {
        if (!string.IsNullOrEmpty(item.Name)
            && GitMenuLocalizationKeys.TryGetValue(item.Name, out string? key))
        {
            item.Text = Localization.T(key);
        }
    }

    private static void ApplyLocalizedExportSummaryMenu(ToolStripDropDownItem parent, bool menuBar = false, bool toolbarButton = false)
    {
        parent.Text = toolbarButton
            ? Localization.T("Toolbar.ExportSummary.Button")
            : menuBar
                ? Localization.T("Menu.ExportSummary.Bar")
                : Localization.T("Menu.ExportSummary");
        parent.ToolTipText = Localization.T("Menu.ExportSummary.Tip");

        foreach (ToolStripItem child in parent.DropDownItems)
        {
            if (child is not ToolStripMenuItem menuItem)
            {
                continue;
            }

            menuItem.Text = (menuItem.Tag as string) switch
            {
                "pdf" => Localization.T("Menu.ExportSummary.Pdf"),
                "docx" => Localization.T("Menu.ExportSummary.Word"),
                "md" => Localization.T("Menu.ExportSummary.Markdown"),
                _ => menuItem.Text
            };
        }
    }

    private void RefreshFileTreeTooltips()
    {
        if (_fileTreeStatusIndex is null)
        {
            return;
        }

        RepositoryPathStatusService.ApplyToTree(_repoFilesTreeModel, _fileTreeStatusIndex, _gitFileTreeImages);
        repoFilesListView.Invalidate();
    }

    private static string FormatChangeKind(ChangeKind kind) => kind switch
    {
        ChangeKind.Added => Localization.T("ChangeKind.Added"),
        ChangeKind.Modified => Localization.T("ChangeKind.Modified"),
        ChangeKind.Deleted => Localization.T("ChangeKind.Deleted"),
        ChangeKind.Renamed => Localization.T("ChangeKind.Renamed"),
        ChangeKind.Copied => Localization.T("ChangeKind.Copied"),
        ChangeKind.Unmodified => Localization.T("ChangeKind.Unmodified"),
        _ => kind.ToString()
    };

    private void PopulateChangedFilesList(TreeChanges changes)
    {
        changedFilesListView.BeginUpdate();
        changedFilesListView.Items.Clear();
        foreach (TreeEntryChanges entry in changes)
        {
            var item = new ListViewItem(entry.Path) { Tag = entry.Path };
            item.SubItems.Add(FormatChangeKind(entry.Status));
            changedFilesListView.Items.Add(item);
        }

        changedFilesListView.EndUpdate();
    }

    private string? GetSelectedChangedFilePath()
    {
        if (changedFilesListView.SelectedItems.Count == 0)
        {
            return null;
        }

        return changedFilesListView.SelectedItems[0].Tag as string
            ?? changedFilesListView.SelectedItems[0].Text;
    }

    private static void ConfigureToolStripButton(ToolStripButton button, Image icon, string toolTipText)
    {
        ApplyToolStripIconButton(button, icon, toolTipText);
    }

    private static void ConfigureToolStripDropDownButton(ToolStripDropDownButton button, Image icon, string toolTipText)
    {
        ApplyToolStripIconButton(button, icon, toolTipText);
        button.ShowDropDownArrow = false;
    }

    private static void ApplyToolStripIconButton(ToolStripItem button, Image icon, string toolTipText)
    {
        button.Image = icon;
        button.ImageScaling = ToolStripItemImageScaling.None;
        button.DisplayStyle = ToolStripItemDisplayStyle.Image;
        button.Text = string.Empty;
        button.Padding = new Padding(4);
        button.Margin = new Padding(2, 0, 2, 0);
        button.AutoSize = false;
        int content = Math.Max(icon.Width, icon.Height);
        button.Size = new Size(content + button.Padding.Horizontal, content + button.Padding.Vertical);
        button.ToolTipText = toolTipText;
    }

    private void OpenLastSuccessfulSessionIfAvailable()
    {
        var session = _settings.LastSuccessfulSession;
        if (session is null || string.IsNullOrWhiteSpace(session.Path))
        {
            return;
        }

        if (!Directory.Exists(session.Path) || !Repository.IsValid(session.Path))
        {
            _settings.RemoveRecentRepository(session.Path);
            _settings.Save();
            return;
        }

        if (session.IsRemote)
        {
            if (string.IsNullOrWhiteSpace(session.RemoteUrl))
            {
                return;
            }

            statusLabel.Text = Localization.T("Status.OpeningLastRemote");
            TryOpenRemoteBrowse(session.Path, session.RemoteUrl, showErrorOnFailure: false);
            return;
        }

        statusLabel.Text = Localization.T("Status.OpeningLastLocal");
        TryOpenRepository(session.Path, showErrorOnFailure: false);
    }

    private void OpenRepositoryMenuItem_Click(object? sender, EventArgs e)
    {
        using var dialog = new FolderBrowserDialog { Description = Localization.T("Dialog.SelectRepoFolder") };
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        statusLabel.Text = Localization.T("Status.OpeningRepo");
        TryOpenRepository(
            dialog.SelectedPath,
            completionTitle: Localization.T("OpComplete.RepoOpened"),
            completionSummary: Localization.T("OpComplete.RepoOpenedSummary"));
    }

    private void CloneRepositoryMenuItem_Click(object? sender, EventArgs e)
    {
        using var dialog = new CloneRepositoryForm();
        if (dialog.ShowDialog(this) != DialogResult.OK || dialog.ClonedRepositoryPath is null)
        {
            return;
        }

        statusLabel.Text = Localization.T("Status.OpeningCloned");
        TryOpenRepository(
            dialog.ClonedRepositoryPath,
            completionTitle: Localization.T("OpComplete.CloneComplete"),
            completionSummary: Localization.T("OpComplete.CloneSummary"),
            completionDetails:
            [
                OpDetail("Detail.RemoteUrl", dialog.RepositoryUrl ?? string.Empty),
                OpDetail("Detail.Folder", dialog.ClonedRepositoryPath)
            ]);
    }

    private void BrowseRemoteRepositoryMenuItem_Click(object? sender, EventArgs e)
    {
        using var dialog = new BrowseRemoteRepositoryForm();
        if (dialog.ShowDialog(this) != DialogResult.OK
            || dialog.RepositoryPath is null
            || string.IsNullOrWhiteSpace(dialog.RepositoryUrl))
        {
            return;
        }

        statusLabel.Text = Localization.T("Status.OpeningRemote");
        TryOpenRemoteBrowse(
            dialog.RepositoryPath,
            dialog.RepositoryUrl,
            completionTitle: Localization.T("OpComplete.RemoteBrowseReady"),
            completionSummary: Localization.T("OpComplete.RemoteBrowseSummary"));
    }

    private void ExitMenuItem_Click(object? sender, EventArgs e) => Close();

    private void PreferencesMenuItem_Click(object? sender, EventArgs e)
    {
        using var dialog = new PreferencesDialog(_settings);
        dialog.ShowDialog(this);
    }

    private void AboutMenuItem_Click(object? sender, EventArgs e)
    {
        using var dialog = new AboutDialog();
        dialog.ShowDialog(this);
    }

    private void TryOpenRepository(
        string path,
        bool showErrorOnFailure = true,
        string? completionTitle = null,
        string? completionSummary = null,
        IReadOnlyList<OperationDetail>? completionDetails = null) =>
        _ = TryOpenRepositoryAsync(path, showErrorOnFailure, completionTitle, completionSummary, completionDetails);

    private async Task TryOpenRepositoryAsync(
        string path,
        bool showErrorOnFailure = true,
        string? completionTitle = null,
        string? completionSummary = null,
        IReadOnlyList<OperationDetail>? completionDetails = null)
    {
        try
        {
            _remoteBrowseUrl = null;
            _pathHistoryFilter = null;
            _gitService.OpenLocal(path);
            statusLabel.Text = Localization.Tf("Status.Branch", _gitService.GetCurrentBranchName());
            await RefreshRepositoryViewsAsync(Localization.T("Status.OpeningRepo"));

            if (!string.IsNullOrWhiteSpace(_gitService.RepositoryPath))
            {
                _settings.RecordSuccessfulLocalSession(_gitService.RepositoryPath);
                _settings.Save();
            }

            RefreshFileRecentMenu();

            if (completionTitle is not null)
            {
                ShowOperationComplete(
                    completionTitle,
                    completionSummary ?? Localization.T("OpComplete.DefaultSummary"),
                    completionDetails,
                    OpDetail("Detail.Repository", _gitService.RepositoryPath ?? path),
                    OpDetail("Detail.Branch", _gitService.GetCurrentBranchName()));
            }
        }
        catch (Exception ex)
        {
            statusLabel.Text = Localization.T("Status.Ready");
            if (showErrorOnFailure)
            {
                MessageBox.Show(this, ex.Message, Localization.T("Error.OpenRepository"), MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    private void TryOpenRemoteBrowse(
        string cachePath,
        string remoteUrl,
        bool showErrorOnFailure = true,
        string? completionTitle = null,
        string? completionSummary = null) =>
        _ = TryOpenRemoteBrowseAsync(cachePath, remoteUrl, showErrorOnFailure, completionTitle, completionSummary);

    private async Task TryOpenRemoteBrowseAsync(
        string cachePath,
        string remoteUrl,
        bool showErrorOnFailure = true,
        string? completionTitle = null,
        string? completionSummary = null)
    {
        try
        {
            _remoteBrowseUrl = remoteUrl;
            _pathHistoryFilter = null;
            _gitService.OpenLocal(cachePath);
            statusLabel.Text = Localization.Tf("Status.BranchRemote", _gitService.GetCurrentBranchName());
            await RefreshRepositoryViewsAsync(Localization.T("Status.OpeningRemote"));

            _settings.RecordSuccessfulRemoteBrowseSession(cachePath, remoteUrl);
            _settings.Save();

            if (completionTitle is not null)
            {
                var displayName = RemoteRepositoryService.GetDisplayName(remoteUrl) ?? remoteUrl;
                ShowOperationComplete(
                    completionTitle,
                    completionSummary ?? Localization.T("OpComplete.DefaultSummary"),
                    null,
                    OpDetail("Detail.Repository", displayName),
                    OpDetail("Detail.RemoteUrl", remoteUrl),
                    OpDetail("Detail.Branch", _gitService.GetCurrentBranchName()),
                    OpDetail("Detail.Mode", Localization.T("Detail.Value.RemoteBrowse")));
            }
        }
        catch (Exception ex)
        {
            _remoteBrowseUrl = null;
            statusLabel.Text = Localization.T("Status.Ready");
            if (showErrorOnFailure)
            {
                MessageBox.Show(this, ex.Message, Localization.T("Error.BrowseRemote"), MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    private bool IsRemoteBrowseMode =>
        !string.IsNullOrWhiteSpace(_remoteBrowseUrl) || _gitService.Repo?.Info.IsBare == true;

    private static OperationDetail OpDetail(string labelKey, string value) =>
        new(Localization.T(labelKey), value);

    private void ShowOperationComplete(
        string title,
        string summary,
        IReadOnlyList<OperationDetail>? prefixDetails,
        params OperationDetail[] trailingDetails)
    {
        var details = new List<OperationDetail>();
        if (prefixDetails is not null)
        {
            details.AddRange(prefixDetails);
        }

        details.AddRange(trailingDetails);
        OperationCompleteDialog.Show(this, title, summary, details);
    }

    private void RefreshFileRecentMenu()
    {
        RefreshFileRecentMenuItems(GetValidRecentRepositoryPaths());
    }

    private void RefreshFileRecentMenuItems(IReadOnlyList<string> validPaths)
    {
        foreach (var item in _fileRecentMenuItems)
        {
            fileMenuItem.DropDownItems.Remove(item);
            item.Click -= RecentRepositoryMenuItem_Click;
            item.Dispose();
        }

        _fileRecentMenuItems.Clear();
        fileRecentSeparator.Visible = validPaths.Count > 0;

        if (validPaths.Count == 0)
        {
            return;
        }

        int insertIndex = fileMenuItem.DropDownItems.IndexOf(fileMenuSeparator);
        string? currentPath = _gitService.RepositoryPath;

        foreach (string path in validPaths)
        {
            var item = CreateRecentRepositoryMenuItem(path, validPaths, currentPath);
            fileMenuItem.DropDownItems.Insert(insertIndex++, item);
            _fileRecentMenuItems.Add(item);
        }
    }

    private ToolStripMenuItem CreateRecentRepositoryMenuItem(
        string path,
        IReadOnlyList<string> allPaths,
        string? currentPath)
    {
        string label = FormatRecentRepositoryLabel(path, allPaths);
        var item = new ToolStripMenuItem(label)
        {
            Tag = path,
            ToolTipText = path,
            Checked = IsSameRepositoryPath(path, currentPath)
        };
        ConfigureMenuItem(item, IconFactory.Folder(IconFactory.MenuBarIconSize, IconFactory.Palette.Folder), label, menuBar: true);
        item.Click += RecentRepositoryMenuItem_Click;
        return item;
    }

    private List<string> GetValidRecentRepositoryPaths()
    {
        var validPaths = new List<string>();
        bool settingsChanged = false;
        foreach (string path in _settings.RecentRepositoryPaths.ToList())
        {
            if (Directory.Exists(path) && Repository.IsValid(path))
            {
                validPaths.Add(path);
                continue;
            }

            _settings.RemoveRecentRepository(path);
            settingsChanged = true;
        }

        if (settingsChanged)
        {
            _settings.Save();
        }

        return validPaths;
    }

    private static bool IsSameRepositoryPath(string path, string? currentPath)
    {
        if (string.IsNullOrWhiteSpace(currentPath))
        {
            return false;
        }

        try
        {
            return string.Equals(
                Path.GetFullPath(path),
                Path.GetFullPath(currentPath),
                StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return string.Equals(path, currentPath, StringComparison.OrdinalIgnoreCase);
        }
    }

    private static string FormatRecentRepositoryLabel(string path, IReadOnlyList<string> allPaths)
    {
        string trimmed = path.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string name = Path.GetFileName(trimmed);
        if (string.IsNullOrEmpty(name))
        {
            name = trimmed;
        }

        bool duplicateName = allPaths.Count(other =>
            string.Equals(
                Path.GetFileName(other.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)),
                name,
                StringComparison.OrdinalIgnoreCase)) > 1;

        if (!duplicateName)
        {
            return name;
        }

        string? parent = Path.GetDirectoryName(trimmed) is { } parentPath
            ? Path.GetFileName(parentPath)
            : null;
        return string.IsNullOrEmpty(parent) ? name : $"{name} ({parent})";
    }

    private void RecentRepositoryMenuItem_Click(object? sender, EventArgs e)
    {
        if (sender is ToolStripMenuItem { Tag: string path })
        {
            if (IsSameRepositoryPath(path, _gitService.RepositoryPath))
            {
                return;
            }

            TryOpenRepository(
                path,
                completionTitle: Localization.T("OpComplete.RepoOpened"),
                completionSummary: Localization.T("OpComplete.RepoOpenedSummary"));
        }
    }

    private void RefreshRepositoryViews() => _ = RefreshRepositoryViewsAsync();

    private void CancelPendingRepositoryOperations()
    {
        _repositoryRefreshGeneration++;
        _fileTreeStatusRefreshGeneration++;
        _pathHistoryLoadGeneration++;
        _commitGraphLoadGeneration++;
    }

    /// <summary>Rebuilds the Git status index and repaints every loaded file-tree row without
    /// collapsing the tree or reloading the commit graph.</summary>
    private async Task RefreshFileTreeStatusAsync()
    {
        if (_gitService.Repo is null)
        {
            _fileTreeStatusIndex = null;
            repoFilesListView.RebuildPreservingSelection();
            return;
        }

        Repository repo = _gitService.Repo;
        int refreshGeneration = ++_fileTreeStatusRefreshGeneration;
        RepositoryPathStatusIndex index = await Task.Run(
            () => _gitService.RunLocked(RepositoryPathStatusService.Build));

        if (refreshGeneration != _fileTreeStatusRefreshGeneration || _gitService.Repo != repo)
        {
            return;
        }

        ApplyFileTreeStatus(index);
    }

    private void WorkingTreeWatcher_Changed(object? sender, RepositoryWorkingTreeChangeEventArgs e) =>
        _ = HandleWorkingTreeChangedAsync(e);

    private async Task HandleWorkingTreeChangedAsync(RepositoryWorkingTreeChangeEventArgs e)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow || _repositoryRefreshInProgress)
        {
            return;
        }

        if (e.RequiresStructureRefresh)
        {
            await RefreshFileTreeStructureAsync(e.AffectedDirectoryPaths);
        }
        else
        {
            await RefreshFileTreeStatusAsync();
        }
    }

    private async Task RefreshFileTreeStructureAsync(IReadOnlyList<string> affectedDirectoryPaths)
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        Repository repo = _gitService.Repo;
        await RefreshFileTreeStatusAsync();
        if (_gitService.Repo != repo)
        {
            return;
        }

        IReadOnlyList<string> pathsToReload = affectedDirectoryPaths.Count > 0
            ? ExpandDirectoryPathsWithAncestors(affectedDirectoryPaths)
            : RepositoryFileTreeService.CollectLoadedDirectoryRelativePaths(_repoFilesTreeModel);

        RepositoryFileTreeService.ReloadDirectories(
            _repoFilesTreeModel,
            repo,
            pathsToReload,
            _gitFileTreeImages,
            _fileTreeStatusIndex);
        repoFilesListView.RebuildPreservingSelection();
    }

    private static IReadOnlyList<string> ExpandDirectoryPathsWithAncestors(IReadOnlyList<string> paths)
    {
        var expanded = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (string path in paths)
        {
            string current = PathCommitHistoryService.NormalizeGitPath(path);
            expanded.Add(current);
            while (!string.IsNullOrEmpty(current))
            {
                int separatorIndex = current.LastIndexOf('/');
                current = separatorIndex < 0 ? string.Empty : current[..separatorIndex];
                expanded.Add(current);
            }
        }

        return expanded.ToList();
    }

    private void UpdateWorkingTreeWatcher()
    {
        if (_gitService.Repo?.Info.WorkingDirectory is { } workingDirectory
            && CanUseGitWorkflow
            && Directory.Exists(workingDirectory))
        {
            _workingTreeWatcher.Watch(workingDirectory);
        }
        else
        {
            _workingTreeWatcher.Stop();
        }
    }

    private async Task RefreshAfterGitCommitAsync()
    {
        await RefreshFileTreeStatusAsync();
        if (_gitService.Repo is null)
        {
            return;
        }

        if (_pathHistoryFilter is not null)
        {
            await LoadPathFilteredCommitGraphAsync();
        }
        else
        {
            await LoadCommitGraphAsync();
        }
    }

    private void ApplyFileTreeStatus(RepositoryPathStatusIndex index)
    {
        _fileTreeStatusIndex = index;
        RepositoryPathStatusService.ApplyToTree(_repoFilesTreeModel, _fileTreeStatusIndex, _gitFileTreeImages);
        repoFilesListView.RebuildPreservingSelection();
    }

    /// <summary>
    /// Refreshes origin/* refs so file status can compare local HEAD with the remote tip.
    /// Uses saved credentials when available; otherwise attempts an anonymous fetch (public repos).
    /// </summary>
    private async Task SyncRemoteTrackingRefsAsync()
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow || !GitWorkflowService.HasOriginRemote(_gitService.Repo))
        {
            return;
        }

        CredentialsPrompt? prompt = _gitCredentialsVerified ? CreateGitCredentialsPrompt() : null;

        try
        {
            await Task.Run(() =>
                _gitService.RunLocked(repo =>
                    GitWorkflowService.TryFetchOrigin(
                        repo,
                        prompt is not null ? prompt.Handler : null,
                        CancellationToken.None)));
        }
        catch (OperationCanceledException)
        {
            // Credential dialog cancelled — continue with cached remote-tracking refs.
        }
    }

    private async Task RefreshRepositoryViewsAsync(string progressMessage = "Refreshing repository...", bool showProgress = true)
    {
        if (_gitService.Repo is null)
        {
            _fileTreeStatusIndex = null;
            _repoFilesTreeModel.Nodes.Clear();
            repoFilesListView.SetRoot(null);
            UpdateWorkingTreeWatcher();
            UpdateGraphTitleLabel();
            return;
        }

        Repository repo = _gitService.Repo;
        int refreshGeneration = ++_repositoryRefreshGeneration;
        _pathHistoryLoadGeneration++;
        _commitGraphLoadGeneration++;
        _repositoryRefreshInProgress = true;
        try
        {
            if (CanUseGitWorkflow && GitWorkflowService.HasOriginRemote(repo))
            {
                if (showProgress)
                {
                    statusLabel.Text = Localization.T("Status.SyncingRemote");
                    repoLoadProgressBar.Visible = true;
                }

                await SyncRemoteTrackingRefsAsync();
            }

            RepositoryPathStatusIndex statusIndex;
            if (showProgress)
            {
                statusLabel.Text = progressMessage;
                repoLoadProgressBar.Visible = true;
                try
                {
                    statusIndex = await Task.Run(
                        () => _gitService.RunLocked(RepositoryPathStatusService.Build));
                }
                finally
                {
                    repoLoadProgressBar.Visible = false;
                }
            }
            else
            {
                statusIndex = await Task.Run(
                    () => _gitService.RunLocked(RepositoryPathStatusService.Build));
            }

            if (refreshGeneration != _repositoryRefreshGeneration || _gitService.Repo != repo)
            {
                return;
            }

            _fileTreeStatusIndex = statusIndex;
            _fileTreeStatusRefreshGeneration++;
            PopulateRepositoryTrees(repo);
            if (refreshGeneration != _repositoryRefreshGeneration || _gitService.Repo != repo)
            {
                return;
            }

            UpdateRepoInfoLabel();
            if (_pathHistoryFilter is not null)
            {
                await LoadPathFilteredCommitGraphAsync();
            }
            else
            {
                await LoadCommitGraphAsync();
            }

            UpdateRepoCounts();
        }
        catch (Exception ex)
        {
            statusLabel.Text = Localization.T("Status.Ready");
            System.Diagnostics.Debug.WriteLine(ex);
        }
        finally
        {
            _repositoryRefreshInProgress = false;
        }

        _ = LoadReleasesAsync();
    }

    private void PopulateRepositoryTrees(Repository repo)
    {
        _suppressFileTreePathLog = true;
        try
        {
            BranchTagTreePopulator.Populate(repoTreeView, repo);
            RepositoryFileTreeService.PopulateRoot(_repoFilesTreeModel, repo, _gitFileTreeImages, _fileTreeStatusIndex);
            TreeNode? root = _repoFilesTreeModel.Nodes.Count > 0 ? _repoFilesTreeModel.Nodes[0] : null;
            if (root?.Tag is RepositoryFileNodeTag)
            {
                RepositoryFileTreeService.LoadChildren(root, repo, _gitFileTreeImages, _fileTreeStatusIndex);
            }

            repoFilesListView.SetRoot(root);
            UpdateWorkingTreeWatcher();
        }
        finally
        {
            _suppressFileTreePathLog = false;
        }
    }

    private void UpdateRepoInfoLabel()
    {
        if (_gitService.Repo is null || string.IsNullOrWhiteSpace(_gitService.RepositoryPath))
        {
            repoInfoLabel.Text = Localization.T("Repo.NoRepository");
            exportSummaryToolButton.Enabled = false;
            SetExportSummaryMenuItemsEnabled(false);
            return;
        }

        string branch = _gitService.GetCurrentBranchName();
        if (IsRemoteBrowseMode && !string.IsNullOrWhiteSpace(_remoteBrowseUrl))
        {
            string displayName = RemoteRepositoryService.GetDisplayName(_remoteBrowseUrl) ?? _remoteBrowseUrl;
            repoInfoLabel.Text = $"{displayName}  ·  {branch}  {Localization.T("Repo.RemoteView")}\n{_remoteBrowseUrl}";
        }
        else
        {
            string folderName = Path.GetFileName(_gitService.RepositoryPath.TrimEnd(Path.DirectorySeparatorChar));
            repoInfoLabel.Text = $"{folderName}  ·  {branch}\n{_gitService.RepositoryPath}";
        }
        exportSummaryToolButton.Enabled = true;
        SetExportSummaryMenuItemsEnabled(true);
    }

    private void SetExportSummaryMenuItemsEnabled(bool enabled)
    {
        barExportSummaryPdfMenuItem.Enabled = enabled;
        barExportSummaryWordMenuItem.Enabled = enabled;
        barExportSummaryMarkdownMenuItem.Enabled = enabled;
    }

    private void UpdateRepoCounts()
    {
        if (_gitService.Repo is null)
        {
            repoCountsStatusLabel.Text = Localization.T("Repo.NoRepository");
            return;
        }

        int localBranches = _gitService.Repo.Branches.Count(b => !b.IsRemote);
        int tags = _gitService.Repo.Tags.Count();
        repoCountsStatusLabel.Text = Localization.Tf("Repo.Counts", localBranches, tags);
    }

    private void RefreshTreeToolButton_Click(object? sender, EventArgs e)
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        statusLabel.Text = Localization.T("Status.RefreshingTree");
        _ = RefreshRepositoryViewsAsync("Refreshing branches, tags, and releases...");
    }

    private void RefreshGraphToolButton_Click(object? sender, EventArgs e)
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        statusLabel.Text = Localization.T("Status.RefreshingGraph");
        _ = LoadCommitGraphAsync();
    }

    private void RepoTreeView_NodeMouseClick(object? sender, TreeNodeMouseClickEventArgs e)
    {
        if (e.Button == MouseButtons.Right)
        {
            repoTreeView.SelectedNode = e.Node;
        }
    }

    private void RepoTreeContextMenu_Opening(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        bool repoOpen = _gitService.Repo is not null;
        bool isCheckoutableBranch = !IsRemoteBrowseMode
            && repoTreeView.SelectedNode?.Tag is Branch branch
            && !branch.IsRemote;
        checkoutContextMenuItem.Enabled = isCheckoutableBranch;
        copyBranchNameContextMenuItem.Enabled = repoTreeView.SelectedNode?.Tag is Branch;
        exportSummaryMenuItem.Enabled = repoOpen;
    }

    private void RepoInfoContextMenu_Opening(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        exportSummaryInfoMenuItem.Enabled = _gitService.Repo is not null;
    }

    private void ExportRepositorySummaryMenuItem_Click(object? sender, EventArgs e)
    {
        if (sender is not ToolStripMenuItem { Tag: string format })
        {
            return;
        }

        ExportRepositorySummary(format);
    }

    private void ExportRepositorySummary(string format)
    {
        if (_gitService.Repo is null || string.IsNullOrWhiteSpace(_gitService.RepositoryPath))
        {
            MessageBox.Show(this, Localization.T("Msg.ExportNeedRepo"), Localization.T("Error.ExportSummary"), MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        try
        {
            UseWaitCursor = true;
            var summary = RepositorySummaryBuilder.Build(
                _gitService.Repo,
                _gitService.RepositoryPath,
                CollectReleaseSummaries());

            UseWaitCursor = false;

            using var preview = new RepositorySummaryPreviewForm(summary, format);
            if (preview.ShowDialog(this) != DialogResult.OK || string.IsNullOrWhiteSpace(preview.ExportedFilePath))
            {
                return;
            }

            statusLabel.Text = Localization.Tf("Status.ExportedSummary", preview.ExportedFilePath);
            ShowOperationComplete(
                Localization.T("OpComplete.ExportComplete"),
                Localization.T("OpComplete.ExportSummary"),
                null,
                OpDetail("Detail.Repository", summary.RepositoryName),
                OpDetail("Detail.Branch", summary.CurrentBranch),
                OpDetail("Detail.Format", GetExportFormatDisplayName(preview.ExportedFormat ?? format)),
                OpDetail("Detail.File", preview.ExportedFilePath));
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, Localization.T("Error.Export"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            UseWaitCursor = false;
        }
    }

    private static string GetExportFormatDisplayName(string format) => format switch
    {
        "pdf" => "PDF",
        "docx" => "Word",
        "md" => "Markdown",
        _ => format.ToUpperInvariant()
    };

    private IReadOnlyList<RepositoryReleaseSummary> CollectReleaseSummaries()
    {
        var releasesNode = BranchTagTreePopulator.FindSectionNode(repoTreeView, RepoTreeSections.Releases);
        if (releasesNode is null)
        {
            return [];
        }

        return releasesNode.Nodes.Cast<TreeNode>()
            .Where(node => node.Tag is Octokit.Release)
            .Select(node => (Octokit.Release)node.Tag!)
            .Select(release => new RepositoryReleaseSummary
            {
                Name = string.IsNullOrWhiteSpace(release.Name) ? release.TagName : release.Name,
                TagName = release.TagName,
                PublishedAt = release.PublishedAt
            })
            .ToList();
    }

    private void CheckoutContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (repoTreeView.SelectedNode?.Tag is Branch branch && !branch.IsRemote)
        {
            CheckoutBranch(branch);
        }
    }

    private void CopyBranchNameContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (repoTreeView.SelectedNode?.Tag is Branch branch)
        {
            Clipboard.SetText(branch.FriendlyName);
        }
    }

    private void RepoTreeView_NodeMouseDoubleClick(object? sender, TreeNodeMouseClickEventArgs e)
    {
        if (IsRemoteBrowseMode)
        {
            return;
        }

        if (e.Node?.Tag is Branch branch && !branch.IsRemote)
        {
            CheckoutBranch(branch);
        }
    }

    private void CheckoutBranch(Branch branch)
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        _ = CheckoutBranchAsync(branch);
    }

    private async Task CheckoutBranchAsync(Branch branch)
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        try
        {
            statusLabel.Text = $"Checking out {branch.FriendlyName}...";
            await OperationProgress.RunAsync(
                this,
                Localization.Tf("Status.CheckingOut", branch.FriendlyName),
                async cancellationToken =>
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    await Task.Run(
                        () => _gitService.RunLocked(activeRepo => Commands.Checkout(activeRepo, branch)),
                        cancellationToken);
                    cancellationToken.ThrowIfCancellationRequested();
                },
                onCancelled: CancelPendingRepositoryOperations);
            await RefreshRepositoryViewsAsync(showProgress: false);
            _ = LoadReleasesAsync();
            ShowOperationComplete(
                Localization.T("OpComplete.CheckoutComplete"),
                Localization.T("OpComplete.CheckoutSummary"),
                null,
                OpDetail("Detail.Branch", branch.FriendlyName),
                OpDetail("Detail.Repository", _gitService.RepositoryPath ?? string.Empty));
        }
        catch (OperationCanceledException)
        {
            statusLabel.Text = Localization.T("Status.CheckoutCancelled");
        }
        catch (Exception ex)
        {
            statusLabel.Text = Localization.T("Status.Ready");
            MessageBox.Show(this, ex.Message, Localization.T("Error.Checkout"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task LoadReleasesAsync()
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        var releasesNode = BranchTagTreePopulator.FindSectionNode(repoTreeView, RepoTreeSections.Releases);
        if (releasesNode is null)
        {
            return;
        }

        var remoteUrl = _gitService.Repo.Network.Remotes["origin"]?.Url;
        var parsed = GitHubReleaseService.ParseGitHubRemote(remoteUrl);

        if (parsed is null)
        {
            BranchTagTreePopulator.SetReleaseNodes(releasesNode,
            [
                ("(not a GitHub remote)", null, null)
            ]);
            return;
        }

        statusLabel.Text = Localization.T("Status.LoadingReleases");
        try
        {
            var releases = await GitHubReleaseService.GetReleasesAsync(parsed.Value.Owner, parsed.Value.Repo, _gitHubToken);
            var items = releases.Select(release =>
            {
                var label = string.IsNullOrWhiteSpace(release.Name) ? release.TagName : release.Name;
                var toolTip = $"{label}\nTag: {release.TagName}\n{release.PublishedAt:yyyy-MM-dd}";
                return (label, (object?)release, (string?)toolTip);
            }).ToList();

            BranchTagTreePopulator.SetReleaseNodes(releasesNode, items);
            statusLabel.Text = Localization.Tf("Status.Branch", _gitService.GetCurrentBranchName());
        }
        catch (Octokit.ApiException ex) when (ex is Octokit.RateLimitExceededException or Octokit.ForbiddenException)
        {
            // GitHub's anonymous quota (60 req/hour/IP) is exhausted easily and returns 403 —
            // ask for a PAT to retry authenticated, since the git-auth PAT is never reused here.
            if (string.IsNullOrEmpty(_gitHubToken) && PromptForGitHubToken())
            {
                await LoadReleasesAsync();
                return;
            }

            BranchTagTreePopulator.SetReleaseNodes(releasesNode,
            [
                ("(403: GitHub API rate limit/access denied — add a Personal Access Token)", null, null)
            ]);
            statusLabel.Text = Localization.Tf("Status.Branch", _gitService.GetCurrentBranchName());
        }
        catch (Exception ex)
        {
            BranchTagTreePopulator.SetReleaseNodes(releasesNode,
            [
                ($"(failed to load: {ex.Message})", null, null)
            ]);
            statusLabel.Text = Localization.Tf("Status.Branch", _gitService.GetCurrentBranchName());
        }
    }

    private bool PromptForGitHubToken()
    {
        using var dialog = new CredentialsDialog(suggestedUsername: null, suggestedPassword: null, isGitHub: true);
        if (dialog.ShowDialog(this) != DialogResult.OK || string.IsNullOrWhiteSpace(dialog.Result.Password))
        {
            return false;
        }

        _gitHubToken = dialog.Result.Password;
        return true;
    }

    private void RepoTreeView_AfterSelect(object? sender, TreeViewEventArgs e)
    {
        if (e.Node?.Tag is not Octokit.Release release)
        {
            return;
        }

        _currentCommit = null;
        commitMetaLabel.Text = $"{(string.IsNullOrWhiteSpace(release.Name) ? release.TagName : release.Name)}   (tag: {release.TagName})\n{release.PublishedAt:yyyy-MM-dd}";
        changedFilesListView.Items.Clear();
        _currentCommitChanges = null;
        diffTextBox.Clear();
        diffTextBox.Text = string.IsNullOrWhiteSpace(release.Body) ? "(no release notes)" : release.Body;
    }

    private void LoadCommitGraph() => _ = LoadCommitGraphAsync();

    private async Task LoadCommitGraphAsync()
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        if (_pathHistoryFilter is not null)
        {
            await LoadPathFilteredCommitGraphAsync();
            return;
        }

        await LoadFullCommitGraphAsync();
    }

    private async Task LoadFullCommitGraphAsync()
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        Repository repo = _gitService.Repo;
        int generation = ++_commitGraphLoadGeneration;
        _pathHistoryLoadGeneration++;
        const string progressMessage = "Loading commit history...";
        statusLabel.Text = progressMessage;

        try
        {
            var rows = await Task.Run(() => _gitService.RunLocked(activeRepo =>
            {
                if (activeRepo.Head?.Tip is null)
                {
                    return new List<CommitRow>();
                }

                var commits = activeRepo.Commits.QueryBy(new CommitFilter
                {
                    IncludeReachableFrom = activeRepo.Head,
                    SortBy = CommitSortStrategies.Topological | CommitSortStrategies.Time
                }).ToList();
                return CommitGraphBuilder.Build(commits);
            }));
            if (generation != _commitGraphLoadGeneration
                || _gitService.Repo != repo
                || _pathHistoryFilter is not null)
            {
                return;
            }

            commitGraphView.SetRows(rows);
            UpdateGraphTitleLabel();
            statusLabel.Text = Localization.Tf("Status.Branch", _gitService.GetCurrentBranchName());
        }
        catch (Exception ex)
        {
            if (generation != _commitGraphLoadGeneration)
            {
                return;
            }

            statusLabel.Text = Localization.T("Status.Ready");
            MessageBox.Show(this, ex.Message, Localization.T("Error.LoadHistory"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task LoadPathFilteredCommitGraphAsync()
    {
        if (_gitService.Repo is null || _pathHistoryFilter is null)
        {
            return;
        }

        var repo = _gitService.Repo;
        string path = _pathHistoryFilter;
        bool isDirectory = _pathHistoryFilterIsDirectory;
        int generation = ++_pathHistoryLoadGeneration;
        _commitGraphLoadGeneration++;
        string progressMessage = string.IsNullOrEmpty(path)
            ? "Loading commit history..."
            : $"Loading commit history for {path}...";
        statusLabel.Text = progressMessage;

        try
        {
            var commits = await Task.Run(() => _gitService.RunLocked(activeRepo =>
                PathCommitHistoryService.GetCommits(
                    activeRepo,
                    path,
                    isDirectory,
                    () => generation == _pathHistoryLoadGeneration)));
            if (generation != _pathHistoryLoadGeneration
                || _gitService.Repo != repo
                || _pathHistoryFilter != path
                || _pathHistoryFilterIsDirectory != isDirectory)
            {
                return;
            }

            var rows = string.IsNullOrEmpty(path)
                ? CommitGraphBuilder.Build(commits)
                : CommitGraphBuilder.BuildFlat(commits);
            commitGraphView.SetRows(rows);
            UpdateGraphTitleLabel();
            if (!commitGraphView.TrySelectFirstCommit())
            {
                _currentCommit = null;
                _currentCommitChanges = null;
                commitMetaLabel.Text = Localization.T("Commit.SelectPrompt");
                changedFilesListView.Items.Clear();
                diffTextBox.Clear();
            }

            statusLabel.Text = string.IsNullOrEmpty(path)
                ? Localization.T("Status.ShowingAllCommits")
                : Localization.Tf("Status.ShowingCommitsFor", path);
        }
        catch (Exception ex)
        {
            if (generation != _pathHistoryLoadGeneration)
            {
                return;
            }

            statusLabel.Text = Localization.T("Status.Ready");
            MessageBox.Show(this, ex.Message, Localization.T("Error.LoadHistory"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void UpdateGraphTitleLabel()
    {
        string title = Localization.T("Section.Graph.Title");
        if (string.IsNullOrWhiteSpace(_pathHistoryFilter))
        {
            graphTitleLabel.Text = title;
            return;
        }

        string displayPath = string.IsNullOrEmpty(_pathHistoryFilter) ? "(root)" : _pathHistoryFilter;
        graphTitleLabel.Text = $"{title} — {displayPath}";
    }

    private void ApplyPathHistoryFilter(string relativePath, bool isDirectory)
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        string normalized = PathCommitHistoryService.NormalizeGitPath(relativePath);
        if (string.IsNullOrEmpty(normalized))
        {
            ClearPathHistoryFilter();
            return;
        }

        bool isDirectoryFilter = isDirectory;
        if (_pathHistoryFilter == normalized
            && _pathHistoryFilterIsDirectory == isDirectoryFilter
            && commitGraphView.HasRows)
        {
            return;
        }

        _pathHistoryFilter = normalized;
        _pathHistoryFilterIsDirectory = isDirectoryFilter;
        UpdateGraphTitleLabel();
        commitGraphView.SetRows([]);
        changedFilesListView.Items.Clear();
        diffTextBox.Clear();
        commitMetaLabel.Text = Localization.T("Commit.SelectPrompt");
        if (!_repositoryRefreshInProgress)
        {
            _ = LoadPathFilteredCommitGraphAsync();
        }
    }

    private void ClearPathHistoryFilter()
    {
        _pathHistoryLoadGeneration++;
        _pathHistoryFilter = null;
        _pathHistoryFilterIsDirectory = false;
        if (_gitService.Repo is not null)
        {
            statusLabel.Text = Localization.Tf("Status.Branch", _gitService.GetCurrentBranchName());
            _ = LoadCommitGraphAsync();
        }
        else
        {
            UpdateGraphTitleLabel();
        }
    }

    private void RepoFilesListView_NodeExpanding(object? sender, TreeNode node)
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        RepositoryFileTreeService.LoadChildren(node, _gitService.Repo, _gitFileTreeImages, _fileTreeStatusIndex);
    }

    private void RepoFilesListView_SelectedNodeChanged(object? sender, TreeNode? node)
    {
        if (_suppressFileTreePathLog || _gitService.Repo is null)
        {
            return;
        }

        TryApplyPathHistoryFromFileNode(node);
    }

    private void RepoFilesListView_NodeDoubleClicked(object? sender, TreeNode node)
    {
        if (_gitService.Repo is null
            || node.Tag is not RepositoryFileNodeTag tag
            || tag.IsPlaceholder
            || tag.IsDirectory)
        {
            return;
        }

        if (tag.IsMissingFromWorkTree || !CanUseGitWorkflow)
        {
            GitOperationNotifier.ShowInfo(this, Localization.T("GitOp.OpenFile"), Localization.T("Msg.OpenFileUnavailable"));
            return;
        }

        try
        {
            WorkingTreeFileService.OpenWithSystemDefault(_gitService.Repo, tag.RelativePath);
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, Localization.T("Error.OpenFile"), ex);
        }
    }

    private void TryApplyPathHistoryFromFileNode(TreeNode? node)
    {
        if (node?.Tag is not RepositoryFileNodeTag tag || tag.IsPlaceholder)
        {
            return;
        }

        ApplyPathHistoryFilter(tag.RelativePath, tag.IsDirectory);
    }

    private bool CanUseGitWorkflow =>
        _gitService.Repo is not null && GitWorkflowService.CanUseWorkflow(_gitService.Repo, IsRemoteBrowseMode);

    private void ConfigureRepositoryGitMenu()
    {
        repositoryGitMenuItem = new ToolStripMenuItem("&Git");
        ConfigureMenuItem(repositoryGitMenuItem, IconFactory.Branch(IconFactory.MenuBarIconSize, IconFactory.Palette.Branch), "&Git", menuBar: true);
        repositoryGitMenuItem.DropDownOpening += (_, _) => UpdateRepositoryGitMenuState();

        AddRepositoryGitMenuItem("Git &Add", IconFactory.GitAdd(IconFactory.MenuBarIconSize), (_, _) => TryGitAdd(RepositoryRootTag), "gitAddContextMenuItem");
        AddRepositoryGitMenuItem("Git Reset (&Unstage)", IconFactory.GitReset(IconFactory.MenuBarIconSize), (_, _) => TryGitReset(RepositoryRootTag), "gitResetContextMenuItem");
        AddRepositoryGitMenuItem("Git &Discard Changes", IconFactory.GitDiscard(IconFactory.MenuBarIconSize), (_, _) => TryGitDiscard(RepositoryRootTag), "gitDiscardContextMenuItem");
        repositoryGitMenuItem.DropDownItems.Add(new ToolStripSeparator());
        AddRepositoryGitMenuItem("Git &Commit...", IconFactory.GitCommit(IconFactory.MenuBarIconSize), GitCommitContextMenuItem_Click, "gitCommitContextMenuItem");
        repositoryGitMenuItem.DropDownItems.Add(new ToolStripSeparator());
        AddRepositoryGitMenuItem("Git Fetc&h", IconFactory.GitFetch(IconFactory.MenuBarIconSize), GitFetchContextMenuItem_Click, "gitFetchContextMenuItem");
        AddRepositoryGitMenuItem("Git P&ull", IconFactory.GitPull(IconFactory.MenuBarIconSize), GitPullContextMenuItem_Click, "gitPullContextMenuItem");
        AddRepositoryGitMenuItem("Git P&ush", IconFactory.GitPush(IconFactory.MenuBarIconSize), GitPushContextMenuItem_Click, "gitPushContextMenuItem");
        repositoryGitMenuItem.DropDownItems.Add(new ToolStripSeparator());
        AddRepositoryGitMenuItem("Git Stas&h", IconFactory.GitStash(IconFactory.MenuBarIconSize), GitStashContextMenuItem_Click, "gitStashContextMenuItem");
        AddRepositoryGitMenuItem("Git Stash &Pop", IconFactory.GitStash(IconFactory.MenuBarIconSize), GitStashPopContextMenuItem_Click, "gitStashPopContextMenuItem");
        AddRepositoryGitMenuItem("Git &Status...", IconFactory.GitStatus(IconFactory.MenuBarIconSize, IconFactory.Palette.GitStatus), (_, _) => ShowGitStatus(RepositoryRootTag), "gitStatusContextMenuItem");

        repositoryGitMenuItem.DropDown.Renderer = _menuRenderer;
        if (repositoryGitMenuItem.DropDown is ToolStripDropDownMenu dropDownMenu)
        {
            dropDownMenu.ShowImageMargin = false;
        }

        WireDropDownWidthAlignment(repositoryGitMenuItem.DropDown);
        repositoryMenuItem.DropDownItems.Insert(1, repositoryGitMenuItem);
        repositoryMenuItem.DropDownItems.Insert(2, new ToolStripSeparator());
    }

    private void AddRepositoryGitMenuItem(string text, Image icon, EventHandler handler, string name)
    {
        var item = new ToolStripMenuItem(text) { Name = name };
        ConfigureMenuItem(item, icon, text, menuBar: true);
        item.Click += handler;
        _repositoryGitMenuItems.Add(item);
        repositoryGitMenuItem.DropDownItems.Add(item);
    }

    private void UpdateRepositoryGitMenuState()
    {
        if (_gitService.Repo is null)
        {
            repositoryGitMenuItem.Enabled = false;
            return;
        }

        repositoryGitMenuItem.Enabled = CanUseGitWorkflow;
        if (!CanUseGitWorkflow)
        {
            return;
        }

        ApplyGitMenuItemState(_gitService.Repo, RepositoryRootTag, _repositoryGitMenuItems, _fileTreeStatusIndex);
    }

    private void RepoFilesContextMenu_Opening(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        if (_gitService.Repo is null)
        {
            e.Cancel = true;
            return;
        }

        _fileTreeStatusIndex ??= RepositoryPathStatusService.Build(_gitService.Repo);

        bool canUseGit = CanUseGitWorkflow;
        SetGitSectionVisible(canUseGit);
        SetWorkspaceSectionVisible(canUseGit);
        addToGitIgnoreContextMenuItem.Visible = canUseGit;
        removeFromGitIgnoreContextMenuItem.Visible = canUseGit;

        RepositoryFileNodeTag? tag = TryGetGitPathTag();
        if (tag is null)
        {
            showFileLogContextMenuItem.Enabled = false;
            ApplyWorkspaceMenuState(RepositoryRootTag, canUseGit);
            addToGitIgnoreContextMenuItem.Enabled = false;
            removeFromGitIgnoreContextMenuItem.Enabled = false;
            copyRepoFilePathContextMenuItem.Enabled = false;
            clearFileLogFilterContextMenuItem.Enabled = _pathHistoryFilter is not null;
            resolveConflictContextMenuItem.Enabled = false;
            if (canUseGit)
            {
                ApplyGitMenuItemState(_gitService.Repo, RepositoryRootTag, GetFilesGitMenuItems(), _fileTreeStatusIndex);
            }

            return;
        }

        showFileLogContextMenuItem.Enabled = true;
        copyRepoFilePathContextMenuItem.Enabled = true;
        ApplyWorkspaceMenuState(tag, canUseGit);
        ApplyGitIgnoreMenuState(_gitService.Repo, tag, canUseGit);
        clearFileLogFilterContextMenuItem.Enabled = _pathHistoryFilter is not null;
        resolveConflictContextMenuItem.Enabled = canUseGit
            && !tag.IsDirectory
            && ExternalMergeToolService.IsConfigured(_settings)
            && ExternalMergeToolService.HasConflict(_gitService.Repo, PathCommitHistoryService.NormalizeGitPath(tag.RelativePath));
        if (canUseGit)
        {
            ApplyGitMenuItemState(_gitService.Repo, tag, GetFilesGitMenuItems(), _fileTreeStatusIndex);
        }
    }

    private void ApplyGitIgnoreMenuState(Repository repo, RepositoryFileNodeTag tag, bool canUseGit)
    {
        bool canEditPath = canUseGit
            && !string.IsNullOrEmpty(tag.RelativePath)
            && !tag.IsMissingFromWorkTree;

        bool isIgnored = canEditPath && GitIgnoreService.IsIgnored(repo, tag.RelativePath, tag.IsDirectory);
        bool hasRemovablePattern = canEditPath
            && GitIgnoreService.HasRemovablePattern(repo, tag.RelativePath, tag.IsDirectory);

        addToGitIgnoreContextMenuItem.Enabled = canEditPath && !isIgnored;
        removeFromGitIgnoreContextMenuItem.Enabled = canEditPath && hasRemovablePattern;
    }

    private void ApplyWorkspaceMenuState(RepositoryFileNodeTag tag, bool canUseWorkspace)
    {
        bool canCreate = canUseWorkspace && !tag.IsMissingFromWorkTree;
        bool canDelete = canUseWorkspace
            && !string.IsNullOrEmpty(tag.RelativePath)
            && !tag.IsMissingFromWorkTree;

        createNewFileContextMenuItem.Enabled = canCreate;
        createNewFolderContextMenuItem.Enabled = canCreate;
        deleteRepoFileContextMenuItem.Enabled = canDelete;
    }

    private void SetWorkspaceSectionVisible(bool visible)
    {
        createNewFileContextMenuItem.Visible = visible;
        createNewFolderContextMenuItem.Visible = visible;
        deleteRepoFileContextMenuItem.Visible = visible;
        repoFilesWorkspaceSeparator.Visible = visible;
    }

    private IEnumerable<ToolStripMenuItem> GetFilesGitMenuItems() =>
    [
        gitAddContextMenuItem,
        gitResetContextMenuItem,
        gitDiscardContextMenuItem,
        gitCommitContextMenuItem,
        gitFetchContextMenuItem,
        gitPullContextMenuItem,
        gitPushContextMenuItem,
        gitStashContextMenuItem,
        gitStashPopContextMenuItem,
        gitStatusContextMenuItem
    ];

    private void SetGitSectionVisible(bool visible)
    {
        repoFilesGitSeparator.Visible = visible;
        gitAddContextMenuItem.Visible = visible;
        gitResetContextMenuItem.Visible = visible;
        gitDiscardContextMenuItem.Visible = visible;
        resolveConflictContextMenuItem.Visible = visible;
        gitStagingSeparator.Visible = visible;
        gitCommitContextMenuItem.Visible = visible;
        gitRemoteSeparator.Visible = visible;
        gitFetchContextMenuItem.Visible = visible;
        gitPullContextMenuItem.Visible = visible;
        gitPushContextMenuItem.Visible = visible;
        gitStashSeparator.Visible = visible;
        gitStashContextMenuItem.Visible = visible;
        gitStashPopContextMenuItem.Visible = visible;
        gitStatusContextMenuItem.Visible = visible;
    }

    private static void ApplyGitMenuItemState(
        Repository repo,
        RepositoryFileNodeTag tag,
        IEnumerable<ToolStripMenuItem> items,
        RepositoryPathStatusIndex? statusIndex)
    {
        bool hasOrigin = GitWorkflowService.HasOriginRemote(repo);
        bool hasStaged = statusIndex?.HasStagedChangesAtPath(tag.RelativePath, tag.IsDirectory) ?? false;
        bool hasWorkTree = statusIndex?.HasWorkTreeChangesAtPath(tag.RelativePath, tag.IsDirectory) ?? false;
        bool hasAnyStaged = statusIndex?.HasAnyStagedChanges ?? false;
        bool hasAnyWorkTree = statusIndex?.HasAnyWorkTreeChanges ?? false;

        foreach (ToolStripMenuItem item in items)
        {
            item.Enabled = item.Name switch
            {
                "gitAddContextMenuItem" => true,
                "gitResetContextMenuItem" => hasStaged,
                "gitDiscardContextMenuItem" => hasWorkTree,
                "gitCommitContextMenuItem" => hasAnyStaged,
                "gitFetchContextMenuItem" => hasOrigin,
                "gitPullContextMenuItem" => hasOrigin,
                "gitPushContextMenuItem" => hasOrigin,
                "gitStashContextMenuItem" => hasAnyWorkTree,
                "gitStashPopContextMenuItem" => GitWorkflowService.HasStashEntries(repo),
                "gitStatusContextMenuItem" => true,
                _ => item.Enabled
            };
        }
    }

    private RepositoryFileNodeTag? TryGetGitPathTag()
    {
        if (repoFilesListView.SelectedNode?.Tag is RepositoryFileNodeTag tag && !tag.IsPlaceholder)
        {
            return tag;
        }

        return null;
    }

    private RepositoryFileNodeTag GetGitPathTagOrRoot() => TryGetGitPathTag() ?? RepositoryRootTag;

    private CredentialsPrompt CreateGitCredentialsPrompt() => new(
        this,
        initialUsername: _gitHubUsername,
        initialPassword: _gitHubToken,
        allowSilentReuse: _gitCredentialsVerified);

    // Captures whatever the user typed (or the silently-reused values) regardless of whether
    // the operation itself succeeded, so a retry dialog is pre-filled instead of blank — only
    // the "skip the dialog" verified flag depends on success.
    private void CaptureGitCredentials(CredentialsPrompt prompt)
    {
        if (prompt.LastEntered is not { } credentials || string.IsNullOrWhiteSpace(credentials.Password))
        {
            return;
        }

        _gitHubUsername = credentials.Username;
        _gitHubToken = credentials.Password;
        _settings.SetGitHubCredentials(credentials.Username, credentials.Password);
        _settings.Save();
    }

    private void MarkGitCredentialsVerified() => _gitCredentialsVerified = true;

    // Forces the next fetch/pull/push to prompt again instead of silently retrying credentials
    // that just failed (e.g. a revoked or SSO-unauthorized PAT) — but keeps the username/PAT
    // values themselves so the dialog reappears pre-filled instead of blank.
    private void MarkGitCredentialsUnverified() => _gitCredentialsVerified = false;

    private static string FormatGitPathScope(string relativePath) =>
        string.IsNullOrEmpty(relativePath)
            ? Localization.T("Detail.Value.Repository")
            : relativePath;

    private void GitAddContextMenuItem_Click(object? sender, EventArgs e) => TryGitAdd(GetGitPathTagOrRoot());

    private void AddToGitIgnoreContextMenuItem_Click(object? sender, EventArgs e)
    {
        RepositoryFileNodeTag? tag = TryGetGitPathTag();
        if (tag is null)
        {
            return;
        }

        TryAddToGitIgnore(tag);
    }

    private void RemoveFromGitIgnoreContextMenuItem_Click(object? sender, EventArgs e)
    {
        RepositoryFileNodeTag? tag = TryGetGitPathTag();
        if (tag is null)
        {
            return;
        }

        TryRemoveFromGitIgnore(tag);
    }

    private void TryRemoveFromGitIgnore(RepositoryFileNodeTag tag)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow || string.IsNullOrEmpty(tag.RelativePath))
        {
            return;
        }

        try
        {
            Repository repo = _gitService.Repo;
            IReadOnlyList<string> removedPatterns = GitIgnoreService.RemoveFromGitIgnore(
                repo,
                tag.RelativePath,
                tag.IsDirectory);

            if (removedPatterns.Count == 0)
            {
                GitOperationNotifier.ShowInfo(
                    this,
                    Localization.T("Gitignore.RemoveTitle"),
                    Localization.T("Gitignore.RemoveNotFound"));
                return;
            }

            statusLabel.Text = removedPatterns.Count == 1
                ? Localization.Tf("Status.RemovedGitignoreOne", removedPatterns[0])
                : Localization.Tf("Status.RemovedGitignoreMany", removedPatterns.Count);
            _ = RefreshFileTreeStatusAsync();
            GitOperationNotifier.ShowSuccess(
                this,
                Localization.T("Gitignore.RemoveTitle"),
                Localization.T("Gitignore.RemoveSummary"),
                OpDetail("Detail.Path", tag.RelativePath),
                OpDetail("Detail.RemovedPatterns", string.Join(", ", removedPatterns)));
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, Localization.T("Gitignore.RemoveFailed"), ex);
        }
    }

    private void TryAddToGitIgnore(RepositoryFileNodeTag tag)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow || string.IsNullOrEmpty(tag.RelativePath))
        {
            return;
        }

        try
        {
            Repository repo = _gitService.Repo;
            string pattern = GitIgnoreService.AddToGitIgnore(repo, tag.RelativePath, tag.IsDirectory);
            statusLabel.Text = Localization.Tf("Status.AddedGitignore", pattern);
            _ = RefreshFileTreeStatusAsync();
            GitOperationNotifier.ShowSuccess(
                this,
                Localization.T("Gitignore.AddTitle"),
                Localization.T("Gitignore.AddSummary"),
                OpDetail("Detail.Path", tag.RelativePath),
                OpDetail("Detail.Pattern", pattern));
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, Localization.T("Gitignore.AddFailed"), ex);
        }
    }

    private void TryGitAdd(RepositoryFileNodeTag tag)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        try
        {
            Repository repo = _gitService.Repo;
            string scope = FormatGitPathScope(tag.RelativePath);
            IReadOnlyList<GitStatusEntry> candidates = GitWorkflowService.GetStageCandidates(
                repo,
                tag.RelativePath,
                tag.IsDirectory);

            if (candidates.Count == 0)
            {
                GitOperationNotifier.ShowInfo(this, Localization.T("GitOp.Add"), Localization.T("Msg.GitAdd.NoChanges"));
                return;
            }

            using var dialog = new GitAddDialog(candidates, scope);
            if (dialog.ShowDialog(this) != DialogResult.OK)
            {
                return;
            }

            IReadOnlyList<string> pathsToStage = dialog.SelectedPaths;
            if (pathsToStage.Count == 0)
            {
                return;
            }

            var before = GitWorkflowService.CreateStatusSnapshot(repo, tag.RelativePath, tag.IsDirectory);
            GitWorkflowService.StagePaths(repo, pathsToStage);
            var stagedPathSet = pathsToStage.ToHashSet(StringComparer.OrdinalIgnoreCase);
            IReadOnlyList<GitStatusEntry> stagedEntries = GitWorkflowService.GetNewlyStagedEntries(
                    before,
                    repo,
                    tag.RelativePath,
                    tag.IsDirectory)
                .Where(entry => stagedPathSet.Contains(entry.FilePath))
                .ToList();

            statusLabel.Text = stagedEntries.Count == 1
                ? Localization.Tf("Status.StagedOne", stagedEntries[0].FilePath)
                : Localization.Tf("Status.StagedMany", stagedEntries.Count);
            _ = RefreshFileTreeStatusAsync();

            if (stagedEntries.Count == 0)
            {
                GitOperationNotifier.ShowInfo(this, Localization.T("GitOp.Add"), Localization.T("Msg.GitAdd.NoneStaged"));
                return;
            }

            using var resultDialog = new GitAddResultDialog(stagedEntries, before, scope);
            resultDialog.ShowDialog(this);
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, Localization.T("GitOp.AddFailed"), ex);
        }
    }

    private void GitResetContextMenuItem_Click(object? sender, EventArgs e) => TryGitReset(GetGitPathTagOrRoot());

    private void TryGitReset(RepositoryFileNodeTag tag)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        try
        {
            Repository repo = _gitService.Repo;
            var unstagedPaths = GitOperationDetails.GetStagedPathsAtScope(repo, tag.RelativePath, tag.IsDirectory);
            GitWorkflowService.Unstage(repo, tag.RelativePath, tag.IsDirectory);
            statusLabel.Text = string.IsNullOrEmpty(tag.RelativePath)
                ? Localization.T("Status.UnstagedAll")
                : Localization.Tf("Status.UnstagedPath", tag.RelativePath);
            _ = RefreshFileTreeStatusAsync();
            GitOperationNotifier.ShowSuccess(
                this,
                Localization.T("GitOp.ResetComplete"),
                Localization.T("GitOp.ResetCompleteSummary"),
                GitOperationDetails.ForReset(repo, tag.RelativePath, unstagedPaths));
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, Localization.T("GitOp.ResetFailed"), ex);
        }
    }

    private void GitDiscardContextMenuItem_Click(object? sender, EventArgs e) => TryGitDiscard(GetGitPathTagOrRoot());

    private void TryGitDiscard(RepositoryFileNodeTag tag)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        string scope = FormatGitPathScope(tag.RelativePath);
        if (MessageBox.Show(
                this,
                Localization.Tf("Msg.GitDiscard.Confirm", scope),
                Localization.T("GitOp.Discard"),
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning) != DialogResult.Yes)
        {
            return;
        }

        try
        {
            Repository repo = _gitService.Repo;
            var discardedEntries = GitOperationDetails.GetWorkTreeEntriesAtScope(repo, tag.RelativePath, tag.IsDirectory);
            GitWorkflowService.DiscardChanges(repo, tag.RelativePath, tag.IsDirectory);
            statusLabel.Text = string.IsNullOrEmpty(tag.RelativePath)
                ? Localization.T("Status.DiscardedAll")
                : Localization.Tf("Status.DiscardedPath", tag.RelativePath);
            _ = RefreshFileTreeStatusAsync();
            GitOperationNotifier.ShowSuccess(
                this,
                Localization.T("GitOp.DiscardComplete"),
                Localization.T("GitOp.DiscardCompleteSummary"),
                GitOperationDetails.ForDiscard(repo, tag.RelativePath, discardedEntries));
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, Localization.T("GitOp.DiscardFailed"), ex);
        }
    }

    private void ResolveConflictContextMenuItem_Click(object? sender, EventArgs e)
    {
        RepositoryFileNodeTag? tag = TryGetGitPathTag();
        if (tag is not null)
        {
            _ = TryResolveConflictAsync(tag);
        }
    }

    private async Task TryResolveConflictAsync(RepositoryFileNodeTag tag)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow || !ExternalMergeToolService.IsConfigured(_settings))
        {
            return;
        }

        Repository repo = _gitService.Repo;
        string path = PathCommitHistoryService.NormalizeGitPath(tag.RelativePath);
        try
        {
            await ExternalMergeToolService.LaunchAsync(_settings, repo, path);
            statusLabel.Text = Localization.Tf("Status.StagedOne", path);
            _ = RefreshFileTreeStatusAsync();
            GitOperationNotifier.ShowSuccess(
                this,
                Localization.T("MergeTool.ResolvedTitle"),
                Localization.Tf("MergeTool.ResolvedMessage", path));
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, Localization.T("MergeTool.Failed"), ex);
        }
    }

    private void GitCommitContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        var stagedPaths = GitWorkflowService.GetStagedPaths(_gitService.Repo);
        if (stagedPaths.Count == 0)
        {
            GitOperationNotifier.ShowInfo(this, Localization.T("GitOp.Commit"), Localization.T("Msg.GitCommit.StageFirst"));
            return;
        }

        using var dialog = new GitCommitDialog(_gitService.Repo, stagedPaths, _settings);
        if (dialog.ShowDialog(this) != DialogResult.OK || string.IsNullOrWhiteSpace(dialog.CommitMessage))
        {
            return;
        }

        if (dialog.RemainingStagedPaths.Count == 0)
        {
            GitOperationNotifier.ShowInfo(this, Localization.T("GitOp.Commit"), Localization.T("Msg.GitCommit.NoneRemaining"));
            _ = RefreshFileTreeStatusAsync();
            return;
        }

        try
        {
            Repository repo = _gitService.Repo;
            var commit = GitWorkflowService.CreateCommit(repo, dialog.CommitMessage);
            _ = RefreshAfterGitCommitAsync();
            statusLabel.Text = Localization.Tf("Status.Committed", commit.Sha[..7]);
            GitOperationNotifier.ShowSuccess(
                this,
                Localization.T("GitOp.CommitComplete"),
                Localization.T("GitOp.CommitCompleteSummary"),
                GitOperationDetails.ForCommit(repo, commit));
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, Localization.T("GitOp.CommitFailed"), ex);
        }
    }

    private void GitFetchContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        _ = GitFetchAsync();
    }

    private async Task GitFetchAsync()
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        Repository repo = _gitService.Repo;
        var prompt = CreateGitCredentialsPrompt();
        var remoteTipsBefore = GitOperationDetails.SnapshotOriginBranchTips(repo);
        try
        {
            await OperationProgress.RunAsync(
                this,
                Localization.T("GitOp.FetchProgress"),
                cancellationToken => Task.Run(
                    () => _gitService.RunLocked(activeRepo => GitWorkflowService.Fetch(activeRepo, prompt.Handler, cancellationToken)),
                    cancellationToken),
                onCancelled: CancelPendingRepositoryOperations);
            CaptureGitCredentials(prompt);
            MarkGitCredentialsVerified();
            await RefreshRepositoryViewsAsync(showProgress: false);
            _ = LoadReleasesAsync();
            statusLabel.Text = Localization.T("Status.Fetched");
            var remoteTipsAfter = GitOperationDetails.SnapshotOriginBranchTips(_gitService.Repo ?? repo);
            GitOperationNotifier.ShowSuccess(
                this,
                Localization.T("GitOp.FetchComplete"),
                Localization.T("GitOp.FetchCompleteSummary"),
                GitOperationDetails.ForFetch(repo, remoteTipsBefore, remoteTipsAfter));
        }
        catch (OperationCanceledException)
        {
            statusLabel.Text = Localization.T("Status.FetchCancelled");
            GitOperationNotifier.ShowCancelled(this, Localization.T("GitOp.Fetch"));
        }
        catch (Exception ex)
        {
            CaptureGitCredentials(prompt);
            MarkGitCredentialsUnverified();
            GitOperationNotifier.ShowFailure(this, Localization.T("GitOp.FetchFailed"), ex);
        }
    }

    private void GitPullContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        _ = GitPullAsync();
    }

    private async Task GitPullAsync()
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        Repository repo = _gitService.Repo;
        var prompt = CreateGitCredentialsPrompt();
        string? headShaBefore = repo.Head?.Tip?.Sha;
        try
        {
            var result = await OperationProgress.RunAsync(
                this,
                Localization.T("GitOp.PullProgress"),
                cancellationToken => Task.Run(
                    () => _gitService.RunLocked(activeRepo => GitWorkflowService.Pull(activeRepo, prompt.Handler, cancellationToken)),
                    cancellationToken),
                onCancelled: CancelPendingRepositoryOperations);
            CaptureGitCredentials(prompt);
            MarkGitCredentialsVerified();
            await RefreshRepositoryViewsAsync(showProgress: false);
            _ = LoadReleasesAsync();
            statusLabel.Text = Localization.Tf("Status.Pulled", _gitService.GetCurrentBranchName());
            string? headShaAfter = (_gitService.Repo ?? repo).Head?.Tip?.Sha;
            GitOperationNotifier.ShowSuccess(
                this,
                Localization.T("GitOp.PullComplete"),
                Localization.T("GitOp.PullCompleteSummary"),
                GitOperationDetails.ForPull(repo, result, headShaBefore, headShaAfter));
        }
        catch (OperationCanceledException)
        {
            statusLabel.Text = Localization.T("Status.PullCancelled");
            GitOperationNotifier.ShowCancelled(this, Localization.T("GitOp.Pull"));
        }
        catch (Exception ex)
        {
            CaptureGitCredentials(prompt);
            MarkGitCredentialsUnverified();
            GitOperationNotifier.ShowFailure(this, Localization.T("GitOp.PullFailed"), ex);
        }
    }

    private void GitPushContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        _ = GitPushAsync();
    }

    private async Task GitPushAsync()
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        Repository repo = _gitService.Repo;
        var prompt = CreateGitCredentialsPrompt();
        try
        {
            // Resolve credentials up front, on the UI thread, before the progress dialog's
            // timer starts — otherwise a user who takes a few seconds to enter a PAT sees the
            // "Pushing to origin..." popup appear while they're still typing. The dialog should
            // only show once we're actually connected and transferring data slowly.
            string? remoteUrl = repo.Network.Remotes["origin"]?.Url;
            if (remoteUrl is not null)
            {
                prompt.Handler(remoteUrl, null, SupportedCredentialTypes.UsernamePassword);
            }

            await Task.Run(() =>
                _gitService.RunLocked(activeRepo =>
                    GitWorkflowService.TryFetchOrigin(activeRepo, prompt.Handler, CancellationToken.None)));

            Repository activeRepo = _gitService.Repo ?? repo;
            string branchName = activeRepo.Head?.FriendlyName ?? _gitService.GetCurrentBranchName();
            var commitsBehind = GitOperationDetails.GetCommitsBehindTracked(activeRepo);
            if (commitsBehind.Count > 0)
            {
                int commitsAhead = GitOperationDetails.GetCommitsAheadOfTracked(activeRepo).Count;
                GitOperationNotifier.ShowInfo(
                    this,
                    Localization.T("GitOp.PushFailed"),
                    Localization.Tf("GitOp.PushRejectedNonFf", branchName, commitsBehind.Count, commitsAhead));
                return;
            }

            var commitsToPush = GitOperationDetails.GetCommitsAheadOfTracked(activeRepo);

            await OperationProgress.RunAsync(
                this,
                Localization.T("GitOp.PushProgress"),
                cancellationToken => Task.Run(
                    () => _gitService.RunLocked(activeRepo => GitWorkflowService.Push(activeRepo, prompt.Handler, cancellationToken)),
                    cancellationToken),
                showDelayMs: 800,
                onCancelled: CancelPendingRepositoryOperations);
            CaptureGitCredentials(prompt);
            MarkGitCredentialsVerified();
            statusLabel.Text = Localization.Tf("Status.Pushed", _gitService.GetCurrentBranchName());
            await RefreshFileTreeStatusAsync();
            GitOperationNotifier.ShowSuccess(
                this,
                Localization.T("GitOp.PushComplete"),
                Localization.T("GitOp.PushCompleteSummary"),
                GitOperationDetails.ForPush(activeRepo, commitsToPush));
        }
        catch (OperationCanceledException)
        {
            statusLabel.Text = Localization.T("Status.PushCancelled");
            GitOperationNotifier.ShowCancelled(this, Localization.T("GitOp.Push"));
        }
        catch (Exception ex)
        {
            CaptureGitCredentials(prompt);
            MarkGitCredentialsUnverified();
            GitOperationNotifier.ShowFailure(this, Localization.T("GitOp.PushFailed"), ex);
        }
    }

    private void GitStashContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        try
        {
            Repository repo = _gitService.Repo;
            var stashedEntries = GitOperationDetails.GetWorkTreeEntriesAtScope(repo, string.Empty, isDirectory: true);
            GitWorkflowService.Stash(repo);
            _ = RefreshFileTreeStatusAsync();
            statusLabel.Text = Localization.T("Status.Stashed");
            string stashMessage = repo.Stashes.FirstOrDefault()?.Message ?? Localization.T("Detail.Value.Stash");
            GitOperationNotifier.ShowSuccess(
                this,
                Localization.T("GitOp.StashComplete"),
                Localization.T("GitOp.StashCompleteSummary"),
                GitOperationDetails.ForStash(repo, stashMessage, stashedEntries, repo.Stashes.Count()));
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, Localization.T("GitOp.StashFailed"), ex);
        }
    }

    private void GitStashPopContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        try
        {
            Repository repo = _gitService.Repo;
            string stashMessage = repo.Stashes.FirstOrDefault()?.Message
                ?? throw new InvalidOperationException("There are no stashed changes.");
            GitWorkflowService.StashPop(repo);
            _ = RefreshFileTreeStatusAsync();
            statusLabel.Text = Localization.T("Status.StashApplied");
            GitOperationNotifier.ShowSuccess(
                this,
                Localization.T("GitOp.StashPopComplete"),
                Localization.T("GitOp.StashPopCompleteSummary"),
                GitOperationDetails.ForStashPop(repo, stashMessage, repo.Stashes.Count()));
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, Localization.T("GitOp.StashPopFailed"), ex);
        }
    }

    private void GitStatusContextMenuItem_Click(object? sender, EventArgs e) =>
        ShowGitStatus(GetGitPathTagOrRoot());

    private void ShowGitStatus(RepositoryFileNodeTag tag)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        var entries = GitWorkflowService.GetStatusEntries(_gitService.Repo, tag.RelativePath, tag.IsDirectory);
        string? scope = string.IsNullOrEmpty(tag.RelativePath) ? null : tag.RelativePath;
        using var dialog = new GitStatusDialog(entries, scope);
        dialog.ShowDialog(this);
    }

    private void ShowFileLogContextMenuItem_Click(object? sender, EventArgs e) =>
        TryApplyPathHistoryFromFileNode(repoFilesListView.SelectedNode);

    private void CreateNewFileContextMenuItem_Click(object? sender, EventArgs e) =>
        TryCreateNewFile(GetGitPathTagOrRoot());

    private void CreateNewFolderContextMenuItem_Click(object? sender, EventArgs e) =>
        TryCreateNewFolder(GetGitPathTagOrRoot());

    private void DeleteRepoFileContextMenuItem_Click(object? sender, EventArgs e)
    {
        RepositoryFileNodeTag? tag = TryGetGitPathTag();
        if (tag is not null)
        {
            TryDeleteRepoPath(tag);
        }
    }

    private void TryCreateNewFile(RepositoryFileNodeTag tag)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        string parentPath = WorkingTreeFileService.GetCreateParentRelativePath(tag);
        string parentLabel = string.IsNullOrEmpty(parentPath) ? Localization.T("Repo.Root") : parentPath;
        string? fileName = NamePromptDialog.Show(
            this,
            Localization.T("Dialog.NewFile.Title"),
            Localization.Tf("Dialog.NewFile.Prompt", parentLabel),
            "new-file.txt");
        if (fileName is null)
        {
            return;
        }

        try
        {
            string createdPath = WorkingTreeFileService.CreateFile(_gitService.Repo, parentPath, fileName);
            _ = ReloadFileTreeDirectoryAsync(parentPath);
            statusLabel.Text = Localization.Tf("Status.Created", createdPath);
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, Localization.T("Error.CreateFile"), ex);
        }
    }

    private void TryCreateNewFolder(RepositoryFileNodeTag tag)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        string parentPath = WorkingTreeFileService.GetCreateParentRelativePath(tag);
        string parentLabel = string.IsNullOrEmpty(parentPath) ? Localization.T("Repo.Root") : parentPath;
        string? folderName = NamePromptDialog.Show(
            this,
            Localization.T("Dialog.NewFolder.Title"),
            Localization.Tf("Dialog.NewFolder.Prompt", parentLabel),
            "NewFolder");
        if (folderName is null)
        {
            return;
        }

        try
        {
            string createdPath = WorkingTreeFileService.CreateDirectory(_gitService.Repo, parentPath, folderName);
            _ = ReloadFileTreeDirectoryAsync(parentPath);
            statusLabel.Text = Localization.Tf("Status.Created", createdPath);
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, Localization.T("Error.CreateFolder"), ex);
        }
    }

    private void TryDeleteRepoPath(RepositoryFileNodeTag tag)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow || string.IsNullOrEmpty(tag.RelativePath))
        {
            return;
        }

        string targetLabel = tag.RelativePath;
        string message = tag.IsDirectory
            ? Localization.Tf("Dialog.DeleteFolder", targetLabel)
            : Localization.Tf("Dialog.DeleteFile", targetLabel);

        if (MessageBox.Show(this, message, Localization.T("Dialog.Delete.Title"), MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes)
        {
            return;
        }

        try
        {
            string parentPath = WorkingTreeFileService.GetDeleteParentRelativePath(tag);
            WorkingTreeFileService.DeletePath(_gitService.Repo, tag.RelativePath, tag.IsDirectory);
            _ = ReloadFileTreeDirectoryAsync(parentPath);
            statusLabel.Text = Localization.Tf("Status.Deleted", targetLabel);
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, Localization.T("Error.Delete"), ex);
        }
    }

    private async Task ReloadFileTreeDirectoryAsync(string directoryRelativePath)
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        Repository repo = _gitService.Repo;
        await RefreshFileTreeStatusAsync();
        if (_gitService.Repo != repo)
        {
            return;
        }

        if (RepositoryFileTreeService.FindNodeByRelativePath(_repoFilesTreeModel, directoryRelativePath) is null
            && !string.IsNullOrEmpty(directoryRelativePath))
        {
            directoryRelativePath = string.Empty;
        }

        RepositoryFileTreeService.ForceReloadDirectory(
            _repoFilesTreeModel,
            repo,
            directoryRelativePath,
            _gitFileTreeImages,
            _fileTreeStatusIndex);
        repoFilesListView.RebuildPreservingSelection();
    }

    private void CopyRepoFilePathContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (repoFilesListView.SelectedNode?.Tag is not RepositoryFileNodeTag tag || tag.IsPlaceholder)
        {
            return;
        }

        Clipboard.SetText(string.IsNullOrEmpty(tag.RelativePath) ? "." : tag.RelativePath);
    }

    private void ClearFileLogFilterContextMenuItem_Click(object? sender, EventArgs e) =>
        ClearPathHistoryFilter();

    private void CommitGraphView_CommitSelected(object? sender, Commit commit)
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        _ = LoadCommitDetailsAsync(commit);
    }

    private async Task LoadCommitDetailsAsync(Commit commit)
    {
        Repository repo = _gitService.Repo!;
        int generation = ++_commitDetailLoadGeneration;

        _currentCommit = commit;
        _currentCommitChanges = null;
        statusLabel.Text = Localization.Tf("Status.LoadingChanges", commit.Sha[..7]);
        commitMetaLabel.Text = CommitDetailService.FormatMetadata(commit);
        changedFilesListView.BeginUpdate();
        changedFilesListView.Items.Clear();
        changedFilesListView.EndUpdate();
        diffTextBox.Clear();

        try
        {
            TreeChanges changes = await Task.Run(() => _gitService.RunLocked(activeRepo =>
                CommitDetailService.GetTreeChanges(activeRepo, commit)));
            if (generation != _commitDetailLoadGeneration
                || _gitService.Repo != repo
                || _currentCommit != commit)
            {
                return;
            }

            _currentCommitChanges = changes;
            PopulateChangedFilesList(changes);
            statusLabel.Text = $"{commit.Sha[..7]}  {commit.MessageShort}";

            if (_pathHistoryFilter is not null)
            {
                SelectChangedFileMatchingPathFilter();
            }
        }
        catch (Exception ex)
        {
            if (generation != _commitDetailLoadGeneration)
            {
                return;
            }

            statusLabel.Text = Localization.T("Status.Ready");
            MessageBox.Show(this, ex.Message, Localization.T("Error.LoadCommitDetails"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void SelectChangedFileMatchingPathFilter()
    {
        if (string.IsNullOrWhiteSpace(_pathHistoryFilter))
        {
            diffTextBox.Clear();
            return;
        }

        string filterPath = PathCommitHistoryService.NormalizeGitPath(_pathHistoryFilter);
        foreach (ListViewItem item in changedFilesListView.Items)
        {
            string itemPath = PathCommitHistoryService.NormalizeGitPath(
                item.Tag as string ?? item.Text);
            if (!PathCommitHistoryService.PathMatchesFilter(itemPath, filterPath, _pathHistoryFilterIsDirectory))
            {
                continue;
            }

            item.Selected = true;
            item.Focused = true;
            return;
        }

        diffTextBox.Clear();
    }

    private void CopyShaContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (_currentCommit is { } commit)
        {
            Clipboard.SetText(commit.Sha);
        }
    }

    private void CopyMessageContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (_currentCommit is { } commit)
        {
            Clipboard.SetText(commit.Message.Trim());
        }
    }

    private void ExportCommitContextMenuItem_Click(object? sender, EventArgs e) => _ = ExportCommitAsync();

    private async Task ExportCommitAsync()
    {
        if (_gitService.Repo is null || _currentCommit is not Commit commit)
        {
            return;
        }

        using var dialog = new FolderBrowserDialog
        {
            Description = Localization.Tf("Export.CommitFolderPrompt", commit.Sha[..7]),
            UseDescriptionForTitle = true,
        };

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        string destination = dialog.SelectedPath;
        if (Directory.Exists(destination) && Directory.EnumerateFileSystemEntries(destination).Any())
        {
            var confirm = MessageBox.Show(
                this,
                Localization.Tf("Export.FolderNotEmpty", destination),
                Localization.T("Export.CommitTitle"),
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);
            if (confirm != DialogResult.Yes)
            {
                return;
            }
        }

        string shortSha = commit.Sha[..7];
        BeginStatusBarProgress(Localization.Tf("Status.ExportingCommit", shortSha, 0));
        try
        {
            await OperationProgress.RunAsync(
                this,
                Localization.Tf("Status.ExportingCommitProgress", shortSha),
                reporter => Task.Run(
                    () => _gitService.RunLocked(repo => CommitExportService.Export(repo, commit, destination, reporter)),
                    reporter.CancellationToken),
                onStatusUpdate: UpdateStatusBarProgress);

            EndStatusBarProgress(Localization.Tf("Status.ExportedCommit", shortSha, destination));
            BeginInvoke(() => ShowExportCompleteDialog(shortSha, commit, destination));
        }
        catch (OperationCanceledException)
        {
            EndStatusBarProgress(Localization.T("Status.ExportCancelled"));
        }
        catch (Exception ex)
        {
            EndStatusBarProgress();
            MessageBox.Show(this, ex.Message, Localization.T("Error.Export"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void ShowExportCompleteDialog(string shortSha, Commit commit, string destination)
    {
        ShowOperationComplete(
            Localization.T("OpComplete.ExportComplete"),
            Localization.T("OpComplete.ExportCommitSummary"),
            null,
            OpDetail("Detail.Commit", $"{shortSha} — {commit.MessageShort.Trim()}"),
            OpDetail("Detail.Author", commit.Author.Name),
            OpDetail("Detail.Folder", destination));
    }

    private void BeginStatusBarProgress(string message)
    {
        statusLabel.Text = message;
        repoLoadProgressBar.Style = ProgressBarStyle.Marquee;
        repoLoadProgressBar.Visible = true;
    }

    private void UpdateStatusBarProgress(OperationProgressUpdate update)
    {
        if (update.Percent is int percent)
        {
            repoLoadProgressBar.Style = ProgressBarStyle.Continuous;
            repoLoadProgressBar.Maximum = 100;
            repoLoadProgressBar.Value = Math.Clamp(percent, 0, 100);
            repoLoadProgressBar.Visible = true;
        }
        else if (!repoLoadProgressBar.Visible)
        {
            repoLoadProgressBar.Style = ProgressBarStyle.Marquee;
            repoLoadProgressBar.Visible = true;
        }

        if (!string.IsNullOrEmpty(update.Message))
        {
            statusLabel.Text = update.Message;
        }
        else if (update.Percent is int percentOnly)
        {
            statusLabel.Text = AppendPercentToStatus(statusLabel.Text ?? string.Empty, percentOnly);
        }
    }

    private static string AppendPercentToStatus(string currentText, int percent)
    {
        if (string.IsNullOrWhiteSpace(currentText))
        {
            return $"{percent}%";
        }

        int percentIndex = currentText.LastIndexOf('%');
        if (percentIndex > 0)
        {
            int start = percentIndex - 1;
            while (start >= 0 && char.IsDigit(currentText[start]))
            {
                start--;
            }

            if (start < percentIndex - 1)
            {
                return currentText[..(start + 1)] + $"{percent}%" + currentText[(percentIndex + 1)..];
            }
        }

        return $"{currentText.TrimEnd()} — {percent}%";
    }

    private void EndStatusBarProgress(string? finalMessage = null)
    {
        repoLoadProgressBar.Visible = false;
        repoLoadProgressBar.Style = ProgressBarStyle.Marquee;
        repoLoadProgressBar.Value = 0;
        if (finalMessage is not null)
        {
            statusLabel.Text = finalMessage;
        }
    }

    private void ChangedFilesListView_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button == MouseButtons.Right)
        {
            var hit = changedFilesListView.HitTest(e.Location);
            if (hit.Item != null)
            {
                hit.Item.Selected = true;
            }
        }
    }

    private void ChangedFilesContextMenu_Opening(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        UpdateOpenExternalDiffMenuItemText();

        bool hasFile = GetSelectedChangedFilePath() is not null;
        bool canOpenExternal = hasFile
            && _currentCommit is not null
            && _gitService.Repo is not null
            && ExternalDiffToolService.IsConfigured(_settings);

        openExternalDiffContextMenuItem.Enabled = canOpenExternal;
        copyFilePathContextMenuItem.Enabled = hasFile;
    }

    private void UpdateOpenExternalDiffMenuItemText()
    {
        string viewer = ExternalDiffToolService.IsConfigured(_settings)
            ? ExternalDiffToolService.GetDisplayName(_settings)
            : Localization.T("Menu.ChangedFiles.ExternalNotConfigured");
        openExternalDiffContextMenuItem.Text =
            $"{Localization.T("Menu.ChangedFiles.OpenExternal")} ({viewer})";
    }

    private void CopyFilePathContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (GetSelectedChangedFilePath() is { } path)
        {
            Clipboard.SetText(path);
        }
    }

    private void OpenExternalDiffContextMenuItem_Click(object? sender, EventArgs e) =>
        TryOpenSelectedChangedFileInExternalDiff();

    private void ChangedFilesListView_SelectedIndexChanged(object? sender, EventArgs e)
    {
        _ = LoadSelectedFileDiffAsync();
    }

    private void ChangedFilesListView_MouseDoubleClick(object? sender, MouseEventArgs e) =>
        TryOpenSelectedChangedFileInExternalDiff();

    private void TryOpenSelectedChangedFileInExternalDiff()
    {
        if (GetSelectedChangedFilePath() is not { } path
            || _currentCommit is null
            || _gitService.Repo is null
            || !ExternalDiffToolService.IsConfigured(_settings))
        {
            return;
        }

        try
        {
            ExternalDiffToolService.Launch(_settings, _gitService.Repo, _currentCommit, path);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, Localization.T("Error.ExternalDiff"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private async Task LoadSelectedFileDiffAsync()
    {
        if (GetSelectedChangedFilePath() is not { } path
            || _currentCommit is null
            || _gitService.Repo is null)
        {
            return;
        }

        Repository repo = _gitService.Repo;
        Commit commit = _currentCommit;
        int generation = ++_diffLoadGeneration;

        diffTextBox.Clear();
        string progressMessage = $"{commit.Sha[..7]}  Loading diff for {Path.GetFileName(path)}...";
        statusLabel.Text = progressMessage;

        try
        {
            string patchText = await Task.Run(() => _gitService.RunLocked(activeRepo =>
                CommitDetailService.GetFilePatch(activeRepo, commit, path)));
            if (generation != _diffLoadGeneration || _currentCommit != commit)
            {
                return;
            }

            DiffTextRenderer.Render(diffTextBox, patchText);
            statusLabel.Text = $"{commit.Sha[..7]}  {commit.MessageShort}";
        }
        catch (Exception ex)
        {
            if (generation != _diffLoadGeneration)
            {
                return;
            }

            diffTextBox.Clear();
            statusLabel.Text = $"{commit.Sha[..7]}  {commit.MessageShort}";
            MessageBox.Show(this, ex.Message, Localization.T("Error.LoadDiff"), MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void WordWrapToolButton_Click(object? sender, EventArgs e)
    {
        SetWordWrap(!diffTextBox.WordWrap);
    }

    private void WordWrapMenuItem_CheckedChanged(object? sender, EventArgs e)
    {
        SetWordWrap(wordWrapMenuItem.Checked);
    }

    private void SetWordWrap(bool enabled)
    {
        diffTextBox.WordWrap = enabled;

        if (wordWrapMenuItem.Checked != enabled)
        {
            wordWrapMenuItem.Checked = enabled;
        }

        if (diffWordWrapContextMenuItem.Checked != enabled)
        {
            diffWordWrapContextMenuItem.Checked = enabled;
        }
    }

    private void DiffWordWrapContextMenuItem_CheckedChanged(object? sender, EventArgs e) =>
        SetWordWrap(diffWordWrapContextMenuItem.Checked);

    private void DiffCopyContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (diffTextBox.SelectionLength > 0)
        {
            diffTextBox.Copy();
        }
        else if (diffTextBox.TextLength > 0)
        {
            Clipboard.SetText(diffTextBox.Text);
        }
    }

    private void CopyDiffToolButton_Click(object? sender, EventArgs e)
    {
        if (diffTextBox.TextLength > 0)
        {
            Clipboard.SetText(diffTextBox.Text);
        }
    }
}
