namespace MDMakerWinV10;

partial class DocumentViewForm
{
    private System.ComponentModel.IContainer components = null;

    private TableLayoutPanel _root;
    private SplitContainer _split;
    private Label _lblTreeHeader;
    private TreeView _tree;
    private TabControl _tabs;
    private TabPage _tabPreview;
    private Panel _pnlPreview;
    private TabPage _tabEdit;
    private TextBox _editor;
    private TableLayoutPanel _toolbar;
    private FlowLayoutPanel _flowButtons;
    private Button _btnSave;
    private Label _lblSeparator;
    private Button _btnExportHtml;
    private Button _btnExportWord;
    private Button _btnExportPdf;
    private Label _lblStatus;
    private ToolTip _toolTip;

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(DocumentViewForm));
        _root = new TableLayoutPanel();
        _split = new SplitContainer();
        _lblTreeHeader = new Label();
        _tree = new TreeView();
        _tabs = new TabControl();
        _tabPreview = new TabPage();
        _pnlPreview = new Panel();
        _tabEdit = new TabPage();
        _editor = new TextBox();
        _toolbar = new TableLayoutPanel();
        _flowButtons = new FlowLayoutPanel();
        _btnSave = new Button();
        _lblSeparator = new Label();
        _btnExportHtml = new Button();
        _btnExportWord = new Button();
        _btnExportPdf = new Button();
        _lblStatus = new Label();
        _toolTip = new ToolTip(components);
        _root.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_split).BeginInit();
        _split.Panel1.SuspendLayout();
        _split.Panel2.SuspendLayout();
        _split.SuspendLayout();
        _tabs.SuspendLayout();
        _tabPreview.SuspendLayout();
        _tabEdit.SuspendLayout();
        _toolbar.SuspendLayout();
        _flowButtons.SuspendLayout();
        SuspendLayout();
        // 
        // _root
        // 
        _root.ColumnCount = 1;
        _root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100F));
        _root.Controls.Add(_split, 0, 0);
        _root.Controls.Add(_toolbar, 0, 1);
        _root.Dock = DockStyle.Fill;
        _root.Location = new Point(0, 0);
        _root.Margin = new Padding(3, 2, 3, 2);
        _root.Name = "_root";
        _root.RowCount = 2;
        _root.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        _root.RowStyles.Add(new RowStyle());
        _root.Size = new Size(980, 540);
        _root.TabIndex = 0;
        // 
        // _split
        // 
        _split.Dock = DockStyle.Fill;
        _split.Location = new Point(3, 2);
        _split.Margin = new Padding(3, 2, 3, 2);
        _split.Name = "_split";
        // 
        // _split.Panel1
        // 
        _split.Panel1.Controls.Add(_lblTreeHeader);
        _split.Panel1.Controls.Add(_tree);
        // 
        // _split.Panel2
        // 
        _split.Panel2.Controls.Add(_tabs);
        _split.Size = new Size(974, 420);
        _split.SplitterDistance = 200;
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
        _lblTreeHeader.Size = new Size(200, 20);
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
        _tree.Margin = new Padding(3, 2, 3, 2);
        _tree.Name = "_tree";
        _tree.Size = new Size(200, 420);
        _tree.TabIndex = 1;
        _tree.AfterSelect += Tree_AfterSelect;
        // 
        // _tabs
        // 
        _tabs.Controls.Add(_tabPreview);
        _tabs.Controls.Add(_tabEdit);
        _tabs.Dock = DockStyle.Fill;
        _tabs.Location = new Point(0, 0);
        _tabs.Margin = new Padding(3, 2, 3, 2);
        _tabs.Name = "_tabs";
        _tabs.SelectedIndex = 0;
        _tabs.Size = new Size(770, 420);
        _tabs.TabIndex = 0;
        _tabs.SelectedIndexChanged += Tabs_SelectedIndexChanged;
        // 
        // _tabPreview
        // 
        _tabPreview.Controls.Add(_pnlPreview);
        _tabPreview.Location = new Point(4, 24);
        _tabPreview.Margin = new Padding(3, 2, 3, 2);
        _tabPreview.Name = "_tabPreview";
        _tabPreview.Size = new Size(762, 392);
        _tabPreview.TabIndex = 0;
        _tabPreview.Text = "미리보기";
        _tabPreview.UseVisualStyleBackColor = true;
        // 
        // _pnlPreview
        // 
        _pnlPreview.BackColor = Color.White;
        _pnlPreview.Dock = DockStyle.Fill;
        _pnlPreview.Location = new Point(0, 0);
        _pnlPreview.Margin = new Padding(3, 2, 3, 2);
        _pnlPreview.Name = "_pnlPreview";
        _pnlPreview.Size = new Size(762, 392);
        _pnlPreview.TabIndex = 0;
        // 
        // _tabEdit
        // 
        _tabEdit.Controls.Add(_editor);
        _tabEdit.Location = new Point(4, 24);
        _tabEdit.Margin = new Padding(3, 2, 3, 2);
        _tabEdit.Name = "_tabEdit";
        _tabEdit.Padding = new Padding(3, 2, 3, 2);
        _tabEdit.Size = new Size(768, 478);
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
        _editor.Margin = new Padding(3, 2, 3, 2);
        _editor.MaxLength = 0;
        _editor.Multiline = true;
        _editor.Name = "_editor";
        _editor.ScrollBars = ScrollBars.Both;
        _editor.Size = new Size(762, 474);
        _editor.TabIndex = 0;
        _editor.WordWrap = false;
        _editor.TextChanged += Editor_TextChanged;
        // 
        // _toolbar
        // 
        _toolbar.AutoSize = true;
        _toolbar.ColumnCount = 2;
        _toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
        _toolbar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 50F));
        _toolbar.Controls.Add(_flowButtons, 0, 0);
        _toolbar.Controls.Add(_lblStatus, 1, 0);
        _toolbar.Dock = DockStyle.Fill;
        _toolbar.Location = new Point(3, 426);
        _toolbar.Margin = new Padding(3, 2, 3, 2);
        _toolbar.Name = "_toolbar";
        _toolbar.Padding = new Padding(5, 4, 7, 4);
        _toolbar.RowCount = 1;
        _toolbar.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        _toolbar.Size = new Size(974, 112);
        _toolbar.TabIndex = 1;
        // 
        // _flowButtons
        // 
        _flowButtons.AutoSize = true;
        _flowButtons.Controls.Add(_btnSave);
        _flowButtons.Controls.Add(_lblSeparator);
        _flowButtons.Controls.Add(_btnExportHtml);
        _flowButtons.Controls.Add(_btnExportWord);
        _flowButtons.Controls.Add(_btnExportPdf);
        _flowButtons.Location = new Point(8, 6);
        _flowButtons.Margin = new Padding(3, 2, 3, 2);
        _flowButtons.Name = "_flowButtons";
        _flowButtons.Size = new Size(419, 25);
        _flowButtons.TabIndex = 0;
        // 
        // _btnSave
        // 
        _btnSave.AutoSize = true;
        _btnSave.BackColor = Color.PaleTurquoise;
        _btnSave.FlatAppearance.BorderSize = 0;
        _btnSave.FlatStyle = FlatStyle.Flat;
        _btnSave.ForeColor = Color.Black;
        _btnSave.Location = new Point(0, 0);
        _btnSave.Margin = new Padding(0, 0, 4, 0);
        _btnSave.Name = "_btnSave";
        _btnSave.Size = new Size(71, 25);
        _btnSave.TabIndex = 0;
        _btnSave.Text = "저장 형식";
        _toolTip.SetToolTip(_btnSave, "Ctrl+S");
        _btnSave.UseVisualStyleBackColor = false;
        _btnSave.Click += Save_Click;
        // 
        // _lblSeparator
        // 
        _lblSeparator.AutoSize = true;
        _lblSeparator.ForeColor = Color.Silver;
        _lblSeparator.Location = new Point(75, 0);
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
        _btnExportHtml.Location = new Point(101, 0);
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
        _btnExportWord.Location = new Point(209, 0);
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
        _btnExportPdf.Location = new Point(317, 0);
        _btnExportPdf.Margin = new Padding(0, 0, 4, 0);
        _btnExportPdf.Name = "_btnExportPdf";
        _btnExportPdf.Size = new Size(98, 25);
        _btnExportPdf.TabIndex = 4;
        _btnExportPdf.Text = "PDF내보내기";
        _btnExportPdf.UseVisualStyleBackColor = true;
        _btnExportPdf.Click += ExportPdf_Click;
        // 
        // _lblStatus
        // 
        _lblStatus.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _lblStatus.AutoEllipsis = true;
        _lblStatus.Font = new Font("Segoe UI", 8.5F);
        _lblStatus.ForeColor = Color.FromArgb(80, 80, 80);
        _lblStatus.Location = new Point(489, 4);
        _lblStatus.Name = "_lblStatus";
        _lblStatus.Size = new Size(475, 27);
        _lblStatus.TabIndex = 1;
        _lblStatus.TextAlign = ContentAlignment.MiddleRight;
        // 
        // DocumentViewForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(980, 540);
        Controls.Add(_root);
        Icon = (Icon)resources.GetObject("$this.Icon");
        KeyPreview = true;
        Margin = new Padding(3, 2, 3, 2);
        MinimumSize = new Size(658, 385);
        Name = "DocumentViewForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "미리보기 — MD Maker";
        KeyDown += OnKeyDown;
        _root.ResumeLayout(false);
        _root.PerformLayout();
        _split.Panel1.ResumeLayout(false);
        _split.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)_split).EndInit();
        _split.ResumeLayout(false);
        _tabs.ResumeLayout(false);
        _tabPreview.ResumeLayout(false);
        _tabEdit.ResumeLayout(false);
        _tabEdit.PerformLayout();
        _toolbar.ResumeLayout(false);
        _toolbar.PerformLayout();
        _flowButtons.ResumeLayout(false);
        _flowButtons.PerformLayout();
        ResumeLayout(false);
    }
}
