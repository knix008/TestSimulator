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
        this.components = new System.ComponentModel.Container();
        this.menuStrip = new System.Windows.Forms.MenuStrip();
        this.tsmiFile = new System.Windows.Forms.ToolStripMenuItem();
        this.tsmiOpen = new System.Windows.Forms.ToolStripMenuItem();
        this.tsmiSaveResult = new System.Windows.Forms.ToolStripMenuItem();
        this.tsmiSep1 = new System.Windows.Forms.ToolStripSeparator();
        this.tsmiExit = new System.Windows.Forms.ToolStripMenuItem();
        this.tsmiHelp = new System.Windows.Forms.ToolStripMenuItem();
        this.tsmiAbout = new System.Windows.Forms.ToolStripMenuItem();
        this.toolStrip = new System.Windows.Forms.ToolStrip();
        this.tsbOpen = new System.Windows.Forms.ToolStripButton();
        this.tsSep1 = new System.Windows.Forms.ToolStripSeparator();
        this.tsbPrev = new System.Windows.Forms.ToolStripButton();
        this.tslPage = new System.Windows.Forms.ToolStripLabel();
        this.tsbNext = new System.Windows.Forms.ToolStripButton();
        this.tsSep2 = new System.Windows.Forms.ToolStripSeparator();
        this.tsbOcr = new System.Windows.Forms.ToolStripButton();
        this.tsbCancel = new System.Windows.Forms.ToolStripButton();
        this.tsSep3 = new System.Windows.Forms.ToolStripSeparator();
        this.tslMode = new System.Windows.Forms.ToolStripLabel();
        this.tscbMode = new System.Windows.Forms.ToolStripComboBox();
        this.tsSep4 = new System.Windows.Forms.ToolStripSeparator();
        this.tsbCopy = new System.Windows.Forms.ToolStripButton();
        this.tsbSave = new System.Windows.Forms.ToolStripButton();
        this.tsbClear = new System.Windows.Forms.ToolStripButton();
        this.outerSplitContainer = new System.Windows.Forms.SplitContainer();
        this.innerSplitContainer = new System.Windows.Forms.SplitContainer();
        this.panelOriginalHeader = new System.Windows.Forms.Panel();
        this.lblOriginalTitle = new System.Windows.Forms.Label();
        this.pictureOriginal = new System.Windows.Forms.PictureBox();
        this.panelBoxesHeader = new System.Windows.Forms.Panel();
        this.lblBoxesTitle = new System.Windows.Forms.Label();
        this.pictureBoxes = new System.Windows.Forms.PictureBox();
        this.panelTextHeader = new System.Windows.Forms.Panel();
        this.lblResultTitle = new System.Windows.Forms.Label();
        this.richTextBoxResult = new System.Windows.Forms.RichTextBox();
        this.statusStrip = new System.Windows.Forms.StatusStrip();
        this.tslStatus = new System.Windows.Forms.ToolStripStatusLabel();
        this.tspProgress = new System.Windows.Forms.ToolStripProgressBar();
        this.tslLang = new System.Windows.Forms.ToolStripStatusLabel();
        this.menuStrip.SuspendLayout();
        this.toolStrip.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)(this.outerSplitContainer)).BeginInit();
        this.outerSplitContainer.Panel1.SuspendLayout();
        this.outerSplitContainer.Panel2.SuspendLayout();
        this.outerSplitContainer.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)(this.innerSplitContainer)).BeginInit();
        this.innerSplitContainer.Panel1.SuspendLayout();
        this.innerSplitContainer.Panel2.SuspendLayout();
        this.innerSplitContainer.SuspendLayout();
        this.panelOriginalHeader.SuspendLayout();
        this.panelBoxesHeader.SuspendLayout();
        this.panelTextHeader.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)(this.pictureOriginal)).BeginInit();
        ((System.ComponentModel.ISupportInitialize)(this.pictureBoxes)).BeginInit();
        this.statusStrip.SuspendLayout();
        this.SuspendLayout();
        //
        // menuStrip
        //
        this.menuStrip.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.tsmiFile,
            this.tsmiHelp});
        this.menuStrip.Location = new System.Drawing.Point(0, 0);
        this.menuStrip.Name = "menuStrip";
        this.menuStrip.Size = new System.Drawing.Size(1200, 24);
        this.menuStrip.TabIndex = 0;
        this.menuStrip.Text = "menuStrip";
        //
        // tsmiFile
        //
        this.tsmiFile.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.tsmiOpen,
            this.tsmiSaveResult,
            this.tsmiSep1,
            this.tsmiExit});
        this.tsmiFile.Name = "tsmiFile";
        this.tsmiFile.Size = new System.Drawing.Size(60, 20);
        this.tsmiFile.Text = "파일(&F)";
        //
        // tsmiOpen
        //
        this.tsmiOpen.Name = "tsmiOpen";
        this.tsmiOpen.ShortcutKeys = ((System.Windows.Forms.Keys)((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.O)));
        this.tsmiOpen.Size = new System.Drawing.Size(210, 22);
        this.tsmiOpen.Text = "열기(&O)";
        this.tsmiOpen.Click += new System.EventHandler(this.tsmiOpen_Click);
        //
        // tsmiSaveResult
        //
        this.tsmiSaveResult.Name = "tsmiSaveResult";
        this.tsmiSaveResult.ShortcutKeys = ((System.Windows.Forms.Keys)((System.Windows.Forms.Keys.Control | System.Windows.Forms.Keys.S)));
        this.tsmiSaveResult.Size = new System.Drawing.Size(210, 22);
        this.tsmiSaveResult.Text = "결과 저장(&S)";
        this.tsmiSaveResult.Click += new System.EventHandler(this.tsmiSaveResult_Click);
        //
        // tsmiSep1
        //
        this.tsmiSep1.Name = "tsmiSep1";
        this.tsmiSep1.Size = new System.Drawing.Size(207, 6);
        //
        // tsmiExit
        //
        this.tsmiExit.Name = "tsmiExit";
        this.tsmiExit.Size = new System.Drawing.Size(210, 22);
        this.tsmiExit.Text = "종료(&X)";
        this.tsmiExit.Click += new System.EventHandler(this.tsmiExit_Click);
        //
        // tsmiHelp
        //
        this.tsmiHelp.DropDownItems.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.tsmiAbout});
        this.tsmiHelp.Name = "tsmiHelp";
        this.tsmiHelp.Size = new System.Drawing.Size(71, 20);
        this.tsmiHelp.Text = "도움말(&H)";
        //
        // tsmiAbout
        //
        this.tsmiAbout.Name = "tsmiAbout";
        this.tsmiAbout.Size = new System.Drawing.Size(180, 22);
        this.tsmiAbout.Text = "정보(&A)";
        this.tsmiAbout.Click += new System.EventHandler(this.tsmiAbout_Click);
        //
        // toolStrip
        //
        this.toolStrip.GripStyle = System.Windows.Forms.ToolStripGripStyle.Hidden;
        this.toolStrip.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.tsbOpen,
            this.tsSep1,
            this.tsbPrev,
            this.tslPage,
            this.tsbNext,
            this.tsSep2,
            this.tsbOcr,
            this.tsbCancel,
            this.tsSep3,
            this.tslMode,
            this.tscbMode,
            this.tsSep4,
            this.tsbCopy,
            this.tsbSave,
            this.tsbClear});
        this.toolStrip.Location = new System.Drawing.Point(0, 24);
        this.toolStrip.Name = "toolStrip";
        this.toolStrip.Size = new System.Drawing.Size(1200, 27);
        this.toolStrip.TabIndex = 1;
        this.toolStrip.Text = "toolStrip";
        //
        // tsbOpen
        //
        this.tsbOpen.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
        this.tsbOpen.Name = "tsbOpen";
        this.tsbOpen.Size = new System.Drawing.Size(36, 24);
        this.tsbOpen.Text = "열기";
        this.tsbOpen.ToolTipText = "이미지 또는 PDF 파일 열기 (Ctrl+O)";
        this.tsbOpen.Click += new System.EventHandler(this.tsbOpen_Click);
        //
        // tsSep1
        //
        this.tsSep1.Name = "tsSep1";
        this.tsSep1.Size = new System.Drawing.Size(6, 27);
        //
        // tsbPrev
        //
        this.tsbPrev.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
        this.tsbPrev.Enabled = false;
        this.tsbPrev.Name = "tsbPrev";
        this.tsbPrev.Size = new System.Drawing.Size(23, 24);
        this.tsbPrev.Text = "◀";
        this.tsbPrev.ToolTipText = "이전 페이지";
        this.tsbPrev.Click += new System.EventHandler(this.tsbPrev_Click);
        //
        // tslPage
        //
        this.tslPage.Name = "tslPage";
        this.tslPage.Size = new System.Drawing.Size(42, 24);
        this.tslPage.Text = "0 / 0";
        this.tslPage.TextAlign = System.Drawing.ContentAlignment.MiddleCenter;
        //
        // tsbNext
        //
        this.tsbNext.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
        this.tsbNext.Enabled = false;
        this.tsbNext.Name = "tsbNext";
        this.tsbNext.Size = new System.Drawing.Size(23, 24);
        this.tsbNext.Text = "▶";
        this.tsbNext.ToolTipText = "다음 페이지";
        this.tsbNext.Click += new System.EventHandler(this.tsbNext_Click);
        //
        // tsSep2
        //
        this.tsSep2.Name = "tsSep2";
        this.tsSep2.Size = new System.Drawing.Size(6, 27);
        //
        // tsbOcr
        //
        this.tsbOcr.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
        this.tsbOcr.Enabled = false;
        this.tsbOcr.Font = new System.Drawing.Font("Segoe UI", 9F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point);
        this.tsbOcr.ForeColor = System.Drawing.Color.DarkBlue;
        this.tsbOcr.Name = "tsbOcr";
        this.tsbOcr.Size = new System.Drawing.Size(63, 24);
        this.tsbOcr.Text = "OCR 실행";
        this.tsbOcr.ToolTipText = "현재 이미지에서 텍스트 인식 (F5)";
        this.tsbOcr.Click += new System.EventHandler(this.tsbOcr_Click);
        //
        // tsbCancel
        //
        this.tsbCancel.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
        this.tsbCancel.Enabled = false;
        this.tsbCancel.ForeColor = System.Drawing.Color.DarkRed;
        this.tsbCancel.Name = "tsbCancel";
        this.tsbCancel.Size = new System.Drawing.Size(36, 24);
        this.tsbCancel.Text = "취소";
        this.tsbCancel.Visible = false;
        this.tsbCancel.Click += new System.EventHandler(this.tsbCancel_Click);
        //
        // tsSep3
        //
        this.tsSep3.Name = "tsSep3";
        this.tsSep3.Size = new System.Drawing.Size(6, 27);
        //
        // tslMode
        //
        this.tslMode.Name = "tslMode";
        this.tslMode.Size = new System.Drawing.Size(43, 24);
        this.tslMode.Text = "전처리:";
        //
        // tscbMode
        //
        this.tscbMode.DropDownStyle = System.Windows.Forms.ComboBoxStyle.DropDownList;
        this.tscbMode.FlatStyle = System.Windows.Forms.FlatStyle.Standard;
        this.tscbMode.Items.AddRange(new object[] {
            "자동",
            "손글씨",
            "없음"});
        this.tscbMode.Name = "tscbMode";
        this.tscbMode.Size = new System.Drawing.Size(80, 27);
        this.tscbMode.ToolTipText = "이미지 전처리 방식 (손글씨 모드 권장)";
        this.tscbMode.SelectedIndexChanged += new System.EventHandler(this.tscbMode_SelectedIndexChanged);
        //
        // tsSep4
        //
        this.tsSep4.Name = "tsSep4";
        this.tsSep4.Size = new System.Drawing.Size(6, 27);
        //
        // tsbCopy
        //
        this.tsbCopy.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
        this.tsbCopy.Name = "tsbCopy";
        this.tsbCopy.Size = new System.Drawing.Size(36, 24);
        this.tsbCopy.Text = "복사";
        this.tsbCopy.ToolTipText = "인식 결과를 클립보드에 복사";
        this.tsbCopy.Click += new System.EventHandler(this.tsbCopy_Click);
        //
        // tsbSave
        //
        this.tsbSave.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
        this.tsbSave.Name = "tsbSave";
        this.tsbSave.Size = new System.Drawing.Size(36, 24);
        this.tsbSave.Text = "저장";
        this.tsbSave.ToolTipText = "인식 결과를 텍스트 파일로 저장";
        this.tsbSave.Click += new System.EventHandler(this.tsbSave_Click);
        //
        // tsbClear
        //
        this.tsbClear.DisplayStyle = System.Windows.Forms.ToolStripItemDisplayStyle.Text;
        this.tsbClear.Name = "tsbClear";
        this.tsbClear.Size = new System.Drawing.Size(46, 24);
        this.tsbClear.Text = "지우기";
        this.tsbClear.ToolTipText = "인식 결과 지우기";
        this.tsbClear.Click += new System.EventHandler(this.tsbClear_Click);
        //
        // outerSplitContainer
        //
        this.outerSplitContainer.Dock = System.Windows.Forms.DockStyle.Fill;
        this.outerSplitContainer.Location = new System.Drawing.Point(0, 51);
        this.outerSplitContainer.Name = "outerSplitContainer";
        //
        // outerSplitContainer.Panel1 — image area
        //
        this.outerSplitContainer.Panel1.Controls.Add(this.innerSplitContainer);
        //
        // outerSplitContainer.Panel2 — text result
        //
        this.outerSplitContainer.Panel2.Controls.Add(this.richTextBoxResult);
        this.outerSplitContainer.Panel2.Controls.Add(this.panelTextHeader);
        this.outerSplitContainer.Orientation = System.Windows.Forms.Orientation.Horizontal;
        this.outerSplitContainer.Size = new System.Drawing.Size(1200, 627);
        this.outerSplitContainer.SplitterDistance = 420;
        this.outerSplitContainer.TabIndex = 2;
        //
        // innerSplitContainer
        //
        this.innerSplitContainer.Dock = System.Windows.Forms.DockStyle.Fill;
        this.innerSplitContainer.Location = new System.Drawing.Point(0, 0);
        this.innerSplitContainer.Name = "innerSplitContainer";
        //
        // innerSplitContainer.Panel1 — original image
        //
        this.innerSplitContainer.Panel1.Controls.Add(this.pictureOriginal);
        this.innerSplitContainer.Panel1.Controls.Add(this.panelOriginalHeader);
        //
        // innerSplitContainer.Panel2 — OCR boxes image
        //
        this.innerSplitContainer.Panel2.Controls.Add(this.pictureBoxes);
        this.innerSplitContainer.Panel2.Controls.Add(this.panelBoxesHeader);
        this.innerSplitContainer.Size = new System.Drawing.Size(797, 627);
        this.innerSplitContainer.SplitterDistance = 397;
        this.innerSplitContainer.TabIndex = 0;
        //
        // panelOriginalHeader
        //
        this.panelOriginalHeader.BackColor = System.Drawing.SystemColors.ControlDark;
        this.panelOriginalHeader.Controls.Add(this.lblOriginalTitle);
        this.panelOriginalHeader.Dock = System.Windows.Forms.DockStyle.Top;
        this.panelOriginalHeader.Location = new System.Drawing.Point(0, 0);
        this.panelOriginalHeader.Name = "panelOriginalHeader";
        this.panelOriginalHeader.Size = new System.Drawing.Size(397, 26);
        this.panelOriginalHeader.TabIndex = 0;
        //
        // lblOriginalTitle
        //
        this.lblOriginalTitle.AutoSize = false;
        this.lblOriginalTitle.Dock = System.Windows.Forms.DockStyle.Fill;
        this.lblOriginalTitle.Font = new System.Drawing.Font("Malgun Gothic", 9F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point);
        this.lblOriginalTitle.ForeColor = System.Drawing.Color.White;
        this.lblOriginalTitle.Location = new System.Drawing.Point(0, 0);
        this.lblOriginalTitle.Name = "lblOriginalTitle";
        this.lblOriginalTitle.Size = new System.Drawing.Size(397, 26);
        this.lblOriginalTitle.TabIndex = 0;
        this.lblOriginalTitle.Text = "  원본 이미지";
        this.lblOriginalTitle.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
        //
        // pictureOriginal
        //
        this.pictureOriginal.BackColor = System.Drawing.Color.DimGray;
        this.pictureOriginal.Dock = System.Windows.Forms.DockStyle.Fill;
        this.pictureOriginal.Location = new System.Drawing.Point(0, 26);
        this.pictureOriginal.Name = "pictureOriginal";
        this.pictureOriginal.Size = new System.Drawing.Size(397, 601);
        this.pictureOriginal.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
        this.pictureOriginal.TabIndex = 1;
        this.pictureOriginal.TabStop = false;
        //
        // panelBoxesHeader
        //
        this.panelBoxesHeader.BackColor = System.Drawing.SystemColors.ControlDark;
        this.panelBoxesHeader.Controls.Add(this.lblBoxesTitle);
        this.panelBoxesHeader.Dock = System.Windows.Forms.DockStyle.Top;
        this.panelBoxesHeader.Location = new System.Drawing.Point(0, 0);
        this.panelBoxesHeader.Name = "panelBoxesHeader";
        this.panelBoxesHeader.Size = new System.Drawing.Size(396, 26);
        this.panelBoxesHeader.TabIndex = 0;
        //
        // lblBoxesTitle
        //
        this.lblBoxesTitle.AutoSize = false;
        this.lblBoxesTitle.Dock = System.Windows.Forms.DockStyle.Fill;
        this.lblBoxesTitle.Font = new System.Drawing.Font("Malgun Gothic", 9F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point);
        this.lblBoxesTitle.ForeColor = System.Drawing.Color.White;
        this.lblBoxesTitle.Location = new System.Drawing.Point(0, 0);
        this.lblBoxesTitle.Name = "lblBoxesTitle";
        this.lblBoxesTitle.Size = new System.Drawing.Size(396, 26);
        this.lblBoxesTitle.TabIndex = 0;
        this.lblBoxesTitle.Text = "  인식 결과 (박스)";
        this.lblBoxesTitle.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
        //
        // pictureBoxes
        //
        this.pictureBoxes.BackColor = System.Drawing.Color.DimGray;
        this.pictureBoxes.Dock = System.Windows.Forms.DockStyle.Fill;
        this.pictureBoxes.Location = new System.Drawing.Point(0, 26);
        this.pictureBoxes.Name = "pictureBoxes";
        this.pictureBoxes.Size = new System.Drawing.Size(396, 601);
        this.pictureBoxes.SizeMode = System.Windows.Forms.PictureBoxSizeMode.Zoom;
        this.pictureBoxes.TabIndex = 1;
        this.pictureBoxes.TabStop = false;
        //
        // panelTextHeader
        //
        this.panelTextHeader.BackColor = System.Drawing.SystemColors.ControlDark;
        this.panelTextHeader.Controls.Add(this.lblResultTitle);
        this.panelTextHeader.Dock = System.Windows.Forms.DockStyle.Top;
        this.panelTextHeader.Location = new System.Drawing.Point(0, 0);
        this.panelTextHeader.Name = "panelTextHeader";
        this.panelTextHeader.Size = new System.Drawing.Size(396, 26);
        this.panelTextHeader.TabIndex = 0;
        //
        // lblResultTitle
        //
        this.lblResultTitle.AutoSize = false;
        this.lblResultTitle.Dock = System.Windows.Forms.DockStyle.Fill;
        this.lblResultTitle.Font = new System.Drawing.Font("Malgun Gothic", 9F, System.Drawing.FontStyle.Bold, System.Drawing.GraphicsUnit.Point);
        this.lblResultTitle.ForeColor = System.Drawing.Color.White;
        this.lblResultTitle.Location = new System.Drawing.Point(0, 0);
        this.lblResultTitle.Name = "lblResultTitle";
        this.lblResultTitle.Size = new System.Drawing.Size(396, 26);
        this.lblResultTitle.TabIndex = 0;
        this.lblResultTitle.Text = "  텍스트 결과";
        this.lblResultTitle.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
        //
        // richTextBoxResult
        //
        this.richTextBoxResult.BackColor = System.Drawing.SystemColors.Window;
        this.richTextBoxResult.Dock = System.Windows.Forms.DockStyle.Fill;
        this.richTextBoxResult.Font = new System.Drawing.Font("Malgun Gothic", 11F, System.Drawing.FontStyle.Regular, System.Drawing.GraphicsUnit.Point);
        this.richTextBoxResult.Location = new System.Drawing.Point(0, 26);
        this.richTextBoxResult.Name = "richTextBoxResult";
        this.richTextBoxResult.ScrollBars = System.Windows.Forms.RichTextBoxScrollBars.Vertical;
        this.richTextBoxResult.Size = new System.Drawing.Size(396, 601);
        this.richTextBoxResult.TabIndex = 1;
        this.richTextBoxResult.Text = "";
        //
        // statusStrip
        //
        this.statusStrip.Items.AddRange(new System.Windows.Forms.ToolStripItem[] {
            this.tslStatus,
            this.tspProgress,
            this.tslLang});
        this.statusStrip.Location = new System.Drawing.Point(0, 678);
        this.statusStrip.Name = "statusStrip";
        this.statusStrip.Size = new System.Drawing.Size(1200, 22);
        this.statusStrip.TabIndex = 3;
        this.statusStrip.Text = "statusStrip";
        //
        // tslStatus
        //
        this.tslStatus.AutoSize = false;
        this.tslStatus.Name = "tslStatus";
        this.tslStatus.Size = new System.Drawing.Size(800, 17);
        this.tslStatus.Spring = true;
        this.tslStatus.Text = "준비";
        this.tslStatus.TextAlign = System.Drawing.ContentAlignment.MiddleLeft;
        //
        // tspProgress
        //
        this.tspProgress.Name = "tspProgress";
        this.tspProgress.Size = new System.Drawing.Size(150, 16);
        this.tspProgress.Style = System.Windows.Forms.ProgressBarStyle.Marquee;
        this.tspProgress.Visible = false;
        //
        // tslLang
        //
        this.tslLang.BorderSides = System.Windows.Forms.ToolStripStatusLabelBorderSides.Left;
        this.tslLang.Name = "tslLang";
        this.tslLang.Size = new System.Drawing.Size(230, 17);
        this.tslLang.Text = "언어: -";
        this.tslLang.TextAlign = System.Drawing.ContentAlignment.MiddleRight;
        //
        // OCRForm
        //
        this.AllowDrop = true;
        this.AutoScaleDimensions = new System.Drawing.SizeF(7F, 15F);
        this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Font;
        this.ClientSize = new System.Drawing.Size(1200, 700);
        this.Controls.Add(this.outerSplitContainer);
        this.Controls.Add(this.statusStrip);
        this.Controls.Add(this.toolStrip);
        this.Controls.Add(this.menuStrip);
        this.KeyPreview = true;
        this.MainMenuStrip = this.menuStrip;
        this.MinimumSize = new System.Drawing.Size(900, 600);
        this.Name = "OCRForm";
        this.StartPosition = System.Windows.Forms.FormStartPosition.CenterScreen;
        this.Text = "한국어 OCR";
        this.DragDrop += new System.Windows.Forms.DragEventHandler(this.OCRForm_DragDrop);
        this.DragEnter += new System.Windows.Forms.DragEventHandler(this.OCRForm_DragEnter);
        this.KeyDown += new System.Windows.Forms.KeyEventHandler(this.OCRForm_KeyDown);
        this.menuStrip.ResumeLayout(false);
        this.menuStrip.PerformLayout();
        this.toolStrip.ResumeLayout(false);
        this.toolStrip.PerformLayout();
        this.panelOriginalHeader.ResumeLayout(false);
        this.panelBoxesHeader.ResumeLayout(false);
        this.panelTextHeader.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)(this.pictureOriginal)).EndInit();
        ((System.ComponentModel.ISupportInitialize)(this.pictureBoxes)).EndInit();
        this.innerSplitContainer.Panel1.ResumeLayout(false);
        this.innerSplitContainer.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)(this.innerSplitContainer)).EndInit();
        this.innerSplitContainer.ResumeLayout(false);
        this.outerSplitContainer.Panel1.ResumeLayout(false);
        this.outerSplitContainer.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)(this.outerSplitContainer)).EndInit();
        this.outerSplitContainer.ResumeLayout(false);
        this.statusStrip.ResumeLayout(false);
        this.statusStrip.PerformLayout();
        this.ResumeLayout(false);
        this.PerformLayout();
    }

    #endregion

    private System.Windows.Forms.MenuStrip menuStrip;
    private System.Windows.Forms.ToolStripMenuItem tsmiFile;
    private System.Windows.Forms.ToolStripMenuItem tsmiOpen;
    private System.Windows.Forms.ToolStripMenuItem tsmiSaveResult;
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
    private System.Windows.Forms.ToolStripLabel tslMode;
    private System.Windows.Forms.ToolStripComboBox tscbMode;
    private System.Windows.Forms.ToolStripSeparator tsSep4;
    private System.Windows.Forms.ToolStripButton tsbCopy;
    private System.Windows.Forms.ToolStripButton tsbSave;
    private System.Windows.Forms.ToolStripButton tsbClear;
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
    private System.Windows.Forms.StatusStrip statusStrip;
    private System.Windows.Forms.ToolStripStatusLabel tslStatus;
    private System.Windows.Forms.ToolStripProgressBar tspProgress;
    private System.Windows.Forms.ToolStripStatusLabel tslLang;
}
