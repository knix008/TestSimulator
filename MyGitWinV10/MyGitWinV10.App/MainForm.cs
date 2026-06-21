using LibGit2Sharp;
using MyGitWinV10.App.Controls;
using MyGitWinV10.App.Dialogs;
using MyGitWinV10.App.Services;

namespace MyGitWinV10.App;

public partial class MainForm : Form
{
    private readonly GitRepositoryService _gitService = new();
    private readonly AppSettingsStore _settings = AppSettingsStore.Load();
    private readonly MenuStripRootIconRenderer _menuRenderer = new();
    private Patch? _currentPatch;
    private Commit? _currentCommit;

    // Kept in memory only for this session — never persisted to disk (see CredentialsPrompt).
    private string? _gitHubToken;

    // Set when viewing a remote repository from cache (Browse Remote); cleared on local open.
    private string? _remoteBrowseUrl;

    private string? _pathHistoryFilter;
    private bool _pathHistoryFilterIsDirectory;
    private bool _suppressFileTreePathLog;

    private readonly List<ToolStripMenuItem> _fileRecentMenuItems = [];

    private bool _applyingPanelLayout;
    private bool _historySplitterUserAdjusted;

    private const int HistoryPanelChromeWidth = 4;

    public MainForm()
    {
        InitializeComponent();
        Icon = AppInfo.LoadIcon();
        Text = AppInfo.Title;
        ConfigureToolbars();
        ConfigureMenuIcons();
        ConfigureChangedFilesListView();
        ConfigureSectionHeadingToolTips();
        graphDetailSplitContainer.FixedPanel = FixedPanel.Panel1;
        // Once the user drags this splitter themselves, stop re-pinning it to the commit
        // graph's preferred (Date-column-aligned) width on every resize/layout pass — it
        // should no longer be "fixed" to that width, only sized to it on first display.
        graphDetailSplitContainer.SplitterMoved += (_, _) =>
        {
            if (!_applyingPanelLayout)
            {
                _historySplitterUserAdjusted = true;
            }
        };
        // Skip auto-fit when the user manually drags a column divider (e.g. widening Date) —
        // the history/detail splitter must not follow column width changes after the
        // initial layout, only when row data changes the required graph-lane width.
        commitGraphView.ColumnLayoutChanged += (_, manualResize) =>
        {
            if (!manualResize)
            {
                ApplyPanelLayout();
            }
        };
        mainSplitContainer.SplitterMoved += (_, _) => ApplyPanelLayout();
        mainSplitContainer.Panel2.Resize += (_, _) => ApplyPanelLayout();
        detailSplitContainer.Resize += (_, _) => ApplyDetailVerticalLayout();
        fileMenuItem.DropDownOpening += (_, _) => RefreshFileRecentMenu();
        FormClosed += (_, _) => _gitService.Dispose();
        Shown += (_, _) =>
        {
            ApplyPanelLayout();
            ApplyDetailVerticalLayout();
            OpenLastSuccessfulSessionIfAvailable();
        };
    }

    private void ApplyPanelLayout()
    {
        ApplyHorizontalPanelLayout();
        ApplyDetailVerticalLayout();
    }

    private void ApplyHorizontalPanelLayout()
    {
        if (_applyingPanelLayout || !IsHandleCreated || _historySplitterUserAdjusted)
        {
            return;
        }

        int graphAreaWidth = mainSplitContainer.Panel2.ClientSize.Width;
        if (graphAreaWidth <= 0)
        {
            return;
        }

        int preferredHistoryWidth = commitGraphView.ListContentWidth + HistoryPanelChromeWidth;
        int maxHistoryWidth = graphAreaWidth
            - graphDetailSplitContainer.Panel2MinSize
            - graphDetailSplitContainer.SplitterWidth;
        if (maxHistoryWidth <= 0)
        {
            return;
        }

        int historyWidth = Math.Min(preferredHistoryWidth, maxHistoryWidth);

        if (Math.Abs(graphDetailSplitContainer.SplitterDistance - historyWidth) < 2)
        {
            return;
        }

        _applyingPanelLayout = true;
        try
        {
            graphDetailSplitContainer.SuspendLayout();
            graphDetailSplitContainer.SplitterDistance = historyWidth;
        }
        finally
        {
            graphDetailSplitContainer.ResumeLayout(true);
            _applyingPanelLayout = false;
        }
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

        int halfHeight = (height - detailSplitContainer.SplitterWidth) / 2;
        int minTop = detailSplitContainer.Panel1MinSize;
        int maxTop = height - detailSplitContainer.Panel2MinSize - detailSplitContainer.SplitterWidth;
        if (maxTop < minTop)
        {
            return;
        }

        _applyingPanelLayout = true;
        try
        {
            detailSplitContainer.SplitterDistance = Math.Clamp(halfHeight, minTop, maxTop);
        }
        finally
        {
            _applyingPanelLayout = false;
        }
    }

