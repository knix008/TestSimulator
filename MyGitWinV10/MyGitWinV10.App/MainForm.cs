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
    private Commit? _currentCommit;
    private TreeChanges? _currentCommitChanges;
    private int _commitDetailLoadGeneration;
    private int _diffLoadGeneration;
    private int _pathHistoryLoadGeneration;
    private int _commitGraphLoadGeneration;
    private int _repositoryRefreshGeneration;
    private bool _repositoryRefreshInProgress;

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

    private static readonly RepositoryFileNodeTag RepositoryRootTag = new()
    {
        RelativePath = string.Empty,
        IsDirectory = true
    };

    private ToolStripMenuItem repositoryGitMenuItem = null!;

    private readonly GitFileTreeImageList _gitFileTreeImages = new();

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
        detailSplitContainer.Resize += (_, _) => ApplyDetailVerticalLayout();
        fileMenuItem.DropDownOpening += (_, _) => RefreshFileRecentMenu();
        FormClosed += (_, _) =>
        {
            _gitService.Dispose();
            _gitFileTreeImages.Dispose();
        };
        _gitFileTreeImages.Attach(repoFilesTreeView);
        Shown += (_, _) =>
        {
            ApplyPanelLayout();
            ApplyDetailVerticalLayout();
            OpenLastSuccessfulSessionIfAvailable();
        };
    }

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
            detailSplitContainer.SplitterDistance = Math.Clamp(targetTop, minTop, maxTop);
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
            (gitResetContextMenuItem, IconFactory.GitReset(), "Git Reset (Unstage)"),
            (gitDiscardContextMenuItem, IconFactory.GitDiscard(), "Git Discard Changes"),
            (gitCommitContextMenuItem, IconFactory.GitCommit(), "Git Commit..."),
            (gitFetchContextMenuItem, IconFactory.GitFetch(), "Git Fetch"),
            (gitPullContextMenuItem, IconFactory.GitPull(), "Git Pull"),
            (gitPushContextMenuItem, IconFactory.GitPush(), "Git Push"),
            (gitStashContextMenuItem, IconFactory.GitStash(), "Git Stash"),
            (gitStashPopContextMenuItem, IconFactory.GitStash(), "Git Stash Pop"),
            (gitStatusContextMenuItem, IconFactory.GitStatus(), "Git Status..."),
            (copyRepoFilePathContextMenuItem, IconFactory.File(), "Copy Path"),
            (clearFileLogFilterContextMenuItem, IconFactory.RefreshGraph(), "Show All Commits"));
        ConfigureRepositoryGitMenu();
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
        toolTip.SetToolTip(repoFilesTitleLabel, "Repository folders and files. Icons show Git status; hover a node for staged and work tree details.");
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
            statusLabel.Text = $"Branch: {_gitService.GetCurrentBranchName()}";
            await RefreshRepositoryViewsAsync("Opening repository...");

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
            statusLabel.Text = $"Branch: {_gitService.GetCurrentBranchName()} (remote view)";
            await RefreshRepositoryViewsAsync("Opening remote repository...");

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

    private void RefreshRepositoryViews() => _ = RefreshRepositoryViewsAsync();

    private void CancelPendingRepositoryOperations()
    {
        _repositoryRefreshGeneration++;
        _pathHistoryLoadGeneration++;
        _commitGraphLoadGeneration++;
    }

    private async Task RefreshRepositoryViewsAsync(string progressMessage = "Refreshing repository...", bool showProgress = true)
    {
        if (_gitService.Repo is null)
        {
            _fileTreeStatusIndex = null;
            repoFilesTreeView.Nodes.Clear();
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
            async Task BuildStatusIndexAsync()
            {
                _fileTreeStatusIndex = await Task.Run(
                    () => _gitService.RunLocked(RepositoryPathStatusService.Build));
            }

            if (showProgress)
            {
                statusLabel.Text = progressMessage;
                repoLoadProgressBar.Visible = true;
                try
                {
                    await BuildStatusIndexAsync();
                }
                finally
                {
                    repoLoadProgressBar.Visible = false;
                }
            }
            else
            {
                await BuildStatusIndexAsync();
            }

            if (refreshGeneration != _repositoryRefreshGeneration || _gitService.Repo != repo)
            {
                return;
            }

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
            RepositoryFileTreeService.PopulateRoot(repoFilesTreeView, repo, _gitFileTreeImages, _fileTreeStatusIndex);
            if (repoFilesTreeView.Nodes.Count == 1 && repoFilesTreeView.Nodes[0].Tag is RepositoryFileNodeTag)
            {
                var root = repoFilesTreeView.Nodes[0];
                RepositoryFileTreeService.LoadChildren(root, repo, _gitFileTreeImages, _fileTreeStatusIndex);
                root.Expand();
            }
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
        _ = RefreshRepositoryViewsAsync("Refreshing branches, tags, and releases...");
    }

    private void RefreshGraphToolButton_Click(object? sender, EventArgs e)
    {
        if (_gitService.Repo is null)
        {
            return;
        }

        statusLabel.Text = "Refreshing commit graph...";
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
                $"Checking out {branch.FriendlyName}...",
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
                "Checkout Complete",
                "The branch was checked out successfully.",
                null,
                new OperationDetail("Branch", branch.FriendlyName),
                new OperationDetail("Repository", _gitService.RepositoryPath ?? string.Empty));
        }
        catch (OperationCanceledException)
        {
            statusLabel.Text = "Checkout cancelled";
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
            statusLabel.Text = $"Branch: {_gitService.GetCurrentBranchName()}";
        }
        catch (Exception ex)
        {
            if (generation != _commitGraphLoadGeneration)
            {
                return;
            }

            statusLabel.Text = "Ready";
            MessageBox.Show(this, ex.Message, "Load Commit History Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
                commitMetaLabel.Text = string.Empty;
                changedFilesListView.Items.Clear();
                diffTextBox.Clear();
            }

            statusLabel.Text = string.IsNullOrEmpty(path)
                ? "Showing all commits"
                : $"Showing commits for {path}";
        }
        catch (Exception ex)
        {
            if (generation != _pathHistoryLoadGeneration)
            {
                return;
            }

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
        commitMetaLabel.Text = string.Empty;
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
            statusLabel.Text = $"Branch: {_gitService.GetCurrentBranchName()}";
            _ = LoadCommitGraphAsync();
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

        RepositoryFileTreeService.LoadChildren(e.Node, _gitService.Repo, _gitFileTreeImages, _fileTreeStatusIndex);
    }

    private void RepoFilesTreeView_MouseDown(object? sender, MouseEventArgs e)
    {
        if (e.Button != MouseButtons.Right)
        {
            return;
        }

        TreeNode? node = repoFilesTreeView.GetNodeAt(e.Location);
        if (node is not null)
        {
            repoFilesTreeView.SelectedNode = node;
        }
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
        if (e.Node is null || e.Button != MouseButtons.Left)
        {
            return;
        }

        bool alreadySelected = repoFilesTreeView.SelectedNode == e.Node;
        repoFilesTreeView.SelectedNode = e.Node;
        if (alreadySelected && !_suppressFileTreePathLog && _gitService.Repo is not null)
        {
            TryApplyPathHistoryFromFileNode(e.Node);
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
        repositoryGitMenuItem.DropDownOpening += (_, _) => UpdateRepositoryGitMenuState();

        AddRepositoryGitMenuItem("Git &Add", IconFactory.GitAdd(), (_, _) => TryGitAdd(RepositoryRootTag), "gitAddContextMenuItem");
        AddRepositoryGitMenuItem("Git Reset (&Unstage)", IconFactory.GitReset(), (_, _) => TryGitReset(RepositoryRootTag), "gitResetContextMenuItem");
        AddRepositoryGitMenuItem("Git &Discard Changes", IconFactory.GitDiscard(), (_, _) => TryGitDiscard(RepositoryRootTag), "gitDiscardContextMenuItem");
        repositoryGitMenuItem.DropDownItems.Add(new ToolStripSeparator());
        AddRepositoryGitMenuItem("Git &Commit...", IconFactory.GitCommit(), GitCommitContextMenuItem_Click, "gitCommitContextMenuItem");
        repositoryGitMenuItem.DropDownItems.Add(new ToolStripSeparator());
        AddRepositoryGitMenuItem("Git Fetc&h", IconFactory.GitFetch(), GitFetchContextMenuItem_Click, "gitFetchContextMenuItem");
        AddRepositoryGitMenuItem("Git P&ull", IconFactory.GitPull(), GitPullContextMenuItem_Click, "gitPullContextMenuItem");
        AddRepositoryGitMenuItem("Git P&ush", IconFactory.GitPush(), GitPushContextMenuItem_Click, "gitPushContextMenuItem");
        repositoryGitMenuItem.DropDownItems.Add(new ToolStripSeparator());
        AddRepositoryGitMenuItem("Git Stas&h", IconFactory.GitStash(), GitStashContextMenuItem_Click, "gitStashContextMenuItem");
        AddRepositoryGitMenuItem("Git Stash &Pop", IconFactory.GitStash(), GitStashPopContextMenuItem_Click, "gitStashPopContextMenuItem");
        AddRepositoryGitMenuItem("Git &Status...", IconFactory.GitStatus(), (_, _) => ShowGitStatus(RepositoryRootTag), "gitStatusContextMenuItem");

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

        RepositoryFileNodeTag? tag = TryGetGitPathTag();
        if (tag is null)
        {
            showFileLogContextMenuItem.Enabled = false;
            copyRepoFilePathContextMenuItem.Enabled = false;
            clearFileLogFilterContextMenuItem.Enabled = _pathHistoryFilter is not null;
            if (canUseGit)
            {
                ApplyGitMenuItemState(_gitService.Repo, RepositoryRootTag, GetFilesGitMenuItems(), _fileTreeStatusIndex);
            }

            return;
        }

        showFileLogContextMenuItem.Enabled = true;
        copyRepoFilePathContextMenuItem.Enabled = true;
        clearFileLogFilterContextMenuItem.Enabled = _pathHistoryFilter is not null;
        if (canUseGit)
        {
            ApplyGitMenuItemState(_gitService.Repo, tag, GetFilesGitMenuItems(), _fileTreeStatusIndex);
        }
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
        if (repoFilesTreeView.SelectedNode?.Tag is RepositoryFileNodeTag tag && !tag.IsPlaceholder)
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
        string.IsNullOrEmpty(relativePath) ? "(repository)" : relativePath;

    private void GitAddContextMenuItem_Click(object? sender, EventArgs e) => TryGitAdd(GetGitPathTagOrRoot());

    private void TryGitAdd(RepositoryFileNodeTag tag)
    {
        if (_gitService.Repo is null || !CanUseGitWorkflow)
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
            GitOperationNotifier.ShowSuccess(
                this,
                "Git Add Complete",
                "The selected changes were staged successfully.",
                new OperationDetail("Path", FormatGitPathScope(tag.RelativePath)),
                new OperationDetail("Branch", _gitService.GetCurrentBranchName()));
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, "Git Add Failed", ex);
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
            GitWorkflowService.Unstage(_gitService.Repo, tag.RelativePath, tag.IsDirectory);
            statusLabel.Text = string.IsNullOrEmpty(tag.RelativePath)
                ? "Unstaged all changes"
                : $"Unstaged {tag.RelativePath}";
            RefreshRepositoryViews();
            GitOperationNotifier.ShowSuccess(
                this,
                "Git Reset Complete",
                "The selected staged changes were unstaged successfully.",
                new OperationDetail("Path", FormatGitPathScope(tag.RelativePath)),
                new OperationDetail("Branch", _gitService.GetCurrentBranchName()));
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, "Git Reset Failed", ex);
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
                $"Discard uncommitted changes in {scope}?\nThis cannot be undone.",
                "Git Discard Changes",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Warning) != DialogResult.Yes)
        {
            return;
        }

        try
        {
            GitWorkflowService.DiscardChanges(_gitService.Repo, tag.RelativePath, tag.IsDirectory);
            statusLabel.Text = string.IsNullOrEmpty(tag.RelativePath)
                ? "Discarded all uncommitted changes"
                : $"Discarded changes in {tag.RelativePath}";
            RefreshRepositoryViews();
            GitOperationNotifier.ShowSuccess(
                this,
                "Git Discard Complete",
                "The uncommitted changes were discarded successfully.",
                new OperationDetail("Path", scope),
                new OperationDetail("Branch", _gitService.GetCurrentBranchName()));
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, "Git Discard Failed", ex);
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
            GitOperationNotifier.ShowInfo(this, "Git Commit", "Stage changes with Git Add before committing.");
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
            GitOperationNotifier.ShowSuccess(
                this,
                "Git Commit Complete",
                "The staged changes were committed successfully.",
                new OperationDetail("Commit", commit.Sha[..7]),
                new OperationDetail("Branch", _gitService.GetCurrentBranchName()),
                new OperationDetail("Message", commit.MessageShort.Trim()));
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, "Git Commit Failed", ex);
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
        try
        {
            await OperationProgress.RunAsync(
                this,
                "Fetching from origin...",
                cancellationToken => Task.Run(
                    () => _gitService.RunLocked(activeRepo => GitWorkflowService.Fetch(activeRepo, prompt.Handler, cancellationToken)),
                    cancellationToken),
                onCancelled: CancelPendingRepositoryOperations);
            CaptureGitCredentials(prompt);
            MarkGitCredentialsVerified();
            await RefreshRepositoryViewsAsync(showProgress: false);
            _ = LoadReleasesAsync();
            statusLabel.Text = "Fetched from origin";
            GitOperationNotifier.ShowSuccess(
                this,
                "Git Fetch Complete",
                "Updates were fetched from origin successfully.",
                new OperationDetail("Remote", "origin"),
                new OperationDetail("Branch", _gitService.GetCurrentBranchName()));
        }
        catch (OperationCanceledException)
        {
            statusLabel.Text = "Fetch cancelled";
            GitOperationNotifier.ShowCancelled(this, "Git Fetch");
        }
        catch (Exception ex)
        {
            CaptureGitCredentials(prompt);
            MarkGitCredentialsUnverified();
            GitOperationNotifier.ShowFailure(this, "Git Fetch Failed", ex);
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
        try
        {
            var result = await OperationProgress.RunAsync(
                this,
                "Pulling from origin...",
                cancellationToken => Task.Run(
                    () => _gitService.RunLocked(activeRepo => GitWorkflowService.Pull(activeRepo, prompt.Handler, cancellationToken)),
                    cancellationToken),
                onCancelled: CancelPendingRepositoryOperations);
            CaptureGitCredentials(prompt);
            MarkGitCredentialsVerified();
            await RefreshRepositoryViewsAsync(showProgress: false);
            _ = LoadReleasesAsync();
            statusLabel.Text = $"Pulled {_gitService.GetCurrentBranchName()} from origin";
            GitOperationNotifier.ShowSuccess(
                this,
                "Git Pull Complete",
                "Updates were pulled from origin successfully.",
                new OperationDetail("Remote", "origin"),
                new OperationDetail("Branch", _gitService.GetCurrentBranchName()),
                new OperationDetail("Commit", result.Commit?.Sha?[..7] ?? "(fast-forward)"));
        }
        catch (OperationCanceledException)
        {
            statusLabel.Text = "Pull cancelled";
            GitOperationNotifier.ShowCancelled(this, "Git Pull");
        }
        catch (Exception ex)
        {
            CaptureGitCredentials(prompt);
            MarkGitCredentialsUnverified();
            GitOperationNotifier.ShowFailure(this, "Git Pull Failed", ex);
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

            await OperationProgress.RunAsync(
                this,
                "Pushing to origin...",
                cancellationToken => Task.Run(
                    () => _gitService.RunLocked(activeRepo => GitWorkflowService.Push(activeRepo, prompt.Handler, cancellationToken)),
                    cancellationToken),
                showDelayMs: 800,
                onCancelled: CancelPendingRepositoryOperations);
            CaptureGitCredentials(prompt);
            MarkGitCredentialsVerified();
            statusLabel.Text = $"Pushed {_gitService.GetCurrentBranchName()} to origin";
            GitOperationNotifier.ShowSuccess(
                this,
                "Git Push Complete",
                "The current branch was pushed to origin successfully.",
                new OperationDetail("Branch", _gitService.GetCurrentBranchName()),
                new OperationDetail("Remote", "origin"));
        }
        catch (OperationCanceledException)
        {
            statusLabel.Text = "Push cancelled";
            GitOperationNotifier.ShowCancelled(this, "Git Push");
        }
        catch (Exception ex)
        {
            CaptureGitCredentials(prompt);
            MarkGitCredentialsUnverified();
            GitOperationNotifier.ShowFailure(this, "Git Push Failed", ex);
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
            GitWorkflowService.Stash(_gitService.Repo);
            RefreshRepositoryViews();
            statusLabel.Text = "Stashed uncommitted changes";
            GitOperationNotifier.ShowSuccess(
                this,
                "Git Stash Complete",
                "Uncommitted changes were stashed successfully.",
                new OperationDetail("Branch", _gitService.GetCurrentBranchName()));
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, "Git Stash Failed", ex);
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
            GitWorkflowService.StashPop(_gitService.Repo);
            RefreshRepositoryViews();
            statusLabel.Text = "Applied latest stash";
            GitOperationNotifier.ShowSuccess(
                this,
                "Git Stash Pop Complete",
                "The latest stash was applied successfully.",
                new OperationDetail("Branch", _gitService.GetCurrentBranchName()));
        }
        catch (Exception ex)
        {
            GitOperationNotifier.ShowFailure(this, "Git Stash Pop Failed", ex);
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

        _ = LoadCommitDetailsAsync(commit);
    }

    private async Task LoadCommitDetailsAsync(Commit commit)
    {
        Repository repo = _gitService.Repo!;
        int generation = ++_commitDetailLoadGeneration;

        _currentCommit = commit;
        _currentCommitChanges = null;
        statusLabel.Text = $"{commit.Sha[..7]}  Loading changes...";
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

            statusLabel.Text = "Ready";
            MessageBox.Show(this, ex.Message, "Load Commit Details Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
        _ = LoadSelectedFileDiffAsync();
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
            MessageBox.Show(this, ex.Message, "Load Diff Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
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
