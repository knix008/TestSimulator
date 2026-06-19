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

    private readonly List<ToolStripMenuItem> _fileRecentMenuItems = [];

    private bool _applyingPanelLayout;

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
        graphDetailSplitContainer.SplitterMoved += (_, _) => ApplyPanelLayout();
        commitGraphView.ColumnLayoutChanged += (_, _) => ApplyPanelLayout();
        mainSplitContainer.SplitterMoved += (_, _) => ApplyPanelLayout();
        mainSplitContainer.Panel2.Resize += (_, _) => ApplyPanelLayout();
        detailSplitContainer.Resize += (_, _) => ApplyDetailVerticalLayout();
        fileMenuItem.DropDownOpening += (_, _) => RefreshFileRecentMenu();
        FormClosed += (_, _) => _gitService.Dispose();
        Shown += (_, _) =>
        {
            ApplyPanelLayout();
            ApplyDetailVerticalLayout();
            OpenLastRepositoryIfAvailable();
        };
    }

    private void ApplyPanelLayout()
    {
        ApplyHorizontalPanelLayout();
        ApplyDetailVerticalLayout();
    }

    private void ApplyHorizontalPanelLayout()
    {
        if (_applyingPanelLayout || !IsHandleCreated)
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
        mainToolStrip.ImageScalingSize = new Size(IconFactory.ToolbarIconSize, IconFactory.ToolbarIconSize);
        mainToolStrip.Padding = new Padding(8, 6, 8, 6);
        mainToolStrip.ShowItemToolTips = true;

        ConfigureToolStripButton(openToolButton, IconFactory.Open(IconFactory.ToolbarIconSize), "Open a local Git repository folder");
        ConfigureToolStripButton(cloneToolButton, IconFactory.Clone(IconFactory.ToolbarIconSize), "Clone a remote repository to a local folder");
        ConfigureToolStripButton(refreshTreeToolButton, IconFactory.RefreshTree(IconFactory.ToolbarIconSize), "Reload branches, tags, and releases");
        ConfigureToolStripDropDownButton(exportSummaryToolButton, IconFactory.Report(IconFactory.ToolbarIconSize), "Export repository summary as PDF, Word, or Markdown");
        exportSummaryToolButton.Enabled = false;
        barExportSummaryMenuItem.Enabled = false;
        ConfigureToolStripButton(refreshGraphToolButton, IconFactory.RefreshGraph(IconFactory.ToolbarIconSize), "Reload the commit history graph");
        ConfigureToolStripButton(copyShaToolButton, IconFactory.Copy(IconFactory.ToolbarIconSize), "Copy the selected commit's full hash to the clipboard");
        ConfigureToolStripButton(copyMessageToolButton, IconFactory.Message(IconFactory.ToolbarIconSize), "Copy the selected commit message to the clipboard");
        ConfigureToolStripButton(copyFilePathToolButton, IconFactory.File(IconFactory.ToolbarIconSize), "Copy the selected file path to the clipboard");
        ConfigureToolStripButton(wordWrapToolButton, IconFactory.WordWrap(IconFactory.ToolbarIconSize), "Toggle word wrap for the diff view");
        ConfigureToolStripButton(copyDiffToolButton, IconFactory.Copy(IconFactory.ToolbarIconSize), "Copy the visible diff text to the clipboard");
        ConfigureToolStripButton(infoToolButton, IconFactory.InfoToolbar(IconFactory.ToolbarIconSize), "Show application information");
    }

    private void ConfigureMenuIcons()
    {
        menuStrip.ImageScalingSize = new Size(16, 16);
        menuStrip.ShowItemToolTips = true;
        menuStrip.Padding = new Padding(4, 2, 4, 2);
        menuStrip.Renderer = _menuRenderer;
        menuStrip.AutoSize = false;
        menuStrip.Height = MenuStripRootIconRenderer.RootMenuHeight;

        ConfigureRootMenuIcon(fileMenuItem, IconFactory.Folder());
        ConfigureRootMenuIcon(repositoryMenuItem, IconFactory.RefreshTree());
        ConfigureRootMenuIcon(historyMenuItem, IconFactory.RefreshGraph());
        ConfigureRootMenuIcon(diffMenuItem, IconFactory.WordWrap());
        ConfigureRootMenuIcon(helpMenuItem, IconFactory.InfoMenu());
        ConfigureDropDownMenu(fileMenuItem);
        ConfigureDropDownMenu(repositoryMenuItem);
        ConfigureDropDownMenu(historyMenuItem);
        ConfigureDropDownMenu(diffMenuItem);
        ConfigureDropDownMenu(helpMenuItem);

        ConfigureMenuItem(openRepositoryMenuItem, IconFactory.Open(), "&Open...");
        ConfigureMenuItem(cloneRepositoryMenuItem, IconFactory.Clone(), "&Clone...");
        ConfigureMenuItem(exitMenuItem, IconFactory.Exit(), "E&xit");
        ConfigureMenuItem(refreshTreeMenuItem, IconFactory.RefreshTree(), "Refresh &Tree");
        ConfigureExportSummaryMenu(barExportSummaryMenuItem);
        ConfigureMenuItem(refreshGraphMenuItem, IconFactory.RefreshGraph(), "Refresh &Graph");
        ConfigureMenuItem(copyShaMenuItem, IconFactory.Copy(), "Copy &SHA");
        ConfigureMenuItem(copyMessageMenuItem, IconFactory.Message(), "Copy &Message");
        ConfigureMenuItem(copyPathMenuItem, IconFactory.File(), "Copy &Path");
        ConfigureMenuItem(wordWrapMenuItem, IconFactory.WordWrap(), "Word &Wrap");
        ConfigureMenuItem(copyDiffMenuItem, IconFactory.Copy(), "Copy &Diff");
        ConfigureMenuItem(aboutMenuItem, IconFactory.Info(), "&About");

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
    }

    private void ConfigureExportSummaryMenu(ToolStripMenuItem parent)
    {
        ConfigureMenuItem(parent, IconFactory.Report(), "Export Summary");
        foreach (ToolStripItem child in parent.DropDownItems)
        {
            if (child is ToolStripMenuItem menuItem)
            {
                ConfigureDropDownItem(menuItem);
            }
        }
    }

    private void ConfigureContextMenu(ContextMenuStrip menu, params (ToolStripMenuItem Item, Image Icon, string Text)[] items)
    {
        menu.Renderer = _menuRenderer;
        menu.ShowImageMargin = false;
        menu.AutoSize = true;
        menu.Padding = new Padding(1);

        foreach (var (item, icon, text) in items)
        {
            ConfigureMenuItem(item, icon, text);
        }
    }

    private static void ConfigureMenuItem(ToolStripMenuItem item, Image icon, string text)
    {
        item.Text = text;
        SetMenuIcon(item, icon);
        ConfigureDropDownItem(item);
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
        menuItem.DropDown.MinimumSize = Size.Empty;
    }

    private static void ConfigureDropDownItem(ToolStripMenuItem item)
    {
        item.AutoSize = true;
        item.DisplayStyle = ToolStripItemDisplayStyle.Text;
        item.Font = new Font(item.Font.FontFamily, MenuStripRootIconRenderer.DropDownMenuFontSize, FontStyle.Regular);
        item.ForeColor = Color.FromArgb(30, 41, 59);
        item.Padding = MenuStripRootIconRenderer.DropDownMenuPadding;
        item.Margin = Padding.Empty;
    }

    private static void ConfigureRootMenuIcon(ToolStripMenuItem item, Image icon)
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
        button.Image = icon;
        button.ImageScaling = ToolStripItemImageScaling.None;
        button.DisplayStyle = ToolStripItemDisplayStyle.Image;
        button.Padding = new Padding(4);
        button.Margin = new Padding(2, 0, 2, 0);
        button.ToolTipText = toolTipText;
    }

    private static void ConfigureToolStripDropDownButton(ToolStripDropDownButton button, Image icon, string toolTipText)
    {
        button.Image = icon;
        button.ImageScaling = ToolStripItemImageScaling.None;
        button.DisplayStyle = ToolStripItemDisplayStyle.Image;
        button.Padding = new Padding(4);
        button.Margin = new Padding(2, 0, 2, 0);
        button.ToolTipText = toolTipText;
        button.ShowDropDownArrow = false;
    }

    private void OpenLastRepositoryIfAvailable()
    {
        if (string.IsNullOrWhiteSpace(_settings.LastRepositoryPath))
        {
            return;
        }

        statusLabel.Text = "Opening last repository...";
        TryOpenRepository(_settings.LastRepositoryPath, showErrorOnFailure: false);
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
            _gitService.OpenLocal(path);
            statusLabel.Text = $"Branch: {_gitService.GetCurrentBranchName()}";
            RefreshRepositoryViews();

            if (!string.IsNullOrWhiteSpace(_gitService.RepositoryPath))
            {
                _settings.RecordRecentRepository(_gitService.RepositoryPath);
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
        ConfigureMenuItem(item, IconFactory.Folder(), label);
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
            return;
        }

        BranchTagTreePopulator.Populate(repoTreeView, _gitService.Repo);
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
            barExportSummaryMenuItem.Enabled = false;
            return;
        }

        string folderName = Path.GetFileName(_gitService.RepositoryPath.TrimEnd(Path.DirectorySeparatorChar));
        string branch = _gitService.GetCurrentBranchName();
        repoInfoLabel.Text = $"{folderName}  ·  {branch}\n{_gitService.RepositoryPath}";
        exportSummaryToolButton.Enabled = true;
        barExportSummaryMenuItem.Enabled = true;
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
        bool isCheckoutableBranch = repoTreeView.SelectedNode?.Tag is Branch branch && !branch.IsRemote;
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

        string repoName = Path.GetFileName(_gitService.RepositoryPath.TrimEnd(Path.DirectorySeparatorChar));
        if (string.IsNullOrEmpty(repoName))
        {
            repoName = "repository";
        }

        string extension = format switch
        {
            "pdf" => ".pdf",
            "docx" => ".docx",
            "md" => ".md",
            _ => ".txt"
        };

        using var dialog = new SaveFileDialog
        {
            Title = "Export Repository Summary",
            Filter = format switch
            {
                "pdf" => "PDF document (*.pdf)|*.pdf",
                "docx" => "Word document (*.docx)|*.docx",
                "md" => "Markdown document (*.md)|*.md",
                _ => "All files (*.*)|*.*"
            },
            FileName = $"{repoName}-summary{extension}",
            DefaultExt = extension.TrimStart('.'),
            AddExtension = true,
            OverwritePrompt = true
        };

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        try
        {
            var summary = RepositorySummaryBuilder.Build(
                _gitService.Repo,
                _gitService.RepositoryPath,
                CollectReleaseSummaries());

            RepositorySummaryExportService.Export(summary, dialog.FileName);
            statusLabel.Text = $"Exported summary to {dialog.FileName}";
            ShowOperationComplete(
                "Export Complete",
                "The repository summary was exported successfully.",
                null,
                new OperationDetail("Repository", summary.RepositoryName),
                new OperationDetail("Branch", summary.CurrentBranch),
                new OperationDetail("Format", GetExportFormatDisplayName(format)),
                new OperationDetail("File", dialog.FileName));
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Export Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
            var releases = await GitHubReleaseService.GetReleasesAsync(parsed.Value.Owner, parsed.Value.Repo);
            var items = releases.Select(release =>
            {
                var label = string.IsNullOrWhiteSpace(release.Name) ? release.TagName : release.Name;
                var toolTip = $"{label}\nTag: {release.TagName}\n{release.PublishedAt:yyyy-MM-dd}";
                return (label, (object?)release, (string?)toolTip);
            }).ToList();

            BranchTagTreePopulator.SetReleaseNodes(releasesNode, items);
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

        var commits = _gitService.Repo.Commits.QueryBy(new CommitFilter
        {
            IncludeReachableFrom = _gitService.Repo.Head,
            SortBy = CommitSortStrategies.Topological | CommitSortStrategies.Time
        }).ToList();

        commitGraphView.SetRows(CommitGraphBuilder.Build(commits));
    }

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