    private void ConfigureToolbars()
    {
        menuStrip.Dock = DockStyle.Top;
        mainToolStrip.Dock = DockStyle.Top;
        mainToolStrip.AutoSize = false;
        mainToolStrip.ImageScalingSize = new Size(IconFactory.ToolbarIconSize, IconFactory.ToolbarIconSize);
        mainToolStrip.Padding = new Padding(6, 4, 6, 4);
        mainToolStrip.Height = IconFactory.ToolbarIconSize + mainToolStrip.Padding.Vertical + 6;
        mainToolStrip.ShowItemToolTips = true;

        ConfigureToolStripButton(openToolButton, IconFactory.Open(IconFactory.ToolbarIconSize), "Open a local Git repository folder");
        ConfigureToolStripButton(cloneToolButton, IconFactory.Clone(IconFactory.ToolbarIconSize), "Clone a remote repository to a local folder");
        ConfigureToolStripButton(browseRemoteToolButton, IconFactory.BrowseRemote(IconFactory.ToolbarIconSize), "Browse remote commit history without saving a local copy");
        ConfigureToolStripButton(refreshTreeToolButton, IconFactory.RefreshTree(IconFactory.ToolbarIconSize), "Reload branches, tags, and releases");
        ConfigureToolStripDropDownButton(exportSummaryToolButton, IconFactory.Report(IconFactory.ToolbarIconSize), "Export repository summary as PDF, Word, or Markdown");
        exportSummaryToolButton.Enabled = false;
        SetExportSummaryMenuItemsEnabled(false);
        ConfigureToolStripButton(refreshGraphToolButton, IconFactory.RefreshGraph(IconFactory.ToolbarIconSize), "Reload the commit history graph");
        ConfigureToolStripButton(copyShaToolButton, IconFactory.Copy(IconFactory.ToolbarIconSize), "Copy the selected commit's full hash to the clipboard");
        ConfigureToolStripButton(copyMessageToolButton, IconFactory.Message(IconFactory.ToolbarIconSize), "Copy the selected commit message to the clipboard");
        ConfigureToolStripButton(copyFilePathToolButton, IconFactory.File(IconFactory.ToolbarIconSize), "Copy the selected file path to the clipboard");
        ConfigureToolStripButton(wordWrapToolButton, IconFactory.WordWrap(IconFactory.ToolbarIconSize), "Toggle word wrap for the diff view");
        ConfigureToolStripButton(copyDiffToolButton, IconFactory.Copy(IconFactory.ToolbarIconSize), "Copy the visible diff text to the clipboard");
        ConfigureToolStripButton(infoToolButton, IconFactory.InfoToolbar(IconFactory.InfoToolbarIconSize), "Show application information");
        infoToolButton.Margin = new Padding(2, 1, 2, 1);
    }

