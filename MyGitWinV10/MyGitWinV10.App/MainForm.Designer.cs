using MyGitWinV10.App.Controls;

namespace MyGitWinV10.App
{
    partial class MainForm
    {
        /// <summary>
        ///  Required designer variable.
        /// </summary>
        private System.ComponentModel.IContainer components = null;

        /// <summary>
        ///  Clean up any resources being used.
        /// </summary>
        /// <param name="disposing">true if managed resources should be disposed; otherwise, false.</param>
        protected override void Dispose(bool disposing)
        {
            if (disposing && (components != null))
            {
                components.Dispose();
            }
            base.Dispose(disposing);
        }

        #region Windows Form Designer generated code

        /// <summary>
        ///  Required method for Designer support - do not modify
        ///  the contents of this method with the code editor.
        /// </summary>
        private void InitializeComponent()
        {
            components = new System.ComponentModel.Container();
            System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
            toolTip = new ToolTip(components);
            repoTreeView = new TreeView();
            repoTreeContextMenu = new ContextMenuStrip(components);
            checkoutContextMenuItem = new ToolStripMenuItem();
            copyBranchNameContextMenuItem = new ToolStripMenuItem();
            repoTreeExportSeparator = new ToolStripSeparator();
            exportSummaryMenuItem = new ToolStripMenuItem();
            exportSummaryPdfMenuItem = new ToolStripMenuItem();
            exportSummaryWordMenuItem = new ToolStripMenuItem();
            exportSummaryMarkdownMenuItem = new ToolStripMenuItem();
            commitMetaLabel = new Label();
            changedFilesListView = new ListView();
            changedFilesContextMenu = new ContextMenuStrip(components);
            copyFilePathContextMenuItem = new ToolStripMenuItem();
            diffTextBox = new RichTextBox();
            repoInfoLabel = new SectionInfoLabel();
            repoInfoContextMenu = new ContextMenuStrip(components);
            exportSummaryInfoMenuItem = new ToolStripMenuItem();
            exportSummaryInfoPdfMenuItem = new ToolStripMenuItem();
            exportSummaryInfoWordMenuItem = new ToolStripMenuItem();
            exportSummaryInfoMarkdownMenuItem = new ToolStripMenuItem();
            commitGraphView = new CommitGraphView();
            commitGraphContextMenu = new ContextMenuStrip(components);
            copyShaContextMenuItem = new ToolStripMenuItem();
            copyMessageContextMenuItem = new ToolStripMenuItem();
            exportCommitContextMenuItem = new ToolStripMenuItem();
            changedFilesTitleLabel = new SectionTitleLabel();
            menuStrip = new MenuStrip();
            fileMenuItem = new ToolStripMenuItem();
            openRepositoryMenuItem = new ToolStripMenuItem();
            cloneRepositoryMenuItem = new ToolStripMenuItem();
            browseRemoteRepositoryMenuItem = new ToolStripMenuItem();
            fileRecentSeparator = new ToolStripSeparator();
            fileMenuSeparator = new ToolStripSeparator();
            exitMenuItem = new ToolStripMenuItem();
            repositoryMenuItem = new ToolStripMenuItem();
            refreshTreeMenuItem = new ToolStripMenuItem();
            barExportSummaryWordMenuItem = new ToolStripMenuItem();
            barExportSummaryMarkdownMenuItem = new ToolStripMenuItem();
            barExportSummaryPdfMenuItem = new ToolStripMenuItem();
            historyMenuItem = new ToolStripMenuItem();
            refreshGraphMenuItem = new ToolStripMenuItem();
            copyShaMenuItem = new ToolStripMenuItem();
            copyMessageMenuItem = new ToolStripMenuItem();
            diffMenuItem = new ToolStripMenuItem();
            copyPathMenuItem = new ToolStripMenuItem();
            wordWrapMenuItem = new ToolStripMenuItem();
            copyDiffMenuItem = new ToolStripMenuItem();
            helpMenuItem = new ToolStripMenuItem();
            aboutMenuItem = new ToolStripMenuItem();
            statusStrip = new StatusStrip();
            statusLabel = new ToolStripStatusLabel();
            repoLoadProgressBar = new ToolStripProgressBar();
            repoCountsStatusLabel = new ToolStripStatusLabel();
            mainSplitContainer = new SplitContainer();
            leftSideSplitContainer = new SplitContainer();
            repoTreePanel = new Panel();
            repoTitleLabel = new SectionTitleLabel();
            repoFilesPanel = new Panel();
            repoFilesTreeView = new TreeView();
            repoFilesContextMenu = new ContextMenuStrip(components);
            showFileLogContextMenuItem = new ToolStripMenuItem();
            repoFilesGitSeparator = new ToolStripSeparator();
            gitAddContextMenuItem = new ToolStripMenuItem();
            gitResetContextMenuItem = new ToolStripMenuItem();
            gitDiscardContextMenuItem = new ToolStripMenuItem();
            gitStagingSeparator = new ToolStripSeparator();
            gitCommitContextMenuItem = new ToolStripMenuItem();
            gitRemoteSeparator = new ToolStripSeparator();
            gitFetchContextMenuItem = new ToolStripMenuItem();
            gitPullContextMenuItem = new ToolStripMenuItem();
            gitPushContextMenuItem = new ToolStripMenuItem();
            gitStashSeparator = new ToolStripSeparator();
            gitStashContextMenuItem = new ToolStripMenuItem();
            gitStashPopContextMenuItem = new ToolStripMenuItem();
            gitStatusContextMenuItem = new ToolStripMenuItem();
            copyRepoFilePathContextMenuItem = new ToolStripMenuItem();
            clearFileLogFilterContextMenuItem = new ToolStripMenuItem();
            repoFilesTitleLabel = new SectionTitleLabel();
            graphDetailSplitContainer = new SplitContainer();
            graphPanel = new Panel();
            graphTitleLabel = new SectionTitleLabel();
            detailSplitContainer = new SplitContainer();
            filesPanel = new Panel();
            filesTitleLabel = new SectionTitleLabel();
            diffPanel = new Panel();
            diffTitleLabel = new SectionTitleLabel();
            mainToolStrip = new ToolStrip();
            openToolButton = new ToolStripButton();
            cloneToolButton = new ToolStripButton();
            browseRemoteToolButton = new ToolStripButton();
            refreshTreeToolButton = new ToolStripButton();
            exportSummaryToolButton = new ToolStripDropDownButton();
            exportSummaryToolPdfItem = new ToolStripMenuItem();
            exportSummaryToolWordItem = new ToolStripMenuItem();
            exportSummaryToolMarkdownItem = new ToolStripMenuItem();
            mainToolStripSeparator1 = new ToolStripSeparator();
            refreshGraphToolButton = new ToolStripButton();
            copyShaToolButton = new ToolStripButton();
            copyMessageToolButton = new ToolStripButton();
            mainToolStripSeparator2 = new ToolStripSeparator();
            copyFilePathToolButton = new ToolStripButton();
            mainToolStripSeparator3 = new ToolStripSeparator();
            wordWrapToolButton = new ToolStripButton();
            copyDiffToolButton = new ToolStripButton();
            infoToolButton = new ToolStripButton();
            repoTreeContextMenu.SuspendLayout();
            changedFilesContextMenu.SuspendLayout();
            repoInfoContextMenu.SuspendLayout();
            commitGraphContextMenu.SuspendLayout();
            menuStrip.SuspendLayout();
            statusStrip.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)mainSplitContainer).BeginInit();
            mainSplitContainer.Panel1.SuspendLayout();
            mainSplitContainer.Panel2.SuspendLayout();
            mainSplitContainer.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)leftSideSplitContainer).BeginInit();
            leftSideSplitContainer.Panel1.SuspendLayout();
            leftSideSplitContainer.Panel2.SuspendLayout();
            leftSideSplitContainer.SuspendLayout();
            repoTreePanel.SuspendLayout();
            repoFilesPanel.SuspendLayout();
            repoFilesContextMenu.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)graphDetailSplitContainer).BeginInit();
            graphDetailSplitContainer.Panel1.SuspendLayout();
            graphDetailSplitContainer.Panel2.SuspendLayout();
            graphDetailSplitContainer.SuspendLayout();
            graphPanel.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)detailSplitContainer).BeginInit();
            detailSplitContainer.Panel1.SuspendLayout();
            detailSplitContainer.Panel2.SuspendLayout();
            detailSplitContainer.SuspendLayout();
            filesPanel.SuspendLayout();
            diffPanel.SuspendLayout();
            mainToolStrip.SuspendLayout();
            SuspendLayout();
            // 
            // repoTreeView
            // 
            repoTreeView.BackColor = Color.FromArgb(250, 250, 251);
            repoTreeView.BorderStyle = BorderStyle.None;
            repoTreeView.ContextMenuStrip = repoTreeContextMenu;
            repoTreeView.Dock = DockStyle.Fill;
            repoTreeView.FullRowSelect = true;
            repoTreeView.HideSelection = false;
            repoTreeView.Location = new Point(1, 80);
            repoTreeView.Name = "repoTreeView";
            repoTreeView.ShowNodeToolTips = true;
            repoTreeView.Size = new Size(296, 377);
            repoTreeView.TabIndex = 0;
            toolTip.SetToolTip(repoTreeView, "Local/remote branches, tags, and releases. Double-click a local branch to check it out.");
            repoTreeView.AfterSelect += RepoTreeView_AfterSelect;
            repoTreeView.NodeMouseClick += RepoTreeView_NodeMouseClick;
            repoTreeView.NodeMouseDoubleClick += RepoTreeView_NodeMouseDoubleClick;
            // 
            // repoTreeContextMenu
            // 
            repoTreeContextMenu.Items.AddRange(new ToolStripItem[] { checkoutContextMenuItem, copyBranchNameContextMenuItem, repoTreeExportSeparator, exportSummaryMenuItem });
            repoTreeContextMenu.Name = "repoTreeContextMenu";
            repoTreeContextMenu.Size = new Size(165, 76);
            repoTreeContextMenu.Opening += RepoTreeContextMenu_Opening;
            // 
            // checkoutContextMenuItem
            // 
            checkoutContextMenuItem.Name = "checkoutContextMenuItem";
            checkoutContextMenuItem.Size = new Size(164, 22);
            checkoutContextMenuItem.Text = "Checkout";
            checkoutContextMenuItem.ToolTipText = "Check out this local branch";
            checkoutContextMenuItem.Click += CheckoutContextMenuItem_Click;
            // 
            // copyBranchNameContextMenuItem
            // 
            copyBranchNameContextMenuItem.Name = "copyBranchNameContextMenuItem";
            copyBranchNameContextMenuItem.Size = new Size(164, 22);
            copyBranchNameContextMenuItem.Text = "Copy Name";
            copyBranchNameContextMenuItem.ToolTipText = "Copy the branch name to the clipboard";
            copyBranchNameContextMenuItem.Click += CopyBranchNameContextMenuItem_Click;
            // 
            // repoTreeExportSeparator
            // 
            repoTreeExportSeparator.Name = "repoTreeExportSeparator";
            repoTreeExportSeparator.Size = new Size(161, 6);
            // 
            // exportSummaryMenuItem
            // 
            exportSummaryMenuItem.DropDownItems.AddRange(new ToolStripItem[] { exportSummaryPdfMenuItem, exportSummaryWordMenuItem, exportSummaryMarkdownMenuItem });
            exportSummaryMenuItem.Name = "exportSummaryMenuItem";
            exportSummaryMenuItem.Size = new Size(164, 22);
            exportSummaryMenuItem.Text = "Export Summary";
            exportSummaryMenuItem.ToolTipText = "Export repository summary as a report";
            // 
            // exportSummaryPdfMenuItem
            // 
            exportSummaryPdfMenuItem.Name = "exportSummaryPdfMenuItem";
            exportSummaryPdfMenuItem.Size = new Size(164, 22);
            exportSummaryPdfMenuItem.Tag = "pdf";
            exportSummaryPdfMenuItem.Text = "PDF (.pdf)";
            exportSummaryPdfMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // exportSummaryWordMenuItem
            // 
            exportSummaryWordMenuItem.Name = "exportSummaryWordMenuItem";
            exportSummaryWordMenuItem.Size = new Size(164, 22);
            exportSummaryWordMenuItem.Tag = "docx";
            exportSummaryWordMenuItem.Text = "Word (.docx)";
            exportSummaryWordMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // exportSummaryMarkdownMenuItem
            // 
            exportSummaryMarkdownMenuItem.Name = "exportSummaryMarkdownMenuItem";
            exportSummaryMarkdownMenuItem.Size = new Size(164, 22);
            exportSummaryMarkdownMenuItem.Tag = "md";
            exportSummaryMarkdownMenuItem.Text = "Markdown (.md)";
            exportSummaryMarkdownMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // commitMetaLabel
            // 
            commitMetaLabel.BackColor = Color.FromArgb(245, 246, 248);
            commitMetaLabel.Dock = DockStyle.Top;
            commitMetaLabel.Location = new Point(1, 31);
            commitMetaLabel.Name = "commitMetaLabel";
            commitMetaLabel.Padding = new Padding(10, 8, 10, 8);
            commitMetaLabel.Size = new Size(311, 84);
            commitMetaLabel.TabIndex = 1;
            commitMetaLabel.Text = "Select a commit to see its details.";
            toolTip.SetToolTip(commitMetaLabel, "Author, date, and message of the selected commit or release.");
            // 
            // changedFilesListView
            // 
            changedFilesListView.BackColor = Color.FromArgb(250, 250, 251);
            changedFilesListView.BorderStyle = BorderStyle.None;
            changedFilesListView.ContextMenuStrip = changedFilesContextMenu;
            changedFilesListView.Dock = DockStyle.Fill;
            changedFilesListView.FullRowSelect = true;
            changedFilesListView.GridLines = true;
            changedFilesListView.HeaderStyle = ColumnHeaderStyle.Nonclickable;
            changedFilesListView.Location = new Point(1, 145);
            changedFilesListView.MultiSelect = false;
            changedFilesListView.Name = "changedFilesListView";
            changedFilesListView.Size = new Size(311, 207);
            changedFilesListView.TabIndex = 0;
            toolTip.SetToolTip(changedFilesListView, "Files changed in the selected commit. Click a file to view its diff.");
            changedFilesListView.UseCompatibleStateImageBehavior = false;
            changedFilesListView.View = View.Details;
            changedFilesListView.SelectedIndexChanged += ChangedFilesListView_SelectedIndexChanged;
            changedFilesListView.MouseDown += ChangedFilesListView_MouseDown;
            // 
            // changedFilesContextMenu
            // 
            changedFilesContextMenu.Items.AddRange(new ToolStripItem[] { copyFilePathContextMenuItem });
            changedFilesContextMenu.Name = "changedFilesContextMenu";
            changedFilesContextMenu.Size = new Size(131, 26);
            // 
            // copyFilePathContextMenuItem
            // 
            copyFilePathContextMenuItem.Name = "copyFilePathContextMenuItem";
            copyFilePathContextMenuItem.Size = new Size(130, 22);
            copyFilePathContextMenuItem.Text = "Copy Path";
            copyFilePathContextMenuItem.ToolTipText = "Copy the selected file path to the clipboard";
            copyFilePathContextMenuItem.Click += CopyFilePathContextMenuItem_Click;
            // 
            // diffTextBox
            // 
            diffTextBox.BackColor = Color.White;
            diffTextBox.BorderStyle = BorderStyle.None;
            diffTextBox.Dock = DockStyle.Fill;
            diffTextBox.Font = new Font("Consolas", 9.5F);
            diffTextBox.Location = new Point(1, 31);
            diffTextBox.Name = "diffTextBox";
            diffTextBox.ReadOnly = true;
            diffTextBox.Size = new Size(311, 486);
            diffTextBox.TabIndex = 0;
            diffTextBox.Text = "";
            toolTip.SetToolTip(diffTextBox, "Unified diff of the selected file.");
            diffTextBox.WordWrap = false;
            // 
            // repoInfoLabel
            // 
            repoInfoLabel.BackColor = Color.FromArgb(238, 242, 255);
            repoInfoLabel.ContextMenuStrip = repoInfoContextMenu;
            repoInfoLabel.Dock = DockStyle.Top;
            repoInfoLabel.Font = new Font("Segoe UI", 9F);
            repoInfoLabel.ForeColor = Color.FromArgb(55, 48, 163);
            repoInfoLabel.Location = new Point(1, 31);
            repoInfoLabel.Name = "repoInfoLabel";
            repoInfoLabel.Padding = new Padding(12, 8, 10, 8);
            repoInfoLabel.Size = new Size(296, 49);
            repoInfoLabel.TabIndex = 2;
            repoInfoLabel.Text = "No repository open";
            repoInfoLabel.TextAlign = ContentAlignment.MiddleLeft;
            toolTip.SetToolTip(repoInfoLabel, "Current repository folder and checked-out branch.");
            repoInfoLabel.UseCompatibleTextRendering = true;
            // 
            // repoInfoContextMenu
            // 
            repoInfoContextMenu.Items.AddRange(new ToolStripItem[] { exportSummaryInfoMenuItem });
            repoInfoContextMenu.Name = "repoInfoContextMenu";
            repoInfoContextMenu.Size = new Size(165, 26);
            repoInfoContextMenu.Opening += RepoInfoContextMenu_Opening;
            // 
            // exportSummaryInfoMenuItem
            // 
            exportSummaryInfoMenuItem.DropDownItems.AddRange(new ToolStripItem[] { exportSummaryInfoPdfMenuItem, exportSummaryInfoWordMenuItem, exportSummaryInfoMarkdownMenuItem });
            exportSummaryInfoMenuItem.Name = "exportSummaryInfoMenuItem";
            exportSummaryInfoMenuItem.Size = new Size(164, 22);
            exportSummaryInfoMenuItem.Text = "Export Summary";
            exportSummaryInfoMenuItem.ToolTipText = "Export repository summary as a report";
            // 
            // exportSummaryInfoPdfMenuItem
            // 
            exportSummaryInfoPdfMenuItem.Name = "exportSummaryInfoPdfMenuItem";
            exportSummaryInfoPdfMenuItem.Size = new Size(164, 22);
            exportSummaryInfoPdfMenuItem.Tag = "pdf";
            exportSummaryInfoPdfMenuItem.Text = "PDF (.pdf)";
            exportSummaryInfoPdfMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // exportSummaryInfoWordMenuItem
            // 
            exportSummaryInfoWordMenuItem.Name = "exportSummaryInfoWordMenuItem";
            exportSummaryInfoWordMenuItem.Size = new Size(164, 22);
            exportSummaryInfoWordMenuItem.Tag = "docx";
            exportSummaryInfoWordMenuItem.Text = "Word (.docx)";
            exportSummaryInfoWordMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // exportSummaryInfoMarkdownMenuItem
            // 
            exportSummaryInfoMarkdownMenuItem.Name = "exportSummaryInfoMarkdownMenuItem";
            exportSummaryInfoMarkdownMenuItem.Size = new Size(164, 22);
            exportSummaryInfoMarkdownMenuItem.Tag = "md";
            exportSummaryInfoMarkdownMenuItem.Text = "Markdown (.md)";
            exportSummaryInfoMarkdownMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // commitGraphView
            // 
            commitGraphView.BackColor = Color.FromArgb(250, 250, 251);
            commitGraphView.ContextMenuStrip = commitGraphContextMenu;
            commitGraphView.Dock = DockStyle.Fill;
            commitGraphView.Location = new Point(1, 31);
            commitGraphView.Name = "commitGraphView";
            commitGraphView.Size = new Size(973, 845);
            commitGraphView.TabIndex = 0;
            commitGraphView.CommitSelected += CommitGraphView_CommitSelected;
            // 
            // commitGraphContextMenu
            // 
            commitGraphContextMenu.Items.AddRange(new ToolStripItem[] { copyShaContextMenuItem, copyMessageContextMenuItem, exportCommitContextMenuItem });
            commitGraphContextMenu.Name = "commitGraphContextMenu";
            commitGraphContextMenu.Size = new Size(170, 70);
            // 
            // copyShaContextMenuItem
            // 
            copyShaContextMenuItem.Name = "copyShaContextMenuItem";
            copyShaContextMenuItem.Size = new Size(169, 22);
            copyShaContextMenuItem.Text = "Copy SHA";
            copyShaContextMenuItem.ToolTipText = "Copy the full commit hash to the clipboard";
            copyShaContextMenuItem.Click += CopyShaContextMenuItem_Click;
            // 
            // copyMessageContextMenuItem
            // 
            copyMessageContextMenuItem.Name = "copyMessageContextMenuItem";
            copyMessageContextMenuItem.Size = new Size(169, 22);
            copyMessageContextMenuItem.Text = "Copy Message";
            copyMessageContextMenuItem.ToolTipText = "Copy the commit message to the clipboard";
            copyMessageContextMenuItem.Click += CopyMessageContextMenuItem_Click;
            // 
            // exportCommitContextMenuItem
            // 
            exportCommitContextMenuItem.Name = "exportCommitContextMenuItem";
            exportCommitContextMenuItem.Size = new Size(169, 22);
            exportCommitContextMenuItem.Text = "Export to Folder...";
            exportCommitContextMenuItem.ToolTipText = "Save this commit snapshot to a separate folder";
            exportCommitContextMenuItem.Click += ExportCommitContextMenuItem_Click;
            // 
            // changedFilesTitleLabel
            // 
            changedFilesTitleLabel.BackColor = Color.FromArgb(255, 247, 237);
            changedFilesTitleLabel.Dock = DockStyle.Top;
            changedFilesTitleLabel.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            changedFilesTitleLabel.ForeColor = Color.FromArgb(154, 52, 18);
            changedFilesTitleLabel.Location = new Point(1, 115);
            changedFilesTitleLabel.Name = "changedFilesTitleLabel";
            changedFilesTitleLabel.Padding = new Padding(12, 0, 10, 0);
            changedFilesTitleLabel.Section = SectionTitleKind.ChangedFiles;
            changedFilesTitleLabel.Size = new Size(311, 30);
            changedFilesTitleLabel.TabIndex = 2;
            changedFilesTitleLabel.Text = "Changed Files";
            changedFilesTitleLabel.TextAlign = ContentAlignment.MiddleLeft;
            changedFilesTitleLabel.UseCompatibleTextRendering = true;
            // 
            // menuStrip
            // 
            menuStrip.BackColor = Color.FromArgb(250, 250, 251);
            menuStrip.Items.AddRange(new ToolStripItem[] { fileMenuItem, repositoryMenuItem, historyMenuItem, diffMenuItem, helpMenuItem });
            menuStrip.Location = new Point(0, 0);
            menuStrip.Name = "menuStrip";
            menuStrip.Size = new Size(1600, 24);
            menuStrip.TabIndex = 1;
            // 
            // fileMenuItem
            // 
            fileMenuItem.DropDownItems.AddRange(new ToolStripItem[] { openRepositoryMenuItem, cloneRepositoryMenuItem, browseRemoteRepositoryMenuItem, fileRecentSeparator, fileMenuSeparator, exitMenuItem });
            fileMenuItem.Name = "fileMenuItem";
            fileMenuItem.Size = new Size(37, 20);
            fileMenuItem.Text = "&File";
            // 
            // openRepositoryMenuItem
            // 
            openRepositoryMenuItem.Name = "openRepositoryMenuItem";
            openRepositoryMenuItem.ShortcutKeys = Keys.Control | Keys.O;
            openRepositoryMenuItem.ShowShortcutKeys = false;
            openRepositoryMenuItem.Size = new Size(159, 22);
            openRepositoryMenuItem.Text = "&Open...";
            openRepositoryMenuItem.ToolTipText = "Open a local Git repository folder";
            openRepositoryMenuItem.Click += OpenRepositoryMenuItem_Click;
            // 
            // cloneRepositoryMenuItem
            // 
            cloneRepositoryMenuItem.Name = "cloneRepositoryMenuItem";
            cloneRepositoryMenuItem.ShortcutKeys = Keys.Control | Keys.Shift | Keys.O;
            cloneRepositoryMenuItem.ShowShortcutKeys = false;
            cloneRepositoryMenuItem.Size = new Size(159, 22);
            cloneRepositoryMenuItem.Text = "&Clone...";
            cloneRepositoryMenuItem.ToolTipText = "Clone a remote repository to a local folder";
            cloneRepositoryMenuItem.Click += CloneRepositoryMenuItem_Click;
            // 
            // browseRemoteRepositoryMenuItem
            // 
            browseRemoteRepositoryMenuItem.Name = "browseRemoteRepositoryMenuItem";
            browseRemoteRepositoryMenuItem.ShortcutKeys = Keys.Control | Keys.Shift | Keys.B;
            browseRemoteRepositoryMenuItem.ShowShortcutKeys = false;
            browseRemoteRepositoryMenuItem.Size = new Size(159, 22);
            browseRemoteRepositoryMenuItem.Text = "Browse &Remote...";
            browseRemoteRepositoryMenuItem.ToolTipText = "Browse remote commit history without saving a local copy";
            browseRemoteRepositoryMenuItem.Click += BrowseRemoteRepositoryMenuItem_Click;
            // 
            // fileRecentSeparator
            // 
            fileRecentSeparator.Name = "fileRecentSeparator";
            fileRecentSeparator.Size = new Size(156, 6);
            // 
            // fileMenuSeparator
            // 
            fileMenuSeparator.Name = "fileMenuSeparator";
            fileMenuSeparator.Size = new Size(156, 6);
            // 
            // exitMenuItem
            // 
            exitMenuItem.Name = "exitMenuItem";
            exitMenuItem.ShortcutKeys = Keys.Alt | Keys.F4;
            exitMenuItem.ShowShortcutKeys = false;
            exitMenuItem.Size = new Size(159, 22);
            exitMenuItem.Text = "E&xit";
            exitMenuItem.ToolTipText = "Close the application";
            exitMenuItem.Click += ExitMenuItem_Click;
            // 
            // repositoryMenuItem
            // 
            repositoryMenuItem.DropDownItems.AddRange(new ToolStripItem[] { refreshTreeMenuItem, barExportSummaryWordMenuItem, barExportSummaryMarkdownMenuItem, barExportSummaryPdfMenuItem });
            repositoryMenuItem.Name = "repositoryMenuItem";
            repositoryMenuItem.Size = new Size(75, 20);
            repositoryMenuItem.Text = "&Repository";
            // 
            // refreshTreeMenuItem
            // 
            refreshTreeMenuItem.Name = "refreshTreeMenuItem";
            refreshTreeMenuItem.ShortcutKeys = Keys.F5;
            refreshTreeMenuItem.ShowShortcutKeys = false;
            refreshTreeMenuItem.Size = new Size(177, 22);
            refreshTreeMenuItem.Text = "Refresh &Tree";
            refreshTreeMenuItem.ToolTipText = "Reload branches, tags, and releases";
            refreshTreeMenuItem.Click += RefreshTreeToolButton_Click;
            // 
            // barExportSummaryWordMenuItem
            // 
            barExportSummaryWordMenuItem.Name = "barExportSummaryWordMenuItem";
            barExportSummaryWordMenuItem.ShortcutKeys = Keys.Control | Keys.Alt | Keys.W;
            barExportSummaryWordMenuItem.ShowShortcutKeys = false;
            barExportSummaryWordMenuItem.Size = new Size(177, 22);
            barExportSummaryWordMenuItem.Tag = "docx";
            barExportSummaryWordMenuItem.Text = "Export to &Word";
            barExportSummaryWordMenuItem.ToolTipText = "Export repository summary as a Word document";
            barExportSummaryWordMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // barExportSummaryMarkdownMenuItem
            // 
            barExportSummaryMarkdownMenuItem.Name = "barExportSummaryMarkdownMenuItem";
            barExportSummaryMarkdownMenuItem.ShortcutKeys = Keys.Control | Keys.Alt | Keys.M;
            barExportSummaryMarkdownMenuItem.ShowShortcutKeys = false;
            barExportSummaryMarkdownMenuItem.Size = new Size(177, 22);
            barExportSummaryMarkdownMenuItem.Tag = "md";
            barExportSummaryMarkdownMenuItem.Text = "Export to &Markdown";
            barExportSummaryMarkdownMenuItem.ToolTipText = "Export repository summary as a Markdown file";
            barExportSummaryMarkdownMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // barExportSummaryPdfMenuItem
            // 
            barExportSummaryPdfMenuItem.Name = "barExportSummaryPdfMenuItem";
            barExportSummaryPdfMenuItem.ShortcutKeys = Keys.Control | Keys.Alt | Keys.P;
            barExportSummaryPdfMenuItem.ShowShortcutKeys = false;
            barExportSummaryPdfMenuItem.Size = new Size(177, 22);
            barExportSummaryPdfMenuItem.Tag = "pdf";
            barExportSummaryPdfMenuItem.Text = "Export to &PDF";
            barExportSummaryPdfMenuItem.ToolTipText = "Export repository summary as a PDF report";
            barExportSummaryPdfMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // historyMenuItem
            // 
            historyMenuItem.DropDownItems.AddRange(new ToolStripItem[] { refreshGraphMenuItem, copyShaMenuItem, copyMessageMenuItem });
            historyMenuItem.Name = "historyMenuItem";
            historyMenuItem.Size = new Size(57, 20);
            historyMenuItem.Text = "&History";
            // 
            // refreshGraphMenuItem
            // 
            refreshGraphMenuItem.Name = "refreshGraphMenuItem";
            refreshGraphMenuItem.ShortcutKeys = Keys.Control | Keys.F5;
            refreshGraphMenuItem.ShowShortcutKeys = false;
            refreshGraphMenuItem.Size = new Size(145, 22);
            refreshGraphMenuItem.Text = "Refresh &Graph";
            refreshGraphMenuItem.ToolTipText = "Reload the commit history graph";
            refreshGraphMenuItem.Click += RefreshGraphToolButton_Click;
            // 
            // copyShaMenuItem
            // 
            copyShaMenuItem.Name = "copyShaMenuItem";
            copyShaMenuItem.ShortcutKeys = Keys.Control | Keys.Shift | Keys.S;
            copyShaMenuItem.ShowShortcutKeys = false;
            copyShaMenuItem.Size = new Size(145, 22);
            copyShaMenuItem.Text = "Copy &SHA";
            copyShaMenuItem.ToolTipText = "Copy the selected commit's full hash to the clipboard";
            copyShaMenuItem.Click += CopyShaContextMenuItem_Click;
            // 
            // copyMessageMenuItem
            // 
            copyMessageMenuItem.Name = "copyMessageMenuItem";
            copyMessageMenuItem.ShortcutKeys = Keys.Control | Keys.Shift | Keys.M;
            copyMessageMenuItem.ShowShortcutKeys = false;
            copyMessageMenuItem.Size = new Size(145, 22);
            copyMessageMenuItem.Text = "Copy &Message";
            copyMessageMenuItem.ToolTipText = "Copy the selected commit message to the clipboard";
            copyMessageMenuItem.Click += CopyMessageContextMenuItem_Click;
            // 
            // diffMenuItem
            // 
            diffMenuItem.DropDownItems.AddRange(new ToolStripItem[] { copyPathMenuItem, wordWrapMenuItem, copyDiffMenuItem });
            diffMenuItem.Name = "diffMenuItem";
            diffMenuItem.Size = new Size(39, 20);
            diffMenuItem.Text = "&Diff";
            // 
            // copyPathMenuItem
            // 
            copyPathMenuItem.Name = "copyPathMenuItem";
            copyPathMenuItem.ShortcutKeys = Keys.Control | Keys.Shift | Keys.P;
            copyPathMenuItem.ShowShortcutKeys = false;
            copyPathMenuItem.Size = new Size(128, 22);
            copyPathMenuItem.Text = "Copy &Path";
            copyPathMenuItem.ToolTipText = "Copy the selected file path to the clipboard";
            copyPathMenuItem.Click += CopyFilePathContextMenuItem_Click;
            // 
            // wordWrapMenuItem
            // 
            wordWrapMenuItem.CheckOnClick = true;
            wordWrapMenuItem.Name = "wordWrapMenuItem";
            wordWrapMenuItem.ShortcutKeys = Keys.Control | Keys.Shift | Keys.W;
            wordWrapMenuItem.ShowShortcutKeys = false;
            wordWrapMenuItem.Size = new Size(128, 22);
            wordWrapMenuItem.Text = "Word &Wrap";
            wordWrapMenuItem.ToolTipText = "Toggle word wrap for the diff view";
            wordWrapMenuItem.CheckedChanged += WordWrapMenuItem_CheckedChanged;
            // 
            // copyDiffMenuItem
            // 
            copyDiffMenuItem.Name = "copyDiffMenuItem";
            copyDiffMenuItem.ShortcutKeys = Keys.Control | Keys.Shift | Keys.D;
            copyDiffMenuItem.ShowShortcutKeys = false;
            copyDiffMenuItem.Size = new Size(128, 22);
            copyDiffMenuItem.Text = "Copy &Diff";
            copyDiffMenuItem.ToolTipText = "Copy the visible diff text to the clipboard";
            copyDiffMenuItem.Click += CopyDiffToolButton_Click;
            // 
            // helpMenuItem
            // 
            helpMenuItem.DropDownItems.AddRange(new ToolStripItem[] { aboutMenuItem });
            helpMenuItem.Name = "helpMenuItem";
            helpMenuItem.Size = new Size(44, 20);
            helpMenuItem.Text = "&Help";
            // 
            // aboutMenuItem
            // 
            aboutMenuItem.Name = "aboutMenuItem";
            aboutMenuItem.ShortcutKeys = Keys.F1;
            aboutMenuItem.ShowShortcutKeys = false;
            aboutMenuItem.Size = new Size(100, 22);
            aboutMenuItem.Text = "&About";
            aboutMenuItem.ToolTipText = "Show application information";
            aboutMenuItem.Click += AboutMenuItem_Click;
            // 
            // statusStrip
            // 
            statusStrip.BackColor = Color.FromArgb(245, 246, 248);
            statusStrip.Items.AddRange(new ToolStripItem[] { statusLabel, repoLoadProgressBar, repoCountsStatusLabel });
            statusStrip.Location = new Point(0, 938);
            statusStrip.Name = "statusStrip";
            statusStrip.Size = new Size(1600, 22);
            statusStrip.TabIndex = 0;
            // 
            // statusLabel
            // 
            statusLabel.Name = "statusLabel";
            statusLabel.Size = new Size(1474, 17);
            statusLabel.Spring = true;
            statusLabel.Text = "Ready";
            statusLabel.TextAlign = ContentAlignment.MiddleLeft;
            // 
            // repoLoadProgressBar
            // 
            repoLoadProgressBar.Alignment = ToolStripItemAlignment.Right;
            repoLoadProgressBar.Name = "repoLoadProgressBar";
            repoLoadProgressBar.Size = new Size(100, 16);
            repoLoadProgressBar.Style = ProgressBarStyle.Marquee;
            repoLoadProgressBar.Visible = false;
            // 
            // repoCountsStatusLabel
            // 
            repoCountsStatusLabel.Name = "repoCountsStatusLabel";
            repoCountsStatusLabel.Size = new Size(111, 17);
            repoCountsStatusLabel.Text = "No repository open";
            // 
            // mainSplitContainer
            // 
            mainSplitContainer.BackColor = Color.FromArgb(230, 231, 234);
            mainSplitContainer.Dock = DockStyle.Fill;
            mainSplitContainer.Location = new Point(0, 59);
            mainSplitContainer.Name = "mainSplitContainer";
            // 
            // mainSplitContainer.Panel1
            // 
            mainSplitContainer.Panel1.Controls.Add(leftSideSplitContainer);
            mainSplitContainer.Panel1MinSize = 220;
            // 
            // mainSplitContainer.Panel2
            // 
            mainSplitContainer.Panel2.Controls.Add(graphDetailSplitContainer);
            mainSplitContainer.Size = new Size(1600, 879);
            mainSplitContainer.SplitterDistance = 300;
            mainSplitContainer.TabIndex = 2;
            // 
            // leftSideSplitContainer
            // 
            leftSideSplitContainer.BackColor = Color.FromArgb(230, 231, 234);
            leftSideSplitContainer.Dock = DockStyle.Fill;
            leftSideSplitContainer.Location = new Point(0, 0);
            leftSideSplitContainer.Name = "leftSideSplitContainer";
            leftSideSplitContainer.Orientation = Orientation.Horizontal;
            // 
            // leftSideSplitContainer.Panel1
            // 
            leftSideSplitContainer.Panel1.Controls.Add(repoTreePanel);
            leftSideSplitContainer.Panel1MinSize = 160;
            // 
            // leftSideSplitContainer.Panel2
            // 
            leftSideSplitContainer.Panel2.Controls.Add(repoFilesPanel);
            leftSideSplitContainer.Panel2MinSize = 120;
            leftSideSplitContainer.Size = new Size(300, 879);
            leftSideSplitContainer.SplitterDistance = 460;
            leftSideSplitContainer.TabIndex = 0;
            // 
            // repoTreePanel
            // 
            repoTreePanel.BackColor = Color.FromArgb(250, 250, 251);
            repoTreePanel.BorderStyle = BorderStyle.FixedSingle;
            repoTreePanel.Controls.Add(repoTreeView);
            repoTreePanel.Controls.Add(repoInfoLabel);
            repoTreePanel.Controls.Add(repoTitleLabel);
            repoTreePanel.Dock = DockStyle.Fill;
            repoTreePanel.Location = new Point(0, 0);
            repoTreePanel.Name = "repoTreePanel";
            repoTreePanel.Padding = new Padding(1);
            repoTreePanel.Size = new Size(300, 460);
            repoTreePanel.TabIndex = 0;
            // 
            // repoTitleLabel
            // 
            repoTitleLabel.BackColor = Color.FromArgb(238, 242, 255);
            repoTitleLabel.Dock = DockStyle.Top;
            repoTitleLabel.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            repoTitleLabel.ForeColor = Color.FromArgb(55, 48, 163);
            repoTitleLabel.Location = new Point(1, 1);
            repoTitleLabel.Name = "repoTitleLabel";
            repoTitleLabel.Padding = new Padding(12, 0, 10, 0);
            repoTitleLabel.Size = new Size(296, 30);
            repoTitleLabel.TabIndex = 1;
            repoTitleLabel.Text = "Repository";
            repoTitleLabel.TextAlign = ContentAlignment.MiddleLeft;
            repoTitleLabel.UseCompatibleTextRendering = true;
            // 
            // repoFilesPanel
            // 
            repoFilesPanel.BackColor = Color.FromArgb(250, 250, 251);
            repoFilesPanel.BorderStyle = BorderStyle.FixedSingle;
            repoFilesPanel.Controls.Add(repoFilesTreeView);
            repoFilesPanel.Controls.Add(repoFilesTitleLabel);
            repoFilesPanel.Dock = DockStyle.Fill;
            repoFilesPanel.Location = new Point(0, 0);
            repoFilesPanel.Name = "repoFilesPanel";
            repoFilesPanel.Padding = new Padding(1);
            repoFilesPanel.Size = new Size(300, 415);
            repoFilesPanel.TabIndex = 1;
            // 
            // repoFilesTreeView
            // 
            repoFilesTreeView.BackColor = Color.FromArgb(250, 250, 251);
            repoFilesTreeView.BorderStyle = BorderStyle.None;
            repoFilesTreeView.ContextMenuStrip = repoFilesContextMenu;
            repoFilesTreeView.Dock = DockStyle.Fill;
            repoFilesTreeView.FullRowSelect = true;
            repoFilesTreeView.HideSelection = false;
            repoFilesTreeView.Location = new Point(1, 31);
            repoFilesTreeView.Name = "repoFilesTreeView";
            repoFilesTreeView.Size = new Size(296, 381);
            repoFilesTreeView.TabIndex = 0;
            repoFilesTreeView.BeforeExpand += RepoFilesTreeView_BeforeExpand;
            repoFilesTreeView.AfterSelect += RepoFilesTreeView_AfterSelect;
            repoFilesTreeView.NodeMouseClick += RepoFilesTreeView_NodeMouseClick;
            repoFilesTreeView.MouseDown += RepoFilesTreeView_MouseDown;
            // 
            // repoFilesContextMenu
            // 
            repoFilesContextMenu.Items.AddRange(new ToolStripItem[] { showFileLogContextMenuItem, repoFilesGitSeparator, gitAddContextMenuItem, gitResetContextMenuItem, gitDiscardContextMenuItem, gitStagingSeparator, gitCommitContextMenuItem, gitRemoteSeparator, gitFetchContextMenuItem, gitPullContextMenuItem, gitPushContextMenuItem, gitStashSeparator, gitStashContextMenuItem, gitStashPopContextMenuItem, gitStatusContextMenuItem, copyRepoFilePathContextMenuItem, clearFileLogFilterContextMenuItem });
            repoFilesContextMenu.Name = "repoFilesContextMenu";
            repoFilesContextMenu.Size = new Size(184, 314);
            repoFilesContextMenu.Opening += RepoFilesContextMenu_Opening;
            // 
            // showFileLogContextMenuItem
            // 
            showFileLogContextMenuItem.Name = "showFileLogContextMenuItem";
            showFileLogContextMenuItem.Size = new Size(183, 22);
            showFileLogContextMenuItem.Text = "Show Log";
            showFileLogContextMenuItem.ToolTipText = "Show commit history for this path in the graph panel";
            showFileLogContextMenuItem.Click += ShowFileLogContextMenuItem_Click;
            // 
            // repoFilesGitSeparator
            // 
            repoFilesGitSeparator.Name = "repoFilesGitSeparator";
            repoFilesGitSeparator.Size = new Size(180, 6);
            // 
            // gitAddContextMenuItem
            // 
            gitAddContextMenuItem.Name = "gitAddContextMenuItem";
            gitAddContextMenuItem.Size = new Size(183, 22);
            gitAddContextMenuItem.Text = "Git Add";
            gitAddContextMenuItem.ToolTipText = "Stage the selected file or folder";
            gitAddContextMenuItem.Click += GitAddContextMenuItem_Click;
            // 
            // gitResetContextMenuItem
            // 
            gitResetContextMenuItem.Name = "gitResetContextMenuItem";
            gitResetContextMenuItem.Size = new Size(183, 22);
            gitResetContextMenuItem.Text = "Git Reset (Unstage)";
            gitResetContextMenuItem.ToolTipText = "Unstage the selected file or folder";
            gitResetContextMenuItem.Click += GitResetContextMenuItem_Click;
            // 
            // gitDiscardContextMenuItem
            // 
            gitDiscardContextMenuItem.Name = "gitDiscardContextMenuItem";
            gitDiscardContextMenuItem.Size = new Size(183, 22);
            gitDiscardContextMenuItem.Text = "Git Discard Changes";
            gitDiscardContextMenuItem.ToolTipText = "Discard uncommitted changes in the selected path";
            gitDiscardContextMenuItem.Click += GitDiscardContextMenuItem_Click;
            // 
            // gitStagingSeparator
            // 
            gitStagingSeparator.Name = "gitStagingSeparator";
            gitStagingSeparator.Size = new Size(180, 6);
            // 
            // gitCommitContextMenuItem
            // 
            gitCommitContextMenuItem.Name = "gitCommitContextMenuItem";
            gitCommitContextMenuItem.Size = new Size(183, 22);
            gitCommitContextMenuItem.Text = "Git Commit...";
            gitCommitContextMenuItem.ToolTipText = "Commit staged changes with a formatted message";
            gitCommitContextMenuItem.Click += GitCommitContextMenuItem_Click;
            // 
            // gitRemoteSeparator
            // 
            gitRemoteSeparator.Name = "gitRemoteSeparator";
            gitRemoteSeparator.Size = new Size(180, 6);
            // 
            // gitFetchContextMenuItem
            // 
            gitFetchContextMenuItem.Name = "gitFetchContextMenuItem";
            gitFetchContextMenuItem.Size = new Size(183, 22);
            gitFetchContextMenuItem.Text = "Git Fetch";
            gitFetchContextMenuItem.ToolTipText = "Fetch updates from origin";
            gitFetchContextMenuItem.Click += GitFetchContextMenuItem_Click;
            // 
            // gitPullContextMenuItem
            // 
            gitPullContextMenuItem.Name = "gitPullContextMenuItem";
            gitPullContextMenuItem.Size = new Size(183, 22);
            gitPullContextMenuItem.Text = "Git Pull";
            gitPullContextMenuItem.ToolTipText = "Pull and merge updates from origin";
            gitPullContextMenuItem.Click += GitPullContextMenuItem_Click;
            // 
            // gitPushContextMenuItem
            // 
            gitPushContextMenuItem.Name = "gitPushContextMenuItem";
            gitPushContextMenuItem.Size = new Size(183, 22);
            gitPushContextMenuItem.Text = "Git Push";
            gitPushContextMenuItem.ToolTipText = "Push the current branch to origin";
            gitPushContextMenuItem.Click += GitPushContextMenuItem_Click;
            // 
            // gitStashSeparator
            // 
            gitStashSeparator.Name = "gitStashSeparator";
            gitStashSeparator.Size = new Size(180, 6);
            // 
            // gitStashContextMenuItem
            // 
            gitStashContextMenuItem.Name = "gitStashContextMenuItem";
            gitStashContextMenuItem.Size = new Size(183, 22);
            gitStashContextMenuItem.Text = "Git Stash";
            gitStashContextMenuItem.ToolTipText = "Stash uncommitted changes";
            gitStashContextMenuItem.Click += GitStashContextMenuItem_Click;
            // 
            // gitStashPopContextMenuItem
            // 
            gitStashPopContextMenuItem.Name = "gitStashPopContextMenuItem";
            gitStashPopContextMenuItem.Size = new Size(183, 22);
            gitStashPopContextMenuItem.Text = "Git Stash Pop";
            gitStashPopContextMenuItem.ToolTipText = "Apply and remove the latest stash";
            gitStashPopContextMenuItem.Click += GitStashPopContextMenuItem_Click;
            // 
            // gitStatusContextMenuItem
            // 
            gitStatusContextMenuItem.Name = "gitStatusContextMenuItem";
            gitStatusContextMenuItem.Size = new Size(183, 22);
            gitStatusContextMenuItem.Text = "Git Status...";
            gitStatusContextMenuItem.ToolTipText = "Show working tree status";
            gitStatusContextMenuItem.Click += GitStatusContextMenuItem_Click;
            // 
            // copyRepoFilePathContextMenuItem
            // 
            copyRepoFilePathContextMenuItem.Name = "copyRepoFilePathContextMenuItem";
            copyRepoFilePathContextMenuItem.Size = new Size(183, 22);
            copyRepoFilePathContextMenuItem.Text = "Copy Path";
            copyRepoFilePathContextMenuItem.ToolTipText = "Copy the repository-relative path to the clipboard";
            copyRepoFilePathContextMenuItem.Click += CopyRepoFilePathContextMenuItem_Click;
            // 
            // clearFileLogFilterContextMenuItem
            // 
            clearFileLogFilterContextMenuItem.Name = "clearFileLogFilterContextMenuItem";
            clearFileLogFilterContextMenuItem.Size = new Size(183, 22);
            clearFileLogFilterContextMenuItem.Text = "Show All Commits";
            clearFileLogFilterContextMenuItem.ToolTipText = "Clear the path filter and show the full commit history";
            clearFileLogFilterContextMenuItem.Click += ClearFileLogFilterContextMenuItem_Click;
            // 
            // repoFilesTitleLabel
            // 
            repoFilesTitleLabel.BackColor = Color.FromArgb(239, 246, 255);
            repoFilesTitleLabel.Dock = DockStyle.Top;
            repoFilesTitleLabel.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            repoFilesTitleLabel.ForeColor = Color.FromArgb(30, 64, 175);
            repoFilesTitleLabel.Location = new Point(1, 1);
            repoFilesTitleLabel.Name = "repoFilesTitleLabel";
            repoFilesTitleLabel.Padding = new Padding(12, 0, 10, 0);
            repoFilesTitleLabel.Section = SectionTitleKind.Workspace;
            repoFilesTitleLabel.Size = new Size(296, 30);
            repoFilesTitleLabel.TabIndex = 1;
            repoFilesTitleLabel.Text = "Files";
            repoFilesTitleLabel.TextAlign = ContentAlignment.MiddleLeft;
            repoFilesTitleLabel.UseCompatibleTextRendering = true;
            // 
            // graphDetailSplitContainer
            // 
            graphDetailSplitContainer.BackColor = Color.FromArgb(230, 231, 234);
            graphDetailSplitContainer.Dock = DockStyle.Fill;
            graphDetailSplitContainer.Location = new Point(0, 0);
            graphDetailSplitContainer.Name = "graphDetailSplitContainer";
            // 
            // graphDetailSplitContainer.Panel1
            // 
            graphDetailSplitContainer.Panel1.Controls.Add(graphPanel);
            graphDetailSplitContainer.Panel1MinSize = 200;
            // 
            // graphDetailSplitContainer.Panel2
            // 
            graphDetailSplitContainer.Panel2.Controls.Add(detailSplitContainer);
            graphDetailSplitContainer.Panel2MinSize = 220;
            graphDetailSplitContainer.Size = new Size(1296, 879);
            graphDetailSplitContainer.SplitterDistance = 977;
            graphDetailSplitContainer.TabIndex = 0;
            // 
            // graphPanel
            // 
            graphPanel.BackColor = Color.FromArgb(250, 250, 251);
            graphPanel.BorderStyle = BorderStyle.FixedSingle;
            graphPanel.Controls.Add(commitGraphView);
            graphPanel.Controls.Add(graphTitleLabel);
            graphPanel.Dock = DockStyle.Fill;
            graphPanel.Location = new Point(0, 0);
            graphPanel.Name = "graphPanel";
            graphPanel.Padding = new Padding(1);
            graphPanel.Size = new Size(977, 879);
            graphPanel.TabIndex = 0;
            // 
            // graphTitleLabel
            // 
            graphTitleLabel.BackColor = Color.FromArgb(245, 243, 255);
            graphTitleLabel.Dock = DockStyle.Top;
            graphTitleLabel.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            graphTitleLabel.ForeColor = Color.FromArgb(91, 33, 182);
            graphTitleLabel.Location = new Point(1, 1);
            graphTitleLabel.Name = "graphTitleLabel";
            graphTitleLabel.Padding = new Padding(12, 0, 10, 0);
            graphTitleLabel.Section = SectionTitleKind.CommitHistory;
            graphTitleLabel.Size = new Size(973, 30);
            graphTitleLabel.TabIndex = 1;
            graphTitleLabel.Text = "Commit History";
            graphTitleLabel.TextAlign = ContentAlignment.MiddleLeft;
            graphTitleLabel.UseCompatibleTextRendering = true;
            // 
            // detailSplitContainer
            // 
            detailSplitContainer.BackColor = Color.FromArgb(230, 231, 234);
            detailSplitContainer.Dock = DockStyle.Fill;
            detailSplitContainer.Location = new Point(0, 0);
            detailSplitContainer.Name = "detailSplitContainer";
            detailSplitContainer.Orientation = Orientation.Horizontal;
            // 
            // detailSplitContainer.Panel1
            // 
            detailSplitContainer.Panel1.Controls.Add(filesPanel);
            detailSplitContainer.Panel1MinSize = 120;
            // 
            // detailSplitContainer.Panel2
            // 
            detailSplitContainer.Panel2.Controls.Add(diffPanel);
            detailSplitContainer.Panel2MinSize = 120;
            detailSplitContainer.Size = new Size(315, 879);
            detailSplitContainer.SplitterDistance = 355;
            detailSplitContainer.TabIndex = 0;
            // 
            // filesPanel
            // 
            filesPanel.BackColor = Color.FromArgb(250, 250, 251);
            filesPanel.BorderStyle = BorderStyle.FixedSingle;
            filesPanel.Controls.Add(changedFilesListView);
            filesPanel.Controls.Add(changedFilesTitleLabel);
            filesPanel.Controls.Add(commitMetaLabel);
            filesPanel.Controls.Add(filesTitleLabel);
            filesPanel.Dock = DockStyle.Fill;
            filesPanel.Location = new Point(0, 0);
            filesPanel.Name = "filesPanel";
            filesPanel.Padding = new Padding(1);
            filesPanel.Size = new Size(315, 355);
            filesPanel.TabIndex = 0;
            // 
            // filesTitleLabel
            // 
            filesTitleLabel.BackColor = Color.FromArgb(236, 254, 255);
            filesTitleLabel.Dock = DockStyle.Top;
            filesTitleLabel.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            filesTitleLabel.ForeColor = Color.FromArgb(21, 94, 117);
            filesTitleLabel.Location = new Point(1, 1);
            filesTitleLabel.Name = "filesTitleLabel";
            filesTitleLabel.Padding = new Padding(12, 0, 10, 0);
            filesTitleLabel.Section = SectionTitleKind.CommitDetails;
            filesTitleLabel.Size = new Size(311, 30);
            filesTitleLabel.TabIndex = 2;
            filesTitleLabel.Text = "Commit Details";
            filesTitleLabel.TextAlign = ContentAlignment.MiddleLeft;
            filesTitleLabel.UseCompatibleTextRendering = true;
            // 
            // diffPanel
            // 
            diffPanel.BackColor = Color.FromArgb(250, 250, 251);
            diffPanel.BorderStyle = BorderStyle.FixedSingle;
            diffPanel.Controls.Add(diffTextBox);
            diffPanel.Controls.Add(diffTitleLabel);
            diffPanel.Dock = DockStyle.Fill;
            diffPanel.Location = new Point(0, 0);
            diffPanel.Name = "diffPanel";
            diffPanel.Padding = new Padding(1);
            diffPanel.Size = new Size(315, 520);
            diffPanel.TabIndex = 0;
            // 
            // diffTitleLabel
            // 
            diffTitleLabel.BackColor = Color.FromArgb(240, 253, 244);
            diffTitleLabel.Dock = DockStyle.Top;
            diffTitleLabel.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            diffTitleLabel.ForeColor = Color.FromArgb(22, 101, 52);
            diffTitleLabel.Location = new Point(1, 1);
            diffTitleLabel.Name = "diffTitleLabel";
            diffTitleLabel.Padding = new Padding(12, 0, 10, 0);
            diffTitleLabel.Section = SectionTitleKind.Diff;
            diffTitleLabel.Size = new Size(311, 30);
            diffTitleLabel.TabIndex = 1;
            diffTitleLabel.Text = "Diff";
            diffTitleLabel.TextAlign = ContentAlignment.MiddleLeft;
            diffTitleLabel.UseCompatibleTextRendering = true;
            // 
            // mainToolStrip
            // 
            mainToolStrip.BackColor = Color.FromArgb(245, 246, 248);
            mainToolStrip.GripStyle = ToolStripGripStyle.Hidden;
            mainToolStrip.ImageScalingSize = new Size(40, 40);
            mainToolStrip.Items.AddRange(new ToolStripItem[] { openToolButton, cloneToolButton, browseRemoteToolButton, refreshTreeToolButton, exportSummaryToolButton, mainToolStripSeparator1, refreshGraphToolButton, copyShaToolButton, copyMessageToolButton, mainToolStripSeparator2, copyFilePathToolButton, mainToolStripSeparator3, wordWrapToolButton, copyDiffToolButton, infoToolButton });
            mainToolStrip.Location = new Point(0, 24);
            mainToolStrip.Name = "mainToolStrip";
            mainToolStrip.Padding = new Padding(8, 6, 8, 6);
            mainToolStrip.Size = new Size(1600, 35);
            mainToolStrip.TabIndex = 3;
            // 
            // openToolButton
            // 
            openToolButton.Name = "openToolButton";
            openToolButton.Size = new Size(40, 20);
            openToolButton.Text = "Open";
            openToolButton.ToolTipText = "Open a local Git repository folder";
            openToolButton.Click += OpenRepositoryMenuItem_Click;
            // 
            // cloneToolButton
            // 
            cloneToolButton.Name = "cloneToolButton";
            cloneToolButton.Size = new Size(42, 20);
            cloneToolButton.Text = "Clone";
            cloneToolButton.ToolTipText = "Clone a remote repository to a local folder";
            cloneToolButton.Click += CloneRepositoryMenuItem_Click;
            // 
            // browseRemoteToolButton
            // 
            browseRemoteToolButton.Name = "browseRemoteToolButton";
            browseRemoteToolButton.Size = new Size(94, 20);
            browseRemoteToolButton.Text = "Browse Remote";
            browseRemoteToolButton.ToolTipText = "Browse remote commit history without saving a local copy";
            browseRemoteToolButton.Click += BrowseRemoteRepositoryMenuItem_Click;
            // 
            // refreshTreeToolButton
            // 
            refreshTreeToolButton.Name = "refreshTreeToolButton";
            refreshTreeToolButton.Size = new Size(76, 20);
            refreshTreeToolButton.Text = "Refresh Tree";
            refreshTreeToolButton.ToolTipText = "Reload branches, tags, and releases";
            refreshTreeToolButton.Click += RefreshTreeToolButton_Click;
            // 
            // exportSummaryToolButton
            // 
            exportSummaryToolButton.DropDownItems.AddRange(new ToolStripItem[] { exportSummaryToolPdfItem, exportSummaryToolWordItem, exportSummaryToolMarkdownItem });
            exportSummaryToolButton.Name = "exportSummaryToolButton";
            exportSummaryToolButton.Size = new Size(110, 20);
            exportSummaryToolButton.Text = "Export Summary";
            exportSummaryToolButton.ToolTipText = "Export repository summary as PDF, Word, or Markdown";
            // 
            // exportSummaryToolPdfItem
            // 
            exportSummaryToolPdfItem.Name = "exportSummaryToolPdfItem";
            exportSummaryToolPdfItem.Size = new Size(164, 22);
            exportSummaryToolPdfItem.Tag = "pdf";
            exportSummaryToolPdfItem.Text = "PDF (.pdf)";
            exportSummaryToolPdfItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // exportSummaryToolWordItem
            // 
            exportSummaryToolWordItem.Name = "exportSummaryToolWordItem";
            exportSummaryToolWordItem.Size = new Size(164, 22);
            exportSummaryToolWordItem.Tag = "docx";
            exportSummaryToolWordItem.Text = "Word (.docx)";
            exportSummaryToolWordItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // exportSummaryToolMarkdownItem
            // 
            exportSummaryToolMarkdownItem.Name = "exportSummaryToolMarkdownItem";
            exportSummaryToolMarkdownItem.Size = new Size(164, 22);
            exportSummaryToolMarkdownItem.Tag = "md";
            exportSummaryToolMarkdownItem.Text = "Markdown (.md)";
            exportSummaryToolMarkdownItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // mainToolStripSeparator1
            // 
            mainToolStripSeparator1.Name = "mainToolStripSeparator1";
            mainToolStripSeparator1.Size = new Size(6, 23);
            // 
            // refreshGraphToolButton
            // 
            refreshGraphToolButton.Name = "refreshGraphToolButton";
            refreshGraphToolButton.Size = new Size(86, 20);
            refreshGraphToolButton.Text = "Refresh Graph";
            refreshGraphToolButton.ToolTipText = "Reload the commit history graph";
            refreshGraphToolButton.Click += RefreshGraphToolButton_Click;
            // 
            // copyShaToolButton
            // 
            copyShaToolButton.Name = "copyShaToolButton";
            copyShaToolButton.Size = new Size(67, 20);
            copyShaToolButton.Text = "Copy SHA";
            copyShaToolButton.ToolTipText = "Copy the selected commit's full hash to the clipboard";
            copyShaToolButton.Click += CopyShaContextMenuItem_Click;
            // 
            // copyMessageToolButton
            // 
            copyMessageToolButton.Name = "copyMessageToolButton";
            copyMessageToolButton.Size = new Size(89, 20);
            copyMessageToolButton.Text = "Copy Message";
            copyMessageToolButton.ToolTipText = "Copy the selected commit message to the clipboard";
            copyMessageToolButton.Click += CopyMessageContextMenuItem_Click;
            // 
            // mainToolStripSeparator2
            // 
            mainToolStripSeparator2.Name = "mainToolStripSeparator2";
            mainToolStripSeparator2.Size = new Size(6, 23);
            // 
            // copyFilePathToolButton
            // 
            copyFilePathToolButton.Name = "copyFilePathToolButton";
            copyFilePathToolButton.Size = new Size(67, 20);
            copyFilePathToolButton.Text = "Copy Path";
            copyFilePathToolButton.ToolTipText = "Copy the selected file path to the clipboard";
            copyFilePathToolButton.Click += CopyFilePathContextMenuItem_Click;
            // 
            // mainToolStripSeparator3
            // 
            mainToolStripSeparator3.Name = "mainToolStripSeparator3";
            mainToolStripSeparator3.Size = new Size(6, 23);
            // 
            // wordWrapToolButton
            // 
            wordWrapToolButton.CheckOnClick = true;
            wordWrapToolButton.Name = "wordWrapToolButton";
            wordWrapToolButton.Size = new Size(39, 20);
            wordWrapToolButton.Text = "Wrap";
            wordWrapToolButton.ToolTipText = "Toggle word wrap for the diff view";
            wordWrapToolButton.CheckedChanged += WordWrapToolButton_CheckedChanged;
            // 
            // copyDiffToolButton
            // 
            copyDiffToolButton.Name = "copyDiffToolButton";
            copyDiffToolButton.Size = new Size(39, 20);
            copyDiffToolButton.Text = "Copy";
            copyDiffToolButton.ToolTipText = "Copy the visible diff text to the clipboard";
            copyDiffToolButton.Click += CopyDiffToolButton_Click;
            // 
            // infoToolButton
            // 
            infoToolButton.Alignment = ToolStripItemAlignment.Right;
            infoToolButton.Name = "infoToolButton";
            infoToolButton.Size = new Size(32, 20);
            infoToolButton.Text = "Info";
            infoToolButton.ToolTipText = "Show application information";
            infoToolButton.Click += AboutMenuItem_Click;
            // 
            // MainForm
            // 
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            BackColor = Color.FromArgb(250, 250, 251);
            ClientSize = new Size(1600, 960);
            Controls.Add(mainSplitContainer);
            Controls.Add(mainToolStrip);
            Controls.Add(menuStrip);
            Controls.Add(statusStrip);
            Font = new Font("Segoe UI", 9F);
            Icon = (Icon)resources.GetObject("$this.Icon");
            MainMenuStrip = menuStrip;
            MinimumSize = new Size(1200, 780);
            Name = "MainForm";
            StartPosition = FormStartPosition.CenterScreen;
            Text = "MyGit V1.0.0";
            repoTreeContextMenu.ResumeLayout(false);
            changedFilesContextMenu.ResumeLayout(false);
            repoInfoContextMenu.ResumeLayout(false);
            commitGraphContextMenu.ResumeLayout(false);
            menuStrip.ResumeLayout(false);
            menuStrip.PerformLayout();
            statusStrip.ResumeLayout(false);
            statusStrip.PerformLayout();
            mainSplitContainer.Panel1.ResumeLayout(false);
            mainSplitContainer.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)mainSplitContainer).EndInit();
            mainSplitContainer.ResumeLayout(false);
            leftSideSplitContainer.Panel1.ResumeLayout(false);
            leftSideSplitContainer.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)leftSideSplitContainer).EndInit();
            leftSideSplitContainer.ResumeLayout(false);
            repoTreePanel.ResumeLayout(false);
            repoFilesPanel.ResumeLayout(false);
            repoFilesContextMenu.ResumeLayout(false);
            graphDetailSplitContainer.Panel1.ResumeLayout(false);
            graphDetailSplitContainer.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)graphDetailSplitContainer).EndInit();
            graphDetailSplitContainer.ResumeLayout(false);
            graphPanel.ResumeLayout(false);
            detailSplitContainer.Panel1.ResumeLayout(false);
            detailSplitContainer.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)detailSplitContainer).EndInit();
            detailSplitContainer.ResumeLayout(false);
            filesPanel.ResumeLayout(false);
            diffPanel.ResumeLayout(false);
            mainToolStrip.ResumeLayout(false);
            mainToolStrip.PerformLayout();
            ResumeLayout(false);
            PerformLayout();
        }

        #endregion

        private ToolTip toolTip;
        private MenuStrip menuStrip;
        private ToolStripMenuItem fileMenuItem;
        private ToolStripMenuItem openRepositoryMenuItem;
        private ToolStripMenuItem cloneRepositoryMenuItem;
        private ToolStripMenuItem browseRemoteRepositoryMenuItem;
        private ToolStripSeparator fileRecentSeparator;
        private ToolStripSeparator fileMenuSeparator;
        private ToolStripMenuItem exitMenuItem;
        private ToolStripMenuItem repositoryMenuItem;
        private ToolStripMenuItem refreshTreeMenuItem;
        private ToolStripMenuItem barExportSummaryPdfMenuItem;
        private ToolStripMenuItem barExportSummaryWordMenuItem;
        private ToolStripMenuItem barExportSummaryMarkdownMenuItem;
        private ToolStripMenuItem historyMenuItem;
        private ToolStripMenuItem refreshGraphMenuItem;
        private ToolStripMenuItem copyShaMenuItem;
        private ToolStripMenuItem copyMessageMenuItem;
        private ToolStripMenuItem diffMenuItem;
        private ToolStripMenuItem copyPathMenuItem;
        private ToolStripMenuItem wordWrapMenuItem;
        private ToolStripMenuItem copyDiffMenuItem;
        private ToolStripMenuItem helpMenuItem;
        private ToolStripMenuItem aboutMenuItem;
        private StatusStrip statusStrip;
        private ToolStripStatusLabel statusLabel;
        private ToolStripProgressBar repoLoadProgressBar;
        private ToolStripStatusLabel repoCountsStatusLabel;
        private SplitContainer mainSplitContainer;
        private SplitContainer leftSideSplitContainer;
        private Panel repoTreePanel;
        private Panel repoFilesPanel;
        private SectionTitleLabel repoFilesTitleLabel;
        private TreeView repoFilesTreeView;
        private ContextMenuStrip repoFilesContextMenu;
        private ToolStripMenuItem showFileLogContextMenuItem;
        private ToolStripSeparator repoFilesGitSeparator;
        private ToolStripMenuItem gitAddContextMenuItem;
        private ToolStripMenuItem gitResetContextMenuItem;
        private ToolStripMenuItem gitDiscardContextMenuItem;
        private ToolStripSeparator gitStagingSeparator;
        private ToolStripMenuItem gitCommitContextMenuItem;
        private ToolStripSeparator gitRemoteSeparator;
        private ToolStripMenuItem gitFetchContextMenuItem;
        private ToolStripMenuItem gitPullContextMenuItem;
        private ToolStripMenuItem gitPushContextMenuItem;
        private ToolStripSeparator gitStashSeparator;
        private ToolStripMenuItem gitStashContextMenuItem;
        private ToolStripMenuItem gitStashPopContextMenuItem;
        private ToolStripMenuItem gitStatusContextMenuItem;
        private ToolStripMenuItem copyRepoFilePathContextMenuItem;
        private ToolStripMenuItem clearFileLogFilterContextMenuItem;
        private SectionInfoLabel repoInfoLabel;
        private TreeView repoTreeView;
        private SectionTitleLabel repoTitleLabel;
        private ToolStrip mainToolStrip;
        private ToolStripButton openToolButton;
        private ToolStripButton cloneToolButton;
        private ToolStripButton browseRemoteToolButton;
        private ToolStripButton refreshTreeToolButton;
        private ToolStripDropDownButton exportSummaryToolButton;
        private ToolStripMenuItem exportSummaryToolPdfItem;
        private ToolStripMenuItem exportSummaryToolWordItem;
        private ToolStripMenuItem exportSummaryToolMarkdownItem;
        private ToolStripSeparator mainToolStripSeparator1;
        private ToolStripButton refreshGraphToolButton;
        private ToolStripButton copyShaToolButton;
        private ToolStripButton copyMessageToolButton;
        private ToolStripSeparator mainToolStripSeparator2;
        private ToolStripButton copyFilePathToolButton;
        private ToolStripSeparator mainToolStripSeparator3;
        private ToolStripButton wordWrapToolButton;
        private ToolStripButton copyDiffToolButton;
        private ToolStripButton infoToolButton;
        private ContextMenuStrip repoTreeContextMenu;
        private ToolStripMenuItem checkoutContextMenuItem;
        private ToolStripMenuItem copyBranchNameContextMenuItem;
        private ToolStripSeparator repoTreeExportSeparator;
        private ToolStripMenuItem exportSummaryMenuItem;
        private ToolStripMenuItem exportSummaryPdfMenuItem;
        private ToolStripMenuItem exportSummaryWordMenuItem;
        private ToolStripMenuItem exportSummaryMarkdownMenuItem;
        private ContextMenuStrip repoInfoContextMenu;
        private ToolStripMenuItem exportSummaryInfoMenuItem;
        private ToolStripMenuItem exportSummaryInfoPdfMenuItem;
        private ToolStripMenuItem exportSummaryInfoWordMenuItem;
        private ToolStripMenuItem exportSummaryInfoMarkdownMenuItem;
        private SplitContainer graphDetailSplitContainer;
        private Panel graphPanel;
        private SectionTitleLabel graphTitleLabel;
        private CommitGraphView commitGraphView;
        private ContextMenuStrip commitGraphContextMenu;
        private ToolStripMenuItem copyShaContextMenuItem;
        private ToolStripMenuItem copyMessageContextMenuItem;
        private ToolStripMenuItem exportCommitContextMenuItem;
        private SplitContainer detailSplitContainer;
        private Panel filesPanel;
        private SectionTitleLabel filesTitleLabel;
        private SectionTitleLabel changedFilesTitleLabel;
        private ListView changedFilesListView;
        private Label commitMetaLabel;
        private ContextMenuStrip changedFilesContextMenu;
        private ToolStripMenuItem copyFilePathContextMenuItem;
        private Panel diffPanel;
        private SectionTitleLabel diffTitleLabel;
        private RichTextBox diffTextBox;
    }
}
