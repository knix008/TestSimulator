namespace MyAgileBoardWinV10.Forms;

partial class MyAgileForm
{
    private System.ComponentModel.IContainer components = null!;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MyAgileForm));
        menuStrip = new MenuStrip();
        menuFile = new ToolStripMenuItem();
        menuNew = new ToolStripMenuItem();
        menuOpen = new ToolStripMenuItem();
        menuSave = new ToolStripMenuItem();
        menuSaveAs = new ToolStripMenuItem();
        menuFileSep = new ToolStripSeparator();
        menuExit = new ToolStripMenuItem();
        menuAbout = new ToolStripMenuItem();
        menuEdit = new ToolStripMenuItem();
        menuUndo = new ToolStripMenuItem();
        menuRedo = new ToolStripMenuItem();
        menuProject = new ToolStripMenuItem();
        menuProjectSettings = new ToolStripMenuItem();
        menuView = new ToolStripMenuItem();
        menuSummary = new ToolStripMenuItem();
        menuCompletedHistory = new ToolStripMenuItem();
        menuBurndown = new ToolStripMenuItem();
        menuViewSep1 = new ToolStripSeparator();
        menuViewShowGrid = new ToolStripMenuItem();
        menuHelp = new ToolStripMenuItem();
        toolStripContainer = new ToolStripContainer();
        panelBoard = new Panel();
        flowColumns = new FlowLayoutPanel();
        btnAddColumn = new Button();
        toolStrip = new ToolStrip();
        toolBtnNew = new ToolStripButton();
        toolBtnOpen = new ToolStripButton();
        toolBtnSave = new ToolStripButton();
        toolStripSep1 = new ToolStripSeparator();
        toolBtnUndo = new ToolStripButton();
        toolBtnRedo = new ToolStripButton();
        toolStripSep2 = new ToolStripSeparator();
        toolBtnSummary = new ToolStripButton();
        toolBtnCompleted = new ToolStripButton();
        toolBtnBurndown = new ToolStripButton();
        toolStripSep3 = new ToolStripSeparator();
        toolBtnToggleGrid = new ToolStripButton();
        statusStrip = new StatusStrip();
        statusTotal = new ToolStripStatusLabel();
        statusSep1 = new ToolStripStatusLabel();
        statusDone = new ToolStripStatusLabel();
        statusSep2 = new ToolStripStatusLabel();
        statusInProgress = new ToolStripStatusLabel();
        menuStrip.SuspendLayout();
        toolStripContainer.ContentPanel.SuspendLayout();
        toolStripContainer.TopToolStripPanel.SuspendLayout();
        toolStripContainer.SuspendLayout();
        panelBoard.SuspendLayout();
        toolStrip.SuspendLayout();
        statusStrip.SuspendLayout();
        SuspendLayout();
        // 
        // menuStrip
        // 
        menuStrip.Dock = DockStyle.None;
        menuStrip.Items.AddRange(new ToolStripItem[] { menuFile, menuEdit, menuProject, menuView, menuHelp });
        menuStrip.Location = new Point(0, 0);
        menuStrip.Name = "menuStrip";
        menuStrip.Size = new Size(1440, 24);
        menuStrip.TabIndex = 2;
        // 
        // menuFile
        // 
        menuFile.DropDownItems.AddRange(new ToolStripItem[] { menuNew, menuOpen, menuSave, menuSaveAs, menuFileSep, menuExit, menuAbout });
        menuFile.Name = "menuFile";
        menuFile.Size = new Size(57, 20);
        menuFile.Text = "파일(&F)";
        // 
        // menuNew
        // 
        menuNew.Name = "menuNew";
        menuNew.ShortcutKeys = Keys.Control | Keys.N;
        menuNew.Size = new Size(277, 22);
        menuNew.Text = "새 프로젝트(&N)";
        menuNew.Click += menuNew_Click;
        // 
        // menuOpen
        // 
        menuOpen.Name = "menuOpen";
        menuOpen.ShortcutKeys = Keys.Control | Keys.O;
        menuOpen.Size = new Size(277, 22);
        menuOpen.Text = "열기(&O)...";
        menuOpen.Click += menuOpen_Click;
        // 
        // menuSave
        // 
        menuSave.Name = "menuSave";
        menuSave.ShortcutKeys = Keys.Control | Keys.S;
        menuSave.Size = new Size(277, 22);
        menuSave.Text = "저장(&S)";
        menuSave.Click += menuSave_Click;
        // 
        // menuSaveAs
        // 
        menuSaveAs.Name = "menuSaveAs";
        menuSaveAs.ShortcutKeys = Keys.Control | Keys.Shift | Keys.S;
        menuSaveAs.Size = new Size(277, 22);
        menuSaveAs.Text = "다른 이름으로 저장(&A)...";
        menuSaveAs.Click += menuSaveAs_Click;
        // 
        // menuFileSep
        // 
        menuFileSep.Name = "menuFileSep";
        menuFileSep.Size = new Size(274, 6);
        // 
        // menuExit
        // 
        menuExit.Name = "menuExit";
        menuExit.Size = new Size(277, 22);
        menuExit.Text = "종료(&X)";
        menuExit.Click += menuExit_Click;
        // 
        // menuAbout
        // 
        menuAbout.Name = "menuAbout";
        menuAbout.ShortcutKeys = Keys.F1;
        menuAbout.Size = new Size(277, 22);
        menuAbout.Visible = false;
        menuAbout.Click += menuAbout_Click;
        // 
        // menuEdit
        // 
        menuEdit.DropDownItems.AddRange(new ToolStripItem[] { menuUndo, menuRedo });
        menuEdit.Name = "menuEdit";
        menuEdit.Size = new Size(57, 20);
        menuEdit.Text = "편집(&E)";
        // 
        // menuUndo
        // 
        menuUndo.Enabled = false;
        menuUndo.Name = "menuUndo";
        menuUndo.ShortcutKeys = Keys.Control | Keys.Z;
        menuUndo.Size = new Size(182, 22);
        menuUndo.Text = "실행 취소(&Z)";
        menuUndo.Click += menuUndo_Click;
        // 
        // menuRedo
        // 
        menuRedo.Enabled = false;
        menuRedo.Name = "menuRedo";
        menuRedo.ShortcutKeys = Keys.Control | Keys.Y;
        menuRedo.Size = new Size(182, 22);
        menuRedo.Text = "다시 실행(&Y)";
        menuRedo.Click += menuRedo_Click;
        // 
        // menuProject
        // 
        menuProject.DropDownItems.AddRange(new ToolStripItem[] { menuProjectSettings });
        menuProject.Name = "menuProject";
        menuProject.Size = new Size(82, 20);
        menuProject.Text = "프로젝트(&P)";
        // 
        // menuProjectSettings
        // 
        menuProjectSettings.Name = "menuProjectSettings";
        menuProjectSettings.Size = new Size(174, 22);
        menuProjectSettings.Text = "프로젝트 설정(&S)...";
        menuProjectSettings.Click += menuProjectSettings_Click;
        // 
        // menuView
        // 
        menuView.DropDownItems.AddRange(new ToolStripItem[] { menuSummary, menuCompletedHistory, menuBurndown, menuViewSep1, menuViewShowGrid });
        menuView.Name = "menuView";
        menuView.Size = new Size(59, 20);
        menuView.Text = "보기(&V)";
        // 
        // menuSummary
        // 
        menuSummary.Name = "menuSummary";
        menuSummary.ShortcutKeys = Keys.Control | Keys.T;
        menuSummary.Size = new Size(217, 22);
        menuSummary.Text = "Summary / 차트(&T)";
        menuSummary.Click += menuSummary_Click;
        // 
        // menuCompletedHistory
        // 
        menuCompletedHistory.Name = "menuCompletedHistory";
        menuCompletedHistory.Size = new Size(217, 22);
        menuCompletedHistory.Text = "완료된 항목 보기(&H)";
        menuCompletedHistory.Click += menuCompletedHistory_Click;
        // 
        // menuBurndown
        // 
        menuBurndown.Name = "menuBurndown";
        menuBurndown.Size = new Size(217, 22);
        menuBurndown.Text = "Burn Down 차트(&B)";
        menuBurndown.Click += menuBurndown_Click;
        // 
        // menuViewSep1
        // 
        menuViewSep1.Name = "menuViewSep1";
        menuViewSep1.Size = new Size(214, 6);
        // 
        // menuViewShowGrid
        // 
        menuViewShowGrid.Checked = true;
        menuViewShowGrid.CheckOnClick = true;
        menuViewShowGrid.CheckState = CheckState.Checked;
        menuViewShowGrid.Name = "menuViewShowGrid";
        menuViewShowGrid.Size = new Size(217, 22);
        menuViewShowGrid.Text = "배경 눈금 표시(&G)";
        menuViewShowGrid.Click += menuViewShowGrid_Click;
        // 
        // menuHelp
        // 
        menuHelp.Alignment = ToolStripItemAlignment.Right;
        menuHelp.Name = "menuHelp";
        menuHelp.Size = new Size(72, 20);
        menuHelp.Text = "도움말(&H)";
        menuHelp.Click += menuAbout_Click;
        // 
        // toolStripContainer
        // 
        toolStripContainer.BottomToolStripPanelVisible = false;
        // 
        // toolStripContainer.ContentPanel
        // 
        toolStripContainer.ContentPanel.Controls.Add(panelBoard);
        toolStripContainer.ContentPanel.Size = new Size(1440, 649);
        toolStripContainer.Dock = DockStyle.Fill;
        toolStripContainer.LeftToolStripPanelVisible = false;
        toolStripContainer.Location = new Point(0, 0);
        toolStripContainer.Name = "toolStripContainer";
        toolStripContainer.RightToolStripPanelVisible = false;
        toolStripContainer.Size = new Size(1440, 698);
        toolStripContainer.TabIndex = 4;
        toolStripContainer.Text = "toolStripContainer";
        // 
        // toolStripContainer.TopToolStripPanel
        // 
        toolStripContainer.TopToolStripPanel.Controls.Add(menuStrip);
        toolStripContainer.TopToolStripPanel.Controls.Add(toolStrip);
        // 
        // panelBoard
        // 
        panelBoard.BackColor = Color.FromArgb(235, 237, 240);
        panelBoard.Controls.Add(flowColumns);
        panelBoard.Controls.Add(btnAddColumn);
        panelBoard.Dock = DockStyle.Fill;
        panelBoard.Location = new Point(0, 0);
        panelBoard.Name = "panelBoard";
        panelBoard.Padding = new Padding(6);
        panelBoard.Size = new Size(1440, 649);
        panelBoard.TabIndex = 0;
        panelBoard.Resize += panelBoard_Resize;
        // 
        // flowColumns
        // 
        flowColumns.AutoScroll = true;
        flowColumns.BackColor = Color.FromArgb(235, 237, 240);
        flowColumns.Dock = DockStyle.Fill;
        flowColumns.Location = new Point(6, 6);
        flowColumns.Name = "flowColumns";
        flowColumns.Size = new Size(1374, 637);
        flowColumns.TabIndex = 0;
        flowColumns.WrapContents = false;
        // 
        // btnAddColumn
        // 
        btnAddColumn.BackColor = Color.FromArgb(220, 222, 226);
        btnAddColumn.Dock = DockStyle.Right;
        btnAddColumn.FlatStyle = FlatStyle.Flat;
        btnAddColumn.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        btnAddColumn.ForeColor = Color.DimGray;
        btnAddColumn.Location = new Point(1380, 6);
        btnAddColumn.Name = "btnAddColumn";
        btnAddColumn.Size = new Size(54, 637);
        btnAddColumn.TabIndex = 1;
        btnAddColumn.Text = "+\r\n컬럼";
        btnAddColumn.UseVisualStyleBackColor = false;
        btnAddColumn.Click += BtnAddColumn_Click;
        // 
        // toolStrip
        // 
        toolStrip.Dock = DockStyle.Top;
        toolStrip.GripStyle = ToolStripGripStyle.Hidden;
        toolStrip.Items.AddRange(new ToolStripItem[] { toolBtnNew, toolBtnOpen, toolBtnSave, toolStripSep1, toolBtnUndo, toolBtnRedo, toolStripSep2, toolBtnSummary, toolBtnCompleted, toolBtnBurndown, toolStripSep3, toolBtnToggleGrid });
        toolStrip.Location = new Point(0, 24);
        toolStrip.Name = "toolStrip";
        toolStrip.Padding = new Padding(0, 0, 1, 0);
        toolStrip.TabIndex = 1;
        // 
        // toolBtnNew
        // 
        toolBtnNew.Name = "toolBtnNew";
        toolBtnNew.Size = new Size(75, 22);
        toolBtnNew.Text = "새로 만들기";
        toolBtnNew.ToolTipText = "새 프로젝트 (Ctrl+N)";
        toolBtnNew.Click += toolBtnNew_Click;
        // 
        // toolBtnOpen
        // 
        toolBtnOpen.Name = "toolBtnOpen";
        toolBtnOpen.Size = new Size(35, 22);
        toolBtnOpen.Text = "열기";
        toolBtnOpen.ToolTipText = "프로젝트 열기 (Ctrl+O)";
        toolBtnOpen.Click += toolBtnOpen_Click;
        // 
        // toolBtnSave
        // 
        toolBtnSave.Name = "toolBtnSave";
        toolBtnSave.Size = new Size(35, 22);
        toolBtnSave.Text = "저장";
        toolBtnSave.ToolTipText = "저장 (Ctrl+S)";
        toolBtnSave.Click += toolBtnSave_Click;
        // 
        // toolStripSep1
        // 
        toolStripSep1.Name = "toolStripSep1";
        toolStripSep1.Size = new Size(6, 25);
        // 
        // toolBtnUndo
        // 
        toolBtnUndo.Enabled = false;
        toolBtnUndo.Name = "toolBtnUndo";
        toolBtnUndo.Size = new Size(35, 22);
        toolBtnUndo.Text = "취소";
        toolBtnUndo.ToolTipText = "실행 취소 (Ctrl+Z)";
        toolBtnUndo.Click += menuUndo_Click;
        // 
        // toolBtnRedo
        // 
        toolBtnRedo.Enabled = false;
        toolBtnRedo.Name = "toolBtnRedo";
        toolBtnRedo.Size = new Size(47, 22);
        toolBtnRedo.Text = "재실행";
        toolBtnRedo.ToolTipText = "다시 실행 (Ctrl+Y)";
        toolBtnRedo.Click += menuRedo_Click;
        // 
        // toolStripSep2
        // 
        toolStripSep2.Name = "toolStripSep2";
        toolStripSep2.Size = new Size(6, 25);
        // 
        // toolBtnSummary
        // 
        toolBtnSummary.Name = "toolBtnSummary";
        toolBtnSummary.Size = new Size(63, 22);
        toolBtnSummary.Text = "Summary";
        toolBtnSummary.ToolTipText = "Summary / 차트 보기 (Ctrl+T)";
        toolBtnSummary.Click += toolBtnSummary_Click;
        // 
        // toolBtnCompleted
        // 
        toolBtnCompleted.Name = "toolBtnCompleted";
        toolBtnCompleted.Size = new Size(75, 22);
        toolBtnCompleted.Text = "완료된 항목";
        toolBtnCompleted.ToolTipText = "완료 후 삭제된 항목 보기";
        toolBtnCompleted.Click += menuCompletedHistory_Click;
        // 
        // toolBtnBurndown
        // 
        toolBtnBurndown.Name = "toolBtnBurndown";
        toolBtnBurndown.Size = new Size(66, 22);
        toolBtnBurndown.Text = "Burndown";
        toolBtnBurndown.ToolTipText = "Burn Down 차트 보기";
        toolBtnBurndown.Click += menuBurndown_Click;
        // 
        // toolStripSep3
        // 
        toolStripSep3.Name = "toolStripSep3";
        toolStripSep3.Size = new Size(6, 25);
        // 
        // toolBtnToggleGrid
        // 
        toolBtnToggleGrid.Checked = true;
        toolBtnToggleGrid.CheckOnClick = true;
        toolBtnToggleGrid.CheckState = CheckState.Checked;
        toolBtnToggleGrid.Name = "toolBtnToggleGrid";
        toolBtnToggleGrid.Size = new Size(35, 22);
        toolBtnToggleGrid.Text = "눈금";
        toolBtnToggleGrid.ToolTipText = "배경 눈금 표시/숨기기";
        toolBtnToggleGrid.Click += toolBtnToggleGrid_Click;
        // 
        // statusStrip
        // 
        statusStrip.Items.AddRange(new ToolStripItem[] { statusTotal, statusSep1, statusDone, statusSep2, statusInProgress });
        statusStrip.Location = new Point(0, 698);
        statusStrip.Name = "statusStrip";
        statusStrip.Size = new Size(1440, 22);
        statusStrip.TabIndex = 3;
        // 
        // statusTotal
        // 
        statusTotal.Name = "statusTotal";
        statusTotal.Size = new Size(57, 17);
        statusTotal.Text = "전체: 0개";
        // 
        // statusSep1
        // 
        statusSep1.Name = "statusSep1";
        statusSep1.Size = new Size(26, 17);
        statusSep1.Text = "  |  ";
        // 
        // statusDone
        // 
        statusDone.ForeColor = Color.SeaGreen;
        statusDone.Name = "statusDone";
        statusDone.Size = new Size(57, 17);
        statusDone.Text = "완료: 0개";
        // 
        // statusSep2
        // 
        statusSep2.Name = "statusSep2";
        statusSep2.Size = new Size(26, 17);
        statusSep2.Text = "  |  ";
        // 
        // statusInProgress
        // 
        statusInProgress.Name = "statusInProgress";
        statusInProgress.Size = new Size(69, 17);
        statusInProgress.Text = "진행중: 0개";
        // 
        // MyAgileForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1440, 720);
        Controls.Add(toolStripContainer);
        Controls.Add(statusStrip);
        Icon = (Icon)resources.GetObject("$this.Icon");
        MainMenuStrip = menuStrip;
        MinimumSize = new Size(800, 500);
        Name = "MyAgileForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "MyAgileBoard";
        menuStrip.ResumeLayout(false);
        menuStrip.PerformLayout();
        toolStripContainer.ContentPanel.ResumeLayout(false);
        toolStripContainer.TopToolStripPanel.ResumeLayout(false);
        toolStripContainer.TopToolStripPanel.PerformLayout();
        toolStripContainer.ResumeLayout(false);
        toolStripContainer.PerformLayout();
        panelBoard.ResumeLayout(false);
        toolStrip.ResumeLayout(false);
        toolStrip.PerformLayout();
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    // Menus
    private MenuStrip menuStrip = null!;
    private ToolStripMenuItem menuFile = null!;
    private ToolStripMenuItem menuNew = null!;
    private ToolStripMenuItem menuOpen = null!;
    private ToolStripMenuItem menuSave = null!;
    private ToolStripMenuItem menuSaveAs = null!;
    private ToolStripSeparator menuFileSep = null!;
    private ToolStripMenuItem menuExit = null!;
    private ToolStripMenuItem menuEdit = null!;
    private ToolStripMenuItem menuUndo = null!;
    private ToolStripMenuItem menuRedo = null!;
    private ToolStripMenuItem menuProject = null!;
    private ToolStripMenuItem menuProjectSettings = null!;
    private ToolStripMenuItem menuView = null!;
    private ToolStripMenuItem menuSummary = null!;
    private ToolStripMenuItem menuCompletedHistory = null!;
    private ToolStripMenuItem menuBurndown = null!;
    private ToolStripSeparator menuViewSep1 = null!;
    private ToolStripMenuItem menuViewShowGrid = null!;
    private ToolStripMenuItem menuHelp = null!;
    private ToolStripMenuItem menuAbout = null!;

    // Toolbar
    private ToolStripContainer toolStripContainer = null!;
    private ToolStrip toolStrip = null!;
    private ToolStripButton toolBtnNew = null!;
    private ToolStripButton toolBtnOpen = null!;
    private ToolStripButton toolBtnSave = null!;
    private ToolStripSeparator toolStripSep1 = null!;
    private ToolStripButton toolBtnUndo = null!;
    private ToolStripButton toolBtnRedo = null!;
    private ToolStripSeparator toolStripSep2 = null!;
    private ToolStripButton toolBtnSummary = null!;
    private ToolStripButton toolBtnCompleted = null!;
    private ToolStripButton toolBtnBurndown = null!;
    private ToolStripSeparator toolStripSep3 = null!;
    private ToolStripButton toolBtnToggleGrid = null!;

    // Board
    private Panel panelBoard = null!;
    private FlowLayoutPanel flowColumns = null!;
    private Button btnAddColumn = null!;

    // Status
    private StatusStrip statusStrip = null!;
    private ToolStripStatusLabel statusTotal = null!;
    private ToolStripStatusLabel statusSep1 = null!;
    private ToolStripStatusLabel statusDone = null!;
    private ToolStripStatusLabel statusSep2 = null!;
    private ToolStripStatusLabel statusInProgress = null!;
}