    private void ConfigureMenuIcons()
    {
        menuStrip.ImageScalingSize = new Size(IconFactory.MenuBarIconSize, IconFactory.MenuBarIconSize);
        menuStrip.ShowItemToolTips = true;
        menuStrip.Padding = new Padding(4, 2, 4, 2);
        menuStrip.Renderer = _menuRenderer;
        menuStrip.AutoSize = false;
        menuStrip.Height = MenuStripRootIconRenderer.RootMenuHeight;

        ConfigureRootMenu(fileMenuItem);
        ConfigureRootMenu(repositoryMenuItem);
        ConfigureRootMenu(historyMenuItem);
        ConfigureRootMenu(diffMenuItem);
        ConfigureRootMenu(helpMenuItem);
        ConfigureDropDownMenu(fileMenuItem);
        ConfigureDropDownMenu(repositoryMenuItem);
        ConfigureDropDownMenu(historyMenuItem);
        ConfigureDropDownMenu(diffMenuItem);
        ConfigureDropDownMenu(helpMenuItem);

        ConfigureMenuItem(openRepositoryMenuItem, IconFactory.Open(IconFactory.MenuBarIconSize), "&Open...", menuBar: true);
        ConfigureMenuItem(cloneRepositoryMenuItem, IconFactory.Clone(IconFactory.MenuBarIconSize), "&Clone...", menuBar: true);
        ConfigureMenuItem(browseRemoteRepositoryMenuItem, IconFactory.BrowseRemote(IconFactory.MenuBarIconSize), "Browse &Remote...", menuBar: true);
        ConfigureMenuItem(exitMenuItem, IconFactory.Exit(IconFactory.MenuBarIconSize), "E&xit", menuBar: true);
        ConfigureMenuItem(refreshTreeMenuItem, IconFactory.RefreshTree(IconFactory.MenuBarIconSize), "Refresh &Tree", menuBar: true);
        ConfigureMenuItem(barExportSummaryWordMenuItem, IconFactory.FileWord(IconFactory.MenuBarIconSize), "Export to &Word", menuBar: true);
        ConfigureMenuItem(barExportSummaryMarkdownMenuItem, IconFactory.FileMarkdown(IconFactory.MenuBarIconSize), "Export to &Markdown", menuBar: true);
        ConfigureMenuItem(barExportSummaryPdfMenuItem, IconFactory.FilePdf(IconFactory.MenuBarIconSize), "Export to &PDF", menuBar: true);
        ConfigureMenuItem(refreshGraphMenuItem, IconFactory.RefreshGraph(IconFactory.MenuBarIconSize), "Refresh &Graph", menuBar: true);
        ConfigureMenuItem(copyShaMenuItem, IconFactory.Copy(IconFactory.MenuBarIconSize), "Copy &SHA", menuBar: true);
        ConfigureMenuItem(copyMessageMenuItem, IconFactory.Message(IconFactory.MenuBarIconSize), "Copy &Message", menuBar: true);
        ConfigureMenuItem(copyPathMenuItem, IconFactory.File(IconFactory.MenuBarIconSize), "Copy &Path", menuBar: true);
        ConfigureMenuItem(wordWrapMenuItem, IconFactory.WordWrap(IconFactory.MenuBarIconSize), "Word &Wrap", menuBar: true);
        ConfigureMenuItem(copyDiffMenuItem, IconFactory.Diff(IconFactory.MenuBarIconSize), "Copy &Diff", menuBar: true);
        ConfigureMenuItem(aboutMenuItem, IconFactory.InfoToolbar(IconFactory.MenuBarIconSize), "&About", menuBar: true);

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
            (copyFilePathContextMenuItem, IconFactory.File(), "Copy Path"));
        ConfigureContextMenu(repoFilesContextMenu,
            (showFileLogContextMenuItem, IconFactory.History(), "Show Log"),
            (gitAddContextMenuItem, IconFactory.GitAdd(), "Git Add"),
            (gitCommitContextMenuItem, IconFactory.GitCommit(), "Git Commit..."),
            (gitPushContextMenuItem, IconFactory.GitPush(), "Git Push"),
            (copyRepoFilePathContextMenuItem, IconFactory.File(), "Copy Path"),
            (clearFileLogFilterContextMenuItem, IconFactory.RefreshGraph(), "Show All Commits"));
    }

    private void ConfigureExportSummaryMenu(ToolStripMenuItem parent, bool menuBar = false)
    {
        Image icon = menuBar ? IconFactory.Report(IconFactory.MenuBarIconSize) : IconFactory.Report(IconFactory.MenuIconSize);
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

    private static void ConfigureRootMenu(ToolStripMenuItem item)
    {
        item.Image = null;
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
        ListViewHeaderToolTipBehavior.AddColumn(
            changedFilesListView,
            "Path",
            280,
            "Relative path of the changed file in the repository.");
        ListViewHeaderToolTipBehavior.AddColumn(
            changedFilesListView,
            "Status",
            100,
            "Kind of change (Added, Modified, Deleted, Renamed, etc.).");
        ListViewHeaderToolTipBehavior.Attach(changedFilesListView);
    }

    private void ConfigureSectionHeadingToolTips()
    {
        toolTip.SetToolTip(repoTitleLabel, "Local repository tree with branches, tags, and releases.");
        toolTip.SetToolTip(repoFilesTitleLabel, "Repository folders and files. Select a tracked path to show its commit log.");
        toolTip.SetToolTip(repoFilesTreeView, "Browse repository folders and files. Select a tracked path to show its commit log.");
        toolTip.SetToolTip(graphTitleLabel, "Commit log with branch graph, messages, and metadata.");
        toolTip.SetToolTip(filesTitleLabel, "Author, message, and files changed in the selected commit.");
        toolTip.SetToolTip(diffTitleLabel, "Unified diff for the selected changed file.");
        toolTip.SetToolTip(changedFilesTitleLabel, "List of files modified in the selected commit.");
    }

    private static string FormatChangeKind(ChangeKind kind) => kind switch
    {
        ChangeKind.Added => "Added",
        ChangeKind.Modified => "Modified",
        ChangeKind.Deleted => "Deleted",
        ChangeKind.Renamed => "Renamed",
        ChangeKind.Copied => "Copied",
        ChangeKind.Unmodified => "Unmodified",
        _ => kind.ToString()
    };

    private void PopulateChangedFilesList(Patch patch)
    {
        changedFilesListView.BeginUpdate();
        changedFilesListView.Items.Clear();
        foreach (var entry in patch)
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

            statusLabel.Text = "Opening last remote repository...";
            TryOpenRemoteBrowse(session.Path, session.RemoteUrl, showErrorOnFailure: false);
            return;
        }

        statusLabel.Text = "Opening last repository...";
        TryOpenRepository(session.Path, showErrorOnFailure: false);
    }

    private void OpenRepositoryMenuItem_Click(object? sender, EventArgs e)
    {
        using var dialog = new FolderBrowserDialog { Description = "Select a Git repository folder" };
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        statusLabel.Text = "Opening repository...";
        TryOpenRepository(
            dialog.SelectedPath,
            completionTitle: "Repository Opened",
            completionSummary: "The repository was opened successfully.");
    }

    private void CloneRepositoryMenuItem_Click(object? sender, EventArgs e)
    {
        using var dialog = new CloneRepositoryForm();
        if (dialog.ShowDialog(this) != DialogResult.OK || dialog.ClonedRepositoryPath is null)
        {
            return;
        }

        statusLabel.Text = "Opening cloned repository...";
        TryOpenRepository(
            dialog.ClonedRepositoryPath,
            completionTitle: "Clone Complete",
            completionSummary: "The repository was cloned successfully.",
            completionDetails:
            [
                new("URL", dialog.RepositoryUrl ?? string.Empty),
                new("Folder", dialog.ClonedRepositoryPath)
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

        statusLabel.Text = "Opening remote repository...";
        TryOpenRemoteBrowse(
            dialog.RepositoryPath,
            dialog.RepositoryUrl,
            completionTitle: "Remote Browse Ready",
            completionSummary: "The remote repository history is ready to browse.");
    }

    private void ExitMenuItem_Click(object? sender, EventArgs e) => Close();

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
        IReadOnlyList<OperationDetail>? completionDetails = null)
    {
        try
        {
            _remoteBrowseUrl = null;
            _pathHistoryFilter = null;
            _gitService.OpenLocal(path);
            statusLabel.Text = $"Branch: {_gitService.GetCurrentBranchName()}";
            RefreshRepositoryViews();

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
                    completionSummary ?? "The operation completed successfully.",
                    completionDetails,
                    new OperationDetail("Repository", _gitService.RepositoryPath ?? path),
                    new OperationDetail("Branch", _gitService.GetCurrentBranchName()));
            }
        }
        catch (Exception ex)
        {
            statusLabel.Text = "Ready";
            if (showErrorOnFailure)
            {
                MessageBox.Show(this, ex.Message, "Open Repository Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    private void TryOpenRemoteBrowse(
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
            statusLabel.Text = $"Branch: {_gitService.GetCurrentBranchName()} (remote view)";
            RefreshRepositoryViews();

            _settings.RecordSuccessfulRemoteBrowseSession(cachePath, remoteUrl);
            _settings.Save();

            if (completionTitle is not null)
            {
                var displayName = RemoteRepositoryService.GetDisplayName(remoteUrl) ?? remoteUrl;
                ShowOperationComplete(
                    completionTitle,
                    completionSummary ?? "The operation completed successfully.",
                    null,
                    new OperationDetail("Repository", displayName),
                    new OperationDetail("URL", remoteUrl),
                    new OperationDetail("Branch", _gitService.GetCurrentBranchName()),
                    new OperationDetail("Mode", "Remote browse (read-only)"));
            }
        }
        catch (Exception ex)
        {
            _remoteBrowseUrl = null;
            statusLabel.Text = "Ready";
            if (showErrorOnFailure)
            {
                MessageBox.Show(this, ex.Message, "Browse Remote Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    private bool IsRemoteBrowseMode =>
        !string.IsNullOrWhiteSpace(_remoteBrowseUrl) || _gitService.Repo?.Info.IsBare == true;

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
        ConfigureMenuItem(item, IconFactory.Folder(IconFactory.MenuBarIconSize), label, menuBar: true);
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
                completionTitle: "Repository Opened",
                completionSummary: "The repository was opened successfully.");
        }
    }

    private void RefreshRepositoryViews()
    {
        if (_gitService.Repo is null)
        {
            repoFilesTreeView.Nodes.Clear();
            UpdateGraphTitleLabel();
            return;
        }

        BranchTagTreePopulator.Populate(repoTreeView, _gitService.Repo);
        RepositoryFileTreeService.PopulateRoot(repoFilesTreeView, _gitService.Repo);
        if (repoFilesTreeView.Nodes.Count == 1 && repoFilesTreeView.Nodes[0].Tag is RepositoryFileNodeTag)
        {
            var root = repoFilesTreeView.Nodes[0];
            RepositoryFileTreeService.LoadChildren(root, _gitService.Repo);
            _suppressFileTreePathLog = true;
            try
            {
                root.Expand();
            }
            finally
            {
                _suppressFileTreePathLog = false;
            }
        }

        UpdateRepoInfoLabel();
        LoadCommitGraph();
        UpdateRepoCounts();
        _ = LoadReleasesAsync();
    }

    private void UpdateRepoInfoLabel()
    {
        if (_gitService.Repo is null || string.IsNullOrWhiteSpace(_gitService.RepositoryPath))
        {
            repoInfoLabel.Text = "No repository open";
            exportSummaryToolButton.Enabled = false;
            SetExportSummaryMenuItemsEnabled(false);
            return;
        }

        string branch = _gitService.GetCurrentBranchName();
        if (IsRemoteBrowseMode && !string.IsNullOrWhiteSpace(_remoteBrowseUrl))
        {
            string displayName = RemoteRepositoryService.GetDisplayName(_remoteBrowseUrl) ?? _remoteBrowseUrl;
            repoInfoLabel.Text = $"{displayName}  ·  {branch}  (remote view)\n{_remoteBrowseUrl}";
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
            repoCountsStatusLabel.Text = "No repository open";
            return;
        }

        int localBranches = _gitService.Repo.Branches.Count(b => !b.IsRemote);
        int tags = _gitService.Repo.Tags.Count();
        repoCountsStatusLabel.Text = $"{localBranches} branches · {tags} tags";
    }

    private void RefreshTreeToolButton_Click(object? sender, EventArgs e)
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        statusLabel.Text = "Refreshing branches, tags, and releases...";
        RefreshRepositoryViews();
        statusLabel.Text = $"Branch: {_gitService.GetCurrentBranchName()}";
    }

    private void RefreshGraphToolButton_Click(object? sender, EventArgs e)
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        statusLabel.Text = "Refreshing commit graph...";
        LoadCommitGraph();
        statusLabel.Text = $"Branch: {_gitService.GetCurrentBranchName()}";
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
            MessageBox.Show(this, "Open a repository before exporting a summary.", "Export Summary", MessageBoxButtons.OK, MessageBoxIcon.Information);
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

            statusLabel.Text = $"Exported summary to {preview.ExportedFilePath}";
            ShowOperationComplete(
                "Export Complete",
                "The repository summary was exported successfully.",
                null,
                new OperationDetail("Repository", summary.RepositoryName),
                new OperationDetail("Branch", summary.CurrentBranch),
                new OperationDetail("Format", GetExportFormatDisplayName(preview.ExportedFormat ?? format)),
                new OperationDetail("File", preview.ExportedFilePath));
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Export Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
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

        try
        {
            statusLabel.Text = $"Checking out {branch.FriendlyName}...";
            Commands.Checkout(_gitService.Repo, branch);
            statusLabel.Text = $"Branch: {_gitService.GetCurrentBranchName()}";
            RefreshRepositoryViews();
            ShowOperationComplete(
                "Checkout Complete",
                "The branch was checked out successfully.",
                null,
                new OperationDetail("Branch", branch.FriendlyName),
                new OperationDetail("Repository", _gitService.RepositoryPath ?? string.Empty));
        }
        catch (Exception ex)
        {
            statusLabel.Text = "Ready";
            MessageBox.Show(this, ex.Message, "Checkout Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
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

        statusLabel.Text = "Loading GitHub releases...";
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
            statusLabel.Text = $"Branch: {_gitService.GetCurrentBranchName()}";
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
            statusLabel.Text = $"Branch: {_gitService.GetCurrentBranchName()}";
        }
        catch (Exception ex)
        {
            BranchTagTreePopulator.SetReleaseNodes(releasesNode,
            [
                ($"(failed to load: {ex.Message})", null, null)
            ]);
            statusLabel.Text = $"Branch: {_gitService.GetCurrentBranchName()}";
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
        _currentPatch = null;
        diffTextBox.Clear();
        diffTextBox.Text = string.IsNullOrWhiteSpace(release.Body) ? "(no release notes)" : release.Body;
    }

    private void LoadCommitGraph()
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        if (_pathHistoryFilter is not null)
        {
            _ = LoadPathFilteredCommitGraphAsync();
            return;
        }

        var commits = _gitService.Repo.Commits.QueryBy(new CommitFilter
        {
            IncludeReachableFrom = _gitService.Repo.Head,
            SortBy = CommitSortStrategies.Topological | CommitSortStrategies.Time
        }).ToList();

        commitGraphView.SetRows(CommitGraphBuilder.Build(commits));
        UpdateGraphTitleLabel();
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
        statusLabel.Text = string.IsNullOrEmpty(path)
            ? "Loading commit history..."
            : $"Loading commit history for {path}...";

        try
        {
            var commits = await Task.Run(() => PathCommitHistoryService.GetCommits(repo, path, isDirectory));
            if (_gitService.Repo != repo || _pathHistoryFilter != path)
            {
                return;
            }

            commitGraphView.SetRows(CommitGraphBuilder.Build(commits));
            UpdateGraphTitleLabel();
            statusLabel.Text = string.IsNullOrEmpty(path)
                ? "Showing all commits"
                : $"Showing commits for {path}";
        }
        catch (Exception ex)
        {
            statusLabel.Text = "Ready";
            MessageBox.Show(this, ex.Message, "Load Commit History Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void UpdateGraphTitleLabel()
    {
        if (string.IsNullOrWhiteSpace(_pathHistoryFilter))
        {
            graphTitleLabel.Text = "Commit History";
            return;
        }

        string displayPath = string.IsNullOrEmpty(_pathHistoryFilter) ? "(root)" : _pathHistoryFilter;
        graphTitleLabel.Text = $"Commit History — {displayPath}";
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
        if (_pathHistoryFilter == normalized && _pathHistoryFilterIsDirectory == isDirectoryFilter)
        {
            return;
        }

        _pathHistoryFilter = normalized;
        _pathHistoryFilterIsDirectory = isDirectoryFilter;
        UpdateGraphTitleLabel();
        _ = LoadPathFilteredCommitGraphAsync();
    }

    private void ClearPathHistoryFilter()
    {
        _pathHistoryFilter = null;
        _pathHistoryFilterIsDirectory = false;
        if (_gitService.Repo is not null)
        {
            statusLabel.Text = $"Branch: {_gitService.GetCurrentBranchName()}";
            LoadCommitGraph();
        }
        else
        {
            UpdateGraphTitleLabel();
        }
    }

    private void RepoFilesTreeView_BeforeExpand(object? sender, TreeViewCancelEventArgs e)
    {
        if (_gitService.Repo is null || e.Node is null)
        {
            return;
        }

        RepositoryFileTreeService.LoadChildren(e.Node, _gitService.Repo);
    }

    private void RepoFilesTreeView_AfterSelect(object? sender, TreeViewEventArgs e)
    {
        if (_suppressFileTreePathLog || _gitService.Repo is null)
        {
            return;
        }

        TryApplyPathHistoryFromFileNode(e.Node);
    }

    private void RepoFilesTreeView_NodeMouseClick(object? sender, TreeNodeMouseClickEventArgs e)
    {
        if (e.Node is not null)
        {
            repoFilesTreeView.SelectedNode = e.Node;
        }
    }

    private void TryApplyPathHistoryFromFileNode(TreeNode? node)
    {
        if (node?.Tag is not RepositoryFileNodeTag tag || tag.IsPlaceholder)
        {
            return;
        }

        if (!PathCommitHistoryService.CanShowLog(_gitService.Repo!, tag.RelativePath, tag.IsDirectory))
        {
            return;
        }

        ApplyPathHistoryFilter(tag.RelativePath, tag.IsDirectory);
    }

    private bool CanUseGitWorkflow =>
        _gitService.Repo is not null && GitWorkflowService.CanUseWorkflow(_gitService.Repo, IsRemoteBrowseMode);

    private void RepoFilesContextMenu_Opening(object? sender, System.ComponentModel.CancelEventArgs e)
    {
        if (_gitService.Repo is null)
        {
            e.Cancel = true;
            return;
        }

        bool canUseGit = CanUseGitWorkflow;
        repoFilesGitSeparator.Visible = canUseGit;
        gitAddContextMenuItem.Visible = canUseGit;
        gitCommitContextMenuItem.Visible = canUseGit;
        gitPushContextMenuItem.Visible = canUseGit;

        if (repoFilesTreeView.SelectedNode?.Tag is not RepositoryFileNodeTag tag || tag.IsPlaceholder)
        {
            showFileLogContextMenuItem.Enabled = false;
            gitAddContextMenuItem.Enabled = false;
            gitCommitContextMenuItem.Enabled = canUseGit && GitWorkflowService.HasStagedChanges(_gitService.Repo);
            gitPushContextMenuItem.Enabled = canUseGit && GitWorkflowService.HasOriginRemote(_gitService.Repo);
            copyRepoFilePathContextMenuItem.Enabled = false;
            clearFileLogFilterContextMenuItem.Enabled = _pathHistoryFilter is not null;
            return;
        }

        bool canShowLog = PathCommitHistoryService.CanShowLog(_gitService.Repo, tag.RelativePath, tag.IsDirectory);
        showFileLogContextMenuItem.Enabled = canShowLog;
        gitAddContextMenuItem.Enabled = canUseGit;
        gitCommitContextMenuItem.Enabled = canUseGit && GitWorkflowService.HasStagedChanges(_gitService.Repo);
        gitPushContextMenuItem.Enabled = canUseGit && GitWorkflowService.HasOriginRemote(_gitService.Repo);
        copyRepoFilePathContextMenuItem.Enabled = true;
        clearFileLogFilterContextMenuItem.Enabled = _pathHistoryFilter is not null;
    }

    private void GitAddContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (_gitService.Repo is null
            || !CanUseGitWorkflow
            || repoFilesTreeView.SelectedNode?.Tag is not RepositoryFileNodeTag tag
            || tag.IsPlaceholder)
        {
            return;
        }

        try
        {
            GitWorkflowService.Stage(_gitService.Repo, tag.RelativePath, tag.IsDirectory);
            statusLabel.Text = string.IsNullOrEmpty(tag.RelativePath)
                ? "Staged all changes"
                : $"Staged {tag.RelativePath}";
            RefreshRepositoryViews();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Git Add Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
            MessageBox.Show(this, "Stage changes with Git Add before committing.", "Git Commit", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dialog = new GitCommitDialog(stagedPaths, _settings);
        if (dialog.ShowDialog(this) != DialogResult.OK || string.IsNullOrWhiteSpace(dialog.CommitMessage))
        {
            return;
        }

        try
        {
            var commit = GitWorkflowService.CreateCommit(_gitService.Repo, dialog.CommitMessage);
            RefreshRepositoryViews();
            statusLabel.Text = $"Committed {commit.Sha[..7]}";
            ShowOperationComplete(
                "Commit Complete",
                "The staged changes were committed successfully.",
                null,
                new OperationDetail("Commit", commit.Sha[..7]),
                new OperationDetail("Branch", _gitService.GetCurrentBranchName()),
                new OperationDetail("Message", commit.MessageShort.Trim()));
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Git Commit Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void GitPushContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
        {
            return;
        }

        try
        {
            var prompt = new CredentialsPrompt(this, initialPassword: _gitHubToken);
            GitWorkflowService.Push(_gitService.Repo, prompt.Handler);
            if (prompt.LastEntered is { } credentials && !string.IsNullOrWhiteSpace(credentials.Password))
            {
                _gitHubToken = credentials.Password;
            }

            statusLabel.Text = $"Pushed {_gitService.GetCurrentBranchName()} to origin";
            ShowOperationComplete(
                "Push Complete",
                "The current branch was pushed to origin successfully.",
                null,
                new OperationDetail("Branch", _gitService.GetCurrentBranchName()),
                new OperationDetail("Remote", "origin"));
        }
        catch (OperationCanceledException)
        {
            statusLabel.Text = "Push cancelled";
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Git Push Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void ShowFileLogContextMenuItem_Click(object? sender, EventArgs e) =>
        TryApplyPathHistoryFromFileNode(repoFilesTreeView.SelectedNode);

    private void CopyRepoFilePathContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (repoFilesTreeView.SelectedNode?.Tag is not RepositoryFileNodeTag tag || tag.IsPlaceholder)
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

        _currentCommit = commit;
        statusLabel.Text = $"{commit.Sha[..7]}  {commit.MessageShort}";
        commitMetaLabel.Text = CommitDetailService.FormatMetadata(commit);

        _currentPatch = CommitDetailService.GetPatch(_gitService.Repo, commit);
        PopulateChangedFilesList(_currentPatch);
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

    private void ExportCommitContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (_gitService.Repo is null || _currentCommit is not Commit commit)
        {
            return;
        }

        using var dialog = new FolderBrowserDialog
        {
            Description = $"Select a folder to export commit {commit.Sha[..7]} into.",
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
                $"The folder is not empty:\n{destination}\n\nExisting files may be overwritten. Continue?",
                "Export Commit",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning);
            if (confirm != DialogResult.Yes)
            {
                return;
            }
        }

        try
        {
            CommitExportService.Export(_gitService.Repo, commit, destination);
            statusLabel.Text = $"Exported {commit.Sha[..7]} to {destination}";
            ShowOperationComplete(
                "Export Complete",
                "The commit snapshot was exported successfully.",
                null,
                new OperationDetail("Commit", $"{commit.Sha[..7]} — {commit.MessageShort.Trim()}"),
                new OperationDetail("Author", commit.Author.Name),
                new OperationDetail("Folder", destination));
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Export Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
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

    private void CopyFilePathContextMenuItem_Click(object? sender, EventArgs e)
    {
        if (GetSelectedChangedFilePath() is { } path)
        {
            Clipboard.SetText(path);
        }
    }

    private void ChangedFilesListView_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (GetSelectedChangedFilePath() is not { } path || _currentPatch is null)
        {
            return;
        }

        var entry = _currentPatch.FirstOrDefault(p => p.Path == path);
        DiffTextRenderer.Render(diffTextBox, entry?.Patch ?? "");
    }

    private void WordWrapToolButton_CheckedChanged(object? sender, EventArgs e)
    {
        SetWordWrap(wordWrapToolButton.Checked);
    }

    private void WordWrapMenuItem_CheckedChanged(object? sender, EventArgs e)
    {
        SetWordWrap(wordWrapMenuItem.Checked);
    }

    private void SetWordWrap(bool enabled)
    {
        diffTextBox.WordWrap = enabled;
        if (wordWrapToolButton.Checked != enabled)
        {
            wordWrapToolButton.Checked = enabled;
        }

        if (wordWrapMenuItem.Checked != enabled)
        {
            wordWrapMenuItem.Checked = enabled;
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
