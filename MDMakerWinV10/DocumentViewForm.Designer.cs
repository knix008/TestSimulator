namespace MDMakerWinV10;

partial class DocumentViewForm
{
    private System.ComponentModel.IContainer components = null;

    private MenuStrip              _menuMain;
    private ToolStripMenuItem      _mnuFile;
    private ToolStripMenuItem      _miSave;
    private ToolStripSeparator     _miSepExport;
    private ToolStripMenuItem      _miExportHtml;
    private ToolStripMenuItem      _miExportWord;
    private ToolStripMenuItem      _miExportPdf;
    private ToolStripMenuItem      _mnuEdit;
    private ToolStripMenuItem      _miRenumber;
    private ToolStripMenuItem      _mnuFormat;
    private ToolStripMenuItem      _miExportSettings;

    private SplitContainer         _split;
    private Label                  _lblTreeHeader;
    private TreeView               _tree;
    private TabControl             _tabs;
    private TabPage                _tabPreview;
    private Panel                  _pnlPreview;
    private TabPage                _tabEdit;
    private TextBox                _editor;
    private ToolStrip              _toolStrip;
    private ToolStripButton        _tsbSave;
    private ToolStripSeparator     _tsSep1;
    private ToolStripButton        _tsbExportHtml;
    private ToolStripButton        _tsbExportWord;
    private ToolStripButton        _tsbExportPdf;
    private ToolStripSeparator     _tsSep2;
    private ToolStripButton        _tsbExportSettings;
    private ToolStripSeparator     _tsSep3;
    private ToolStripButton        _tsbRenumber;
    private StatusStrip            _statusStrip;
    private ToolStripStatusLabel   _tsslStatus;
    private ToolStripProgressBar   _tsspProgress;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(DocumentViewForm));
        _menuMain = new MenuStrip();
        _mnuFile = new ToolStripMenuItem();
        _miSave = new ToolStripMenuItem();
        _miSepExport = new ToolStripSeparator();
        _miExportHtml = new ToolStripMenuItem();
        _miExportWord = new ToolStripMenuItem();
        _miExportPdf = new ToolStripMenuItem();
        _mnuEdit = new ToolStripMenuItem();
        _miRenumber = new ToolStripMenuItem();
        _mnuFormat = new ToolStripMenuItem();
        _miExportSettings = new ToolStripMenuItem();
        _split = new SplitContainer();
        _tree = new TreeView();
        _lblTreeHeader = new Label();
        _tabs = new TabControl();
        _tabPreview = new TabPage();
        _pnlPreview = new Panel();
        _tabEdit = new TabPage();
        _editor = new TextBox();
        _toolStrip = new ToolStrip();
        _tsbSave = new ToolStripButton();
        _tsSep1 = new ToolStripSeparator();
        _tsbExportHtml = new ToolStripButton();
        _tsbExportWord = new ToolStripButton();
        _tsbExportPdf = new ToolStripButton();
        _tsSep2 = new ToolStripSeparator();
        _tsbExportSettings = new ToolStripButton();
        _tsSep3 = new ToolStripSeparator();
        _tsbRenumber = new ToolStripButton();
        _statusStrip = new StatusStrip();
        _tsslStatus = new ToolStripStatusLabel();
        _tsspProgress = new ToolStripProgressBar();
        _menuMain.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_split).BeginInit();
        _split.Panel1.SuspendLayout();
        _split.Panel2.SuspendLayout();
        _split.SuspendLayout();
        _tabs.SuspendLayout();
        _tabPreview.SuspendLayout();
        _tabEdit.SuspendLayout();
        _toolStrip.SuspendLayout();
        _statusStrip.SuspendLayout();
        SuspendLayout();
        // 
        // _menuMain
        // 
        _menuMain.Items.AddRange(new ToolStripItem[] { _mnuFile, _mnuEdit, _mnuFormat });
        _menuMain.Location = new Point(0, 0);
        _menuMain.Name = "_menuMain";
        _menuMain.Size = new Size(1000, 24);
        _menuMain.TabIndex = 0;
        // 
        // _mnuFile
        // 
        _mnuFile.DropDownItems.AddRange(new ToolStripItem[] { _miSave, _miSepExport, _miExportHtml, _miExportWord, _miExportPdf });
        _mnuFile.Name = "_mnuFile";
        _mnuFile.Size = new Size(57, 20);
        _mnuFile.Text = "파일(&F)";
        // 
        // _miSave
        // 
        _miSave.Name = "_miSave";
        _miSave.ShortcutKeys = Keys.Control | Keys.S;
        _miSave.Size = new Size(154, 22);
        _miSave.Text = "저장(&S)";
        _miSave.Click += Save_Click;
        // 
        // _miSepExport
        // 
        _miSepExport.Name = "_miSepExport";
        _miSepExport.Size = new Size(151, 6);
        // 
        // _miExportHtml
        // 
        _miExportHtml.Name = "_miExportHtml";
        _miExportHtml.Size = new Size(154, 22);
        _miExportHtml.Text = "HTML 보내기";
        _miExportHtml.Click += ExportHtml_Click;
        // 
        // _miExportWord
        // 
        _miExportWord.Name = "_miExportWord";
        _miExportWord.Size = new Size(154, 22);
        _miExportWord.Text = "Word 보내기";
        _miExportWord.Click += ExportWord_Click;
        // 
        // _miExportPdf
        // 
        _miExportPdf.Name = "_miExportPdf";
        _miExportPdf.Size = new Size(154, 22);
        _miExportPdf.Text = "PDF 보내기";
        _miExportPdf.Click += ExportPdf_Click;
        // 
        // _mnuEdit
        // 
        _mnuEdit.DropDownItems.AddRange(new ToolStripItem[] { _miRenumber });
        _mnuEdit.Name = "_mnuEdit";
        _mnuEdit.Size = new Size(57, 20);
        _mnuEdit.Text = "편집(&E)";
        // 
        // _miRenumber
        // 
        _miRenumber.Name = "_miRenumber";
        _miRenumber.Size = new Size(32, 19);
        _miRenumber.Text = "번호 재정렬";
        _miRenumber.Click += Renumber_Click;
        // 
        // _mnuFormat
        // 
        _mnuFormat.DropDownItems.AddRange(new ToolStripItem[] { _miExportSettings });
        _mnuFormat.Name = "_mnuFormat";
        _mnuFormat.Size = new Size(60, 20);
        _mnuFormat.Text = "서식(&O)";
        // 
        // _miExportSettings
        // 
        _miExportSettings.Name = "_miExportSettings";
        _miExportSettings.Size = new Size(32, 19);
        _miExportSettings.Text = "보내기 서식(&F)...";
        _miExportSettings.Click += ExportSettings_Click;
        // 
        // _split
        // 
        _split.Dock = DockStyle.Fill;
        _split.Location = new Point(0, 51);
        _split.Name = "_split";
        // 
        // _split.Panel1
        // 
        _split.Panel1.Controls.Add(_tree);
        _split.Panel1.Controls.Add(_lblTreeHeader);
        // 
        // _split.Panel2
        // 
        _split.Panel2.Controls.Add(_tabs);
        _split.Size = new Size(1000, 507);
        _split.SplitterDistance = 806;
        _split.TabIndex = 1;
        // 
        // _tree
        // 
        _tree.BorderStyle = BorderStyle.FixedSingle;
        _tree.Dock = DockStyle.Fill;
        _tree.Font = new Font("Segoe UI", 9F);
        _tree.FullRowSelect = true;
        _tree.HideSelection = false;
        _tree.Location = new Point(0, 26);
        _tree.Name = "_tree";
        _tree.Size = new Size(806, 481);
        _tree.TabIndex = 1;
        _tree.AfterSelect += Tree_AfterSelect;
        // 
        // _lblTreeHeader
        // 
        _lblTreeHeader.Dock = DockStyle.Top;
        _lblTreeHeader.Font = new Font("Segoe UI", 9F, FontStyle.Bold);
        _lblTreeHeader.ForeColor = Color.FromArgb(96, 96, 96);
        _lblTreeHeader.Location = new Point(0, 0);
        _lblTreeHeader.Name = "_lblTreeHeader";
        _lblTreeHeader.Padding = new Padding(6, 6, 0, 4);
        _lblTreeHeader.Size = new Size(806, 26);
        _lblTreeHeader.TabIndex = 0;
        _lblTreeHeader.Text = "문서 구조";
        // 
        // _tabs
        // 
        _tabs.Controls.Add(_tabPreview);
        _tabs.Controls.Add(_tabEdit);
        _tabs.Dock = DockStyle.Fill;
        _tabs.Location = new Point(0, 0);
        _tabs.Name = "_tabs";
        _tabs.SelectedIndex = 0;
        _tabs.Size = new Size(190, 507);
        _tabs.TabIndex = 0;
        _tabs.SelectedIndexChanged += Tabs_SelectedIndexChanged;
        // 
        // _tabPreview
        // 
        _tabPreview.Controls.Add(_pnlPreview);
        _tabPreview.Location = new Point(4, 24);
        _tabPreview.Name = "_tabPreview";
        _tabPreview.Padding = new Padding(4);
        _tabPreview.Size = new Size(182, 479);
        _tabPreview.TabIndex = 0;
        _tabPreview.Text = "미리보기";
        _tabPreview.UseVisualStyleBackColor = true;
        // 
        // _pnlPreview
        // 
        _pnlPreview.BackColor = Color.White;
        _pnlPreview.Dock = DockStyle.Fill;
        _pnlPreview.Location = new Point(4, 4);
        _pnlPreview.Name = "_pnlPreview";
        _pnlPreview.Size = new Size(174, 471);
        _pnlPreview.TabIndex = 0;
        // 
        // _tabEdit
        // 
        _tabEdit.Controls.Add(_editor);
        _tabEdit.Location = new Point(4, 24);
        _tabEdit.Name = "_tabEdit";
        _tabEdit.Padding = new Padding(4);
        _tabEdit.Size = new Size(182, 479);
        _tabEdit.TabIndex = 1;
        _tabEdit.Text = "편집";
        _tabEdit.UseVisualStyleBackColor = true;
        // 
        // _editor
        // 
        _editor.AcceptsReturn = true;
        _editor.AcceptsTab = true;
        _editor.BorderStyle = BorderStyle.FixedSingle;
        _editor.Dock = DockStyle.Fill;
        _editor.Font = new Font("Consolas", 10F);
        _editor.Location = new Point(4, 4);
        _editor.Multiline = true;
        _editor.Name = "_editor";
        _editor.ScrollBars = ScrollBars.Both;
        _editor.Size = new Size(174, 471);
        _editor.TabIndex = 0;
        _editor.WordWrap = false;
        _editor.TextChanged += Editor_TextChanged;
        // 
        // _toolStrip
        // 
        _toolStrip.GripStyle = ToolStripGripStyle.Hidden;
        _toolStrip.Items.AddRange(new ToolStripItem[] { _tsbSave, _tsSep1, _tsbExportHtml, _tsbExportWord, _tsbExportPdf, _tsSep2, _tsbExportSettings, _tsSep3, _tsbRenumber });
        _toolStrip.Location = new Point(0, 24);
        _toolStrip.Name = "_toolStrip";
        _toolStrip.Padding = new Padding(4, 2, 4, 2);
        _toolStrip.Size = new Size(1000, 27);
        _toolStrip.TabIndex = 2;
        // 
        // _tsbSave
        // 
        _tsbSave.Name = "_tsbSave";
        _tsbSave.Size = new Size(35, 20);
        _tsbSave.Text = "저장";
        _tsbSave.ToolTipText = "저장 (Ctrl+S)";
        _tsbSave.Click += Save_Click;
        // 
        // _tsSep1
        // 
        _tsSep1.Name = "_tsSep1";
        _tsSep1.Size = new Size(6, 23);
        // 
        // _tsbExportHtml
        // 
        _tsbExportHtml.Name = "_tsbExportHtml";
        _tsbExportHtml.Size = new Size(43, 20);
        _tsbExportHtml.Text = "HTML";
        _tsbExportHtml.Click += ExportHtml_Click;
        // 
        // _tsbExportWord
        // 
        _tsbExportWord.Name = "_tsbExportWord";
        _tsbExportWord.Size = new Size(40, 20);
        _tsbExportWord.Text = "Word";
        _tsbExportWord.Click += ExportWord_Click;
        // 
        // _tsbExportPdf
        // 
        _tsbExportPdf.Enabled = false;
        _tsbExportPdf.Name = "_tsbExportPdf";
        _tsbExportPdf.Size = new Size(33, 20);
        _tsbExportPdf.Text = "PDF";
        _tsbExportPdf.Click += ExportPdf_Click;
        // 
        // _tsSep2
        // 
        _tsSep2.Name = "_tsSep2";
        _tsSep2.Size = new Size(6, 23);
        // 
        // _tsbExportSettings
        // 
        _tsbExportSettings.Name = "_tsbExportSettings";
        _tsbExportSettings.Size = new Size(75, 20);
        _tsbExportSettings.Text = "보내기 서식";
        _tsbExportSettings.Click += ExportSettings_Click;
        // 
        // _tsSep3
        // 
        _tsSep3.Name = "_tsSep3";
        _tsSep3.Size = new Size(6, 23);
        // 
        // _tsbRenumber
        // 
        _tsbRenumber.Name = "_tsbRenumber";
        _tsbRenumber.Size = new Size(75, 20);
        _tsbRenumber.Text = "번호 재정렬";
        _tsbRenumber.Click += Renumber_Click;
        // 
        // _statusStrip
        // 
        _statusStrip.Items.AddRange(new ToolStripItem[] { _tsslStatus, _tsspProgress });
        _statusStrip.Location = new Point(0, 558);
        _statusStrip.Name = "_statusStrip";
        _statusStrip.Size = new Size(1000, 22);
        _statusStrip.SizingGrip = false;
        _statusStrip.TabIndex = 3;
        // 
        // _tsslStatus
        // 
        _tsslStatus.Font = new Font("Segoe UI", 8.5F);
        _tsslStatus.ForeColor = Color.FromArgb(96, 96, 96);
        _tsslStatus.Name = "_tsslStatus";
        _tsslStatus.Size = new Size(985, 17);
        _tsslStatus.Spring = true;
        _tsslStatus.TextAlign = ContentAlignment.MiddleRight;
        // 
        // _tsspProgress
        // 
        _tsspProgress.MarqueeAnimationSpeed = 30;
        _tsspProgress.Name = "_tsspProgress";
        _tsspProgress.Size = new Size(160, 16);
        _tsspProgress.Style = ProgressBarStyle.Marquee;
        _tsspProgress.Visible = false;
        // 
        // DocumentViewForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1000, 580);
        Controls.Add(_split);
        Controls.Add(_toolStrip);
        Controls.Add(_statusStrip);
        Controls.Add(_menuMain);
        Icon = (Icon)resources.GetObject("$this.Icon");
        KeyPreview = true;
        MainMenuStrip = _menuMain;
        MinimumSize = new Size(800, 420);
        Name = "DocumentViewForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "미리보기 — MD Maker";
        KeyDown += OnKeyDown;
        _menuMain.ResumeLayout(false);
        _menuMain.PerformLayout();
        _split.Panel1.ResumeLayout(false);
        _split.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)_split).EndInit();
        _split.ResumeLayout(false);
        _tabs.ResumeLayout(false);
        _tabPreview.ResumeLayout(false);
        _tabEdit.ResumeLayout(false);
        _tabEdit.PerformLayout();
        _toolStrip.ResumeLayout(false);
        _toolStrip.PerformLayout();
        _statusStrip.ResumeLayout(false);
        _statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}
