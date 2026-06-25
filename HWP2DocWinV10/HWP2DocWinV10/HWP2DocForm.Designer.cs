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
        btnExportMarkdown = new ToolStripButton();
        btnExportWord = new ToolStripButton();
        btnExportPdf = new ToolStripButton();
        toolSep2 = new ToolStripSeparator();
        lblFontSize = new ToolStripLabel();
        cboFontSize = new ToolStripComboBox();
        btnProgramInfo = new ToolStripButton();
        splitContainerMain = new SplitContainer();
        splitContainer1 = new SplitContainer();
        pnlStructure = new Panel();
        webViewMarkdown = new Microsoft.Web.WebView2.WinForms.WebView2();
        lblMarkdown = new Label();
        webViewPreview = new Microsoft.Web.WebView2.WinForms.WebView2();
        lblPreview = new Label();
        lblStructure = new Label();
        treeStructure = new TreeView();
        statusStrip1 = new StatusStrip();
        lblStatus = new ToolStripStatusLabel();
        statusProgress = new ToolStripProgressBar();
        openFileDialog1 = new OpenFileDialog();
        saveFileDialog1 = new SaveFileDialog();
        previewTimer = new System.Windows.Forms.Timer(components);
        menuStrip1.SuspendLayout();
        toolStrip1.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitContainerMain).BeginInit();
        splitContainerMain.Panel1.SuspendLayout();
        splitContainerMain.Panel2.SuspendLayout();
        splitContainerMain.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)splitContainer1).BeginInit();
        splitContainer1.Panel1.SuspendLayout();
        splitContainer1.Panel2.SuspendLayout();
        splitContainer1.SuspendLayout();
        pnlStructure.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)webViewMarkdown).BeginInit();
        ((System.ComponentModel.ISupportInitialize)webViewPreview).BeginInit();
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
        fileToolStripMenuItem.DropDownItems.AddRange(new ToolStripItem[] { openToolStripMenuItem, convertToolStripMenuItem, menuSepExport, exportMarkdownToolStripMenuItem, exportWordToolStripMenuItem, exportPdfToolStripMenuItem, menuSepExit, exitToolStripMenuItem });
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
        structurePanelVisibleToolStripMenuItem.Checked = true;
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
        toolStrip1.Items.AddRange(new ToolStripItem[] { btnOpen, btnConvert, toolSep1, btnExportMarkdown, btnExportWord, btnExportPdf, toolSep2, lblFontSize, cboFontSize, btnProgramInfo });
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
        // splitContainerMain
        // 
        splitContainerMain.Dock = DockStyle.Fill;
        splitContainerMain.FixedPanel = FixedPanel.Panel2;
        splitContainerMain.Location = new Point(0, 49);
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
        splitContainerMain.Size = new Size(1184, 610);
        splitContainerMain.SplitterDistance = 900;
        splitContainerMain.TabIndex = 2;
        // 
        // pnlStructure
        // 
        pnlStructure.Controls.Add(treeStructure);
        pnlStructure.Controls.Add(lblStructure);
        pnlStructure.Dock = DockStyle.Fill;
        pnlStructure.Location = new Point(0, 0);
        pnlStructure.Name = "pnlStructure";
        pnlStructure.Size = new Size(280, 610);
        pnlStructure.TabIndex = 0;
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
        splitContainer1.Panel1.BackColor = Color.FromArgb(243, 244, 246);
        splitContainer1.Panel1MinSize = 200;
        // 
        // splitContainer1.Panel2
        // 
        splitContainer1.Panel2.Controls.Add(webViewPreview);
        splitContainer1.Panel2.Controls.Add(lblPreview);
        splitContainer1.Panel2.BackColor = Color.FromArgb(243, 244, 246);
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
        lblMarkdown.Padding = new Padding(8, 6, 8, 4);
        lblMarkdown.Size = new Size(420, 28);
        lblMarkdown.TabIndex = 0;
        lblMarkdown.Text = "Markdown";
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
        lblPreview.Padding = new Padding(8, 6, 8, 4);
        lblPreview.Size = new Size(476, 28);
        lblPreview.TabIndex = 0;
        lblPreview.Text = "미리보기";
        // 
        // lblStructure
        // 
        lblStructure.Dock = DockStyle.Top;
        lblStructure.Location = new Point(0, 0);
        lblStructure.Name = "lblStructure";
        lblStructure.Padding = new Padding(8, 6, 8, 4);
        lblStructure.Size = new Size(280, 28);
        lblStructure.TabIndex = 0;
        lblStructure.Text = "문서 구조";
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
        statusStrip1.Items.AddRange(new ToolStripItem[] { lblStatus, statusProgress });
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
        statusProgress.Name = "statusProgress";
        statusProgress.Size = new Size(100, 16);
        statusProgress.Style = ProgressBarStyle.Marquee;
        statusProgress.Visible = false;
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
        Controls.Add(splitContainerMain);
        Controls.Add(toolStrip1);
        Controls.Add(menuStrip1);
        Controls.Add(statusStrip1);
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
        pnlStructure.ResumeLayout(false);
        splitContainer1.Panel1.ResumeLayout(false);
        splitContainer1.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitContainer1).EndInit();
        splitContainer1.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)webViewMarkdown).EndInit();
        ((System.ComponentModel.ISupportInitialize)webViewPreview).EndInit();
        statusStrip1.ResumeLayout(false);
        statusStrip1.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    private MenuStrip menuStrip1;
    private ToolStripMenuItem fileToolStripMenuItem;
    private ToolStripMenuItem openToolStripMenuItem;
    private ToolStripMenuItem convertToolStripMenuItem;
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
    private ToolStripButton btnExportMarkdown;
    private ToolStripButton btnExportWord;
    private ToolStripButton btnExportPdf;
    private ToolStripSeparator toolSep2;
    private ToolStripLabel lblFontSize;
    private ToolStripComboBox cboFontSize;
    private ToolStripButton btnProgramInfo;
    private SplitContainer splitContainerMain;
    private SplitContainer splitContainer1;
    private Panel pnlStructure;
    private Label lblMarkdown;
    private Microsoft.Web.WebView2.WinForms.WebView2 webViewMarkdown;
    private Label lblPreview;
    private Microsoft.Web.WebView2.WinForms.WebView2 webViewPreview;
    private Label lblStructure;
    private TreeView treeStructure;
    private StatusStrip statusStrip1;
    private ToolStripStatusLabel lblStatus;
    private ToolStripProgressBar statusProgress;
    private OpenFileDialog openFileDialog1;
    private SaveFileDialog saveFileDialog1;
    private System.Windows.Forms.Timer previewTimer;
}
