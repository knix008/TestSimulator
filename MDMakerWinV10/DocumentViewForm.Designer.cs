namespace MDMakerWinV10;

partial class DocumentViewForm
{
    private System.ComponentModel.IContainer components = null;

    private SplitContainer _split;
    private Label _lblTreeHeader;
    private TreeView _tree;
    private TabControl _tabs;
    private TabPage _tabPreview;
    private Panel _pnlPreview;
    private TabPage _tabEdit;
    private TextBox _editor;
    private Panel _pnlToolbar;
    private FlowLayoutPanel _flowButtons;
    private Button _btnSave;
    private Label _lblSeparator;
    private Button _btnExportHtml;
    private Button _btnExportWord;
    private Button _btnExportPdf;
    private Button _btnExportSettings;
    private StatusStrip _statusStrip;
    private ToolStripStatusLabel _tsslStatus;
    private ToolStripProgressBar _tsspProgress;
    private ToolTip _toolTip;

    protected override void Dispose(bool disposing)
    {
        if (disposing && (components != null))
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(DocumentViewForm));
        _split = new SplitContainer();
        _lblTreeHeader = new Label();
        _tree = new TreeView();
        _tabs = new TabControl();
        _tabPreview = new TabPage();
        _pnlPreview = new Panel();
        _tabEdit = new TabPage();
        _editor = new TextBox();
        _pnlToolbar = new Panel();
        _flowButtons = new FlowLayoutPanel();
        _btnSave = new Button();
        _lblSeparator = new Label();
        _btnExportHtml = new Button();
        _btnExportWord = new Button();
        _btnExportPdf = new Button();
        _btnExportSettings = new Button();
        _statusStrip = new StatusStrip();
        _tsslStatus = new ToolStripStatusLabel();
        _tsspProgress = new ToolStripProgressBar();
        _toolTip = new ToolTip(components);
        ((System.ComponentModel.ISupportInitialize)_split).BeginInit();
        _split.Panel1.SuspendLayout();
        _split.Panel2.SuspendLayout();
        _split.SuspendLayout();
        _tabs.SuspendLayout();
        _tabPreview.SuspendLayout();
        _tabEdit.SuspendLayout();
        _pnlToolbar.SuspendLayout();
        _flowButtons.SuspendLayout();
        _statusStrip.SuspendLayout();
        SuspendLayout();
        //
        // _split
        //
        _split.Dock = DockStyle.Fill;
        _split.Location = new Point(0, 0);
        _split.Name = "_split";
        _split.Panel1.Controls.Add(_lblTreeHeader);
        _split.Panel1.Controls.Add(_tree);
        _split.Panel2.Controls.Add(_tabs);
        _split.Size = new Size(980, 504);
        _split.SplitterDistance = 230;
        _split.TabIndex = 0;
        //
        // _lblTreeHeader
        //
        _lblTreeHeader.Dock = DockStyle.Top;
        _lblTreeHeader.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
        _lblTreeHeader.ForeColor = Color.FromArgb(80, 80, 80);
        _lblTreeHeader.Location = new Point(0, 0);
        _lblTreeHeader.Name = "_lblTreeHeader";
        _lblTreeHeader.Padding = new Padding(5, 4, 0, 0);
        _lblTreeHeader.Size = new Size(230, 22);
        _lblTreeHeader.TabIndex = 0;
        _lblTreeHeader.Text = "문서 구조";
        //
        // _tree
        //
        _tree.BorderStyle = BorderStyle.None;
        _tree.Dock = DockStyle.Fill;
        _tree.Font = new Font("Segoe UI", 9F);
        _tree.FullRowSelect = true;
        _tree.HideSelection = false;
        _tree.Location = new Point(0, 0);
        _tree.Name = "_tree";
        _tree.Size = new Size(230, 504);
        _tree.TabIndex = 1;
        _tree.AfterSelect += Tree_AfterSelect;
        //
        // _tabs
        //
        _tabs.Controls.Add(_tabPreview);
        _tabs.Controls.Add(_tabEdit);
        _tabs.Dock = DockStyle.Fill;
        _tabs.Location = new Point(0, 0);
        _tabs.Name = "_tabs";
        _tabs.SelectedIndex = 0;
        _tabs.Size = new Size(746, 504);
        _tabs.TabIndex = 0;
        _tabs.SelectedIndexChanged += Tabs_SelectedIndexChanged;
        //
        // _tabPreview
        //
        _tabPreview.Controls.Add(_pnlPreview);
        _tabPreview.Location = new Point(4, 24);
        _tabPreview.Name = "_tabPreview";
        _tabPreview.Size = new Size(738, 476);
        _tabPreview.TabIndex = 0;
        _tabPreview.Text = "미리보기";
        _tabPreview.UseVisualStyleBackColor = true;
        //
        // _pnlPreview
        //
        _pnlPreview.BackColor = Color.White;
        _pnlPreview.Dock = DockStyle.Fill;
        _pnlPreview.Location = new Point(0, 0);
        _pnlPreview.Name = "_pnlPreview";
        _pnlPreview.Size = new Size(738, 476);
        _pnlPreview.TabIndex = 0;
        //
        // _tabEdit
        //
        _tabEdit.Controls.Add(_editor);
        _tabEdit.Location = new Point(4, 24);
        _tabEdit.Name = "_tabEdit";
        _tabEdit.Padding = new Padding(3, 2, 3, 2);
        _tabEdit.Size = new Size(738, 476);
        _tabEdit.TabIndex = 1;
        _tabEdit.Text = "편집";
        _tabEdit.UseVisualStyleBackColor = true;
        //
        // _editor
        //
        _editor.AcceptsReturn = true;
        _editor.AcceptsTab = true;
        _editor.Dock = DockStyle.Fill;
        _editor.Font = new Font("Consolas", 10F);
        _editor.Location = new Point(3, 2);
        _editor.MaxLength = 0;
        _editor.Multiline = true;
        _editor.Name = "_editor";
        _editor.ScrollBars = ScrollBars.Both;
        _editor.Size = new Size(732, 472);
        _editor.TabIndex = 0;
        _editor.WordWrap = false;
        _editor.TextChanged += Editor_TextChanged;
        //
        // _pnlToolbar
        //
        _pnlToolbar.Controls.Add(_flowButtons);
        _pnlToolbar.Dock = DockStyle.Bottom;
        _pnlToolbar.Height = 36;
        _pnlToolbar.Name = "_pnlToolbar";
        _pnlToolbar.TabIndex = 1;
        //
        // _flowButtons
        //
        _flowButtons.AutoSize = true;
        _flowButtons.Controls.Add(_btnSave);
        _flowButtons.Controls.Add(_lblSeparator);
        _flowButtons.Controls.Add(_btnExportHtml);
        _flowButtons.Controls.Add(_btnExportWord);
        _flowButtons.Controls.Add(_btnExportPdf);
        _flowButtons.Controls.Add(_btnExportSettings);
        _flowButtons.Anchor = AnchorStyles.Left | AnchorStyles.Top | AnchorStyles.Bottom;
        _flowButtons.Location = new Point(4, 5);
        _flowButtons.Name = "_flowButtons";
        _flowButtons.TabIndex = 0;
        //
        // _btnSave
        //
        _btnSave.AutoSize = true;
        _btnSave.BackColor = Color.FromArgb(46, 184, 92);
        _btnSave.FlatAppearance.BorderSize = 0;
        _btnSave.FlatStyle = FlatStyle.Flat;
        _btnSave.ForeColor = Color.White;
        _btnSave.Location = new Point(0, 0);
        _btnSave.Margin = new Padding(0, 0, 4, 0);
        _btnSave.Name = "_btnSave";
        _btnSave.Size = new Size(51, 25);
        _btnSave.TabIndex = 0;
        _btnSave.Text = "저장";
        _toolTip.SetToolTip(_btnSave, "Ctrl+S");
        _btnSave.UseVisualStyleBackColor = false;
        _btnSave.Click += Save_Click;
        //
        // _lblSeparator
        //
        _lblSeparator.AutoSize = true;
        _lblSeparator.ForeColor = Color.Silver;
        _lblSeparator.Location = new Point(55, 0);
        _lblSeparator.Margin = new Padding(0, 0, 4, 0);
        _lblSeparator.Name = "_lblSeparator";
        _lblSeparator.Padding = new Padding(2, 3, 2, 0);
        _lblSeparator.Size = new Size(22, 18);
        _lblSeparator.TabIndex = 1;
        _lblSeparator.Text = " | ";
        _lblSeparator.TextAlign = ContentAlignment.MiddleCenter;
        //
        // _btnExportHtml
        //
        _btnExportHtml.AutoSize = true;
        _btnExportHtml.Location = new Point(81, 0);
        _btnExportHtml.Margin = new Padding(0, 0, 4, 0);
        _btnExportHtml.Name = "_btnExportHtml";
        _btnExportHtml.Size = new Size(104, 25);
        _btnExportHtml.TabIndex = 2;
        _btnExportHtml.Text = "HTML내보내기";
        _btnExportHtml.UseVisualStyleBackColor = true;
        _btnExportHtml.Click += ExportHtml_Click;
        //
        // _btnExportWord
        //
        _btnExportWord.AutoSize = true;
        _btnExportWord.Location = new Point(189, 0);
        _btnExportWord.Margin = new Padding(0, 0, 4, 0);
        _btnExportWord.Name = "_btnExportWord";
        _btnExportWord.Size = new Size(104, 25);
        _btnExportWord.TabIndex = 3;
        _btnExportWord.Text = "Word내보내기";
        _btnExportWord.UseVisualStyleBackColor = true;
        _btnExportWord.Click += ExportWord_Click;
        //
        // _btnExportPdf
        //
        _btnExportPdf.AutoSize = true;
        _btnExportPdf.Enabled = false;
        _btnExportPdf.Location = new Point(297, 0);
        _btnExportPdf.Margin = new Padding(0, 0, 4, 0);
        _btnExportPdf.Name = "_btnExportPdf";
        _btnExportPdf.Size = new Size(98, 25);
        _btnExportPdf.TabIndex = 4;
        _btnExportPdf.Text = "PDF내보내기";
        _btnExportPdf.UseVisualStyleBackColor = true;
        _btnExportPdf.Click += ExportPdf_Click;
        //
        // _btnExportSettings
        //
        _btnExportSettings.AutoSize = true;
        _btnExportSettings.Location = new Point(399, 0);
        _btnExportSettings.Margin = new Padding(0, 0, 4, 0);
        _btnExportSettings.Name = "_btnExportSettings";
        _btnExportSettings.TabIndex = 5;
        _btnExportSettings.Text = "내보내기 서식";
        _btnExportSettings.UseVisualStyleBackColor = true;
        _btnExportSettings.Click += ExportSettings_Click;
        //
        // _statusStrip
        //
        _statusStrip.Items.AddRange(new ToolStripItem[] { _tsslStatus, _tsspProgress });
        _statusStrip.Name = "_statusStrip";
        _statusStrip.SizingGrip = false;
        _statusStrip.TabIndex = 2;
        //
        // _tsslStatus
        //
        _tsslStatus.Font = new Font("Segoe UI", 8.5F);
        _tsslStatus.ForeColor = Color.FromArgb(80, 80, 80);
        _tsslStatus.Name = "_tsslStatus";
        _tsslStatus.Size = new Size(0, 17);
        _tsslStatus.Spring = true;
        _tsslStatus.TextAlign = ContentAlignment.MiddleRight;
        //
        // _tsspProgress
        //
        _tsspProgress.Name = "_tsspProgress";
        _tsspProgress.Size = new Size(160, 16);
        _tsspProgress.Style = ProgressBarStyle.Marquee;
        _tsspProgress.MarqueeAnimationSpeed = 30;
        _tsspProgress.Visible = false;
        //
        // DocumentViewForm
        //
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(980, 562);
        Controls.Add(_split);
        Controls.Add(_pnlToolbar);
        Controls.Add(_statusStrip);
        Icon = (Icon)resources.GetObject("$this.Icon");
        KeyPreview = true;
        MinimumSize = new Size(658, 407);
        Name = "DocumentViewForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "미리보기 — MD Maker";
        KeyDown += OnKeyDown;
        ((System.ComponentModel.ISupportInitialize)_split).EndInit();
        _split.Panel1.ResumeLayout(false);
        _split.Panel2.ResumeLayout(false);
        _split.ResumeLayout(false);
        _tabs.ResumeLayout(false);
        _tabPreview.ResumeLayout(false);
        _tabEdit.ResumeLayout(false);
        _tabEdit.PerformLayout();
        _pnlToolbar.ResumeLayout(false);
        _pnlToolbar.PerformLayout();
        _flowButtons.ResumeLayout(false);
        _flowButtons.PerformLayout();
        _statusStrip.ResumeLayout(false);
        _statusStrip.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}
