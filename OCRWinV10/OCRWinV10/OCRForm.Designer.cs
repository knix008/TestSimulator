namespace OCRWinV10;

partial class OCRForm
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    #region Windows Form Designer generated code

    private void InitializeComponent()
    {
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(OCRForm));
        menuStrip = new MenuStrip();
        tsmiFile = new ToolStripMenuItem();
        tsmiOpen = new ToolStripMenuItem();
        tsmiSaveResult = new ToolStripMenuItem();
        tsmiSaveBoxesImage = new ToolStripMenuItem();
        tsmiSaveAll = new ToolStripMenuItem();
        tsmiSep1 = new ToolStripSeparator();
        tsmiExit = new ToolStripMenuItem();
        tsmiHelp = new ToolStripMenuItem();
        tsmiAbout = new ToolStripMenuItem();
        toolStrip = new ToolStrip();
        tsbOpen = new ToolStripButton();
        tsSep1 = new ToolStripSeparator();
        tsbPrev = new ToolStripButton();
        tslPage = new ToolStripLabel();
        tsbNext = new ToolStripButton();
        tsSep2 = new ToolStripSeparator();
        tsbOcr = new ToolStripButton();
        tsbCancel = new ToolStripButton();
        tsSep3 = new ToolStripSeparator();
        tslEngine = new ToolStripLabel();
        tscbEngine = new ToolStripComboBox();
        tsSepEngine = new ToolStripSeparator();
        tslMode = new ToolStripLabel();
        tscbMode = new ToolStripComboBox();
        outerSplitContainer = new SplitContainer();
        innerSplitContainer = new SplitContainer();
        pictureOriginal = new PictureBox();
        panelOriginalHeader = new Panel();
        lblOriginalTitle = new Label();
        pictureBoxes = new PictureBox();
        panelBoxesHeader = new Panel();
        lblBoxesTitle = new Label();
        richTextBoxResult = new RichTextBox();
        panelResultBar = new Panel();
        flowResultActions = new FlowLayoutPanel();
        btnCopyResult = new Button();
        btnSaveText = new Button();
        btnSaveBoxes = new Button();
        btnSaveAll = new Button();
        btnClearResult = new Button();
        panelTextHeader = new Panel();
        lblResultTitle = new Label();
        statusStrip = new StatusStrip();
        tslStatus = new ToolStripStatusLabel();
        tspProgress = new ToolStripProgressBar();
        tslLang = new ToolStripStatusLabel();
        menuStrip.SuspendLayout();
        toolStrip.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)outerSplitContainer).BeginInit();
        outerSplitContainer.Panel1.SuspendLayout();
        outerSplitContainer.Panel2.SuspendLayout();
        outerSplitContainer.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)innerSplitContainer).BeginInit();
        innerSplitContainer.Panel1.SuspendLayout();
        innerSplitContainer.Panel2.SuspendLayout();
        innerSplitContainer.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)pictureOriginal).BeginInit();
        panelOriginalHeader.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)pictureBoxes).BeginInit();
        panelBoxesHeader.SuspendLayout();
        panelResultBar.SuspendLayout();
        flowResultActions.SuspendLayout();
        panelTextHeader.SuspendLayout();
        statusStrip.SuspendLayout();
        SuspendLayout();
        // 
        // menuStrip
        // 
        menuStrip.Items.AddRange(new ToolStripItem[] { tsmiFile, tsmiHelp });
        menuStrip.Location = new Point(0, 0);
        menuStrip.Name = "menuStrip";
        menuStrip.Size = new Size(1200, 24);
        menuStrip.TabIndex = 0;
        menuStrip.Text = "menuStrip";
        // 
        // tsmiFile
        // 
        tsmiFile.DropDownItems.AddRange(new ToolStripItem[] { tsmiOpen, tsmiSaveResult, tsmiSaveBoxesImage, tsmiSaveAll, tsmiSep1, tsmiExit });
        tsmiFile.Name = "tsmiFile";
        tsmiFile.Size = new Size(57, 20);
        tsmiFile.Text = "파일(&F)";
        // 
        // tsmiOpen
        // 
        tsmiOpen.Name = "tsmiOpen";
        tsmiOpen.ShortcutKeys = Keys.Control | Keys.O;
        tsmiOpen.Size = new Size(301, 22);
        tsmiOpen.Text = "열기(&O)";
        tsmiOpen.Click += tsmiOpen_Click;
        // 
        // tsmiSaveResult
        // 
        tsmiSaveResult.Name = "tsmiSaveResult";
        tsmiSaveResult.ShortcutKeys = Keys.Control | Keys.S;
        tsmiSaveResult.Size = new Size(301, 22);
        tsmiSaveResult.Text = "텍스트 저장(&S)";
        tsmiSaveResult.Click += tsmiSaveResult_Click;
        // 
        // tsmiSaveBoxesImage
        // 
        tsmiSaveBoxesImage.Name = "tsmiSaveBoxesImage";
        tsmiSaveBoxesImage.ShortcutKeys = Keys.Control | Keys.Shift | Keys.S;
        tsmiSaveBoxesImage.Size = new Size(301, 22);
        tsmiSaveBoxesImage.Text = "박스 이미지 저장(&B)";
        tsmiSaveBoxesImage.Click += tsmiSaveBoxesImage_Click;
        // 
        // tsmiSaveAll
        // 
        tsmiSaveAll.Name = "tsmiSaveAll";
        tsmiSaveAll.ShortcutKeys = Keys.Control | Keys.Shift | Keys.A;
        tsmiSaveAll.Size = new Size(301, 22);
        tsmiSaveAll.Text = "텍스트+박스 이미지 저장(&A)";
        tsmiSaveAll.Click += tsmiSaveAll_Click;
        // 
        // tsmiSep1
        // 
        tsmiSep1.Name = "tsmiSep1";
        tsmiSep1.Size = new Size(298, 6);
        // 
        // tsmiExit
        // 
        tsmiExit.Name = "tsmiExit";
        tsmiExit.Size = new Size(301, 22);
        tsmiExit.Text = "종료(&X)";
        tsmiExit.Click += tsmiExit_Click;
        // 
        // tsmiHelp
        // 
        tsmiHelp.DropDownItems.AddRange(new ToolStripItem[] { tsmiAbout });
        tsmiHelp.Name = "tsmiHelp";
        tsmiHelp.Size = new Size(72, 20);
        tsmiHelp.Text = "도움말(&H)";
        // 
        // tsmiAbout
        // 
        tsmiAbout.Name = "tsmiAbout";
        tsmiAbout.Size = new Size(114, 22);
        tsmiAbout.Text = "정보(&A)";
        tsmiAbout.Click += tsmiAbout_Click;
        // 
        // toolStrip
        // 
        toolStrip.GripStyle = ToolStripGripStyle.Hidden;
        toolStrip.Items.AddRange(new ToolStripItem[] { tsbOpen, tsSep1, tsbPrev, tslPage, tsbNext, tsSep2, tsbOcr, tsbCancel, tsSep3, tslEngine, tscbEngine, tsSepEngine, tslMode, tscbMode });
        toolStrip.Location = new Point(0, 24);
        toolStrip.Name = "toolStrip";
        toolStrip.Size = new Size(1200, 25);
        toolStrip.TabIndex = 1;
        toolStrip.Text = "toolStrip";
        // 
        // tsbOpen
        // 
        tsbOpen.DisplayStyle = ToolStripItemDisplayStyle.Text;
        tsbOpen.Name = "tsbOpen";
        tsbOpen.Size = new Size(35, 22);
        tsbOpen.Text = "열기";
        tsbOpen.ToolTipText = "이미지 또는 PDF 파일 열기 (Ctrl+O)";
        tsbOpen.Click += tsbOpen_Click;
        // 
        // tsSep1
        // 
        tsSep1.Name = "tsSep1";
        tsSep1.Size = new Size(6, 25);
        // 
        // tsbPrev
        // 
        tsbPrev.DisplayStyle = ToolStripItemDisplayStyle.Text;
        tsbPrev.Enabled = false;
        tsbPrev.Name = "tsbPrev";
        tsbPrev.Size = new Size(23, 22);
        tsbPrev.Text = "◀";
        tsbPrev.ToolTipText = "이전 페이지";
        tsbPrev.Click += tsbPrev_Click;
        // 
        // tslPage
        // 
        tslPage.Name = "tslPage";
        tslPage.Size = new Size(34, 22);
        tslPage.Text = "0 / 0";
        // 
        // tsbNext
        // 
        tsbNext.DisplayStyle = ToolStripItemDisplayStyle.Text;
        tsbNext.Enabled = false;
        tsbNext.Name = "tsbNext";
        tsbNext.Size = new Size(23, 22);
        tsbNext.Text = "▶";
        tsbNext.ToolTipText = "다음 페이지";
        tsbNext.Click += tsbNext_Click;
        // 
        // tsSep2
        // 
        tsSep2.Name = "tsSep2";
        tsSep2.Size = new Size(6, 25);
        // 
        // tsbOcr
        // 
        tsbOcr.DisplayStyle = ToolStripItemDisplayStyle.Text;
        tsbOcr.Enabled = false;
        tsbOcr.BackColor = Color.FromArgb(187, 247, 208);
        tsbOcr.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
        tsbOcr.ForeColor = Color.FromArgb(21, 128, 61);
        tsbOcr.Name = "tsbOcr";
        tsbOcr.Size = new Size(62, 22);
        tsbOcr.Text = "OCR 실행";
        tsbOcr.ToolTipText = "현재 이미지에서 텍스트 인식 (F5)";
        tsbOcr.Click += tsbOcr_Click;
        // 
        // tsbCancel
        // 
        tsbCancel.DisplayStyle = ToolStripItemDisplayStyle.Text;
        tsbCancel.Enabled = false;
        tsbCancel.ForeColor = Color.DarkRed;
        tsbCancel.Name = "tsbCancel";
        tsbCancel.Size = new Size(35, 22);
        tsbCancel.Text = "취소";
        tsbCancel.Visible = false;
        tsbCancel.Click += tsbCancel_Click;
        // 
        // tsSep3
        // 
        tsSep3.Name = "tsSep3";
        tsSep3.Size = new Size(6, 25);
        // 
        // tslEngine
        // 
        tslEngine.Name = "tslEngine";
        tslEngine.Size = new Size(34, 22);
        tslEngine.Text = "엔진:";
        // 
        // tscbEngine
        // 
        tscbEngine.DropDownStyle = ComboBoxStyle.DropDownList;
        tscbEngine.FlatStyle = FlatStyle.Standard;
        tscbEngine.Name = "tscbEngine";
        tscbEngine.Size = new Size(150, 25);
        tscbEngine.ToolTipText = "한·영 OCR 엔진 (권장: PaddleOCR, 미설치 시 자동 설치)";
        tscbEngine.SelectedIndexChanged += tscbEngine_SelectedIndexChanged;
        // 
        // tsSepEngine
        // 
        tsSepEngine.Name = "tsSepEngine";
        tsSepEngine.Size = new Size(6, 25);
        // 
        // tslMode
        // 
        tslMode.Name = "tslMode";
        tslMode.Size = new Size(46, 22);
        tslMode.Text = "전처리:";
        // 
        // tscbMode
        // 
        tscbMode.DropDownStyle = ComboBoxStyle.DropDownList;
        tscbMode.FlatStyle = FlatStyle.Standard;
        tscbMode.Items.AddRange(new object[] { "자동", "손글씨", "없음" });
        tscbMode.Name = "tscbMode";
        tscbMode.Size = new Size(80, 25);
        tscbMode.ToolTipText = "한글 문서 전처리 (손글씨·낮은 해상도는 손글씨 모드 권장)";
        tscbMode.SelectedIndexChanged += tscbMode_SelectedIndexChanged;
        // 
        // outerSplitContainer
        // 
        outerSplitContainer.Dock = DockStyle.Fill;
        outerSplitContainer.Location = new Point(0, 49);
        outerSplitContainer.Name = "outerSplitContainer";
        outerSplitContainer.Orientation = Orientation.Horizontal;
        // 
        // outerSplitContainer.Panel1
        // 
        outerSplitContainer.Panel1.Controls.Add(innerSplitContainer);
        // 
        // outerSplitContainer.Panel2
        // 
        outerSplitContainer.Panel2.Controls.Add(richTextBoxResult);
        outerSplitContainer.Panel2.Controls.Add(panelResultBar);
        outerSplitContainer.Panel2.Controls.Add(panelTextHeader);
        outerSplitContainer.Size = new Size(1200, 868);
        outerSplitContainer.SplitterDistance = 580;
        outerSplitContainer.TabIndex = 2;
        // 
        // innerSplitContainer
        // 
        innerSplitContainer.Dock = DockStyle.Fill;
        innerSplitContainer.Location = new Point(0, 0);
        innerSplitContainer.Name = "innerSplitContainer";
        // 
        // innerSplitContainer.Panel1
        // 
        innerSplitContainer.Panel1.Controls.Add(pictureOriginal);
        innerSplitContainer.Panel1.Controls.Add(panelOriginalHeader);
        // 
        // innerSplitContainer.Panel2
        // 
        innerSplitContainer.Panel2.Controls.Add(pictureBoxes);
        innerSplitContainer.Panel2.Controls.Add(panelBoxesHeader);
        innerSplitContainer.Size = new Size(1200, 580);
        innerSplitContainer.SplitterDistance = 597;
        innerSplitContainer.TabIndex = 0;
        // 
        // pictureOriginal
        // 
        pictureOriginal.BackColor = Color.FromArgb(24, 27, 34);
        pictureOriginal.Dock = DockStyle.Fill;
        pictureOriginal.Location = new Point(0, 26);
        pictureOriginal.Name = "pictureOriginal";
        pictureOriginal.Size = new Size(597, 554);
        pictureOriginal.SizeMode = PictureBoxSizeMode.Zoom;
        pictureOriginal.TabIndex = 1;
        pictureOriginal.TabStop = false;
        // 
        // panelOriginalHeader
        // 
        panelOriginalHeader.BackColor = SystemColors.ControlDark;
        panelOriginalHeader.Controls.Add(lblOriginalTitle);
        panelOriginalHeader.Dock = DockStyle.Top;
        panelOriginalHeader.Location = new Point(0, 0);
        panelOriginalHeader.Name = "panelOriginalHeader";
        panelOriginalHeader.Size = new Size(597, 26);
        panelOriginalHeader.TabIndex = 0;
        // 
        // lblOriginalTitle
        // 
        lblOriginalTitle.Dock = DockStyle.Fill;
        lblOriginalTitle.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
        lblOriginalTitle.ForeColor = Color.White;
        lblOriginalTitle.Location = new Point(0, 0);
        lblOriginalTitle.Name = "lblOriginalTitle";
        lblOriginalTitle.Size = new Size(597, 26);
        lblOriginalTitle.TabIndex = 0;
        lblOriginalTitle.Text = "  원본 이미지";
        lblOriginalTitle.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // pictureBoxes
        // 
        pictureBoxes.BackColor = Color.FromArgb(24, 27, 34);
        pictureBoxes.Dock = DockStyle.Fill;
        pictureBoxes.Location = new Point(0, 26);
        pictureBoxes.Name = "pictureBoxes";
        pictureBoxes.Size = new Size(599, 554);
        pictureBoxes.SizeMode = PictureBoxSizeMode.Zoom;
        pictureBoxes.TabIndex = 1;
        pictureBoxes.TabStop = false;
        // 
        // panelBoxesHeader
        // 
        panelBoxesHeader.BackColor = SystemColors.ControlDark;
        panelBoxesHeader.Controls.Add(lblBoxesTitle);
        panelBoxesHeader.Dock = DockStyle.Top;
        panelBoxesHeader.Location = new Point(0, 0);
        panelBoxesHeader.Name = "panelBoxesHeader";
        panelBoxesHeader.Size = new Size(599, 26);
        panelBoxesHeader.TabIndex = 0;
        // 
        // lblBoxesTitle
        // 
        lblBoxesTitle.Dock = DockStyle.Fill;
        lblBoxesTitle.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
        lblBoxesTitle.ForeColor = Color.White;
        lblBoxesTitle.Location = new Point(0, 0);
        lblBoxesTitle.Name = "lblBoxesTitle";
        lblBoxesTitle.Size = new Size(599, 26);
        lblBoxesTitle.TabIndex = 0;
        lblBoxesTitle.Text = "  인식 결과 (박스)";
        lblBoxesTitle.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // richTextBoxResult
        // 
        richTextBoxResult.BackColor = SystemColors.Window;
        richTextBoxResult.Dock = DockStyle.Fill;
        richTextBoxResult.Font = new Font("맑은 고딕", 11F);
        richTextBoxResult.Location = new Point(0, 26);
        richTextBoxResult.Name = "richTextBoxResult";
        richTextBoxResult.ScrollBars = RichTextBoxScrollBars.Vertical;
        richTextBoxResult.Size = new Size(1200, 222);
        richTextBoxResult.TabIndex = 1;
        richTextBoxResult.Text = "";
        // 
        // panelResultBar
        // 
        panelResultBar.Controls.Add(flowResultActions);
        panelResultBar.Dock = DockStyle.Bottom;
        panelResultBar.Location = new Point(0, 248);
        panelResultBar.Name = "panelResultBar";
        panelResultBar.Padding = new Padding(8, 4, 8, 4);
        panelResultBar.Size = new Size(1200, 36);
        panelResultBar.TabIndex = 2;
        // 
        // flowResultActions
        // 
        flowResultActions.AutoSize = true;
        flowResultActions.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        flowResultActions.Controls.Add(btnCopyResult);
        flowResultActions.Controls.Add(btnSaveText);
        flowResultActions.Controls.Add(btnSaveBoxes);
        flowResultActions.Controls.Add(btnSaveAll);
        flowResultActions.Controls.Add(btnClearResult);
        flowResultActions.Dock = DockStyle.Fill;
        flowResultActions.Location = new Point(8, 4);
        flowResultActions.Name = "flowResultActions";
        flowResultActions.Size = new Size(1184, 28);
        flowResultActions.TabIndex = 0;
        flowResultActions.WrapContents = false;
        // 
        // btnCopyResult
        // 
        btnCopyResult.AutoSize = true;
        btnCopyResult.Location = new Point(0, 0);
        btnCopyResult.Margin = new Padding(0, 0, 6, 0);
        btnCopyResult.Name = "btnCopyResult";
        btnCopyResult.Size = new Size(75, 28);
        btnCopyResult.TabIndex = 0;
        btnCopyResult.Text = "복사";
        btnCopyResult.UseVisualStyleBackColor = true;
        btnCopyResult.Click += btnCopyResult_Click;
        // 
        // btnSaveText
        // 
        btnSaveText.AutoSize = true;
        btnSaveText.Location = new Point(81, 0);
        btnSaveText.Margin = new Padding(0, 0, 6, 0);
        btnSaveText.Name = "btnSaveText";
        btnSaveText.Size = new Size(99, 28);
        btnSaveText.TabIndex = 1;
        btnSaveText.Text = "텍스트 저장";
        btnSaveText.UseVisualStyleBackColor = true;
        btnSaveText.Click += btnSaveText_Click;
        // 
        // btnSaveBoxes
        // 
        btnSaveBoxes.AutoSize = true;
        btnSaveBoxes.Location = new Point(186, 0);
        btnSaveBoxes.Margin = new Padding(0, 0, 6, 0);
        btnSaveBoxes.Name = "btnSaveBoxes";
        btnSaveBoxes.Size = new Size(111, 28);
        btnSaveBoxes.TabIndex = 2;
        btnSaveBoxes.Text = "박스 이미지";
        btnSaveBoxes.UseVisualStyleBackColor = true;
        btnSaveBoxes.Click += btnSaveBoxes_Click;
        // 
        // btnSaveAll
        // 
        btnSaveAll.AutoSize = true;
        btnSaveAll.Location = new Point(303, 0);
        btnSaveAll.Margin = new Padding(0, 0, 6, 0);
        btnSaveAll.Name = "btnSaveAll";
        btnSaveAll.Size = new Size(75, 28);
        btnSaveAll.TabIndex = 3;
        btnSaveAll.Text = "모두 저장";
        btnSaveAll.UseVisualStyleBackColor = true;
        btnSaveAll.Click += btnSaveAll_Click;
        // 
        // btnClearResult
        // 
        btnClearResult.AutoSize = true;
        btnClearResult.Location = new Point(384, 0);
        btnClearResult.Margin = new Padding(0);
        btnClearResult.Name = "btnClearResult";
        btnClearResult.Size = new Size(75, 28);
        btnClearResult.TabIndex = 4;
        btnClearResult.Text = "지우기";
        btnClearResult.UseVisualStyleBackColor = true;
        btnClearResult.Click += btnClearResult_Click;
        // 
        // panelTextHeader
        // 
        panelTextHeader.BackColor = SystemColors.ControlDark;
        panelTextHeader.Controls.Add(lblResultTitle);
        panelTextHeader.Dock = DockStyle.Top;
        panelTextHeader.Location = new Point(0, 0);
        panelTextHeader.Name = "panelTextHeader";
        panelTextHeader.Size = new Size(1200, 26);
        panelTextHeader.TabIndex = 0;
        // 
        // lblResultTitle
        // 
        lblResultTitle.Dock = DockStyle.Fill;
        lblResultTitle.Font = new Font("맑은 고딕", 9F, FontStyle.Bold);
        lblResultTitle.ForeColor = Color.White;
        lblResultTitle.Location = new Point(0, 0);
        lblResultTitle.Name = "lblResultTitle";
        lblResultTitle.Size = new Size(1200, 26);
        lblResultTitle.TabIndex = 0;
        lblResultTitle.Text = "  텍스트 결과";
        lblResultTitle.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // statusStrip
        // 
        statusStrip.Items.AddRange(new ToolStripItem[] { tslStatus, tslLang, tspProgress });
        statusStrip.Location = new Point(0, 917);
        statusStrip.Name = "statusStrip";
        statusStrip.Size = new Size(1200, 24);
        statusStrip.TabIndex = 3;
        statusStrip.Text = "statusStrip";
        // 
        // tslStatus
        // 
        tslStatus.Name = "tslStatus";
        tslStatus.Spring = true;
        tslStatus.Text = "준비";
        tslStatus.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // tslLang
        // 
        tslLang.BorderSides = ToolStripStatusLabelBorderSides.Left;
        tslLang.Name = "tslLang";
        tslLang.Size = new Size(120, 19);
        tslLang.Text = "언어: -";
        tslLang.TextAlign = ContentAlignment.MiddleRight;
        // 
        // tspProgress
        // 
        tspProgress.Alignment = ToolStripItemAlignment.Right;
        tspProgress.Name = "tspProgress";
        tspProgress.Size = new Size(200, 18);
        tspProgress.Style = ProgressBarStyle.Continuous;
        tspProgress.Visible = false;
        // 
        // OCRForm
        // 
        AllowDrop = true;
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1200, 941);
        Controls.Add(outerSplitContainer);
        Controls.Add(statusStrip);
        Controls.Add(toolStrip);
        Controls.Add(menuStrip);
        Icon = (Icon)resources.GetObject("$this.Icon");
        KeyPreview = true;
        MainMenuStrip = menuStrip;
        MinimumSize = new Size(900, 600);
        Name = "OCRForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "한국어 OCR";
        DragDrop += OCRForm_DragDrop;
        DragEnter += OCRForm_DragEnter;
        KeyDown += OCRForm_KeyDown;
        menuStrip.ResumeLayout(false);
        menuStrip.PerformLayout();
        toolStrip.ResumeLayout(false);
        toolStrip.PerformLayout();
        outerSplitContainer.Panel1.ResumeLayout(false);
        outerSplitContainer.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)outerSplitContainer).EndInit();
        outerSplitContainer.ResumeLayout(false);
        innerSplitContainer.Panel1.ResumeLayout(false);
        innerSplitContainer.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)innerSplitContainer).EndInit();
        innerSplitContainer.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)pictureOriginal).EndInit();
        panelOriginalHeader.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)pictureBoxes).EndInit();
        panelBoxesHeader.ResumeLayout(false);
        panelResultBar.ResumeLayout(false);
        panelResultBar.PerformLayout();
        flowResultActions.ResumeLayout(false);
        flowResultActions.PerformLayout();
        panelTextHeader.ResumeLayout(false);
        statusStrip.ResumeLayout(false);
        statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }

    #endregion

    private System.Windows.Forms.MenuStrip menuStrip;
    private System.Windows.Forms.ToolStripMenuItem tsmiFile;
    private System.Windows.Forms.ToolStripMenuItem tsmiOpen;
    private System.Windows.Forms.ToolStripMenuItem tsmiSaveResult;
    private System.Windows.Forms.ToolStripMenuItem tsmiSaveBoxesImage;
    private System.Windows.Forms.ToolStripMenuItem tsmiSaveAll;
    private System.Windows.Forms.ToolStripSeparator tsmiSep1;
    private System.Windows.Forms.ToolStripMenuItem tsmiExit;
    private System.Windows.Forms.ToolStripMenuItem tsmiHelp;
    private System.Windows.Forms.ToolStripMenuItem tsmiAbout;
    private System.Windows.Forms.ToolStrip toolStrip;
    private System.Windows.Forms.ToolStripButton tsbOpen;
    private System.Windows.Forms.ToolStripSeparator tsSep1;
    private System.Windows.Forms.ToolStripButton tsbPrev;
    private System.Windows.Forms.ToolStripLabel tslPage;
    private System.Windows.Forms.ToolStripButton tsbNext;
    private System.Windows.Forms.ToolStripSeparator tsSep2;
    private System.Windows.Forms.ToolStripButton tsbOcr;
    private System.Windows.Forms.ToolStripButton tsbCancel;
    private System.Windows.Forms.ToolStripSeparator tsSep3;
    private System.Windows.Forms.ToolStripLabel tslEngine;
    private System.Windows.Forms.ToolStripComboBox tscbEngine;
    private System.Windows.Forms.ToolStripSeparator tsSepEngine;
    private System.Windows.Forms.ToolStripLabel tslMode;
    private System.Windows.Forms.ToolStripComboBox tscbMode;
    private System.Windows.Forms.SplitContainer outerSplitContainer;
    private System.Windows.Forms.SplitContainer innerSplitContainer;
    private System.Windows.Forms.Panel panelOriginalHeader;
    private System.Windows.Forms.Label lblOriginalTitle;
    private System.Windows.Forms.PictureBox pictureOriginal;
    private System.Windows.Forms.Panel panelBoxesHeader;
    private System.Windows.Forms.Label lblBoxesTitle;
    private System.Windows.Forms.PictureBox pictureBoxes;
    private System.Windows.Forms.Panel panelTextHeader;
    private System.Windows.Forms.Label lblResultTitle;
    private System.Windows.Forms.RichTextBox richTextBoxResult;
    private System.Windows.Forms.Panel panelResultBar;
    private System.Windows.Forms.FlowLayoutPanel flowResultActions;
    private System.Windows.Forms.Button btnCopyResult;
    private System.Windows.Forms.Button btnSaveText;
    private System.Windows.Forms.Button btnSaveBoxes;
    private System.Windows.Forms.Button btnSaveAll;
    private System.Windows.Forms.Button btnClearResult;
    private System.Windows.Forms.StatusStrip statusStrip;
    private System.Windows.Forms.ToolStripStatusLabel tslStatus;
    private System.Windows.Forms.ToolStripProgressBar tspProgress;
    private System.Windows.Forms.ToolStripStatusLabel tslLang;
}
