namespace HWP2DocWinV10;

partial class HWP2DocForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(HWP2DocForm));
        menuStrip1 = new MenuStrip();
        fileToolStripMenuItem = new ToolStripMenuItem();
        openToolStripMenuItem = new ToolStripMenuItem();
        convertToolStripMenuItem = new ToolStripMenuItem();
        llmSettingsToolStripMenuItem = new ToolStripMenuItem();
        menuSepExport = new ToolStripSeparator();
        exportMarkdownToolStripMenuItem = new ToolStripMenuItem();
        exportWordToolStripMenuItem = new ToolStripMenuItem();
        exportPdfToolStripMenuItem = new ToolStripMenuItem();
        menuSepExit = new ToolStripSeparator();
        exitToolStripMenuItem = new ToolStripMenuItem();
        infoToolStripMenuItem = new ToolStripMenuItem();
        programInfoToolStripMenuItem = new ToolStripMenuItem();
        viewToolStripMenuItem = new ToolStripMenuItem();
        structurePositionToolStripMenuItem = new ToolStripMenuItem();
        structurePanelLeftToolStripMenuItem = new ToolStripMenuItem();
        structurePanelRightToolStripMenuItem = new ToolStripMenuItem();
        menuSepStructureView = new ToolStripSeparator();
        structurePanelVisibleToolStripMenuItem = new ToolStripMenuItem();
        menuSepFontSize = new ToolStripSeparator();
        fontSizeToolStripMenuItem = new ToolStripMenuItem();
        toolStrip1 = new ToolStrip();
        btnOpen = new ToolStripButton();
        btnConvert = new ToolStripButton();
        toolSep1 = new ToolStripSeparator();
        lblFontSize = new ToolStripLabel();
        cboFontSize = new ToolStripComboBox();
        toolSepFont = new ToolStripSeparator();
        btnExportMarkdown = new ToolStripButton();
        btnExportWord = new ToolStripButton();
        btnExportPdf = new ToolStripButton();
        toolSep2 = new ToolStripSeparator();
        btnToggleStructure = new ToolStripButton();
        btnProgramInfo = new ToolStripButton();
        splitContainerMain = new SplitContainer();
        pnlContent = new Panel();
        splitContainer1 = new SplitContainer();
        pnlStructure = new Panel();
        pnlStructureHeader = new Panel();
        btnCloseStructure = new Button();
        webViewMarkdown = new Microsoft.Web.WebView2.WinForms.WebView2();
        lblMarkdown = new Label();
        picMarkdownIcon = new PictureBox();
        webViewPreview = new Microsoft.Web.WebView2.WinForms.WebView2();
        lblPreview = new Label();
        picPreviewIcon = new PictureBox();
        lblStructure = new Label();
        picStructureIcon = new PictureBox();
        treeStructure = new TreeView();
        statusStrip1 = new StatusStrip();
        lblStatus = new ToolStripStatusLabel();
        statusProgress = new ToolStripProgressBar();
        lblProgressPercent = new ToolStripStatusLabel();
        openFileDialog1 = new OpenFileDialog();
        saveFileDialog1 = new SaveFileDialog();
        previewTimer = new System.Windows.Forms.Timer(components);
        menuStrip1.SuspendLayout();
        toolStrip1.SuspendLayout();
        pnlContent.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitContainerMain).BeginInit();
        splitContainerMain.Panel1.SuspendLayout();
        splitContainerMain.Panel2.SuspendLayout();
        splitContainerMain.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitContainer1).BeginInit();
        splitContainer1.Panel1.SuspendLayout();
        splitContainer1.Panel2.SuspendLayout();
        splitContainer1.SuspendLayout();
        pnlStructure.SuspendLayout();
        pnlStructureHeader.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)webViewMarkdown).BeginInit();
        ((System.ComponentModel.ISupportInitialize)webViewPreview).BeginInit();
        ((System.ComponentModel.ISupportInitialize)picMarkdownIcon).BeginInit();
        ((System.ComponentModel.ISupportInitialize)picPreviewIcon).BeginInit();
        ((System.ComponentModel.ISupportInitialize)picStructureIcon).BeginInit();
        statusStrip1.SuspendLayout();
        SuspendLayout();
        // 
        // menuStrip1
        // 
        menuStrip1.Items.AddRange(new ToolStripItem[] { fileToolStripMenuItem, viewToolStripMenuItem, infoToolStripMenuItem });
        menuStrip1.Location = new Point(0, 0);
        menuStrip1.Name = "menuStrip1";
        menuStrip1.Size = new Size(1184, 24);
        menuStrip1.TabIndex = 0;
        menuStrip1.Text = "menuStrip1";
        // 
        // fileToolStripMenuItem
        // 
        fileToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { openToolStripMenuItem, convertToolStripMenuItem, llmSettingsToolStripMenuItem, menuSepExport, exportMarkdownToolStripMenuItem, exportWordToolStripMenuItem, exportPdfToolStripMenuItem, menuSepExit, exitToolStripMenuItem });
        fileToolStripMenuItem.Name = "fileToolStripMenuItem";
        fileToolStripMenuItem.Size = new Size(57, 20);
        fileToolStripMenuItem.Text = "파일(&F)";
        // 
        // openToolStripMenuItem
        // 
        openToolStripMenuItem.Name = "openToolStripMenuItem";
        openToolStripMenuItem.ShortcutKeys = Keys.Control | Keys.O;
        openToolStripMenuItem.Size = new Size(313, 22);
        openToolStripMenuItem.Text = "HWP 파일 열기(&O)...";
        openToolStripMenuItem.Click += openToolStripMenuItem_Click;
        // 
        // convertToolStripMenuItem
        // 
        convertToolStripMenuItem.Name = "convertToolStripMenuItem";
        convertToolStripMenuItem.ShortcutKeys = Keys.F5;
        convertToolStripMenuItem.Size = new Size(313, 22);
        convertToolStripMenuItem.Text = "변환(&C)";
        convertToolStripMenuItem.Click += convertToolStripMenuItem_Click;
        //
        // llmSettingsToolStripMenuItem
        //
        llmSettingsToolStripMenuItem.Name = "llmSettingsToolStripMenuItem";
        llmSettingsToolStripMenuItem.Size = new Size(313, 22);
        llmSettingsToolStripMenuItem.Text = "LLM 설정(&L)...";
        llmSettingsToolStripMenuItem.Click += llmSettingsToolStripMenuItem_Click;
        //
        // menuSepExport
        // 
        menuSepExport.Name = "menuSepExport";
        menuSepExport.Size = new Size(310, 6);
        // 
        // exportMarkdownToolStripMenuItem
        // 
        exportMarkdownToolStripMenuItem.Name = "exportMarkdownToolStripMenuItem";
        exportMarkdownToolStripMenuItem.ShortcutKeys = Keys.Control | Keys.Shift | Keys.M;
        exportMarkdownToolStripMenuItem.Size = new Size(313, 22);
        exportMarkdownToolStripMenuItem.Text = "Markdown으로 내보내기(&M)...";
        exportMarkdownToolStripMenuItem.Click += exportMarkdownToolStripMenuItem_Click;
        // 
        // exportWordToolStripMenuItem
        // 
        exportWordToolStripMenuItem.Name = "exportWordToolStripMenuItem";
        exportWordToolStripMenuItem.ShortcutKeys = Keys.Control | Keys.Shift | Keys.W;
        exportWordToolStripMenuItem.Size = new Size(313, 22);
        exportWordToolStripMenuItem.Text = "Word로 내보내기(&W)...";
        exportWordToolStripMenuItem.Click += exportWordToolStripMenuItem_Click;
        // 
        // exportPdfToolStripMenuItem
        // 
        exportPdfToolStripMenuItem.Name = "exportPdfToolStripMenuItem";
        exportPdfToolStripMenuItem.ShortcutKeys = Keys.Control | Keys.Shift | Keys.P;
        exportPdfToolStripMenuItem.Size = new Size(313, 22);
        exportPdfToolStripMenuItem.Text = "PDF로 내보내기(&P)...";
        exportPdfToolStripMenuItem.Click += exportPdfToolStripMenuItem_Click;
        // 
        // menuSepExit
        // 
        menuSepExit.Name = "menuSepExit";
        menuSepExit.Size = new Size(310, 6);
        // 
        // exitToolStripMenuItem
        // 
        exitToolStripMenuItem.Name = "exitToolStripMenuItem";
        exitToolStripMenuItem.Size = new Size(313, 22);
        exitToolStripMenuItem.Text = "종료(&X)";
        exitToolStripMenuItem.Click += exitToolStripMenuItem_Click;
        // 
        // infoToolStripMenuItem
        // 
        infoToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { programInfoToolStripMenuItem });
        infoToolStripMenuItem.Name = "infoToolStripMenuItem";
        infoToolStripMenuItem.Size = new Size(57, 20);
        infoToolStripMenuItem.Text = "정보(&I)";
        // 
        // programInfoToolStripMenuItem
        // 
        programInfoToolStripMenuItem.Name = "programInfoToolStripMenuItem";
        programInfoToolStripMenuItem.ShortcutKeys = Keys.F1;
        programInfoToolStripMenuItem.Size = new Size(220, 22);
        programInfoToolStripMenuItem.Text = "프로그램 정보(&P)...";
        programInfoToolStripMenuItem.Click += programInfoToolStripMenuItem_Click;
        // 
        // viewToolStripMenuItem
        // 
        viewToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { structurePanelVisibleToolStripMenuItem, menuSepStructureView, structurePositionToolStripMenuItem, menuSepFontSize, fontSizeToolStripMenuItem });
        viewToolStripMenuItem.Name = "viewToolStripMenuItem";
        viewToolStripMenuItem.Size = new Size(59, 20);
        viewToolStripMenuItem.Text = "보기(&V)";
        // 
        // structurePanelVisibleToolStripMenuItem
        // 
        structurePanelVisibleToolStripMenuItem.Checked = false;
        structurePanelVisibleToolStripMenuItem.CheckOnClick = true;
        structurePanelVisibleToolStripMenuItem.Name = "structurePanelVisibleToolStripMenuItem";
        structurePanelVisibleToolStripMenuItem.Size = new Size(220, 22);
        structurePanelVisibleToolStripMenuItem.Text = "문서 구조 표시(&T)";
        structurePanelVisibleToolStripMenuItem.Click += structurePanelVisibleToolStripMenuItem_Click;
        // 
        // menuSepStructureView
        // 
        menuSepStructureView.Name = "menuSepStructureView";
        menuSepStructureView.Size = new Size(217, 6);
        // 
        // structurePositionToolStripMenuItem
        // 
        structurePositionToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { structurePanelLeftToolStripMenuItem, structurePanelRightToolStripMenuItem });
        structurePositionToolStripMenuItem.Name = "structurePositionToolStripMenuItem";
        structurePositionToolStripMenuItem.Size = new Size(220, 22);
        structurePositionToolStripMenuItem.Text = "문서 구조 위치(&S)";
        // 
        // structurePanelLeftToolStripMenuItem
        // 
        structurePanelLeftToolStripMenuItem.CheckOnClick = true;
        structurePanelLeftToolStripMenuItem.Name = "structurePanelLeftToolStripMenuItem";
        structurePanelLeftToolStripMenuItem.Size = new Size(180, 22);
        structurePanelLeftToolStripMenuItem.Text = "왼쪽(&L)";
        structurePanelLeftToolStripMenuItem.Click += structurePanelLeftToolStripMenuItem_Click;
        // 
        // structurePanelRightToolStripMenuItem
        // 
        structurePanelRightToolStripMenuItem.CheckOnClick = true;
        structurePanelRightToolStripMenuItem.Name = "structurePanelRightToolStripMenuItem";
        structurePanelRightToolStripMenuItem.Size = new Size(180, 22);
        structurePanelRightToolStripMenuItem.Text = "오른쪽(&R)";
        structurePanelRightToolStripMenuItem.Click += structurePanelRightToolStripMenuItem_Click;
        // 
        // menuSepFontSize
        // 
        menuSepFontSize.Name = "menuSepFontSize";
        menuSepFontSize.Size = new Size(217, 6);
        // 
        // fontSizeToolStripMenuItem
        // 
        fontSizeToolStripMenuItem.Name = "fontSizeToolStripMenuItem";
        fontSizeToolStripMenuItem.Size = new Size(220, 22);
        fontSizeToolStripMenuItem.Text = "폰트 크기(&F)";
        // 
        // toolStrip1
        // 
        toolStrip1.Items.AddRange(new ToolStripItem[] { btnOpen, btnConvert, toolSep1, lblFontSize, cboFontSize, toolSepFont, btnExportMarkdown, btnExportWord, btnExportPdf, toolSep2, btnToggleStructure, btnProgramInfo });
        toolStrip1.Location = new Point(0, 24);
        toolStrip1.Name = "toolStrip1";
        toolStrip1.Size = new Size(1184, 25);
        toolStrip1.TabIndex = 1;
        toolStrip1.Text = "toolStrip1";
        // 
        // btnOpen
        // 
        btnOpen.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        btnOpen.ImageTransparentColor = Color.Magenta;
        btnOpen.Name = "btnOpen";
        btnOpen.Size = new Size(52, 22);
        btnOpen.Text = "열기";
        btnOpen.TextImageRelation = TextImageRelation.ImageBeforeText;
        btnOpen.Click += openToolStripMenuItem_Click;
        // 
        // btnConvert
        // 
        btnConvert.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        btnConvert.ImageTransparentColor = Color.Magenta;
        btnConvert.Name = "btnConvert";
        btnConvert.Size = new Size(52, 22);
        btnConvert.Text = "변환";
        btnConvert.TextImageRelation = TextImageRelation.ImageBeforeText;
        btnConvert.Click += convertToolStripMenuItem_Click;
        // 
        // toolSep1
        //
        toolSep1.Name = "toolSep1";
        toolSep1.Size = new Size(6, 25);
        //
        // lblFontSize
        //
        lblFontSize.Name = "lblFontSize";
        lblFontSize.Size = new Size(31, 22);
        lblFontSize.Text = "글꼴";
        //
        // cboFontSize
        //
        cboFontSize.AutoSize = false;
        cboFontSize.DropDownStyle = ComboBoxStyle.DropDownList;
        cboFontSize.Name = "cboFontSize";
        cboFontSize.Size = new Size(52, 25);
        cboFontSize.ToolTipText = "폰트 크기";
        cboFontSize.SelectedIndexChanged += cboFontSize_SelectedIndexChanged;
        //
        // toolSepFont
        //
        toolSepFont.Name = "toolSepFont";
        toolSepFont.Size = new Size(6, 25);
        //
        // btnExportMarkdown
        // 
        btnExportMarkdown.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        btnExportMarkdown.ImageTransparentColor = Color.Magenta;
        btnExportMarkdown.Name = "btnExportMarkdown";
        btnExportMarkdown.Size = new Size(92, 22);
        btnExportMarkdown.Text = "Markdown";
        btnExportMarkdown.TextImageRelation = TextImageRelation.ImageBeforeText;
        btnExportMarkdown.Click += exportMarkdownToolStripMenuItem_Click;
        // 
        // btnExportWord
        // 
        btnExportWord.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        btnExportWord.ImageTransparentColor = Color.Magenta;
        btnExportWord.Name = "btnExportWord";
        btnExportWord.Size = new Size(62, 22);
        btnExportWord.Text = "Word";
        btnExportWord.TextImageRelation = TextImageRelation.ImageBeforeText;
        btnExportWord.Click += exportWordToolStripMenuItem_Click;
        // 
        // btnExportPdf
        // 
        btnExportPdf.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        btnExportPdf.ImageTransparentColor = Color.Magenta;
        btnExportPdf.Name = "btnExportPdf";
        btnExportPdf.Size = new Size(52, 22);
        btnExportPdf.Text = "PDF";
        btnExportPdf.TextImageRelation = TextImageRelation.ImageBeforeText;
        btnExportPdf.Click += exportPdfToolStripMenuItem_Click;
        // 
        // toolSep2
        // 
        toolSep2.Name = "toolSep2";
        toolSep2.Size = new Size(6, 25);
        //
        // btnProgramInfo
        // 
        btnProgramInfo.Alignment = ToolStripItemAlignment.Right;
        btnProgramInfo.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        btnProgramInfo.ImageTransparentColor = Color.Magenta;
        btnProgramInfo.Name = "btnProgramInfo";
        btnProgramInfo.Size = new Size(72, 22);
        btnProgramInfo.Text = "정보";
        btnProgramInfo.TextImageRelation = TextImageRelation.ImageBeforeText;
        btnProgramInfo.Click += programInfoToolStripMenuItem_Click;
        // 
        // btnToggleStructure
        // 
        btnToggleStructure.CheckOnClick = true;
        btnToggleStructure.DisplayStyle = ToolStripItemDisplayStyle.ImageAndText;
        btnToggleStructure.ImageTransparentColor = Color.Magenta;
        btnToggleStructure.Name = "btnToggleStructure";
        btnToggleStructure.Size = new Size(84, 22);
        btnToggleStructure.Text = "문서 구조";
        btnToggleStructure.TextImageRelation = TextImageRelation.ImageBeforeText;
        btnToggleStructure.ToolTipText = "문서 구조 패널 표시/숨김";
        btnToggleStructure.Click += btnToggleStructure_Click;
        // 
        // pnlContent
        // 
        pnlContent.BackColor = Color.FromArgb(243, 244, 246);
        pnlContent.Controls.Add(splitContainerMain);
        pnlContent.Dock = DockStyle.Fill;
        pnlContent.Location = new Point(0, 49);
        pnlContent.Name = "pnlContent";
        pnlContent.Padding = new Padding(10, 8, 10, 8);
        pnlContent.Size = new Size(1184, 610);
        pnlContent.TabIndex = 4;
        // 
        // splitContainerMain
        // 
        splitContainerMain.Dock = DockStyle.Fill;
        splitContainerMain.FixedPanel = FixedPanel.Panel2;
        splitContainerMain.Location = new Point(10, 8);
        splitContainerMain.Name = "splitContainerMain";
        // 
        // splitContainerMain.Panel1
        // 
        splitContainerMain.Panel1.Controls.Add(splitContainer1);
        splitContainerMain.Panel1MinSize = 500;
        // 
        // splitContainerMain.Panel2
        // 
        splitContainerMain.Panel2.Controls.Add(pnlStructure);
        splitContainerMain.Panel2MinSize = 180;
        splitContainerMain.Size = new Size(1164, 594);
        splitContainerMain.SplitterDistance = 880;
        splitContainerMain.TabIndex = 2;
        // 
        // pnlStructure
        //
        pnlStructure.BackColor = Color.FromArgb(243, 244, 246);
        pnlStructure.Controls.Add(treeStructure);
        pnlStructure.Controls.Add(pnlStructureHeader);
        pnlStructure.Dock = DockStyle.Fill;
        pnlStructure.Location = new Point(0, 0);
        pnlStructure.Name = "pnlStructure";
        pnlStructure.Padding = new Padding(6, 0, 6, 6);
        pnlStructure.Size = new Size(280, 610);
        pnlStructure.TabIndex = 0;
        //
        // pnlStructureHeader
        //
        pnlStructureHeader.BackColor = Color.FromArgb(243, 244, 246);
        pnlStructureHeader.Controls.Add(lblStructure);
        pnlStructureHeader.Controls.Add(btnCloseStructure);
        lblStructure.Controls.Add(picStructureIcon);
        pnlStructureHeader.Dock = DockStyle.Top;
        pnlStructureHeader.Location = new Point(6, 0);
        pnlStructureHeader.Name = "pnlStructureHeader";
        pnlStructureHeader.Size = new Size(268, 28);
        pnlStructureHeader.TabIndex = 2;
        //
        // btnCloseStructure
        //
        btnCloseStructure.AutoSize = true;
        btnCloseStructure.Dock = DockStyle.Right;
        btnCloseStructure.FlatAppearance.BorderSize = 0;
        btnCloseStructure.FlatStyle = FlatStyle.Flat;
        btnCloseStructure.Font = new Font("Segoe UI", 8.5F);
        btnCloseStructure.ForeColor = Color.FromArgb(100, 116, 139);
        btnCloseStructure.Location = new Point(218, 0);
        btnCloseStructure.Margin = new Padding(0);
        btnCloseStructure.Name = "btnCloseStructure";
        btnCloseStructure.Padding = new Padding(4, 0, 2, 0);
        btnCloseStructure.Size = new Size(50, 28);
        btnCloseStructure.TabIndex = 1;
        btnCloseStructure.Text = "닫기";
        btnCloseStructure.UseVisualStyleBackColor = true;
        btnCloseStructure.Click += btnCloseStructure_Click;
        // 
        // splitContainer1
        // 
        splitContainer1.Dock = DockStyle.Fill;
        splitContainer1.Location = new Point(0, 0);
        splitContainer1.Name = "splitContainer1";
        // 
        // splitContainer1.Panel1
        // 
        splitContainer1.Panel1.Controls.Add(webViewMarkdown);
        splitContainer1.Panel1.Controls.Add(lblMarkdown);
        lblMarkdown.Controls.Add(picMarkdownIcon);
        splitContainer1.Panel1.BackColor = Color.FromArgb(243, 244, 246);
        splitContainer1.Panel1.Padding = new Padding(6, 0, 6, 6);
        splitContainer1.Panel1MinSize = 200;
        //
        // splitContainer1.Panel2
        //
        splitContainer1.Panel2.Controls.Add(webViewPreview);
        splitContainer1.Panel2.Controls.Add(lblPreview);
        lblPreview.Controls.Add(picPreviewIcon);
        splitContainer1.Panel2.BackColor = Color.FromArgb(243, 244, 246);
        splitContainer1.Panel2.Padding = new Padding(6, 0, 6, 6);
        splitContainer1.Panel2MinSize = 200;
        splitContainer1.Size = new Size(900, 610);
        splitContainer1.SplitterDistance = 420;
        splitContainer1.TabIndex = 0;
        // 
        // webViewMarkdown
        // 
        webViewMarkdown.AllowExternalDrop = false;
        webViewMarkdown.CreationProperties = null;
        webViewMarkdown.DefaultBackgroundColor = Color.FromArgb(243, 244, 246);
        webViewMarkdown.Dock = DockStyle.Fill;
        webViewMarkdown.Location = new Point(0, 28);
        webViewMarkdown.Name = "webViewMarkdown";
        webViewMarkdown.Size = new Size(420, 582);
        webViewMarkdown.TabIndex = 1;
        webViewMarkdown.ZoomFactor = 1D;
        // 
        // lblMarkdown
        //
        lblMarkdown.BackColor = Color.FromArgb(243, 244, 246);
        lblMarkdown.Dock = DockStyle.Top;
        lblMarkdown.Location = new Point(0, 0);
        lblMarkdown.Name = "lblMarkdown";
        lblMarkdown.Padding = new Padding(28, 6, 8, 4);
        lblMarkdown.Size = new Size(420, 28);
        lblMarkdown.TabIndex = 0;
        lblMarkdown.Text = "Markdown";
        //
        // picMarkdownIcon
        //
        picMarkdownIcon.BackColor = Color.Transparent;
        picMarkdownIcon.Location = new Point(6, 4);
        picMarkdownIcon.Name = "picMarkdownIcon";
        picMarkdownIcon.Size = new Size(20, 20);
        picMarkdownIcon.SizeMode = PictureBoxSizeMode.CenterImage;
        picMarkdownIcon.TabIndex = 9;
        picMarkdownIcon.TabStop = false;
        //
        // webViewPreview
        // 
        webViewPreview.AllowExternalDrop = false;
        webViewPreview.CreationProperties = null;
        webViewPreview.DefaultBackgroundColor = Color.FromArgb(243, 244, 246);
        webViewPreview.Dock = DockStyle.Fill;
        webViewPreview.Location = new Point(0, 28);
        webViewPreview.Name = "webViewPreview";
        webViewPreview.Size = new Size(476, 582);
        webViewPreview.TabIndex = 1;
        webViewPreview.ZoomFactor = 1D;
        // 
        // lblPreview
        //
        lblPreview.BackColor = Color.FromArgb(243, 244, 246);
        lblPreview.Dock = DockStyle.Top;
        lblPreview.Location = new Point(0, 0);
        lblPreview.Name = "lblPreview";
        lblPreview.Padding = new Padding(28, 6, 8, 4);
        lblPreview.Size = new Size(476, 28);
        lblPreview.TabIndex = 0;
        lblPreview.Text = "미리보기";
        //
        // picPreviewIcon
        //
        picPreviewIcon.BackColor = Color.Transparent;
        picPreviewIcon.Location = new Point(6, 4);
        picPreviewIcon.Name = "picPreviewIcon";
        picPreviewIcon.Size = new Size(20, 20);
        picPreviewIcon.SizeMode = PictureBoxSizeMode.CenterImage;
        picPreviewIcon.TabIndex = 9;
        picPreviewIcon.TabStop = false;
        //
        // lblStructure
        //
        lblStructure.BackColor = Color.FromArgb(243, 244, 246);
        lblStructure.Dock = DockStyle.Fill;
        lblStructure.Location = new Point(0, 0);
        lblStructure.Name = "lblStructure";
        lblStructure.Padding = new Padding(28, 6, 4, 4);
        lblStructure.Size = new Size(218, 28);
        lblStructure.TabIndex = 0;
        lblStructure.Text = "문서 구조";
        //
        // picStructureIcon
        //
        picStructureIcon.BackColor = Color.Transparent;
        picStructureIcon.Location = new Point(6, 4);
        picStructureIcon.Name = "picStructureIcon";
        picStructureIcon.Size = new Size(20, 20);
        picStructureIcon.SizeMode = PictureBoxSizeMode.CenterImage;
        picStructureIcon.TabIndex = 9;
        picStructureIcon.TabStop = false;
        //
        // treeStructure
        // 
        treeStructure.Dock = DockStyle.Fill;
        treeStructure.Font = new Font("Segoe UI", 9F);
        treeStructure.FullRowSelect = true;
        treeStructure.HideSelection = false;
        treeStructure.Location = new Point(0, 28);
        treeStructure.Name = "treeStructure";
        treeStructure.ShowLines = true;
        treeStructure.ShowPlusMinus = true;
        treeStructure.ShowRootLines = true;
        treeStructure.Size = new Size(280, 582);
        treeStructure.TabIndex = 1;
        treeStructure.AfterSelect += treeStructure_AfterSelect;
        treeStructure.NodeMouseDoubleClick += treeStructure_NodeMouseDoubleClick;
        // 
        // statusStrip1
        // 
        statusStrip1.Items.AddRange(new ToolStripItem[] { lblStatus, statusProgress, lblProgressPercent });
        statusStrip1.Location = new Point(0, 659);
        statusStrip1.Name = "statusStrip1";
        statusStrip1.Size = new Size(1184, 22);
        statusStrip1.TabIndex = 3;
        statusStrip1.Text = "statusStrip1";
        // 
        // lblStatus
        // 
        lblStatus.Name = "lblStatus";
        lblStatus.Size = new Size(1169, 17);
        lblStatus.Spring = true;
        lblStatus.Text = "HWP/HWPX 파일을 열고 변환하세요.";
        lblStatus.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // statusProgress
        // 
        statusProgress.MarqueeAnimationSpeed = 30;
        statusProgress.Name = "statusProgress";
        statusProgress.Size = new Size(180, 16);
        statusProgress.Style = ProgressBarStyle.Marquee;
        statusProgress.Visible = false;
        //
        // lblProgressPercent
        //
        lblProgressPercent.AutoSize = false;
        lblProgressPercent.Margin = new Padding(0, 0, 4, 0);
        lblProgressPercent.Name = "lblProgressPercent";
        lblProgressPercent.Size = new Size(44, 17);
        lblProgressPercent.Text = "";
        lblProgressPercent.TextAlign = ContentAlignment.MiddleRight;
        lblProgressPercent.Visible = false;
        //
        // openFileDialog1
        // 
        openFileDialog1.Filter = "한글 문서 (*.hwp;*.hwpx)|*.hwp;*.hwpx|모든 파일 (*.*)|*.*";
        openFileDialog1.Title = "HWP 파일 열기";
        // 
        // saveFileDialog1
        // 
        saveFileDialog1.Filter = "Markdown (*.md)|*.md|Word (*.docx)|*.docx|PDF (*.pdf)|*.pdf";
        saveFileDialog1.Title = "내보내기";
        // 
        // previewTimer
        // 
        previewTimer.Interval = 350;
        previewTimer.Tick += previewTimer_Tick;
        // 
        // HWP2DocForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1184, 681);
        Controls.Add(pnlContent);
        Controls.Add(statusStrip1);
        Controls.Add(toolStrip1);
        Controls.Add(menuStrip1);
        Icon = (Icon)resources.GetObject("$this.Icon");
        MainMenuStrip = menuStrip1;
        MinimumSize = new Size(900, 600);
        Name = "HWP2DocForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "HWP2Doc";
        Load += HWP2DocForm_Load;
        menuStrip1.ResumeLayout(false);
        menuStrip1.PerformLayout();
        toolStrip1.ResumeLayout(false);
        toolStrip1.PerformLayout();
        splitContainerMain.Panel1.ResumeLayout(false);
        splitContainerMain.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitContainerMain).EndInit();
        splitContainerMain.ResumeLayout(false);
        pnlContent.ResumeLayout(false);
        pnlStructure.ResumeLayout(false);
        pnlStructureHeader.ResumeLayout(false);
        pnlStructureHeader.PerformLayout();
        splitContainer1.Panel1.ResumeLayout(false);
        splitContainer1.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitContainer1).EndInit();
        splitContainer1.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)webViewMarkdown).EndInit();
        ((System.ComponentModel.ISupportInitialize)webViewPreview).EndInit();
        ((System.ComponentModel.ISupportInitialize)picMarkdownIcon).EndInit();
        ((System.ComponentModel.ISupportInitialize)picPreviewIcon).EndInit();
        ((System.ComponentModel.ISupportInitialize)picStructureIcon).EndInit();
        statusStrip1.ResumeLayout(false);
        statusStrip1.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    private MenuStrip menuStrip1;
    private ToolStripMenuItem fileToolStripMenuItem;
    private ToolStripMenuItem openToolStripMenuItem;
    private ToolStripMenuItem convertToolStripMenuItem;
    private ToolStripMenuItem llmSettingsToolStripMenuItem;
    private ToolStripSeparator menuSepExport;
    private ToolStripMenuItem exportMarkdownToolStripMenuItem;
    private ToolStripMenuItem exportWordToolStripMenuItem;
    private ToolStripMenuItem exportPdfToolStripMenuItem;
    private ToolStripSeparator menuSepExit;
    private ToolStripMenuItem exitToolStripMenuItem;
    private ToolStripMenuItem infoToolStripMenuItem;
    private ToolStripMenuItem programInfoToolStripMenuItem;
    private ToolStripMenuItem viewToolStripMenuItem;
    private ToolStripMenuItem structurePanelVisibleToolStripMenuItem;
    private ToolStripSeparator menuSepStructureView;
    private ToolStripMenuItem structurePositionToolStripMenuItem;
    private ToolStripMenuItem structurePanelLeftToolStripMenuItem;
    private ToolStripMenuItem structurePanelRightToolStripMenuItem;
    private ToolStripSeparator menuSepFontSize;
    private ToolStripMenuItem fontSizeToolStripMenuItem;
    private ToolStrip toolStrip1;
    private ToolStripButton btnOpen;
    private ToolStripButton btnConvert;
    private ToolStripSeparator toolSep1;
    private ToolStripLabel lblFontSize;
    private ToolStripComboBox cboFontSize;
    private ToolStripSeparator toolSepFont;
    private ToolStripButton btnExportMarkdown;
    private ToolStripButton btnExportWord;
    private ToolStripButton btnExportPdf;
    private ToolStripSeparator toolSep2;
    private ToolStripButton btnToggleStructure;
    private ToolStripButton btnProgramInfo;
    private SplitContainer splitContainerMain;
    private Panel pnlContent;
    private SplitContainer splitContainer1;
    private Panel pnlStructure;
    private Panel pnlStructureHeader;
    private Button btnCloseStructure;
    private Label lblMarkdown;
    private PictureBox picMarkdownIcon;
    private Microsoft.Web.WebView2.WinForms.WebView2 webViewMarkdown;
    private Label lblPreview;
    private PictureBox picPreviewIcon;
    private Microsoft.Web.WebView2.WinForms.WebView2 webViewPreview;
    private Label lblStructure;
    private PictureBox picStructureIcon;
    private TreeView treeStructure;
    private StatusStrip statusStrip1;
    private ToolStripStatusLabel lblStatus;
    private ToolStripProgressBar statusProgress;
    private ToolStripStatusLabel lblProgressPercent;
    private OpenFileDialog openFileDialog1;
    private SaveFileDialog saveFileDialog1;
    private System.Windows.Forms.Timer previewTimer;
}
