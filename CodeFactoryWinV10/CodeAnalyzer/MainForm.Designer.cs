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
        grpAnalysis = new GroupBox();
        numMinDuplicateLines = new NumericUpDown();
        lblMinDuplicateLines = new Label();
        numWarnParameter = new NumericUpDown();
        lblWarnParameter = new Label();
        numWarnTodoDensity = new NumericUpDown();
        lblWarnTodoDensity = new Label();
        numWarnMi = new NumericUpDown();
        numWarnFanOut = new NumericUpDown();
        lblWarnMi = new Label();
        lblWarnFanOut = new Label();
        numWarnNesting = new NumericUpDown();
        numWarnCognitive = new NumericUpDown();
        numWarnCyclomatic = new NumericUpDown();
        lblWarnNesting = new Label();
        lblWarnCognitive = new Label();
        lblWarnCyclomatic = new Label();
        lblQualityThresholds = new Label();
        btnAnalyze = new Button();
        lblExcludeHint = new Label();
        checkedListDirectories = new CheckedListBox();
        lblExclude = new Label();
        checkedListLanguages = new CheckedListBox();
        lblLanguages = new Label();
        btnBrowseRoot = new Button();
        txtRootPath = new TextBox();
        lblRootPath = new Label();
        diagramViewHost = new DiagramViewHost();
        panelToolbar = new Panel();
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
        menuOpen = new ToolStripMenuItem();
        menuSave = new ToolStripMenuItem();
        menuExportImage = new ToolStripMenuItem();
        menuExportMetrics = new ToolStripMenuItem();
        menuExportReport = new ToolStripMenuItem();
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
        grpAnalysis.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)numMinDuplicateLines).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numWarnParameter).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numWarnTodoDensity).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numWarnMi).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numWarnFanOut).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numWarnNesting).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numWarnCognitive).BeginInit();
        ((System.ComponentModel.ISupportInitialize)numWarnCyclomatic).BeginInit();
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
        splitContainerMain.Panel1.Controls.Add(grpAnalysis);
        splitContainerMain.Panel1.Padding = new Padding(8);
        splitContainerMain.Panel1MinSize = 260;
        // 
        // splitContainerMain.Panel2
        // 
        splitContainerMain.Panel2.Controls.Add(diagramViewHost);
        splitContainerMain.Panel2.Controls.Add(panelToolbar);
        splitContainerMain.Panel2MinSize = 320;
        splitContainerMain.Size = new Size(1280, 733);
        splitContainerMain.SplitterDistance = 320;
        splitContainerMain.SplitterWidth = 6;
        splitContainerMain.TabIndex = 0;
        // 
        // grpAnalysis
        // 
        grpAnalysis.Controls.Add(btnAnalyze);
        grpAnalysis.Controls.Add(lblExcludeHint);
        grpAnalysis.Controls.Add(checkedListDirectories);
        grpAnalysis.Controls.Add(lblExclude);
        grpAnalysis.Controls.Add(numMinDuplicateLines);
        grpAnalysis.Controls.Add(lblMinDuplicateLines);
        grpAnalysis.Controls.Add(numWarnParameter);
        grpAnalysis.Controls.Add(lblWarnParameter);
        grpAnalysis.Controls.Add(numWarnTodoDensity);
        grpAnalysis.Controls.Add(lblWarnTodoDensity);
        grpAnalysis.Controls.Add(numWarnMi);
        grpAnalysis.Controls.Add(numWarnFanOut);
        grpAnalysis.Controls.Add(lblWarnMi);
        grpAnalysis.Controls.Add(lblWarnFanOut);
        grpAnalysis.Controls.Add(numWarnNesting);
        grpAnalysis.Controls.Add(numWarnCognitive);
        grpAnalysis.Controls.Add(numWarnCyclomatic);
        grpAnalysis.Controls.Add(lblWarnNesting);
        grpAnalysis.Controls.Add(lblWarnCognitive);
        grpAnalysis.Controls.Add(lblWarnCyclomatic);
        grpAnalysis.Controls.Add(lblQualityThresholds);
        grpAnalysis.Controls.Add(checkedListLanguages);
        grpAnalysis.Controls.Add(lblLanguages);
        grpAnalysis.Controls.Add(btnBrowseRoot);
        grpAnalysis.Controls.Add(txtRootPath);
        grpAnalysis.Controls.Add(lblRootPath);
        grpAnalysis.Dock = DockStyle.Fill;
        grpAnalysis.Location = new Point(8, 8);
        grpAnalysis.Name = "grpAnalysis";
        grpAnalysis.Padding = new Padding(12, 8, 12, 12);
        grpAnalysis.Size = new Size(304, 717);
        grpAnalysis.TabIndex = 0;
        grpAnalysis.TabStop = false;
        grpAnalysis.Text = "코드 분석 설정";
        // 
        // btnAnalyze
        // 
        btnAnalyze.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        btnAnalyze.Location = new Point(12, 659);
        btnAnalyze.Name = "btnAnalyze";
        btnAnalyze.Size = new Size(276, 36);
        btnAnalyze.TabIndex = 8;
        btnAnalyze.Text = "분석 실행";
        btnAnalyze.UseVisualStyleBackColor = false;
        btnAnalyze.Click += btnAnalyze_Click;
        // 
        // lblExcludeHint
        // 
        lblExcludeHint.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        lblExcludeHint.ForeColor = Color.DimGray;
        lblExcludeHint.Location = new Point(12, 619);
        lblExcludeHint.Name = "lblExcludeHint";
        lblExcludeHint.Size = new Size(276, 32);
        lblExcludeHint.TabIndex = 7;
        lblExcludeHint.Text = "체크된 디렉터리는 분석에서 제외됩니다. (루트 '.' 체크 시 전체 제외)";
        // 
        // checkedListDirectories
        // 
        checkedListDirectories.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        checkedListDirectories.CheckOnClick = true;
        checkedListDirectories.FormattingEnabled = true;
        checkedListDirectories.IntegralHeight = false;
        checkedListDirectories.Location = new Point(12, 498);
        checkedListDirectories.Name = "checkedListDirectories";
        checkedListDirectories.Size = new Size(276, 111);
        checkedListDirectories.TabIndex = 6;
        // 
        // lblQualityThresholds
        // 
        lblQualityThresholds.AutoSize = true;
        lblQualityThresholds.Location = new Point(12, 218);
        lblQualityThresholds.Name = "lblQualityThresholds";
        lblQualityThresholds.Size = new Size(107, 15);
        lblQualityThresholds.TabIndex = 11;
        lblQualityThresholds.Text = "품질 경고 기준 (≥)";
        // 
        // lblWarnCyclomatic
        // 
        lblWarnCyclomatic.AutoSize = true;
        lblWarnCyclomatic.Location = new Point(12, 238);
        lblWarnCyclomatic.Name = "lblWarnCyclomatic";
        lblWarnCyclomatic.Size = new Size(25, 15);
        lblWarnCyclomatic.TabIndex = 12;
        lblWarnCyclomatic.Text = "CC";
        // 
        // numWarnCyclomatic
        // 
        numWarnCyclomatic.Location = new Point(40, 236);
        numWarnCyclomatic.Maximum = new decimal(new int[] { 200, 0, 0, 0 });
        numWarnCyclomatic.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
        numWarnCyclomatic.Name = "numWarnCyclomatic";
        numWarnCyclomatic.Size = new Size(48, 23);
        numWarnCyclomatic.TabIndex = 13;
        numWarnCyclomatic.Value = new decimal(new int[] { 15, 0, 0, 0 });
        numWarnCyclomatic.ValueChanged += QualityThreshold_ValueChanged;
        // 
        // lblWarnCognitive
        // 
        lblWarnCognitive.AutoSize = true;
        lblWarnCognitive.Location = new Point(100, 238);
        lblWarnCognitive.Name = "lblWarnCognitive";
        lblWarnCognitive.Size = new Size(31, 15);
        lblWarnCognitive.TabIndex = 14;
        lblWarnCognitive.Text = "인지";
        // 
        // numWarnCognitive
        // 
        numWarnCognitive.Location = new Point(134, 236);
        numWarnCognitive.Maximum = new decimal(new int[] { 200, 0, 0, 0 });
        numWarnCognitive.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
        numWarnCognitive.Name = "numWarnCognitive";
        numWarnCognitive.Size = new Size(48, 23);
        numWarnCognitive.TabIndex = 15;
        numWarnCognitive.Value = new decimal(new int[] { 15, 0, 0, 0 });
        numWarnCognitive.ValueChanged += QualityThreshold_ValueChanged;
        // 
        // lblWarnNesting
        // 
        lblWarnNesting.AutoSize = true;
        lblWarnNesting.Location = new Point(194, 238);
        lblWarnNesting.Name = "lblWarnNesting";
        lblWarnNesting.Size = new Size(31, 15);
        lblWarnNesting.TabIndex = 16;
        lblWarnNesting.Text = "중첩";
        // 
        // numWarnNesting
        // 
        numWarnNesting.Location = new Point(228, 236);
        numWarnNesting.Maximum = new decimal(new int[] { 50, 0, 0, 0 });
        numWarnNesting.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
        numWarnNesting.Name = "numWarnNesting";
        numWarnNesting.Size = new Size(48, 23);
        numWarnNesting.TabIndex = 17;
        numWarnNesting.Value = new decimal(new int[] { 4, 0, 0, 0 });
        numWarnNesting.ValueChanged += QualityThreshold_ValueChanged;
        // 
        // lblWarnFanOut
        // 
        lblWarnFanOut.AutoSize = true;
        lblWarnFanOut.Location = new Point(12, 262);
        lblWarnFanOut.Name = "lblWarnFanOut";
        lblWarnFanOut.Size = new Size(48, 15);
        lblWarnFanOut.TabIndex = 18;
        lblWarnFanOut.Text = "FanOut";
        // 
        // numWarnFanOut
        // 
        numWarnFanOut.Location = new Point(62, 260);
        numWarnFanOut.Maximum = new decimal(new int[] { 500, 0, 0, 0 });
        numWarnFanOut.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
        numWarnFanOut.Name = "numWarnFanOut";
        numWarnFanOut.Size = new Size(48, 23);
        numWarnFanOut.TabIndex = 19;
        numWarnFanOut.Value = new decimal(new int[] { 10, 0, 0, 0 });
        numWarnFanOut.ValueChanged += QualityThreshold_ValueChanged;
        // 
        // lblWarnMi
        // 
        lblWarnMi.AutoSize = true;
        lblWarnMi.Location = new Point(120, 262);
        lblWarnMi.Name = "lblWarnMi";
        lblWarnMi.Size = new Size(43, 15);
        lblWarnMi.TabIndex = 20;
        lblWarnMi.Text = "MI <";
        // 
        // numWarnMi
        // 
        numWarnMi.Location = new Point(166, 260);
        numWarnMi.Maximum = new decimal(new int[] { 171, 0, 0, 0 });
        numWarnMi.Name = "numWarnMi";
        numWarnMi.Size = new Size(48, 23);
        numWarnMi.TabIndex = 21;
        numWarnMi.Value = new decimal(new int[] { 65, 0, 0, 0 });
        numWarnMi.ValueChanged += QualityThreshold_ValueChanged;
        // 
        // lblWarnTodoDensity
        // 
        lblWarnTodoDensity.AutoSize = true;
        lblWarnTodoDensity.Location = new Point(220, 262);
        lblWarnTodoDensity.Name = "lblWarnTodoDensity";
        lblWarnTodoDensity.Size = new Size(58, 15);
        lblWarnTodoDensity.TabIndex = 22;
        lblWarnTodoDensity.Text = "TODO≥";
        // 
        // numWarnTodoDensity
        // 
        numWarnTodoDensity.DecimalPlaces = 1;
        numWarnTodoDensity.Increment = new decimal(new int[] { 5, 0, 0, 65536 });
        numWarnTodoDensity.Location = new Point(278, 260);
        numWarnTodoDensity.Maximum = new decimal(new int[] { 100, 0, 0, 0 });
        numWarnTodoDensity.Name = "numWarnTodoDensity";
        numWarnTodoDensity.Size = new Size(48, 23);
        numWarnTodoDensity.TabIndex = 23;
        numWarnTodoDensity.Value = new decimal(new int[] { 20, 0, 0, 65536 });
        numWarnTodoDensity.ValueChanged += QualityThreshold_ValueChanged;
        // 
        // lblWarnParameter
        // 
        lblWarnParameter.AutoSize = true;
        lblWarnParameter.Location = new Point(12, 286);
        lblWarnParameter.Name = "lblWarnParameter";
        lblWarnParameter.Size = new Size(31, 15);
        lblWarnParameter.TabIndex = 24;
        lblWarnParameter.Text = "매개";
        // 
        // numWarnParameter
        // 
        numWarnParameter.Location = new Point(44, 284);
        numWarnParameter.Maximum = new decimal(new int[] { 50, 0, 0, 0 });
        numWarnParameter.Minimum = new decimal(new int[] { 1, 0, 0, 0 });
        numWarnParameter.Name = "numWarnParameter";
        numWarnParameter.Size = new Size(48, 23);
        numWarnParameter.TabIndex = 25;
        numWarnParameter.Value = new decimal(new int[] { 7, 0, 0, 0 });
        numWarnParameter.ValueChanged += QualityThreshold_ValueChanged;
        // 
        // numMinDuplicateLines
        // 
        numMinDuplicateLines.Location = new Point(12, 448);
        numMinDuplicateLines.Maximum = new decimal(new int[] { 200, 0, 0, 0 });
        numMinDuplicateLines.Minimum = new decimal(new int[] { 2, 0, 0, 0 });
        numMinDuplicateLines.Name = "numMinDuplicateLines";
        numMinDuplicateLines.Size = new Size(80, 23);
        numMinDuplicateLines.TabIndex = 9;
        numMinDuplicateLines.Value = new decimal(new int[] { 3, 0, 0, 0 });
        numMinDuplicateLines.ValueChanged += numMinDuplicateLines_ValueChanged;
        // 
        // lblMinDuplicateLines
        // 
        lblMinDuplicateLines.AutoSize = true;
        lblMinDuplicateLines.Location = new Point(12, 428);
        lblMinDuplicateLines.Name = "lblMinDuplicateLines";
        lblMinDuplicateLines.Size = new Size(195, 15);
        lblMinDuplicateLines.TabIndex = 10;
        lblMinDuplicateLines.Text = "중복 코드 최소 줄 수 (동일 연속 줄)";
        // 
        // lblExclude
        // 
        lblExclude.AutoSize = true;
        lblExclude.Location = new Point(12, 478);
        lblExclude.Name = "lblExclude";
        lblExclude.Size = new Size(123, 15);
        lblExclude.TabIndex = 5;
        lblExclude.Text = "제외할 하위 디렉터리";
        // 
        // checkedListLanguages
        // 
        checkedListLanguages.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        checkedListLanguages.CheckOnClick = true;
        checkedListLanguages.FormattingEnabled = true;
        checkedListLanguages.IntegralHeight = false;
        checkedListLanguages.Location = new Point(12, 100);
        checkedListLanguages.Name = "checkedListLanguages";
        checkedListLanguages.Size = new Size(276, 110);
        checkedListLanguages.TabIndex = 4;
        // 
        // lblLanguages
        // 
        lblLanguages.AutoSize = true;
        lblLanguages.Location = new Point(12, 80);
        lblLanguages.Name = "lblLanguages";
        lblLanguages.Size = new Size(135, 15);
        lblLanguages.TabIndex = 3;
        lblLanguages.Text = "분석할 프로그래밍 언어";
        // 
        // btnBrowseRoot
        // 
        btnBrowseRoot.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnBrowseRoot.Location = new Point(214, 42);
        btnBrowseRoot.Name = "btnBrowseRoot";
        btnBrowseRoot.Size = new Size(74, 27);
        btnBrowseRoot.TabIndex = 2;
        btnBrowseRoot.Text = "찾아보기";
        btnBrowseRoot.UseVisualStyleBackColor = true;
        btnBrowseRoot.Click += btnBrowseRoot_Click;
        // 
        // txtRootPath
        // 
        txtRootPath.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        txtRootPath.Location = new Point(12, 44);
        txtRootPath.Name = "txtRootPath";
        txtRootPath.PlaceholderText = "C:\\Projects\\MyApp";
        txtRootPath.Size = new Size(196, 23);
        txtRootPath.TabIndex = 1;
        txtRootPath.Leave += txtRootPath_Leave;
        // 
        // lblRootPath
        // 
        lblRootPath.AutoSize = true;
        lblRootPath.Location = new Point(12, 24);
        lblRootPath.Name = "lblRootPath";
        lblRootPath.Size = new Size(83, 15);
        lblRootPath.TabIndex = 0;
        lblRootPath.Text = "루트 디렉터리";
        // 
        // diagramViewHost
        // 
        diagramViewHost.Dock = DockStyle.Fill;
        diagramViewHost.Location = new Point(0, 48);
        diagramViewHost.Name = "diagramViewHost";
        diagramViewHost.Size = new Size(954, 685);
        diagramViewHost.TabIndex = 1;
        diagramViewHost.ViewKind = Models.DiagramViewKind.CallGraph;
        // 
        // panelToolbar
        // 
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
        panelToolbar.Size = new Size(954, 48);
        panelToolbar.TabIndex = 0;
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
        btnCollapseAll.Location = new Point(854, 10);
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
        btnExpandAll.Location = new Point(759, 10);
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
        comboLineStyle.Location = new Point(665, 11);
        comboLineStyle.Name = "comboLineStyle";
        comboLineStyle.Size = new Size(87, 23);
        comboLineStyle.TabIndex = 5;
        comboLineStyle.SelectedIndexChanged += comboLineStyle_SelectedIndexChanged;
        // 
        // lblLineStyle
        // 
        lblLineStyle.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        lblLineStyle.AutoSize = true;
        lblLineStyle.Location = new Point(616, 14);
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
        comboLayoutDirection.Location = new Point(529, 11);
        comboLayoutDirection.Name = "comboLayoutDirection";
        comboLayoutDirection.Size = new Size(81, 23);
        comboLayoutDirection.TabIndex = 3;
        comboLayoutDirection.SelectedIndexChanged += comboLayoutDirection_SelectedIndexChanged;
        // 
        // lblLayout
        // 
        lblLayout.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        lblLayout.AutoSize = true;
        lblLayout.Location = new Point(468, 14);
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
        comboRootMethod.Size = new Size(173, 23);
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
        menuStrip.Items.AddRange(new ToolStripItem[] { menuFile, toolStripSearchLabel, toolStripSearchBox, toolStripFindPrevious, toolStripFindNext });
        menuStrip.Location = new Point(0, 0);
        menuStrip.Name = "menuStrip";
        menuStrip.Size = new Size(1280, 27);
        menuStrip.TabIndex = 2;
        menuStrip.Text = "menuStrip";
        // 
        // menuFile
        // 
        menuFile.DropDownItems.AddRange(new ToolStripItem[] { menuOpen, menuSave, menuExportMetrics, menuExportReport, menuExportImage });
        menuFile.Name = "menuFile";
        menuFile.Size = new Size(43, 23);
        menuFile.Text = "파일";
        //
        // menuOpen
        //
        menuOpen.Name = "menuOpen";
        menuOpen.ShortcutKeys = Keys.Control | Keys.O;
        menuOpen.Size = new Size(200, 22);
        menuOpen.Text = "결과 불러오기...";
        menuOpen.Click += menuOpen_Click;
        //
        // menuSave
        //
        menuSave.Name = "menuSave";
        menuSave.ShortcutKeys = Keys.Control | Keys.S;
        menuSave.Size = new Size(200, 22);
        menuSave.Text = "결과 저장...";
        menuSave.Click += menuSave_Click;
        //
        // menuExportMetrics
        // 
        menuExportMetrics.Name = "menuExportMetrics";
        menuExportMetrics.Size = new Size(200, 22);
        menuExportMetrics.Text = "메트릭 CSV보내기...";
        menuExportMetrics.Click += menuExportMetrics_Click;
        // 
        // menuExportReport
        // 
        menuExportReport.Name = "menuExportReport";
        menuExportReport.Size = new Size(240, 22);
        menuExportReport.Text = "분석 보고서보내기 (HTML/MD/Word/PDF)...";
        menuExportReport.Click += menuExportReport_Click;
        // 
        // menuExportImage
        //
        menuExportImage.Name = "menuExportImage";
        menuExportImage.ShortcutKeys = Keys.Control | Keys.E;
        menuExportImage.Size = new Size(200, 22);
        menuExportImage.Text = "이미지로 내보내기...";
        menuExportImage.Click += menuExportImage_Click;
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
        toolStripSearchBox.ToolTipText = "함수·타입 검색 — 입력 시 목록 표시 (Ctrl+F, ↓ 선택, Enter 이동)";
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
        statusStrip.Location = new Point(0, 760);
        statusStrip.Name = "statusStrip";
        statusStrip.Size = new Size(1280, 22);
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
        lblStatus.Size = new Size(1265, 17);
        lblStatus.Spring = true;
        lblStatus.Text = "준비";
        lblStatus.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1280, 782);
        Controls.Add(splitContainerMain);
        Controls.Add(statusStrip);
        Controls.Add(menuStrip);
        Icon = (Icon)resources.GetObject("$this.Icon");
        MainMenuStrip = menuStrip;
        MinimumSize = new Size(960, 640);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "Code Analyzer - 코드 구조 분석";
        splitContainerMain.Panel1.ResumeLayout(false);
        splitContainerMain.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitContainerMain).EndInit();
        splitContainerMain.ResumeLayout(false);
        grpAnalysis.ResumeLayout(false);
        grpAnalysis.PerformLayout();
        ((System.ComponentModel.ISupportInitialize)numMinDuplicateLines).EndInit();
        ((System.ComponentModel.ISupportInitialize)numWarnParameter).EndInit();
        ((System.ComponentModel.ISupportInitialize)numWarnTodoDensity).EndInit();
        ((System.ComponentModel.ISupportInitialize)numWarnMi).EndInit();
        ((System.ComponentModel.ISupportInitialize)numWarnFanOut).EndInit();
        ((System.ComponentModel.ISupportInitialize)numWarnNesting).EndInit();
        ((System.ComponentModel.ISupportInitialize)numWarnCognitive).EndInit();
        ((System.ComponentModel.ISupportInitialize)numWarnCyclomatic).EndInit();
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
    private GroupBox grpAnalysis;
    private NumericUpDown numMinDuplicateLines;
    private Label lblMinDuplicateLines;
    private NumericUpDown numWarnParameter;
    private Label lblWarnParameter;
    private NumericUpDown numWarnTodoDensity;
    private Label lblWarnTodoDensity;
    private NumericUpDown numWarnMi;
    private NumericUpDown numWarnFanOut;
    private Label lblWarnMi;
    private Label lblWarnFanOut;
    private NumericUpDown numWarnNesting;
    private NumericUpDown numWarnCognitive;
    private NumericUpDown numWarnCyclomatic;
    private Label lblWarnNesting;
    private Label lblWarnCognitive;
    private Label lblWarnCyclomatic;
    private Label lblQualityThresholds;
    private Button btnAnalyze;
    private Label lblExcludeHint;
    private CheckedListBox checkedListDirectories;
    private Label lblExclude;
    private CheckedListBox checkedListLanguages;
    private Label lblLanguages;
    private Button btnBrowseRoot;
    private TextBox txtRootPath;
    private Label lblRootPath;
    private DiagramViewHost diagramViewHost;
    private Panel panelToolbar;
    private Button btnBackView;
    private Button btnCollapseAll;
    private Button btnExpandAll;
    private ComboBox comboLineStyle;
    private Label lblLineStyle;
    private ComboBox comboLayoutDirection;
    private Label lblLayout;
    private ComboBox comboRootMethod;
    private Label lblRootMethod;
    private ComboBox comboDiagramView;
    private Label lblDiagramView;
    private MenuStrip menuStrip;
    private ToolStripMenuItem menuFile;
    private ToolStripMenuItem menuOpen;
    private ToolStripMenuItem menuSave;
    private ToolStripMenuItem menuExportMetrics;
    private ToolStripMenuItem menuExportReport;
    private ToolStripMenuItem menuExportImage;
    private ToolStripLabel toolStripSearchLabel;
    private ToolStripTextBox toolStripSearchBox;
    private ToolStripButton toolStripFindPrevious;
    private ToolStripButton toolStripFindNext;
    private StatusStrip statusStrip;
    private ToolStripProgressBar progressBarAnalysis;
    private ToolStripStatusLabel lblProgressPercent;
    private ToolStripStatusLabel lblStatus;
}
