using CodeAnalyzer.Controls;

namespace CodeAnalyzer;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
        {
            components.Dispose();
        }

        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
        splitContainerMain = new SplitContainer();
        analysisSetupPanel = new AnalysisSetupPanel();
        diagramViewHost = new DiagramViewHost();
        panelToolbar = new Panel();
        btnResetView = new Button();
        btnBackView = new Button();
        btnCollapseAll = new Button();
        btnExpandAll = new Button();
        comboLineStyle = new ComboBox();
        lblLineStyle = new Label();
        comboLayoutDirection = new ComboBox();
        lblLayout = new Label();
        comboRootMethod = new ComboBox();
        lblRootMethod = new Label();
        comboDiagramView = new ComboBox();
        lblDiagramView = new Label();
        menuStrip = new MenuStrip();
        menuFile = new ToolStripMenuItem();
        menuProjectOpen = new ToolStripMenuItem();
        menuProjectSave = new ToolStripMenuItem();
        menuSeparator1 = new ToolStripSeparator();
        menuOpen = new ToolStripMenuItem();
        menuSave = new ToolStripMenuItem();
        menuSeparator2 = new ToolStripSeparator();
        menuExportMetrics = new ToolStripMenuItem();
        menuExportReport = new ToolStripMenuItem();
        menuExportImage = new ToolStripMenuItem();
        menuSettings = new ToolStripMenuItem();
        menuAnalysisSettings = new ToolStripMenuItem();
        menuDatabaseSettings = new ToolStripMenuItem();
        toolStripSearchLabel = new ToolStripLabel();
        toolStripSearchBox = new ToolStripTextBox();
        toolStripFindPrevious = new ToolStripButton();
        toolStripFindNext = new ToolStripButton();
        statusStrip = new StatusStrip();
        progressBarAnalysis = new ToolStripProgressBar();
        lblProgressPercent = new ToolStripStatusLabel();
        lblStatus = new ToolStripStatusLabel();
        ((System.ComponentModel.ISupportInitialize)splitContainerMain).BeginInit();
        splitContainerMain.Panel1.SuspendLayout();
        splitContainerMain.Panel2.SuspendLayout();
        splitContainerMain.SuspendLayout();
        panelToolbar.SuspendLayout();
        menuStrip.SuspendLayout();
        statusStrip.SuspendLayout();
        SuspendLayout();
        // 
        // splitContainerMain
        // 
        splitContainerMain.Dock = DockStyle.Fill;
        splitContainerMain.Location = new Point(0, 27);
        splitContainerMain.Name = "splitContainerMain";
        // 
        // splitContainerMain.Panel1
        // 
        splitContainerMain.Panel1.Controls.Add(analysisSetupPanel);
        splitContainerMain.Panel1.Padding = new Padding(8);
        splitContainerMain.Panel1MinSize = 320;
        // 
        // splitContainerMain.Panel2
        // 
        splitContainerMain.Panel2.Controls.Add(diagramViewHost);
        splitContainerMain.Panel2.Controls.Add(panelToolbar);
        splitContainerMain.Panel2MinSize = 940;
        splitContainerMain.Size = new Size(1528, 951);
        splitContainerMain.SplitterDistance = 356;
        splitContainerMain.SplitterWidth = 6;
        splitContainerMain.TabIndex = 0;
        // 
        // analysisSetupPanel
        // 
        analysisSetupPanel.Dock = DockStyle.Fill;
        analysisSetupPanel.Location = new Point(8, 8);
        analysisSetupPanel.Name = "analysisSetupPanel";
        analysisSetupPanel.Size = new Size(340, 935);
        analysisSetupPanel.TabIndex = 0;
        // 
        // diagramViewHost
        // 
        diagramViewHost.Dock = DockStyle.Fill;
        diagramViewHost.Location = new Point(0, 48);
        diagramViewHost.Name = "diagramViewHost";
        diagramViewHost.Size = new Size(1166, 903);
        diagramViewHost.TabIndex = 1;
        diagramViewHost.ViewKind = Models.DiagramViewKind.CallGraph;
        // 
        // panelToolbar
        // 
        panelToolbar.Controls.Add(btnResetView);
        panelToolbar.Controls.Add(btnBackView);
        panelToolbar.Controls.Add(btnCollapseAll);
        panelToolbar.Controls.Add(btnExpandAll);
        panelToolbar.Controls.Add(comboLineStyle);
        panelToolbar.Controls.Add(lblLineStyle);
        panelToolbar.Controls.Add(comboLayoutDirection);
        panelToolbar.Controls.Add(lblLayout);
        panelToolbar.Controls.Add(comboRootMethod);
        panelToolbar.Controls.Add(lblRootMethod);
        panelToolbar.Controls.Add(comboDiagramView);
        panelToolbar.Controls.Add(lblDiagramView);
        panelToolbar.Dock = DockStyle.Top;
        panelToolbar.Location = new Point(0, 0);
        panelToolbar.Name = "panelToolbar";
        panelToolbar.Padding = new Padding(8, 8, 8, 4);
        panelToolbar.Size = new Size(1166, 48);
        panelToolbar.TabIndex = 0;
        // 
        // btnResetView
        // 
        btnResetView.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnResetView.Location = new Point(1071, 10);
        btnResetView.Name = "btnResetView";
        btnResetView.Size = new Size(88, 27);
        btnResetView.TabIndex = 9;
        btnResetView.Text = "⟳ 뷰 초기화";
        btnResetView.UseVisualStyleBackColor = true;
        btnResetView.Click += btnResetView_Click;
        // 
        // btnBackView
        // 
        btnBackView.Location = new Point(157, 10);
        btnBackView.Name = "btnBackView";
        btnBackView.Size = new Size(70, 27);
        btnBackView.TabIndex = 2;
        btnBackView.Text = "← 뒤로";
        btnBackView.UseVisualStyleBackColor = true;
        btnBackView.Click += btnBackView_Click;
        // 
        // btnCollapseAll
        // 
        btnCollapseAll.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnCollapseAll.Location = new Point(974, 10);
        btnCollapseAll.Name = "btnCollapseAll";
        btnCollapseAll.Size = new Size(92, 27);
        btnCollapseAll.TabIndex = 7;
        btnCollapseAll.Text = "▲ 전체 접기";
        btnCollapseAll.UseVisualStyleBackColor = true;
        btnCollapseAll.Click += btnCollapseAll_Click;
        // 
        // btnExpandAll
        // 
        btnExpandAll.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnExpandAll.Location = new Point(879, 10);
        btnExpandAll.Name = "btnExpandAll";
        btnExpandAll.Size = new Size(92, 27);
        btnExpandAll.TabIndex = 6;
        btnExpandAll.Text = "▼ 전체 펼치기";
        btnExpandAll.UseVisualStyleBackColor = true;
        btnExpandAll.Click += btnExpandAll_Click;
        // 
        // comboLineStyle
        // 
        comboLineStyle.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        comboLineStyle.DropDownStyle = ComboBoxStyle.DropDownList;
        comboLineStyle.FormattingEnabled = true;
        comboLineStyle.Location = new Point(785, 11);
        comboLineStyle.Name = "comboLineStyle";
        comboLineStyle.Size = new Size(87, 23);
        comboLineStyle.TabIndex = 5;
        comboLineStyle.SelectedIndexChanged += comboLineStyle_SelectedIndexChanged;
        // 
        // lblLineStyle
        // 
        lblLineStyle.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        lblLineStyle.AutoSize = true;
        lblLineStyle.Location = new Point(736, 14);
        lblLineStyle.Name = "lblLineStyle";
        lblLineStyle.Size = new Size(43, 15);
        lblLineStyle.TabIndex = 4;
        lblLineStyle.Text = "연결선";
        // 
        // comboLayoutDirection
        // 
        comboLayoutDirection.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        comboLayoutDirection.DropDownStyle = ComboBoxStyle.DropDownList;
        comboLayoutDirection.FormattingEnabled = true;
        comboLayoutDirection.Location = new Point(649, 11);
        comboLayoutDirection.Name = "comboLayoutDirection";
        comboLayoutDirection.Size = new Size(81, 23);
        comboLayoutDirection.TabIndex = 3;
        comboLayoutDirection.SelectedIndexChanged += comboLayoutDirection_SelectedIndexChanged;
        // 
        // lblLayout
        // 
        lblLayout.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        lblLayout.AutoSize = true;
        lblLayout.Location = new Point(588, 14);
        lblLayout.Name = "lblLayout";
        lblLayout.Size = new Size(55, 15);
        lblLayout.TabIndex = 2;
        lblLayout.Text = "레이아웃";
        lblLayout.Click += lblLayout_Click;
        // 
        // comboRootMethod
        // 
        comboRootMethod.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        comboRootMethod.DropDownStyle = ComboBoxStyle.DropDownList;
        comboRootMethod.FormattingEnabled = true;
        comboRootMethod.Location = new Point(289, 11);
        comboRootMethod.Name = "comboRootMethod";
        comboRootMethod.Size = new Size(293, 23);
        comboRootMethod.TabIndex = 3;
        comboRootMethod.SelectedIndexChanged += comboRootMethod_SelectedIndexChanged;
        // 
        // lblRootMethod
        // 
        lblRootMethod.AutoSize = true;
        lblRootMethod.Location = new Point(228, 15);
        lblRootMethod.Name = "lblRootMethod";
        lblRootMethod.Size = new Size(59, 15);
        lblRootMethod.TabIndex = 2;
        lblRootMethod.Text = "시작 함수";
        // 
        // comboDiagramView
        // 
        comboDiagramView.DropDownStyle = ComboBoxStyle.DropDownList;
        comboDiagramView.FormattingEnabled = true;
        comboDiagramView.Location = new Point(32, 11);
        comboDiagramView.Name = "comboDiagramView";
        comboDiagramView.Size = new Size(120, 23);
        comboDiagramView.TabIndex = 1;
        comboDiagramView.SelectedIndexChanged += comboDiagramView_SelectedIndexChanged;
        // 
        // lblDiagramView
        // 
        lblDiagramView.AutoSize = true;
        lblDiagramView.Location = new Point(8, 15);
        lblDiagramView.Name = "lblDiagramView";
        lblDiagramView.Size = new Size(19, 15);
        lblDiagramView.TabIndex = 0;
        lblDiagramView.Text = "뷰";
        // 
        // menuStrip
        // 
        menuStrip.Items.AddRange(new ToolStripItem[] { menuFile, menuSettings, toolStripSearchLabel, toolStripSearchBox, toolStripFindPrevious, toolStripFindNext });
        menuStrip.Location = new Point(0, 0);
        menuStrip.Name = "menuStrip";
        menuStrip.Size = new Size(1528, 27);
        menuStrip.TabIndex = 2;
        menuStrip.Text = "menuStrip";
        // 
        // menuFile
        // 
        menuFile.DropDownItems.AddRange(new ToolStripItem[] { menuProjectOpen, menuProjectSave, menuSeparator1, menuOpen, menuSave, menuSeparator2, menuExportMetrics, menuExportReport, menuExportImage });
        menuFile.Name = "menuFile";
        menuFile.Size = new Size(43, 23);
        menuFile.Text = "파일";
        // 
        // menuProjectOpen
        // 
        menuProjectOpen.Name = "menuProjectOpen";
        menuProjectOpen.ShortcutKeys = Keys.Control | Keys.Shift | Keys.O;
        menuProjectOpen.Size = new Size(313, 22);
        menuProjectOpen.Text = "프로젝트 불러오기...";
        menuProjectOpen.Click += menuProjectOpen_Click;
        // 
        // menuProjectSave
        // 
        menuProjectSave.Name = "menuProjectSave";
        menuProjectSave.ShortcutKeys = Keys.Control | Keys.Shift | Keys.S;
        menuProjectSave.Size = new Size(313, 22);
        menuProjectSave.Text = "프로젝트 저장...";
        menuProjectSave.Click += menuProjectSave_Click;
        // 
        // menuSeparator1
        // 
        menuSeparator1.Name = "menuSeparator1";
        menuSeparator1.Size = new Size(310, 6);
        // 
        // menuOpen
        // 
        menuOpen.Name = "menuOpen";
        menuOpen.ShortcutKeys = Keys.Control | Keys.O;
        menuOpen.Size = new Size(313, 22);
        menuOpen.Text = "결과 불러오기...";
        menuOpen.Click += menuOpen_Click;
        // 
        // menuSave
        // 
        menuSave.Name = "menuSave";
        menuSave.ShortcutKeys = Keys.Control | Keys.S;
        menuSave.Size = new Size(313, 22);
        menuSave.Text = "결과 저장...";
        menuSave.Click += menuSave_Click;
        // 
        // menuSeparator2
        // 
        menuSeparator2.Name = "menuSeparator2";
        menuSeparator2.Size = new Size(310, 6);
        // 
        // menuExportMetrics
        // 
        menuExportMetrics.Name = "menuExportMetrics";
        menuExportMetrics.Size = new Size(313, 22);
        menuExportMetrics.Text = "메트릭 CSV보내기...";
        menuExportMetrics.Click += menuExportMetrics_Click;
        // 
        // menuExportReport
        // 
        menuExportReport.Name = "menuExportReport";
        menuExportReport.Size = new Size(313, 22);
        menuExportReport.Text = "분석 보고서보내기 (HTML/MD/Word/PDF)...";
        menuExportReport.Click += menuExportReport_Click;
        // 
        // menuExportImage
        // 
        menuExportImage.Name = "menuExportImage";
        menuExportImage.ShortcutKeys = Keys.Control | Keys.E;
        menuExportImage.Size = new Size(313, 22);
        menuExportImage.Text = "이미지로 내보내기...";
        menuExportImage.Click += menuExportImage_Click;
        // 
        // menuSettings
        // 
        menuSettings.DropDownItems.AddRange(new ToolStripItem[] { menuAnalysisSettings, menuDatabaseSettings });
        menuSettings.Name = "menuSettings";
        menuSettings.Size = new Size(43, 23);
        menuSettings.Text = "설정";
        // 
        // menuAnalysisSettings
        // 
        menuAnalysisSettings.Name = "menuAnalysisSettings";
        menuAnalysisSettings.Size = new Size(155, 22);
        menuAnalysisSettings.Text = "분석 설정...";
        menuAnalysisSettings.Click += btnAnalysisSettings_Click;
        // 
        // menuDatabaseSettings
        // 
        menuDatabaseSettings.Name = "menuDatabaseSettings";
        menuDatabaseSettings.Size = new Size(155, 22);
        menuDatabaseSettings.Text = "DB 연결 설정...";
        menuDatabaseSettings.Click += btnDatabaseSettings_Click;
        // 
        // toolStripSearchLabel
        // 
        toolStripSearchLabel.Margin = new Padding(12, 0, 4, 0);
        toolStripSearchLabel.Name = "toolStripSearchLabel";
        toolStripSearchLabel.Size = new Size(50, 23);
        toolStripSearchLabel.Text = "🔍 찾기:";
        // 
        // toolStripSearchBox
        // 
        toolStripSearchBox.AutoSize = false;
        toolStripSearchBox.Enabled = false;
        toolStripSearchBox.Name = "toolStripSearchBox";
        toolStripSearchBox.Size = new Size(220, 23);
        toolStripSearchBox.ToolTipText = "함수·타입·파일·디렉터리 검색 — ↓ 목록, Enter 선택 및 상세 정보";
        toolStripSearchBox.KeyDown += toolStripSearchBox_KeyDown;
        toolStripSearchBox.TextChanged += toolStripSearchBox_TextChanged;
        // 
        // toolStripFindPrevious
        // 
        toolStripFindPrevious.DisplayStyle = ToolStripItemDisplayStyle.Text;
        toolStripFindPrevious.Enabled = false;
        toolStripFindPrevious.Name = "toolStripFindPrevious";
        toolStripFindPrevious.Size = new Size(51, 20);
        toolStripFindPrevious.Text = "◀ 이전";
        toolStripFindPrevious.ToolTipText = "이전 찾기 (Shift+F3)";
        toolStripFindPrevious.Click += toolStripFindPrevious_Click;
        // 
        // toolStripFindNext
        // 
        toolStripFindNext.DisplayStyle = ToolStripItemDisplayStyle.Text;
        toolStripFindNext.Enabled = false;
        toolStripFindNext.Name = "toolStripFindNext";
        toolStripFindNext.Size = new Size(51, 20);
        toolStripFindNext.Text = "다음 ▶";
        toolStripFindNext.ToolTipText = "다음 찾기 (F3)";
        toolStripFindNext.Click += toolStripFindNext_Click;
        // 
        // statusStrip
        // 
        statusStrip.Items.AddRange(new ToolStripItem[] { progressBarAnalysis, lblProgressPercent, lblStatus });
        statusStrip.Location = new Point(0, 978);
        statusStrip.Name = "statusStrip";
        statusStrip.Size = new Size(1528, 22);
        statusStrip.TabIndex = 1;
        statusStrip.Text = "statusStrip1";
        // 
        // progressBarAnalysis
        // 
        progressBarAnalysis.AutoSize = false;
        progressBarAnalysis.Name = "progressBarAnalysis";
        progressBarAnalysis.Size = new Size(160, 16);
        progressBarAnalysis.Style = ProgressBarStyle.Continuous;
        progressBarAnalysis.Visible = false;
        // 
        // lblProgressPercent
        // 
        lblProgressPercent.AutoSize = false;
        lblProgressPercent.Name = "lblProgressPercent";
        lblProgressPercent.Size = new Size(44, 17);
        lblProgressPercent.Text = "0%";
        lblProgressPercent.Visible = false;
        // 
        // lblStatus
        // 
        lblStatus.Name = "lblStatus";
        lblStatus.Size = new Size(1513, 17);
        lblStatus.Spring = true;
        lblStatus.Text = "준비";
        lblStatus.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1528, 1000);
        Controls.Add(splitContainerMain);
        Controls.Add(statusStrip);
        Controls.Add(menuStrip);
        Icon = (Icon)resources.GetObject("$this.Icon");
        MainMenuStrip = menuStrip;
        MinimumSize = new Size(1400, 980);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "Code Analyzer - 코드 구조 분석";
        splitContainerMain.Panel1.ResumeLayout(false);
        splitContainerMain.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitContainerMain).EndInit();
        splitContainerMain.ResumeLayout(false);
        panelToolbar.ResumeLayout(false);
        panelToolbar.PerformLayout();
        menuStrip.ResumeLayout(false);
        menuStrip.PerformLayout();
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    private SplitContainer splitContainerMain;
    private AnalysisSetupPanel analysisSetupPanel;
    private DiagramViewHost diagramViewHost;
    private Panel panelToolbar;
    private Button btnBackView;
    private Button btnCollapseAll;
    private Button btnExpandAll;
    private ComboBox comboLineStyle;
    private Label lblLineStyle;
    private ComboBox comboLayoutDirection;
    private Label lblLayout;
    private Button btnResetView;
    private ComboBox comboRootMethod;
    private Label lblRootMethod;
    private ComboBox comboDiagramView;
    private Label lblDiagramView;
    private MenuStrip menuStrip;
    private ToolStripMenuItem menuFile;
    private ToolStripMenuItem menuSettings;
    private ToolStripMenuItem menuAnalysisSettings;
    private ToolStripMenuItem menuProjectOpen;
    private ToolStripMenuItem menuProjectSave;
    private ToolStripSeparator menuSeparator1;
    private ToolStripSeparator menuSeparator2;
    private ToolStripMenuItem menuOpen;
    private ToolStripMenuItem menuSave;
    private ToolStripMenuItem menuExportMetrics;
    private ToolStripMenuItem menuExportReport;
    private ToolStripMenuItem menuExportImage;
    private ToolStripMenuItem menuDatabaseSettings;
    private ToolStripLabel toolStripSearchLabel;
    private ToolStripTextBox toolStripSearchBox;
    private ToolStripButton toolStripFindPrevious;
    private ToolStripButton toolStripFindNext;
    private StatusStrip statusStrip;
    private ToolStripProgressBar progressBarAnalysis;
    private ToolStripStatusLabel lblProgressPercent;
    private ToolStripStatusLabel lblStatus;
}
