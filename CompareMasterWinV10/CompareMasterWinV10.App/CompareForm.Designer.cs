namespace CompareMasterWinV10.App;

partial class CompareForm
{
    private TabPage _directoryTab;
    private TabPage _fileTab;
    private FlowLayoutPanel _dirTopBar;
    private FlowLayoutPanel _fileTopBar;
    private Button _leftDirButton;
    private Button _rightDirButton;
    private Button _compareDirButton;
    private Label _excludeLabel;
    private Panel _leftDirPanel;
    private Panel _rightDirPanel;
    private TableLayoutPanel _leftDiffLayout;
    private TableLayoutPanel _rightDiffLayout;
    private Panel _leftFilePanel;
    private Panel _rightFilePanel;
    private Button _leftFileButton;
    private Button _rightFileButton;
    private Button _compareFileButton;
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
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(CompareForm));
        _tabs = new TabControl();
        _directoryTab = new TabPage();
        _dirSplit = new SplitContainer();
        _leftDirPanel = new Panel();
        _leftDirTree = new SyncTreeView();
        _leftDirLabel = new Label();
        _rightDirPanel = new Panel();
        _rightDirTree = new SyncTreeView();
        _rightDirLabel = new Label();
        _dirTopBar = new FlowLayoutPanel();
        _leftDirButton = new Button();
        _rightDirButton = new Button();
        _excludeLabel = new Label();
        _excludePattern = new TextBox();
        _dirIgnoreWhitespace = new CheckBox();
        _dirIgnoreCase = new CheckBox();
        _compareDirButton = new Button();
        _fileTab = new TabPage();
        _fileSplit = new SplitContainer();
        _leftFilePanel = new Panel();
        _leftDiffLayout = new TableLayoutPanel();
        _leftDiff = new SyncRichTextBox();
        _leftIndicator = new DiffIndicatorBar();
        _leftFileLabel = new Label();
        _rightFilePanel = new Panel();
        _rightDiffLayout = new TableLayoutPanel();
        _rightIndicator = new DiffIndicatorBar();
        _rightDiff = new SyncRichTextBox();
        _rightFileLabel = new Label();
        _fileTopBar = new FlowLayoutPanel();
        _leftFileButton = new Button();
        _rightFileButton = new Button();
        _fileIgnoreWhitespace = new CheckBox();
        _fileIgnoreCase = new CheckBox();
        _compareFileButton = new Button();
        _dirStatusIcons = new ImageList(components);
        _statusStrip = new StatusStrip();
        _statusLabel = new ToolStripStatusLabel();
        _tabs.SuspendLayout();
        _directoryTab.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_dirSplit).BeginInit();
        _dirSplit.Panel1.SuspendLayout();
        _dirSplit.Panel2.SuspendLayout();
        _dirSplit.SuspendLayout();
        _leftDirPanel.SuspendLayout();
        _rightDirPanel.SuspendLayout();
        _dirTopBar.SuspendLayout();
        _fileTab.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_fileSplit).BeginInit();
        _fileSplit.Panel1.SuspendLayout();
        _fileSplit.Panel2.SuspendLayout();
        _fileSplit.SuspendLayout();
        _leftFilePanel.SuspendLayout();
        _leftDiffLayout.SuspendLayout();
        _rightFilePanel.SuspendLayout();
        _rightDiffLayout.SuspendLayout();
        _fileTopBar.SuspendLayout();
        _statusStrip.SuspendLayout();
        SuspendLayout();
        // 
        // _tabs
        // 
        _tabs.Controls.Add(_directoryTab);
        _tabs.Controls.Add(_fileTab);
        _tabs.Dock = DockStyle.Fill;
        _tabs.Font = new Font("Segoe UI", 10F);
        _tabs.Location = new Point(0, 0);
        _tabs.Name = "_tabs";
        _tabs.Padding = new Point(18, 6);
        _tabs.SelectedIndex = 0;
        _tabs.Size = new Size(1300, 838);
        _tabs.TabIndex = 0;
        // 
        // _directoryTab
        // 
        _directoryTab.BackColor = Color.FromArgb(245, 247, 250);
        _directoryTab.Controls.Add(_dirSplit);
        _directoryTab.Controls.Add(_dirTopBar);
        _directoryTab.ForeColor = Color.FromArgb(33, 37, 41);
        _directoryTab.Location = new Point(4, 32);
        _directoryTab.Name = "_directoryTab";
        _directoryTab.Size = new Size(1292, 802);
        _directoryTab.TabIndex = 0;
        _directoryTab.Text = "Directory Compare";
        // 
        // _dirSplit
        // 
        _dirSplit.BackColor = Color.FromArgb(245, 247, 250);
        _dirSplit.Dock = DockStyle.Fill;
        _dirSplit.Location = new Point(0, 42);
        _dirSplit.Name = "_dirSplit";
        // 
        // _dirSplit.Panel1
        // 
        _dirSplit.Panel1.Controls.Add(_leftDirPanel);
        _dirSplit.Panel1.Padding = new Padding(8);
        // 
        // _dirSplit.Panel2
        // 
        _dirSplit.Panel2.Controls.Add(_rightDirPanel);
        _dirSplit.Panel2.Padding = new Padding(8);
        _dirSplit.Size = new Size(1292, 760);
        _dirSplit.SplitterDistance = 1042;
        _dirSplit.TabIndex = 0;
        _dirSplit.Resize += DirSplit_Resize;
        // 
        // _leftDirPanel
        // 
        _leftDirPanel.BackColor = Color.FromArgb(255, 255, 255);
        _leftDirPanel.BorderStyle = BorderStyle.FixedSingle;
        _leftDirPanel.Controls.Add(_leftDirTree);
        _leftDirPanel.Controls.Add(_leftDirLabel);
        _leftDirPanel.Dock = DockStyle.Fill;
        _leftDirPanel.Location = new Point(8, 8);
        _leftDirPanel.Name = "_leftDirPanel";
        _leftDirPanel.Padding = new Padding(8);
        _leftDirPanel.Size = new Size(1026, 744);
        _leftDirPanel.TabIndex = 0;
        // 
        // _leftDirTree
        // 
        _leftDirTree.BackColor = Color.FromArgb(255, 255, 255);
        _leftDirTree.BorderStyle = BorderStyle.FixedSingle;
        _leftDirTree.Dock = DockStyle.Fill;
        _leftDirTree.ForeColor = Color.FromArgb(33, 37, 41);
        _leftDirTree.HideSelection = false;
        _leftDirTree.Location = new Point(8, 32);
        _leftDirTree.Name = "_leftDirTree";
        _leftDirTree.Size = new Size(1008, 702);
        _leftDirTree.TabIndex = 0;
        // 
        // _leftDirLabel
        // 
        _leftDirLabel.AutoEllipsis = true;
        _leftDirLabel.BackColor = Color.FromArgb(235, 241, 248);
        _leftDirLabel.Dock = DockStyle.Top;
        _leftDirLabel.ForeColor = Color.FromArgb(92, 99, 112);
        _leftDirLabel.Location = new Point(8, 8);
        _leftDirLabel.Name = "_leftDirLabel";
        _leftDirLabel.Padding = new Padding(8, 0, 0, 0);
        _leftDirLabel.Size = new Size(1008, 28);
        _leftDirLabel.TabIndex = 1;
        _leftDirLabel.Text = "Left: (not selected)";
        // 
        // _rightDirPanel
        // 
        _rightDirPanel.BackColor = Color.FromArgb(255, 255, 255);
        _rightDirPanel.BorderStyle = BorderStyle.FixedSingle;
        _rightDirPanel.Controls.Add(_rightDirTree);
        _rightDirPanel.Controls.Add(_rightDirLabel);
        _rightDirPanel.Dock = DockStyle.Fill;
        _rightDirPanel.Location = new Point(8, 8);
        _rightDirPanel.Name = "_rightDirPanel";
        _rightDirPanel.Padding = new Padding(8);
        _rightDirPanel.Size = new Size(230, 744);
        _rightDirPanel.TabIndex = 0;
        // 
        // _rightDirTree
        // 
        _rightDirTree.BackColor = Color.FromArgb(255, 255, 255);
        _rightDirTree.BorderStyle = BorderStyle.FixedSingle;
        _rightDirTree.Dock = DockStyle.Fill;
        _rightDirTree.ForeColor = Color.FromArgb(33, 37, 41);
        _rightDirTree.HideSelection = false;
        _rightDirTree.Location = new Point(8, 32);
        _rightDirTree.Name = "_rightDirTree";
        _rightDirTree.Size = new Size(212, 702);
        _rightDirTree.TabIndex = 0;
        // 
        // _rightDirLabel
        // 
        _rightDirLabel.AutoEllipsis = true;
        _rightDirLabel.BackColor = Color.FromArgb(235, 241, 248);
        _rightDirLabel.Dock = DockStyle.Top;
        _rightDirLabel.ForeColor = Color.FromArgb(92, 99, 112);
        _rightDirLabel.Location = new Point(8, 8);
        _rightDirLabel.Name = "_rightDirLabel";
        _rightDirLabel.Padding = new Padding(8, 0, 0, 0);
        _rightDirLabel.Size = new Size(212, 28);
        _rightDirLabel.TabIndex = 1;
        _rightDirLabel.Text = "Right: (not selected)";
        // 
        // _dirTopBar
        // 
        _dirTopBar.Controls.Add(_leftDirButton);
        _dirTopBar.Controls.Add(_rightDirButton);
        _dirTopBar.Controls.Add(_excludeLabel);
        _dirTopBar.Controls.Add(_excludePattern);
        _dirTopBar.Controls.Add(_dirIgnoreWhitespace);
        _dirTopBar.Controls.Add(_dirIgnoreCase);
        _dirTopBar.Controls.Add(_compareDirButton);
        _dirTopBar.Padding = new Padding(8, 6, 8, 6);
        _dirTopBar.BackColor = Color.FromArgb(245, 247, 250);
        _dirTopBar.Dock = DockStyle.Top;
        _dirTopBar.Location = new Point(0, 0);
        _dirTopBar.Name = "_dirTopBar";
        _dirTopBar.Size = new Size(1292, 44);
        _dirTopBar.TabIndex = 1;
        _dirTopBar.WrapContents = false;
        // 
        // _leftDirButton
        // 
        _leftDirButton.BackColor = Color.FromArgb(255, 255, 255);
        _leftDirButton.FlatAppearance.BorderColor = Color.FromArgb(76, 84, 98);
        _leftDirButton.FlatStyle = FlatStyle.Flat;
        _leftDirButton.ForeColor = Color.FromArgb(33, 37, 41);
        _leftDirButton.Location = new Point(8, 6);
        _leftDirButton.Margin = new Padding(0, 0, 6, 0);
        _leftDirButton.Name = "_leftDirButton";
        _leftDirButton.Size = new Size(160, 30);
        _leftDirButton.TabIndex = 0;
        _leftDirButton.Text = "Left Directory Select";
        _leftDirButton.UseVisualStyleBackColor = false;
        _leftDirButton.Click += LeftDirButton_Click;
        // 
        // _rightDirButton
        // 
        _rightDirButton.BackColor = Color.FromArgb(255, 255, 255);
        _rightDirButton.FlatAppearance.BorderColor = Color.FromArgb(76, 84, 98);
        _rightDirButton.FlatStyle = FlatStyle.Flat;
        _rightDirButton.ForeColor = Color.FromArgb(33, 37, 41);
        _rightDirButton.Location = new Point(174, 6);
        _rightDirButton.Margin = new Padding(0, 0, 6, 0);
        _rightDirButton.Name = "_rightDirButton";
        _rightDirButton.Size = new Size(160, 30);
        _rightDirButton.TabIndex = 1;
        _rightDirButton.Text = "Right Directory Select";
        _rightDirButton.UseVisualStyleBackColor = false;
        _rightDirButton.Click += RightDirButton_Click;
        // 
        // _excludeLabel
        // 
        _excludeLabel.ForeColor = Color.FromArgb(92, 99, 112);
        _excludeLabel.Location = new Point(344, 8);
        _excludeLabel.Margin = new Padding(4, 2, 0, 0);
        _excludeLabel.Name = "_excludeLabel";
        _excludeLabel.Size = new Size(80, 26);
        _excludeLabel.TabIndex = 2;
        _excludeLabel.Text = "Exclude:";
        _excludeLabel.TextAlign = ContentAlignment.MiddleRight;
        // 
        // _excludePattern
        // 
        _excludePattern.BackColor = Color.FromArgb(255, 255, 255);
        _excludePattern.BorderStyle = BorderStyle.FixedSingle;
        _excludePattern.ForeColor = Color.FromArgb(33, 37, 41);
        _excludePattern.Location = new Point(424, 8);
        _excludePattern.Margin = new Padding(2, 0, 8, 0);
        _excludePattern.Name = "_excludePattern";
        _excludePattern.Size = new Size(200, 25);
        _excludePattern.TabIndex = 3;
        _excludePattern.Text = ".git;bin;obj";
        // 
        // _dirIgnoreWhitespace
        // 
        _dirIgnoreWhitespace.AutoSize = true;
        _dirIgnoreWhitespace.ForeColor = Color.FromArgb(92, 99, 112);
        _dirIgnoreWhitespace.Location = new Point(634, 8);
        _dirIgnoreWhitespace.Margin = new Padding(0, 2, 8, 0);
        _dirIgnoreWhitespace.Name = "_dirIgnoreWhitespace";
        _dirIgnoreWhitespace.Size = new Size(142, 23);
        _dirIgnoreWhitespace.TabIndex = 4;
        _dirIgnoreWhitespace.Text = "Ignore Whitespace";
        // 
        // _dirIgnoreCase
        // 
        _dirIgnoreCase.AutoSize = true;
        _dirIgnoreCase.ForeColor = Color.FromArgb(92, 99, 112);
        _dirIgnoreCase.Location = new Point(784, 8);
        _dirIgnoreCase.Margin = new Padding(0, 2, 8, 0);
        _dirIgnoreCase.Name = "_dirIgnoreCase";
        _dirIgnoreCase.Size = new Size(101, 23);
        _dirIgnoreCase.TabIndex = 5;
        _dirIgnoreCase.Text = "Ignore Case";
        // 
        // _compareDirButton
        // 
        _compareDirButton.BackColor = Color.FromArgb(43, 123, 229);
        _compareDirButton.FlatAppearance.BorderColor = Color.FromArgb(37, 105, 196);
        _compareDirButton.FlatStyle = FlatStyle.Flat;
        _compareDirButton.ForeColor = Color.White;
        _compareDirButton.Location = new Point(893, 6);
        _compareDirButton.Margin = new Padding(0, 0, 0, 0);
        _compareDirButton.Name = "_compareDirButton";
        _compareDirButton.Size = new Size(100, 30);
        _compareDirButton.TabIndex = 6;
        _compareDirButton.Text = "Compare";
        _compareDirButton.UseVisualStyleBackColor = false;
        _compareDirButton.Click += CompareDirButton_Click;
        // 
        // _fileTab
        // 
        _fileTab.BackColor = Color.FromArgb(245, 247, 250);
        _fileTab.Controls.Add(_fileSplit);
        _fileTab.Controls.Add(_fileTopBar);
        _fileTab.ForeColor = Color.FromArgb(33, 37, 41);
        _fileTab.Location = new Point(4, 32);
        _fileTab.Name = "_fileTab";
        _fileTab.Size = new Size(1292, 802);
        _fileTab.TabIndex = 1;
        _fileTab.Text = "File Compare";
        // 
        // _fileSplit
        // 
        _fileSplit.BackColor = Color.FromArgb(245, 247, 250);
        _fileSplit.Dock = DockStyle.Fill;
        _fileSplit.Location = new Point(0, 42);
        _fileSplit.Name = "_fileSplit";
        // 
        // _fileSplit.Panel1
        // 
        _fileSplit.Panel1.Controls.Add(_leftFilePanel);
        _fileSplit.Panel1.Padding = new Padding(8);
        // 
        // _fileSplit.Panel2
        // 
        _fileSplit.Panel2.Controls.Add(_rightFilePanel);
        _fileSplit.Panel2.Padding = new Padding(8);
        _fileSplit.Size = new Size(1292, 760);
        _fileSplit.SplitterDistance = 1036;
        _fileSplit.TabIndex = 0;
        _fileSplit.Resize += FileSplit_Resize;
        // 
        // _leftFilePanel
        // 
        _leftFilePanel.BackColor = Color.FromArgb(255, 255, 255);
        _leftFilePanel.BorderStyle = BorderStyle.FixedSingle;
        _leftFilePanel.Controls.Add(_leftDiffLayout);
        _leftFilePanel.Controls.Add(_leftFileLabel);
        _leftFilePanel.Dock = DockStyle.Fill;
        _leftFilePanel.Location = new Point(8, 8);
        _leftFilePanel.Name = "_leftFilePanel";
        _leftFilePanel.Padding = new Padding(8);
        _leftFilePanel.Size = new Size(1020, 744);
        _leftFilePanel.TabIndex = 0;
        // 
        // _leftDiffLayout
        // 
        _leftDiffLayout.ColumnCount = 2;
        _leftDiffLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        _leftDiffLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 14F));
        _leftDiffLayout.Controls.Add(_leftDiff, 0, 0);
        _leftDiffLayout.Controls.Add(_leftIndicator, 1, 0);
        _leftDiffLayout.Dock = DockStyle.Fill;
        _leftDiffLayout.Location = new Point(8, 32);
        _leftDiffLayout.Name = "_leftDiffLayout";
        _leftDiffLayout.RowCount = 1;
        _leftDiffLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 20F));
        _leftDiffLayout.Size = new Size(1002, 702);
        _leftDiffLayout.TabIndex = 0;
        // 
        // _leftDiff
        // 
        _leftDiff.BackColor = Color.FromArgb(255, 255, 255);
        _leftDiff.BorderStyle = BorderStyle.FixedSingle;
        _leftDiff.Dock = DockStyle.Fill;
        _leftDiff.Font = new Font("Consolas", 10F);
        _leftDiff.ForeColor = Color.FromArgb(33, 37, 41);
        _leftDiff.Location = new Point(3, 3);
        _leftDiff.Name = "_leftDiff";
        _leftDiff.ReadOnly = true;
        _leftDiff.Size = new Size(982, 696);
        _leftDiff.TabIndex = 0;
        _leftDiff.Text = "";
        _leftDiff.WordWrap = false;
        // 
        // _leftIndicator
        // 
        _leftIndicator.Dock = DockStyle.Fill;
        _leftIndicator.Location = new Point(991, 3);
        _leftIndicator.Name = "_leftIndicator";
        _leftIndicator.Size = new Size(8, 696);
        _leftIndicator.TabIndex = 1;
        // 
        // _leftFileLabel
        // 
        _leftFileLabel.AutoEllipsis = true;
        _leftFileLabel.BackColor = Color.FromArgb(235, 241, 248);
        _leftFileLabel.Dock = DockStyle.Top;
        _leftFileLabel.ForeColor = Color.FromArgb(92, 99, 112);
        _leftFileLabel.Location = new Point(8, 8);
        _leftFileLabel.Name = "_leftFileLabel";
        _leftFileLabel.Padding = new Padding(8, 0, 0, 0);
        _leftFileLabel.Size = new Size(1002, 28);
        _leftFileLabel.TabIndex = 1;
        _leftFileLabel.Text = "Left: (not selected)";
        // 
        // _rightFilePanel
        // 
        _rightFilePanel.BackColor = Color.FromArgb(255, 255, 255);
        _rightFilePanel.BorderStyle = BorderStyle.FixedSingle;
        _rightFilePanel.Controls.Add(_rightDiffLayout);
        _rightFilePanel.Controls.Add(_rightFileLabel);
        _rightFilePanel.Dock = DockStyle.Fill;
        _rightFilePanel.Location = new Point(8, 8);
        _rightFilePanel.Name = "_rightFilePanel";
        _rightFilePanel.Padding = new Padding(8);
        _rightFilePanel.Size = new Size(236, 744);
        _rightFilePanel.TabIndex = 0;
        // 
        // _rightDiffLayout
        // 
        _rightDiffLayout.ColumnCount = 2;
        _rightDiffLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 14F));
        _rightDiffLayout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        _rightDiffLayout.Controls.Add(_rightIndicator, 0, 0);
        _rightDiffLayout.Controls.Add(_rightDiff, 1, 0);
        _rightDiffLayout.Dock = DockStyle.Fill;
        _rightDiffLayout.Location = new Point(8, 32);
        _rightDiffLayout.Name = "_rightDiffLayout";
        _rightDiffLayout.RowCount = 1;
        _rightDiffLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 20F));
        _rightDiffLayout.Size = new Size(218, 702);
        _rightDiffLayout.TabIndex = 0;
        // 
        // _rightIndicator
        // 
        _rightIndicator.Dock = DockStyle.Fill;
        _rightIndicator.Location = new Point(3, 3);
        _rightIndicator.Name = "_rightIndicator";
        _rightIndicator.Size = new Size(8, 696);
        _rightIndicator.TabIndex = 0;
        // 
        // _rightDiff
        // 
        _rightDiff.BackColor = Color.FromArgb(255, 255, 255);
        _rightDiff.BorderStyle = BorderStyle.FixedSingle;
        _rightDiff.Dock = DockStyle.Fill;
        _rightDiff.Font = new Font("Consolas", 10F);
        _rightDiff.ForeColor = Color.FromArgb(33, 37, 41);
        _rightDiff.Location = new Point(17, 3);
        _rightDiff.Name = "_rightDiff";
        _rightDiff.ReadOnly = true;
        _rightDiff.Size = new Size(198, 696);
        _rightDiff.TabIndex = 1;
        _rightDiff.Text = "";
        _rightDiff.WordWrap = false;
        // 
        // _rightFileLabel
        // 
        _rightFileLabel.AutoEllipsis = true;
        _rightFileLabel.BackColor = Color.FromArgb(235, 241, 248);
        _rightFileLabel.Dock = DockStyle.Top;
        _rightFileLabel.ForeColor = Color.FromArgb(92, 99, 112);
        _rightFileLabel.Location = new Point(8, 8);
        _rightFileLabel.Name = "_rightFileLabel";
        _rightFileLabel.Padding = new Padding(8, 0, 0, 0);
        _rightFileLabel.Size = new Size(218, 28);
        _rightFileLabel.TabIndex = 1;
        _rightFileLabel.Text = "Right: (not selected)";
        // 
        // _fileTopBar
        // 
        _fileTopBar.Controls.Add(_leftFileButton);
        _fileTopBar.Controls.Add(_rightFileButton);
        _fileTopBar.Controls.Add(_fileIgnoreWhitespace);
        _fileTopBar.Controls.Add(_fileIgnoreCase);
        _fileTopBar.Controls.Add(_compareFileButton);
        _fileTopBar.Padding = new Padding(8, 6, 8, 6);
        _fileTopBar.BackColor = Color.FromArgb(245, 247, 250);
        _fileTopBar.Dock = DockStyle.Top;
        _fileTopBar.Location = new Point(0, 0);
        _fileTopBar.Name = "_fileTopBar";
        _fileTopBar.Size = new Size(1292, 44);
        _fileTopBar.TabIndex = 1;
        _fileTopBar.WrapContents = false;
        // 
        // _leftFileButton
        // 
        _leftFileButton.BackColor = Color.FromArgb(255, 255, 255);
        _leftFileButton.FlatAppearance.BorderColor = Color.FromArgb(76, 84, 98);
        _leftFileButton.FlatStyle = FlatStyle.Flat;
        _leftFileButton.ForeColor = Color.FromArgb(33, 37, 41);
        _leftFileButton.Location = new Point(8, 6);
        _leftFileButton.Margin = new Padding(0, 0, 6, 0);
        _leftFileButton.Name = "_leftFileButton";
        _leftFileButton.Size = new Size(160, 30);
        _leftFileButton.TabIndex = 0;
        _leftFileButton.Text = "Left File Select";
        _leftFileButton.UseVisualStyleBackColor = false;
        _leftFileButton.Click += LeftFileButton_Click;
        // 
        // _rightFileButton
        // 
        _rightFileButton.BackColor = Color.FromArgb(255, 255, 255);
        _rightFileButton.FlatAppearance.BorderColor = Color.FromArgb(76, 84, 98);
        _rightFileButton.FlatStyle = FlatStyle.Flat;
        _rightFileButton.ForeColor = Color.FromArgb(33, 37, 41);
        _rightFileButton.Location = new Point(174, 6);
        _rightFileButton.Margin = new Padding(0, 0, 6, 0);
        _rightFileButton.Name = "_rightFileButton";
        _rightFileButton.Size = new Size(160, 30);
        _rightFileButton.TabIndex = 1;
        _rightFileButton.Text = "Right File Select";
        _rightFileButton.UseVisualStyleBackColor = false;
        _rightFileButton.Click += RightFileButton_Click;
        // 
        // _fileIgnoreWhitespace
        // 
        _fileIgnoreWhitespace.AutoSize = true;
        _fileIgnoreWhitespace.ForeColor = Color.FromArgb(92, 99, 112);
        _fileIgnoreWhitespace.Location = new Point(342, 8);
        _fileIgnoreWhitespace.Margin = new Padding(0, 2, 8, 0);
        _fileIgnoreWhitespace.Name = "_fileIgnoreWhitespace";
        _fileIgnoreWhitespace.Size = new Size(142, 23);
        _fileIgnoreWhitespace.TabIndex = 2;
        _fileIgnoreWhitespace.Text = "Ignore Whitespace";
        // 
        // _fileIgnoreCase
        // 
        _fileIgnoreCase.AutoSize = true;
        _fileIgnoreCase.ForeColor = Color.FromArgb(92, 99, 112);
        _fileIgnoreCase.Location = new Point(492, 8);
        _fileIgnoreCase.Margin = new Padding(0, 2, 8, 0);
        _fileIgnoreCase.Name = "_fileIgnoreCase";
        _fileIgnoreCase.Size = new Size(101, 23);
        _fileIgnoreCase.TabIndex = 3;
        _fileIgnoreCase.Text = "Ignore Case";
        // 
        // _compareFileButton
        // 
        _compareFileButton.BackColor = Color.FromArgb(43, 123, 229);
        _compareFileButton.FlatAppearance.BorderColor = Color.FromArgb(37, 105, 196);
        _compareFileButton.FlatStyle = FlatStyle.Flat;
        _compareFileButton.ForeColor = Color.White;
        _compareFileButton.Location = new Point(601, 6);
        _compareFileButton.Margin = new Padding(0, 0, 8, 0);
        _compareFileButton.Name = "_compareFileButton";
        _compareFileButton.Size = new Size(100, 30);
        _compareFileButton.TabIndex = 4;
        _compareFileButton.Text = "Compare";
        _compareFileButton.UseVisualStyleBackColor = false;
        _compareFileButton.Click += CompareFileButton_Click;
        // 
        // _dirStatusIcons
        // 
        _dirStatusIcons.ColorDepth = ColorDepth.Depth32Bit;
        _dirStatusIcons.ImageSize = new Size(16, 16);
        _dirStatusIcons.TransparentColor = Color.Transparent;
        // 
        // _statusStrip
        // 
        _statusStrip.BackColor = Color.FromArgb(255, 255, 255);
        _statusStrip.Items.AddRange(new ToolStripItem[] { _statusLabel });
        _statusStrip.Location = new Point(0, 838);
        _statusStrip.Name = "_statusStrip";
        _statusStrip.Size = new Size(1300, 22);
        _statusStrip.SizingGrip = false;
        _statusStrip.TabIndex = 1;
        // 
        // _statusLabel
        // 
        _statusLabel.ForeColor = Color.FromArgb(33, 37, 41);
        _statusLabel.Name = "_statusLabel";
        _statusLabel.Size = new Size(1285, 17);
        _statusLabel.Spring = true;
        _statusLabel.Text = "Ready";
        _statusLabel.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // CompareForm
        // 
        AutoScaleDimensions = new SizeF(7F, 17F);
        AutoScaleMode = AutoScaleMode.Font;
        BackColor = Color.FromArgb(245, 247, 250);
        ClientSize = new Size(1300, 860);
        Controls.Add(_tabs);
        Controls.Add(_statusStrip);
        Font = new Font("Segoe UI", 10F);
        ForeColor = Color.FromArgb(33, 37, 41);
        Icon = (Icon)resources.GetObject("$this.Icon");
        Name = "CompareForm";
        Text = "CompareMasterWinV10 - Rebuilt WinForms UI";
        _tabs.ResumeLayout(false);
        _directoryTab.ResumeLayout(false);
        _dirSplit.Panel1.ResumeLayout(false);
        _dirSplit.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)_dirSplit).EndInit();
        _dirSplit.ResumeLayout(false);
        _leftDirPanel.ResumeLayout(false);
        _rightDirPanel.ResumeLayout(false);
        _dirTopBar.ResumeLayout(false);
        _dirTopBar.PerformLayout();
        _fileTab.ResumeLayout(false);
        _fileSplit.Panel1.ResumeLayout(false);
        _fileSplit.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)_fileSplit).EndInit();
        _fileSplit.ResumeLayout(false);
        _leftFilePanel.ResumeLayout(false);
        _leftDiffLayout.ResumeLayout(false);
        _rightFilePanel.ResumeLayout(false);
        _rightDiffLayout.ResumeLayout(false);
        _fileTopBar.ResumeLayout(false);
        _fileTopBar.PerformLayout();
        _statusStrip.ResumeLayout(false);
        _statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    private void DirSplit_Resize(object sender, EventArgs e)
    {
        _dirSplit.SplitterDistance = Math.Max(100, _dirSplit.Width / 2);
    }

    private void FileSplit_Resize(object sender, EventArgs e)
    {
        _fileSplit.SplitterDistance = Math.Max(100, _fileSplit.Width / 2);
    }

    private void LeftDirButton_Click(object sender, EventArgs e)
    {
        SelectDirectory(true);
    }

    private void RightDirButton_Click(object sender, EventArgs e)
    {
        SelectDirectory(false);
    }

    private void CompareDirButton_Click(object sender, EventArgs e)
    {
        CompareDirectories();
    }

    private void LeftFileButton_Click(object sender, EventArgs e)
    {
        SelectFile(true);
    }

    private void RightFileButton_Click(object sender, EventArgs e)
    {
        SelectFile(false);
    }

    private void CompareFileButton_Click(object sender, EventArgs e)
    {
        CompareFiles();
    }

    #endregion
}
