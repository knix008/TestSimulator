namespace ReqTrace.Forms;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
        {
            components.Dispose();
        }
        base.Dispose(disposing);
    }

    private MenuStrip menuStrip1;
    private ToolStrip toolStrip1;
    private StatusStrip statusStrip1;
    private SplitContainer splitContainerMain;
    private SplitContainer splitContainerDetail;
    private ListView reqListView;
    private DataGridView testCaseGrid;
    private Panel detailPanel;
    private TableLayoutPanel detailTable;
    private TextBox txtDetailCode;
    private TextBox txtDetailTitle;
    private TextBox txtDetailCategory;
    private ComboBox cboDetailPriority;
    private ComboBox cboDetailStatus;
    private TextBox txtDetailDescription;
    private Button btnEditRequirement;
    private Label lblCode, lblTitle, lblCategory, lblPriority, lblStatusField, lblDescription;
    private Label lblTreeHeader, lblDetailHeader, lblTestCasesHeader;

    private ToolStripStatusLabel statusFileLabel;
    private ToolStripStatusLabel statusCountLabel;
    private ToolStripStatusLabel statusCoverageLabel;
    private ToolStripStatusLabel statusPassRateLabel;

    private ToolStripMenuItem fileMenu, newProjectMenuItem, openProjectMenuItem, saveMenuItem, saveAsMenuItem,
        importExcelMenuItem, exportReportMenuItem, recentFilesMenuItem, exitMenuItem;
    private ToolStripMenuItem editMenu, addRequirementMenuItem, editRequirementMenuItem, deleteRequirementMenuItem,
        addTestCaseMenuItem, editTestCaseMenuItem, deleteTestCaseMenuItem, recordTestRunMenuItem;
    private ToolStripMenuItem viewMenu, groupByCategoryMenuItem, groupByHierarchyMenuItem, refreshMenuItem, searchToggleMenuItem;
    private ToolStripMenuItem toolsMenu, traceabilitySummaryMenuItem, llmSettingsMenuItem, optionsMenuItem;
    private ToolStripMenuItem helpMenu, aboutMenuItem;

    private ToolStripButton newToolButton, openToolButton, saveToolButton, importExcelToolButton, exportReportToolButton,
        addRequirementToolButton, editRequirementToolButton, deleteRequirementToolButton,
        addTestCaseToolButton, recordTestRunToolButton;

    private void InitializeComponent()
    {
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
        menuStrip1 = new MenuStrip();
        fileMenu = new ToolStripMenuItem();
        newProjectMenuItem = new ToolStripMenuItem();
        openProjectMenuItem = new ToolStripMenuItem();
        saveMenuItem = new ToolStripMenuItem();
        saveAsMenuItem = new ToolStripMenuItem();
        importExcelMenuItem = new ToolStripMenuItem();
        exportReportMenuItem = new ToolStripMenuItem();
        recentFilesMenuItem = new ToolStripMenuItem();
        exitMenuItem = new ToolStripMenuItem();
        editMenu = new ToolStripMenuItem();
        addRequirementMenuItem = new ToolStripMenuItem();
        editRequirementMenuItem = new ToolStripMenuItem();
        deleteRequirementMenuItem = new ToolStripMenuItem();
        addTestCaseMenuItem = new ToolStripMenuItem();
        editTestCaseMenuItem = new ToolStripMenuItem();
        deleteTestCaseMenuItem = new ToolStripMenuItem();
        recordTestRunMenuItem = new ToolStripMenuItem();
        viewMenu = new ToolStripMenuItem();
        groupByCategoryMenuItem = new ToolStripMenuItem();
        groupByHierarchyMenuItem = new ToolStripMenuItem();
        refreshMenuItem = new ToolStripMenuItem();
        searchToggleMenuItem = new ToolStripMenuItem();
        toolsMenu = new ToolStripMenuItem();
        traceabilitySummaryMenuItem = new ToolStripMenuItem();
        llmSettingsMenuItem = new ToolStripMenuItem();
        optionsMenuItem = new ToolStripMenuItem();
        helpMenu = new ToolStripMenuItem();
        aboutMenuItem = new ToolStripMenuItem();
        toolStrip1 = new ToolStrip();
        newToolButton = new ToolStripButton();
        openToolButton = new ToolStripButton();
        saveToolButton = new ToolStripButton();
        importExcelToolButton = new ToolStripButton();
        exportReportToolButton = new ToolStripButton();
        addRequirementToolButton = new ToolStripButton();
        editRequirementToolButton = new ToolStripButton();
        deleteRequirementToolButton = new ToolStripButton();
        addTestCaseToolButton = new ToolStripButton();
        recordTestRunToolButton = new ToolStripButton();
        statusStrip1 = new StatusStrip();
        statusFileLabel = new ToolStripStatusLabel();
        statusCountLabel = new ToolStripStatusLabel();
        statusCoverageLabel = new ToolStripStatusLabel();
        statusPassRateLabel = new ToolStripStatusLabel();
        splitContainerMain = new SplitContainer();
        reqListView = new ListView();
        lblTreeHeader = new Label();
        splitContainerDetail = new SplitContainer();
        detailPanel = new Panel();
        detailTable = new TableLayoutPanel();
        lblCode = new Label();
        txtDetailCode = new TextBox();
        lblTitle = new Label();
        txtDetailTitle = new TextBox();
        lblCategory = new Label();
        txtDetailCategory = new TextBox();
        lblDescription = new Label();
        txtDetailDescription = new TextBox();
        lblPriority = new Label();
        cboDetailPriority = new ComboBox();
        lblStatusField = new Label();
        cboDetailStatus = new ComboBox();
        btnEditRequirement = new Button();
        lblDetailHeader = new Label();
        testCaseGrid = new DataGridView();
        lblTestCasesHeader = new Label();
        menuStrip1.SuspendLayout();
        toolStrip1.SuspendLayout();
        statusStrip1.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitContainerMain).BeginInit();
        splitContainerMain.Panel1.SuspendLayout();
        splitContainerMain.Panel2.SuspendLayout();
        splitContainerMain.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitContainerDetail).BeginInit();
        splitContainerDetail.Panel1.SuspendLayout();
        splitContainerDetail.Panel2.SuspendLayout();
        splitContainerDetail.SuspendLayout();
        detailPanel.SuspendLayout();
        detailTable.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)testCaseGrid).BeginInit();
        SuspendLayout();
        // 
        // menuStrip1
        // 
        menuStrip1.Items.AddRange(new ToolStripItem[] { fileMenu, editMenu, viewMenu, toolsMenu, helpMenu });
        menuStrip1.Location = new Point(0, 0);
        menuStrip1.Name = "menuStrip1";
        menuStrip1.Size = new Size(1600, 24);
        menuStrip1.TabIndex = 2;
        // 
        // fileMenu
        // 
        fileMenu.DropDownItems.AddRange(new ToolStripItem[] { newProjectMenuItem, openProjectMenuItem, saveMenuItem, saveAsMenuItem, importExcelMenuItem, exportReportMenuItem, recentFilesMenuItem, exitMenuItem });
        fileMenu.Name = "fileMenu";
        fileMenu.Size = new Size(37, 20);
        fileMenu.Text = "&File";
        // 
        // newProjectMenuItem
        // 
        newProjectMenuItem.Name = "newProjectMenuItem";
        newProjectMenuItem.ShortcutKeys = Keys.Control | Keys.N;
        newProjectMenuItem.Size = new Size(217, 22);
        newProjectMenuItem.Text = "&New Project";
        // 
        // openProjectMenuItem
        // 
        openProjectMenuItem.Name = "openProjectMenuItem";
        openProjectMenuItem.ShortcutKeys = Keys.Control | Keys.O;
        openProjectMenuItem.Size = new Size(217, 22);
        openProjectMenuItem.Text = "&Open Project...";
        // 
        // saveMenuItem
        // 
        saveMenuItem.Name = "saveMenuItem";
        saveMenuItem.ShortcutKeys = Keys.Control | Keys.S;
        saveMenuItem.Size = new Size(217, 22);
        saveMenuItem.Text = "&Save";
        // 
        // saveAsMenuItem
        // 
        saveAsMenuItem.Name = "saveAsMenuItem";
        saveAsMenuItem.ShortcutKeys = Keys.Control | Keys.Shift | Keys.S;
        saveAsMenuItem.Size = new Size(217, 22);
        saveAsMenuItem.Text = "Save &As...";
        // 
        // importExcelMenuItem
        // 
        importExcelMenuItem.Name = "importExcelMenuItem";
        importExcelMenuItem.ShortcutKeys = Keys.Control | Keys.I;
        importExcelMenuItem.Size = new Size(217, 22);
        importExcelMenuItem.Text = "&Import from Excel...";
        // 
        // exportReportMenuItem
        // 
        exportReportMenuItem.Name = "exportReportMenuItem";
        exportReportMenuItem.ShortcutKeys = Keys.Control | Keys.E;
        exportReportMenuItem.Size = new Size(217, 22);
        exportReportMenuItem.Text = "&Export Report...";
        // 
        // recentFilesMenuItem
        // 
        recentFilesMenuItem.Name = "recentFilesMenuItem";
        recentFilesMenuItem.Size = new Size(217, 22);
        recentFilesMenuItem.Text = "Recent &Projects";
        // 
        // exitMenuItem
        // 
        exitMenuItem.Name = "exitMenuItem";
        exitMenuItem.Size = new Size(217, 22);
        exitMenuItem.Text = "E&xit";
        // 
        // editMenu
        // 
        editMenu.DropDownItems.AddRange(new ToolStripItem[] { addRequirementMenuItem, editRequirementMenuItem, deleteRequirementMenuItem, addTestCaseMenuItem, editTestCaseMenuItem, deleteTestCaseMenuItem, recordTestRunMenuItem });
        editMenu.Name = "editMenu";
        editMenu.Size = new Size(39, 20);
        editMenu.Text = "&Edit";
        // 
        // addRequirementMenuItem
        // 
        addRequirementMenuItem.Name = "addRequirementMenuItem";
        addRequirementMenuItem.ShortcutKeys = Keys.Control | Keys.Shift | Keys.N;
        addRequirementMenuItem.Size = new Size(244, 22);
        addRequirementMenuItem.Text = "Add &Requirement";
        // 
        // editRequirementMenuItem
        // 
        editRequirementMenuItem.Name = "editRequirementMenuItem";
        editRequirementMenuItem.ShortcutKeys = Keys.F2;
        editRequirementMenuItem.Size = new Size(244, 22);
        editRequirementMenuItem.Text = "&Edit Requirement";
        // 
        // deleteRequirementMenuItem
        // 
        deleteRequirementMenuItem.Name = "deleteRequirementMenuItem";
        deleteRequirementMenuItem.ShortcutKeys = Keys.Delete;
        deleteRequirementMenuItem.Size = new Size(244, 22);
        deleteRequirementMenuItem.Text = "&Delete Requirement";
        // 
        // addTestCaseMenuItem
        // 
        addTestCaseMenuItem.Name = "addTestCaseMenuItem";
        addTestCaseMenuItem.ShortcutKeys = Keys.Control | Keys.T;
        addTestCaseMenuItem.Size = new Size(244, 22);
        addTestCaseMenuItem.Text = "Add &Test Case";
        // 
        // editTestCaseMenuItem
        // 
        editTestCaseMenuItem.Name = "editTestCaseMenuItem";
        editTestCaseMenuItem.ShortcutKeys = Keys.Shift | Keys.F2;
        editTestCaseMenuItem.Size = new Size(244, 22);
        editTestCaseMenuItem.Text = "Edit Test &Case";
        // 
        // deleteTestCaseMenuItem
        // 
        deleteTestCaseMenuItem.Name = "deleteTestCaseMenuItem";
        deleteTestCaseMenuItem.ShortcutKeys = Keys.Shift | Keys.Delete;
        deleteTestCaseMenuItem.Size = new Size(244, 22);
        deleteTestCaseMenuItem.Text = "Delete Test C&ase";
        // 
        // recordTestRunMenuItem
        // 
        recordTestRunMenuItem.Name = "recordTestRunMenuItem";
        recordTestRunMenuItem.ShortcutKeys = Keys.F5;
        recordTestRunMenuItem.Size = new Size(244, 22);
        recordTestRunMenuItem.Text = "&Record Test Run";
        // 
        // viewMenu
        // 
        viewMenu.DropDownItems.AddRange(new ToolStripItem[] { groupByCategoryMenuItem, groupByHierarchyMenuItem, refreshMenuItem, searchToggleMenuItem });
        viewMenu.Name = "viewMenu";
        viewMenu.Size = new Size(45, 20);
        viewMenu.Text = "&View";
        // 
        // groupByCategoryMenuItem
        // 
        groupByCategoryMenuItem.Checked = true;
        groupByCategoryMenuItem.CheckState = CheckState.Checked;
        groupByCategoryMenuItem.Name = "groupByCategoryMenuItem";
        groupByCategoryMenuItem.Size = new Size(189, 22);
        groupByCategoryMenuItem.Text = "Group by &Category";
        // 
        // groupByHierarchyMenuItem
        // 
        groupByHierarchyMenuItem.Name = "groupByHierarchyMenuItem";
        groupByHierarchyMenuItem.Size = new Size(189, 22);
        groupByHierarchyMenuItem.Text = "Group by &Hierarchy";
        // 
        // refreshMenuItem
        // 
        refreshMenuItem.Name = "refreshMenuItem";
        refreshMenuItem.ShortcutKeys = Keys.Control | Keys.R;
        refreshMenuItem.Size = new Size(189, 22);
        refreshMenuItem.Text = "&Refresh";
        // 
        // searchToggleMenuItem
        // 
        searchToggleMenuItem.Name = "searchToggleMenuItem";
        searchToggleMenuItem.ShortcutKeys = Keys.Control | Keys.F;
        searchToggleMenuItem.Size = new Size(189, 22);
        searchToggleMenuItem.Text = "&Search / Filter";
        // 
        // toolsMenu
        // 
        toolsMenu.DropDownItems.AddRange(new ToolStripItem[] { traceabilitySummaryMenuItem, llmSettingsMenuItem, optionsMenuItem });
        toolsMenu.Name = "toolsMenu";
        toolsMenu.Size = new Size(47, 20);
        toolsMenu.Text = "&Tools";
        // 
        // traceabilitySummaryMenuItem
        // 
        traceabilitySummaryMenuItem.Name = "traceabilitySummaryMenuItem";
        traceabilitySummaryMenuItem.ShortcutKeys = Keys.Control | Keys.Shift | Keys.T;
        traceabilitySummaryMenuItem.Size = new Size(263, 22);
        traceabilitySummaryMenuItem.Text = "&Traceability Summary";
        // 
        // llmSettingsMenuItem
        // 
        llmSettingsMenuItem.Name = "llmSettingsMenuItem";
        llmSettingsMenuItem.Size = new Size(263, 22);
        llmSettingsMenuItem.Text = "LLM Settings...";
        // 
        // optionsMenuItem
        // 
        optionsMenuItem.Name = "optionsMenuItem";
        optionsMenuItem.Size = new Size(263, 22);
        optionsMenuItem.Text = "&Options...";
        // 
        // helpMenu
        // 
        helpMenu.DropDownItems.AddRange(new ToolStripItem[] { aboutMenuItem });
        helpMenu.Name = "helpMenu";
        helpMenu.Size = new Size(44, 20);
        helpMenu.Text = "&Help";
        // 
        // aboutMenuItem
        // 
        aboutMenuItem.Name = "aboutMenuItem";
        aboutMenuItem.Size = new Size(107, 22);
        aboutMenuItem.Text = "&About";
        // 
        // toolStrip1
        // 
        toolStrip1.Items.AddRange(new ToolStripItem[] { newToolButton, openToolButton, saveToolButton, importExcelToolButton, exportReportToolButton, addRequirementToolButton, editRequirementToolButton, deleteRequirementToolButton, addTestCaseToolButton, recordTestRunToolButton });
        toolStrip1.Location = new Point(0, 24);
        toolStrip1.Name = "toolStrip1";
        toolStrip1.Size = new Size(1600, 25);
        toolStrip1.TabIndex = 1;
        // 
        // newToolButton
        // 
        newToolButton.Name = "newToolButton";
        newToolButton.Size = new Size(35, 22);
        newToolButton.Text = "New";
        // 
        // openToolButton
        // 
        openToolButton.Name = "openToolButton";
        openToolButton.Size = new Size(40, 22);
        openToolButton.Text = "Open";
        // 
        // saveToolButton
        // 
        saveToolButton.Name = "saveToolButton";
        saveToolButton.Size = new Size(36, 22);
        saveToolButton.Text = "Save";
        // 
        // importExcelToolButton
        // 
        importExcelToolButton.Name = "importExcelToolButton";
        importExcelToolButton.Size = new Size(78, 22);
        importExcelToolButton.Text = "Import Excel";
        // 
        // exportReportToolButton
        // 
        exportReportToolButton.Name = "exportReportToolButton";
        exportReportToolButton.Size = new Size(84, 22);
        exportReportToolButton.Text = "Export Report";
        // 
        // addRequirementToolButton
        // 
        addRequirementToolButton.Name = "addRequirementToolButton";
        addRequirementToolButton.Size = new Size(57, 22);
        addRequirementToolButton.Text = "Add Req";
        // 
        // editRequirementToolButton
        // 
        editRequirementToolButton.Name = "editRequirementToolButton";
        editRequirementToolButton.Size = new Size(55, 22);
        editRequirementToolButton.Text = "Edit Req";
        // 
        // deleteRequirementToolButton
        // 
        deleteRequirementToolButton.Name = "deleteRequirementToolButton";
        deleteRequirementToolButton.Size = new Size(69, 22);
        deleteRequirementToolButton.Text = "Delete Req";
        // 
        // addTestCaseToolButton
        // 
        addTestCaseToolButton.Name = "addTestCaseToolButton";
        addTestCaseToolButton.Size = new Size(58, 22);
        addTestCaseToolButton.Text = "Add Test";
        // 
        // recordTestRunToolButton
        // 
        recordTestRunToolButton.Name = "recordTestRunToolButton";
        recordTestRunToolButton.Size = new Size(73, 22);
        recordTestRunToolButton.Text = "Record Run";
        // 
        // statusStrip1
        // 
        statusStrip1.Items.AddRange(new ToolStripItem[] { statusFileLabel, statusCountLabel, statusCoverageLabel, statusPassRateLabel });
        statusStrip1.Location = new Point(0, 828);
        statusStrip1.Name = "statusStrip1";
        statusStrip1.Size = new Size(1600, 22);
        statusStrip1.TabIndex = 3;
        // 
        // statusFileLabel
        // 
        statusFileLabel.Name = "statusFileLabel";
        statusFileLabel.Size = new Size(1332, 17);
        statusFileLabel.Spring = true;
        statusFileLabel.Text = "(no project)";
        statusFileLabel.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // statusCountLabel
        // 
        statusCountLabel.Name = "statusCountLabel";
        statusCountLabel.Size = new Size(94, 17);
        statusCountLabel.Text = "Requirements: 0";
        // 
        // statusCoverageLabel
        // 
        statusCoverageLabel.Name = "statusCoverageLabel";
        statusCoverageLabel.Size = new Size(81, 17);
        statusCoverageLabel.Text = "Coverage: 0%";
        // 
        // statusPassRateLabel
        // 
        statusPassRateLabel.Name = "statusPassRateLabel";
        statusPassRateLabel.Size = new Size(78, 17);
        statusPassRateLabel.Text = "Pass rate: 0%";
        // 
        // splitContainerMain
        // 
        splitContainerMain.Dock = DockStyle.Fill;
        splitContainerMain.Location = new Point(0, 49);
        splitContainerMain.Name = "splitContainerMain";
        // 
        // splitContainerMain.Panel1
        // 
        splitContainerMain.Panel1.Controls.Add(reqListView);
        splitContainerMain.Panel1.Controls.Add(lblTreeHeader);
        splitContainerMain.Panel1MinSize = 200;
        // 
        // splitContainerMain.Panel2
        // 
        splitContainerMain.Panel2.Controls.Add(splitContainerDetail);
        splitContainerMain.Panel2MinSize = 400;
        splitContainerMain.Size = new Size(1600, 779);
        splitContainerMain.SplitterDistance = 1012;
        splitContainerMain.TabIndex = 0;
        // 
        // reqListView
        // 
        reqListView.Dock = DockStyle.Fill;
        reqListView.FullRowSelect = true;
        reqListView.GridLines = true;
        reqListView.Location = new Point(0, 32);
        reqListView.Name = "reqListView";
        reqListView.Size = new Size(1012, 747);
        reqListView.TabIndex = 1;
        reqListView.UseCompatibleStateImageBehavior = false;
        reqListView.View = View.Details;
        // 
        // lblTreeHeader
        // 
        lblTreeHeader.Dock = DockStyle.Top;
        lblTreeHeader.Location = new Point(0, 0);
        lblTreeHeader.Name = "lblTreeHeader";
        lblTreeHeader.Padding = new Padding(10, 0, 0, 0);
        lblTreeHeader.Size = new Size(1012, 32);
        lblTreeHeader.TabIndex = 0;
        lblTreeHeader.Text = "Requirements";
        lblTreeHeader.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // splitContainerDetail
        // 
        splitContainerDetail.Dock = DockStyle.Fill;
        splitContainerDetail.Location = new Point(0, 0);
        splitContainerDetail.Name = "splitContainerDetail";
        splitContainerDetail.Orientation = Orientation.Horizontal;
        // 
        // splitContainerDetail.Panel1
        // 
        splitContainerDetail.Panel1.Controls.Add(detailPanel);
        splitContainerDetail.Panel1.Controls.Add(lblDetailHeader);
        splitContainerDetail.Panel1MinSize = 300;
        // 
        // splitContainerDetail.Panel2
        // 
        splitContainerDetail.Panel2.Controls.Add(testCaseGrid);
        splitContainerDetail.Panel2.Controls.Add(lblTestCasesHeader);
        splitContainerDetail.Panel2MinSize = 120;
        splitContainerDetail.Size = new Size(584, 779);
        splitContainerDetail.SplitterDistance = 380;
        splitContainerDetail.TabIndex = 0;
        // 
        // detailPanel
        // 
        detailPanel.Controls.Add(detailTable);
        detailPanel.Dock = DockStyle.Fill;
        detailPanel.Location = new Point(0, 32);
        detailPanel.Name = "detailPanel";
        detailPanel.Size = new Size(584, 348);
        detailPanel.TabIndex = 1;
        // 
        // detailTable
        // 
        detailTable.ColumnCount = 2;
        detailTable.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 100F));
        detailTable.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        detailTable.Controls.Add(lblCode, 0, 0);
        detailTable.Controls.Add(txtDetailCode, 1, 0);
        detailTable.Controls.Add(lblTitle, 0, 1);
        detailTable.Controls.Add(txtDetailTitle, 1, 1);
        detailTable.Controls.Add(lblCategory, 0, 2);
        detailTable.Controls.Add(txtDetailCategory, 1, 2);
        detailTable.Controls.Add(lblDescription, 0, 3);
        detailTable.Controls.Add(txtDetailDescription, 0, 4);
        detailTable.Controls.Add(lblPriority, 0, 5);
        detailTable.Controls.Add(cboDetailPriority, 1, 5);
        detailTable.Controls.Add(lblStatusField, 0, 6);
        detailTable.Controls.Add(cboDetailStatus, 1, 6);
        detailTable.Controls.Add(btnEditRequirement, 0, 7);
        detailTable.Dock = DockStyle.Fill;
        detailTable.Location = new Point(0, 0);
        detailTable.Name = "detailTable";
        detailTable.Padding = new Padding(10);
        detailTable.RowCount = 8;
        detailTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        detailTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        detailTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        detailTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 22F));
        detailTable.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        detailTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        detailTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 30F));
        detailTable.RowStyles.Add(new RowStyle(SizeType.Absolute, 38F));
        detailTable.Size = new Size(584, 348);
        detailTable.TabIndex = 0;
        // 
        // lblCode
        // 
        lblCode.Anchor = AnchorStyles.Left;
        lblCode.AutoSize = true;
        lblCode.Location = new Point(13, 20);
        lblCode.Margin = new Padding(3, 8, 3, 3);
        lblCode.Name = "lblCode";
        lblCode.Size = new Size(38, 15);
        lblCode.TabIndex = 0;
        lblCode.Text = "Code:";
        // 
        // txtDetailCode
        // 
        txtDetailCode.Dock = DockStyle.Fill;
        txtDetailCode.Location = new Point(113, 13);
        txtDetailCode.Name = "txtDetailCode";
        txtDetailCode.Size = new Size(458, 23);
        txtDetailCode.TabIndex = 1;
        // 
        // lblTitle
        // 
        lblTitle.Anchor = AnchorStyles.Left;
        lblTitle.AutoSize = true;
        lblTitle.Location = new Point(13, 50);
        lblTitle.Margin = new Padding(3, 8, 3, 3);
        lblTitle.Name = "lblTitle";
        lblTitle.Size = new Size(32, 15);
        lblTitle.TabIndex = 2;
        lblTitle.Text = "Title:";
        // 
        // txtDetailTitle
        // 
        txtDetailTitle.Dock = DockStyle.Fill;
        txtDetailTitle.Location = new Point(113, 43);
        txtDetailTitle.Name = "txtDetailTitle";
        txtDetailTitle.Size = new Size(458, 23);
        txtDetailTitle.TabIndex = 3;
        // 
        // lblCategory
        // 
        lblCategory.Anchor = AnchorStyles.Left;
        lblCategory.AutoSize = true;
        lblCategory.Location = new Point(13, 80);
        lblCategory.Margin = new Padding(3, 8, 3, 3);
        lblCategory.Name = "lblCategory";
        lblCategory.Size = new Size(58, 15);
        lblCategory.TabIndex = 4;
        lblCategory.Text = "Category:";
        // 
        // txtDetailCategory
        // 
        txtDetailCategory.Dock = DockStyle.Fill;
        txtDetailCategory.Location = new Point(113, 73);
        txtDetailCategory.Name = "txtDetailCategory";
        txtDetailCategory.Size = new Size(458, 23);
        txtDetailCategory.TabIndex = 5;
        // 
        // lblDescription
        // 
        lblDescription.Anchor = AnchorStyles.Left;
        lblDescription.AutoSize = true;
        detailTable.SetColumnSpan(lblDescription, 2);
        lblDescription.Location = new Point(13, 103);
        lblDescription.Name = "lblDescription";
        lblDescription.Size = new Size(71, 15);
        lblDescription.TabIndex = 10;
        lblDescription.Text = "Description:";
        // 
        // txtDetailDescription
        // 
        detailTable.SetColumnSpan(txtDetailDescription, 2);
        txtDetailDescription.Dock = DockStyle.Fill;
        txtDetailDescription.Location = new Point(13, 125);
        txtDetailDescription.Multiline = true;
        txtDetailDescription.Name = "txtDetailDescription";
        txtDetailDescription.ScrollBars = ScrollBars.Vertical;
        txtDetailDescription.Size = new Size(558, 112);
        txtDetailDescription.TabIndex = 11;
        // 
        // lblPriority
        // 
        lblPriority.Anchor = AnchorStyles.Left;
        lblPriority.AutoSize = true;
        lblPriority.Location = new Point(13, 250);
        lblPriority.Margin = new Padding(3, 8, 3, 3);
        lblPriority.Name = "lblPriority";
        lblPriority.Size = new Size(48, 15);
        lblPriority.TabIndex = 6;
        lblPriority.Text = "Priority:";
        // 
        // cboDetailPriority
        // 
        cboDetailPriority.Dock = DockStyle.Fill;
        cboDetailPriority.DropDownStyle = ComboBoxStyle.DropDownList;
        cboDetailPriority.Location = new Point(113, 243);
        cboDetailPriority.Name = "cboDetailPriority";
        cboDetailPriority.Size = new Size(458, 23);
        cboDetailPriority.TabIndex = 7;
        // 
        // lblStatusField
        // 
        lblStatusField.Anchor = AnchorStyles.Left;
        lblStatusField.AutoSize = true;
        lblStatusField.Location = new Point(13, 280);
        lblStatusField.Margin = new Padding(3, 8, 3, 3);
        lblStatusField.Name = "lblStatusField";
        lblStatusField.Size = new Size(43, 15);
        lblStatusField.TabIndex = 8;
        lblStatusField.Text = "Status:";
        // 
        // cboDetailStatus
        // 
        cboDetailStatus.Dock = DockStyle.Fill;
        cboDetailStatus.DropDownStyle = ComboBoxStyle.DropDownList;
        cboDetailStatus.Location = new Point(113, 273);
        cboDetailStatus.Name = "cboDetailStatus";
        cboDetailStatus.Size = new Size(458, 23);
        cboDetailStatus.TabIndex = 9;
        // 
        // btnEditRequirement
        // 
        btnEditRequirement.Anchor = AnchorStyles.Left;
        btnEditRequirement.AutoSize = true;
        detailTable.SetColumnSpan(btnEditRequirement, 2);
        btnEditRequirement.Location = new Point(13, 309);
        btnEditRequirement.Margin = new Padding(3, 8, 3, 3);
        btnEditRequirement.Name = "btnEditRequirement";
        btnEditRequirement.Size = new Size(118, 25);
        btnEditRequirement.TabIndex = 12;
        btnEditRequirement.Text = "Edit Requirement...";
        // 
        // lblDetailHeader
        // 
        lblDetailHeader.Dock = DockStyle.Top;
        lblDetailHeader.Location = new Point(0, 0);
        lblDetailHeader.Name = "lblDetailHeader";
        lblDetailHeader.Padding = new Padding(10, 0, 0, 0);
        lblDetailHeader.Size = new Size(584, 32);
        lblDetailHeader.TabIndex = 0;
        lblDetailHeader.Text = "Requirement Details";
        lblDetailHeader.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // testCaseGrid
        // 
        testCaseGrid.AllowUserToAddRows = false;
        testCaseGrid.AllowUserToDeleteRows = false;
        testCaseGrid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        testCaseGrid.Dock = DockStyle.Fill;
        testCaseGrid.Location = new Point(0, 32);
        testCaseGrid.Name = "testCaseGrid";
        testCaseGrid.ReadOnly = true;
        testCaseGrid.RowHeadersVisible = false;
        testCaseGrid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        testCaseGrid.Size = new Size(584, 363);
        testCaseGrid.TabIndex = 1;
        // 
        // lblTestCasesHeader
        // 
        lblTestCasesHeader.Dock = DockStyle.Top;
        lblTestCasesHeader.Location = new Point(0, 0);
        lblTestCasesHeader.Name = "lblTestCasesHeader";
        lblTestCasesHeader.Padding = new Padding(10, 0, 0, 0);
        lblTestCasesHeader.Size = new Size(584, 32);
        lblTestCasesHeader.TabIndex = 0;
        lblTestCasesHeader.Text = "Test Cases";
        lblTestCasesHeader.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1600, 850);
        Controls.Add(splitContainerMain);
        Controls.Add(toolStrip1);
        Controls.Add(menuStrip1);
        Controls.Add(statusStrip1);
        Icon = (Icon)resources.GetObject("$this.Icon");
        MainMenuStrip = menuStrip1;
        MinimumSize = new Size(1100, 650);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "Requirements Traceability Manager";
        menuStrip1.ResumeLayout(false);
        menuStrip1.PerformLayout();
        toolStrip1.ResumeLayout(false);
        toolStrip1.PerformLayout();
        statusStrip1.ResumeLayout(false);
        statusStrip1.PerformLayout();
        splitContainerMain.Panel1.ResumeLayout(false);
        splitContainerMain.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitContainerMain).EndInit();
        splitContainerMain.ResumeLayout(false);
        splitContainerDetail.Panel1.ResumeLayout(false);
        splitContainerDetail.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitContainerDetail).EndInit();
        splitContainerDetail.ResumeLayout(false);
        detailPanel.ResumeLayout(false);
        detailTable.ResumeLayout(false);
        detailTable.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)testCaseGrid).EndInit();
        ResumeLayout(false);
        PerformLayout();
    }
}
