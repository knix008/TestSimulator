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
            repoInfoContextMenu = new ContextMenuStrip(components);
            exportSummaryInfoMenuItem = new ToolStripMenuItem();
            exportSummaryInfoPdfMenuItem = new ToolStripMenuItem();
            exportSummaryInfoWordMenuItem = new ToolStripMenuItem();
            exportSummaryInfoMarkdownMenuItem = new ToolStripMenuItem();
            commitMetaLabel = new Label();
            changedFilesListView = new ListView();
            changedFilesContextMenu = new ContextMenuStrip(components);
            copyFilePathContextMenuItem = new ToolStripMenuItem();
            diffTextBox = new RichTextBox();
            repoInfoLabel = new SectionInfoLabel();
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
            fileRecentSeparator = new ToolStripSeparator();
            fileMenuSeparator = new ToolStripSeparator();
            exitMenuItem = new ToolStripMenuItem();
            repositoryMenuItem = new ToolStripMenuItem();
            refreshTreeMenuItem = new ToolStripMenuItem();
            barExportSummaryMenuItem = new ToolStripMenuItem();
            barExportSummaryPdfMenuItem = new ToolStripMenuItem();
            barExportSummaryWordMenuItem = new ToolStripMenuItem();
            barExportSummaryMarkdownMenuItem = new ToolStripMenuItem();
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
            repoCountsStatusLabel = new ToolStripStatusLabel();
            mainSplitContainer = new SplitContainer();
            repoTreePanel = new Panel();
            repoTitleLabel = new SectionTitleLabel();
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
            repoInfoContextMenu.SuspendLayout();
            changedFilesContextMenu.SuspendLayout();
            commitGraphContextMenu.SuspendLayout();
            menuStrip.SuspendLayout();
            statusStrip.SuspendLayout();
            ((System.ComponentModel.ISupportInitialize)mainSplitContainer).BeginInit();
            mainSplitContainer.Panel1.SuspendLayout();
            mainSplitContainer.Panel2.SuspendLayout();
            mainSplitContainer.SuspendLayout();
            repoTreePanel.SuspendLayout();
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
            repoTreeView.Location = new Point(1, 83);
            repoTreeView.Name = "repoTreeView";
            repoTreeView.ShowNodeToolTips = true;
            repoTreeView.Size = new Size(296, 793);
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
            repoTreeContextMenu.Size = new Size(200, 120);
            repoTreeContextMenu.Opening += RepoTreeContextMenu_Opening;
            // 
            // checkoutContextMenuItem
            // 
            checkoutContextMenuItem.Name = "checkoutContextMenuItem";
            checkoutContextMenuItem.Size = new Size(138, 22);
            checkoutContextMenuItem.Text = "Checkout";
            checkoutContextMenuItem.ToolTipText = "Check out this local branch";
            checkoutContextMenuItem.Click += CheckoutContextMenuItem_Click;
            // 
            // copyBranchNameContextMenuItem
            // 
            copyBranchNameContextMenuItem.Name = "copyBranchNameContextMenuItem";
            copyBranchNameContextMenuItem.Size = new Size(138, 22);
            copyBranchNameContextMenuItem.Text = "Copy Name";
            copyBranchNameContextMenuItem.ToolTipText = "Copy the branch name to the clipboard";
            copyBranchNameContextMenuItem.Click += CopyBranchNameContextMenuItem_Click;
            // 
            // repoTreeExportSeparator
            // 
            repoTreeExportSeparator.Name = "repoTreeExportSeparator";
            repoTreeExportSeparator.Size = new Size(196, 6);
            // 
            // exportSummaryMenuItem
            // 
            exportSummaryMenuItem.DropDownItems.AddRange(new ToolStripItem[] { exportSummaryPdfMenuItem, exportSummaryWordMenuItem, exportSummaryMarkdownMenuItem });
            exportSummaryMenuItem.Name = "exportSummaryMenuItem";
            exportSummaryMenuItem.Size = new Size(197, 22);
            exportSummaryMenuItem.Text = "Export Summary";
            exportSummaryMenuItem.ToolTipText = "Export repository summary as a report";
            // 
            // exportSummaryPdfMenuItem
            // 
            exportSummaryPdfMenuItem.Name = "exportSummaryPdfMenuItem";
            exportSummaryPdfMenuItem.Size = new Size(180, 22);
            exportSummaryPdfMenuItem.Tag = "pdf";
            exportSummaryPdfMenuItem.Text = "PDF (.pdf)";
            exportSummaryPdfMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // exportSummaryWordMenuItem
            // 
            exportSummaryWordMenuItem.Name = "exportSummaryWordMenuItem";
            exportSummaryWordMenuItem.Size = new Size(180, 22);
            exportSummaryWordMenuItem.Tag = "docx";
            exportSummaryWordMenuItem.Text = "Word (.docx)";
            exportSummaryWordMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // exportSummaryMarkdownMenuItem
            // 
            exportSummaryMarkdownMenuItem.Name = "exportSummaryMarkdownMenuItem";
            exportSummaryMarkdownMenuItem.Size = new Size(180, 22);
            exportSummaryMarkdownMenuItem.Tag = "md";
            exportSummaryMarkdownMenuItem.Text = "Markdown (.md)";
            exportSummaryMarkdownMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // repoInfoContextMenu
            // 
            repoInfoContextMenu.Items.AddRange(new ToolStripItem[] { exportSummaryInfoMenuItem });
            repoInfoContextMenu.Name = "repoInfoContextMenu";
            repoInfoContextMenu.Size = new Size(200, 26);
            repoInfoContextMenu.Opening += RepoInfoContextMenu_Opening;
            // 
            // exportSummaryInfoMenuItem
            // 
            exportSummaryInfoMenuItem.DropDownItems.AddRange(new ToolStripItem[] { exportSummaryInfoPdfMenuItem, exportSummaryInfoWordMenuItem, exportSummaryInfoMarkdownMenuItem });
            exportSummaryInfoMenuItem.Name = "exportSummaryInfoMenuItem";
            exportSummaryInfoMenuItem.Size = new Size(199, 22);
            exportSummaryInfoMenuItem.Text = "Export Summary";
            exportSummaryInfoMenuItem.ToolTipText = "Export repository summary as a report";
            // 
            // exportSummaryInfoPdfMenuItem
            // 
            exportSummaryInfoPdfMenuItem.Name = "exportSummaryInfoPdfMenuItem";
            exportSummaryInfoPdfMenuItem.Size = new Size(180, 22);
            exportSummaryInfoPdfMenuItem.Tag = "pdf";
            exportSummaryInfoPdfMenuItem.Text = "PDF (.pdf)";
            exportSummaryInfoPdfMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // exportSummaryInfoWordMenuItem
            // 
            exportSummaryInfoWordMenuItem.Name = "exportSummaryInfoWordMenuItem";
            exportSummaryInfoWordMenuItem.Size = new Size(180, 22);
            exportSummaryInfoWordMenuItem.Tag = "docx";
            exportSummaryInfoWordMenuItem.Text = "Word (.docx)";
            exportSummaryInfoWordMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // exportSummaryInfoMarkdownMenuItem
            // 
            exportSummaryInfoMarkdownMenuItem.Name = "exportSummaryInfoMarkdownMenuItem";
            exportSummaryInfoMarkdownMenuItem.Size = new Size(180, 22);
            exportSummaryInfoMarkdownMenuItem.Tag = "md";
            exportSummaryInfoMarkdownMenuItem.Text = "Markdown (.md)";
            exportSummaryInfoMarkdownMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // commitMetaLabel
            // 
            commitMetaLabel.BackColor = Color.FromArgb(245, 246, 248);
            commitMetaLabel.Dock = DockStyle.Top;
            commitMetaLabel.Location = new Point(1, 31);
            commitMetaLabel.Name = "commitMetaLabel";
            commitMetaLabel.Padding = new Padding(10, 8, 10, 8);
            commitMetaLabel.Size = new Size(342, 84);
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
            changedFilesListView.Size = new Size(342, 289);
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
            diffTextBox.Size = new Size(342, 404);
            diffTextBox.TabIndex = 0;
            diffTextBox.Text = "";
            toolTip.SetToolTip(diffTextBox, "Unified diff of the selected file.");
            diffTextBox.WordWrap = false;
            // 
            // repoInfoLabel
            // 
            repoInfoLabel.Dock = DockStyle.Top;
            repoInfoLabel.ContextMenuStrip = repoInfoContextMenu;
            repoInfoLabel.Location = new Point(1, 31);
            repoInfoLabel.Name = "repoInfoLabel";
            repoInfoLabel.Padding = new Padding(12, 8, 10, 8);
            repoInfoLabel.Section = SectionTitleKind.Repository;
            repoInfoLabel.Size = new Size(296, 52);
            repoInfoLabel.TabIndex = 2;
            repoInfoLabel.Text = "No repository open";
            repoInfoLabel.TextAlign = ContentAlignment.MiddleLeft;
            toolTip.SetToolTip(repoInfoLabel, "Current repository folder and checked-out branch.");
            // 
            // commitGraphView
            // 
            commitGraphView.BackColor = Color.FromArgb(250, 250, 251);
            commitGraphView.ContextMenuStrip = commitGraphContextMenu;
            commitGraphView.Dock = DockStyle.Fill;
            commitGraphView.Location = new Point(1, 31);
            commitGraphView.Name = "commitGraphView";
            commitGraphView.Size = new Size(942, 845);
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
            changedFilesTitleLabel.Size = new Size(342, 30);
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
            fileMenuItem.DropDownItems.AddRange(new ToolStripItem[] { openRepositoryMenuItem, cloneRepositoryMenuItem, fileRecentSeparator, fileMenuSeparator, exitMenuItem });
            fileMenuItem.Name = "fileMenuItem";
            fileMenuItem.Size = new Size(37, 20);
            fileMenuItem.Text = "&File";
            // 
            // openRepositoryMenuItem
            // 
            openRepositoryMenuItem.Name = "openRepositoryMenuItem";
            openRepositoryMenuItem.Size = new Size(114, 22);
            openRepositoryMenuItem.Text = "&Open...";
            openRepositoryMenuItem.ToolTipText = "Open a local Git repository folder";
            openRepositoryMenuItem.Click += OpenRepositoryMenuItem_Click;
            // 
            // cloneRepositoryMenuItem
            // 
            cloneRepositoryMenuItem.Name = "cloneRepositoryMenuItem";
            cloneRepositoryMenuItem.Size = new Size(114, 22);
            cloneRepositoryMenuItem.Text = "&Clone...";
            cloneRepositoryMenuItem.ToolTipText = "Clone a remote repository to a local folder";
            cloneRepositoryMenuItem.Click += CloneRepositoryMenuItem_Click;
            // 
            // fileRecentSeparator
            // 
            fileRecentSeparator.Name = "fileRecentSeparator";
            fileRecentSeparator.Size = new Size(111, 6);
            // 
            // fileMenuSeparator
            // 
            fileMenuSeparator.Name = "fileMenuSeparator";
            fileMenuSeparator.Size = new Size(111, 6);
            // 
            // exitMenuItem
            // 
            exitMenuItem.Name = "exitMenuItem";
            exitMenuItem.Size = new Size(114, 22);
            exitMenuItem.Text = "E&xit";
            exitMenuItem.ToolTipText = "Close the application";
            exitMenuItem.Click += ExitMenuItem_Click;
            // 
            // repositoryMenuItem
            // 
            repositoryMenuItem.DropDownItems.AddRange(new ToolStripItem[] { refreshTreeMenuItem, barExportSummaryMenuItem });
            repositoryMenuItem.Name = "repositoryMenuItem";
            repositoryMenuItem.Size = new Size(75, 20);
            repositoryMenuItem.Text = "&Repository";
            // 
            // refreshTreeMenuItem
            // 
            refreshTreeMenuItem.Name = "refreshTreeMenuItem";
            refreshTreeMenuItem.Size = new Size(220, 22);
            refreshTreeMenuItem.Text = "Refresh &Tree";
            refreshTreeMenuItem.ToolTipText = "Reload branches, tags, and releases";
            refreshTreeMenuItem.Click += RefreshTreeToolButton_Click;
            // 
            // barExportSummaryMenuItem
            // 
            barExportSummaryMenuItem.DropDownItems.AddRange(new ToolStripItem[] { barExportSummaryPdfMenuItem, barExportSummaryWordMenuItem, barExportSummaryMarkdownMenuItem });
            barExportSummaryMenuItem.Name = "barExportSummaryMenuItem";
            barExportSummaryMenuItem.Size = new Size(220, 22);
            barExportSummaryMenuItem.Text = "Export &Summary";
            barExportSummaryMenuItem.ToolTipText = "Export repository summary as a report";
            // 
            // barExportSummaryPdfMenuItem
            // 
            barExportSummaryPdfMenuItem.Name = "barExportSummaryPdfMenuItem";
            barExportSummaryPdfMenuItem.Size = new Size(180, 22);
            barExportSummaryPdfMenuItem.Tag = "pdf";
            barExportSummaryPdfMenuItem.Text = "PDF (.pdf)";
            barExportSummaryPdfMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // barExportSummaryWordMenuItem
            // 
            barExportSummaryWordMenuItem.Name = "barExportSummaryWordMenuItem";
            barExportSummaryWordMenuItem.Size = new Size(180, 22);
            barExportSummaryWordMenuItem.Tag = "docx";
            barExportSummaryWordMenuItem.Text = "Word (.docx)";
            barExportSummaryWordMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // barExportSummaryMarkdownMenuItem
            // 
            barExportSummaryMarkdownMenuItem.Name = "barExportSummaryMarkdownMenuItem";
            barExportSummaryMarkdownMenuItem.Size = new Size(180, 22);
            barExportSummaryMarkdownMenuItem.Tag = "md";
            barExportSummaryMarkdownMenuItem.Text = "Markdown (.md)";
            barExportSummaryMarkdownMenuItem.Click += ExportRepositorySummaryMenuItem_Click;
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
            refreshGraphMenuItem.Size = new Size(200, 22);
            refreshGraphMenuItem.Text = "Refresh &Graph";
            refreshGraphMenuItem.ToolTipText = "Reload the commit history graph";
            refreshGraphMenuItem.Click += RefreshGraphToolButton_Click;
            // 
            // copyShaMenuItem
            // 
            copyShaMenuItem.Name = "copyShaMenuItem";
            copyShaMenuItem.Size = new Size(200, 22);
            copyShaMenuItem.Text = "Copy &SHA";
            copyShaMenuItem.ToolTipText = "Copy the selected commit's full hash to the clipboard";
            copyShaMenuItem.Click += CopyShaContextMenuItem_Click;
            // 
            // copyMessageMenuItem
            // 
            copyMessageMenuItem.Name = "copyMessageMenuItem";
            copyMessageMenuItem.Size = new Size(200, 22);
            copyMessageMenuItem.Text = "Copy &Message";
            copyMessageMenuItem.ToolTipText = "Copy the selected commit message to the clipboard";
            copyMessageMenuItem.Click += CopyMessageContextMenuItem_Click;
            // 
            // diffMenuItem
            // 
            diffMenuItem.DropDownItems.AddRange(new ToolStripItem[] { copyPathMenuItem, wordWrapMenuItem, copyDiffMenuItem });
            diffMenuItem.Name = "diffMenuItem";
            diffMenuItem.Size = new Size(40, 20);
            diffMenuItem.Text = "&Diff";
            // 
            // copyPathMenuItem
            // 
            copyPathMenuItem.Name = "copyPathMenuItem";
            copyPathMenuItem.Size = new Size(180, 22);
            copyPathMenuItem.Text = "Copy &Path";
            copyPathMenuItem.ToolTipText = "Copy the selected file path to the clipboard";
            copyPathMenuItem.Click += CopyFilePathContextMenuItem_Click;
            // 
            // wordWrapMenuItem
            // 
            wordWrapMenuItem.CheckOnClick = true;
            wordWrapMenuItem.Name = "wordWrapMenuItem";
            wordWrapMenuItem.Size = new Size(180, 22);
            wordWrapMenuItem.Text = "Word &Wrap";
            wordWrapMenuItem.ToolTipText = "Toggle word wrap for the diff view";
            wordWrapMenuItem.CheckedChanged += WordWrapMenuItem_CheckedChanged;
            // 
            // copyDiffMenuItem
            // 
            copyDiffMenuItem.Name = "copyDiffMenuItem";
            copyDiffMenuItem.Size = new Size(180, 22);
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
            aboutMenuItem.Size = new Size(107, 22);
            aboutMenuItem.Text = "&About";
            aboutMenuItem.ToolTipText = "Show application information";
            aboutMenuItem.Click += AboutMenuItem_Click;
            // 
            // statusStrip
            // 
            statusStrip.BackColor = Color.FromArgb(245, 246, 248);
            statusStrip.Items.AddRange(new ToolStripItem[] { statusLabel, repoCountsStatusLabel });
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
            mainSplitContainer.Panel1.Controls.Add(repoTreePanel);
            mainSplitContainer.Panel1MinSize = 220;
            // 
            // mainSplitContainer.Panel2
            // 
            mainSplitContainer.Panel2.Controls.Add(graphDetailSplitContainer);
            mainSplitContainer.Size = new Size(1600, 879);
            mainSplitContainer.SplitterDistance = 300;
            mainSplitContainer.TabIndex = 2;
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
            repoTreePanel.Size = new Size(300, 879);
            repoTreePanel.TabIndex = 0;
            // 
            // repoTitleLabel
            // 
            repoTitleLabel.Dock = DockStyle.Top;
            repoTitleLabel.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
            repoTitleLabel.Location = new Point(1, 1);
            repoTitleLabel.Name = "repoTitleLabel";
            repoTitleLabel.Padding = new Padding(12, 0, 10, 0);
            repoTitleLabel.Section = SectionTitleKind.Repository;
            repoTitleLabel.Size = new Size(296, 30);
            repoTitleLabel.TabIndex = 1;
            repoTitleLabel.Text = "Repository";
            repoTitleLabel.TextAlign = ContentAlignment.MiddleLeft;
            repoTitleLabel.UseCompatibleTextRendering = true;
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
            graphDetailSplitContainer.SplitterDistance = 946;
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
            graphPanel.Size = new Size(946, 879);
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
            graphTitleLabel.Size = new Size(942, 30);
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
            detailSplitContainer.Size = new Size(346, 879);
            detailSplitContainer.SplitterDistance = 437;
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
            filesPanel.Size = new Size(346, 437);
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
            filesTitleLabel.Size = new Size(342, 30);
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
            diffPanel.Size = new Size(346, 438);
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
            diffTitleLabel.Size = new Size(342, 30);
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
            mainToolStrip.Items.AddRange(new ToolStripItem[] { openToolButton, cloneToolButton, refreshTreeToolButton, exportSummaryToolButton, mainToolStripSeparator1, refreshGraphToolButton, copyShaToolButton, copyMessageToolButton, mainToolStripSeparator2, copyFilePathToolButton, mainToolStripSeparator3, wordWrapToolButton, copyDiffToolButton, infoToolButton });
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
            exportSummaryToolButton.Size = new Size(48, 20);
            exportSummaryToolButton.Text = "Export Summary";
            exportSummaryToolButton.ToolTipText = "Export repository summary as PDF, Word, or Markdown";
            // 
            // exportSummaryToolPdfItem
            // 
            exportSummaryToolPdfItem.Name = "exportSummaryToolPdfItem";
            exportSummaryToolPdfItem.Size = new Size(180, 22);
            exportSummaryToolPdfItem.Tag = "pdf";
            exportSummaryToolPdfItem.Text = "PDF (.pdf)";
            exportSummaryToolPdfItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // exportSummaryToolWordItem
            // 
            exportSummaryToolWordItem.Name = "exportSummaryToolWordItem";
            exportSummaryToolWordItem.Size = new Size(180, 22);
            exportSummaryToolWordItem.Tag = "docx";
            exportSummaryToolWordItem.Text = "Word (.docx)";
            exportSummaryToolWordItem.Click += ExportRepositorySummaryMenuItem_Click;
            // 
            // exportSummaryToolMarkdownItem
            // 
            exportSummaryToolMarkdownItem.Name = "exportSummaryToolMarkdownItem";
            exportSummaryToolMarkdownItem.Size = new Size(180, 22);
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
            repoInfoContextMenu.ResumeLayout(false);
            changedFilesContextMenu.ResumeLayout(false);
            commitGraphContextMenu.ResumeLayout(false);
            menuStrip.ResumeLayout(false);
            menuStrip.PerformLayout();
            statusStrip.ResumeLayout(false);
            statusStrip.PerformLayout();
            mainSplitContainer.Panel1.ResumeLayout(false);
            mainSplitContainer.Panel2.ResumeLayout(false);
            ((System.ComponentModel.ISupportInitialize)mainSplitContainer).EndInit();
            mainSplitContainer.ResumeLayout(false);
            repoTreePanel.ResumeLayout(false);
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
        private ToolStripSeparator fileRecentSeparator;
        private ToolStripSeparator fileMenuSeparator;
        private ToolStripMenuItem exitMenuItem;
        private ToolStripMenuItem repositoryMenuItem;
        private ToolStripMenuItem refreshTreeMenuItem;
        private ToolStripMenuItem barExportSummaryMenuItem;
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
        private ToolStripStatusLabel repoCountsStatusLabel;
        private SplitContainer mainSplitContainer;
        private Panel repoTreePanel;
        private SectionInfoLabel repoInfoLabel;
        private TreeView repoTreeView;
        private SectionTitleLabel repoTitleLabel;
        private ToolStrip mainToolStrip;
        private ToolStripButton openToolButton;
        private ToolStripButton cloneToolButton;
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
