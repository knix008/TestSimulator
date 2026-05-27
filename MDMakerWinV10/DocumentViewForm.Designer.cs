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

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            components?.Dispose();
            if (_webView != null)
            {
                _webView.Dispose();
                _webView = null;
            }
        }
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        components = new System.ComponentModel.Container();
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
        _root.Name = "_root";
        _root.RowCount = 2;
        _root.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        _root.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        _root.Size = new Size(1120, 720);
        _root.TabIndex = 0;
        // 
        // _split
        // 
        _split.Dock = DockStyle.Fill;
        _split.Location = new Point(0, 0);
        _split.Name = "_split";
        // 
        // _split.Panel1
        // 
        _split.Panel1.Controls.Add(_lblTreeHeader);
        _split.Panel1.Controls.Add(_tree);
        _split.Panel1MinSize = 25;
        // 
        // _split.Panel2
        // 
        _split.Panel2.Controls.Add(_tabs);
        _split.Panel2MinSize = 25;
        _split.Size = new Size(1120, 674);
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
        _lblTreeHeader.Padding = new Padding(6, 5, 0, 0);
        _lblTreeHeader.Size = new Size(230, 26);
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
        _tree.Location = new Point(0, 26);
        _tree.Name = "_tree";
        _tree.ShowLines = true;
        _tree.Size = new Size(230, 648);
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
        _tabs.Size = new Size(886, 674);
        _tabs.TabIndex = 0;
        _tabs.SelectedIndexChanged += Tabs_SelectedIndexChanged;
        // 
        // _tabPreview
        // 
        _tabPreview.Controls.Add(_pnlPreview);
        _tabPreview.Location = new Point(4, 29);
        _tabPreview.Name = "_tabPreview";
        _tabPreview.Padding = new Padding(0);
        _tabPreview.Size = new Size(878, 641);
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
        _pnlPreview.Size = new Size(878, 641);
        _pnlPreview.TabIndex = 0;
        // 
        // _tabEdit
        // 
        _tabEdit.Controls.Add(_editor);
        _tabEdit.Location = new Point(4, 29);
        _tabEdit.Name = "_tabEdit";
        _tabEdit.Padding = new Padding(3);
        _tabEdit.Size = new Size(878, 641);
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
        _editor.Location = new Point(3, 3);
        _editor.MaxLength = 0;
        _editor.Multiline = true;
        _editor.Name = "_editor";
        _editor.ScrollBars = ScrollBars.Both;
        _editor.Size = new Size(872, 635);
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
        _toolbar.Location = new Point(0, 674);
        _toolbar.Name = "_toolbar";
        _toolbar.Padding = new Padding(6, 5, 8, 5);
        _toolbar.RowCount = 1;
        _toolbar.RowStyles.Add(new RowStyle(SizeType.Percent, 100F));
        _toolbar.Size = new Size(1120, 46);
        _toolbar.TabIndex = 1;
        // 
        // _flowButtons
        // 
        _flowButtons.AutoSize = true;
        _flowButtons.Anchor = AnchorStyles.Left | AnchorStyles.Top;
        _flowButtons.Controls.Add(_btnSave);
        _flowButtons.Controls.Add(_lblSeparator);
        _flowButtons.Controls.Add(_btnExportHtml);
        _flowButtons.Controls.Add(_btnExportWord);
        _flowButtons.Controls.Add(_btnExportPdf);
        _flowButtons.Location = new Point(9, 8);
        _flowButtons.Name = "_flowButtons";
        _flowButtons.Size = new Size(500, 30);
        _flowButtons.TabIndex = 0;
        _flowButtons.WrapContents = true;
        // 
        // _btnSave
        // 
        _btnSave.AutoSize = true;
        _btnSave.BackColor = Color.FromArgb(46, 184, 92);
        _btnSave.FlatAppearance.BorderSize = 0;
        _btnSave.FlatStyle = FlatStyle.Flat;
        _btnSave.ForeColor = Color.White;
        _btnSave.Location = new Point(3, 0);
        _btnSave.Margin = new Padding(0, 0, 4, 0);
        _btnSave.Name = "_btnSave";
        _btnSave.Size = new Size(51, 30);
        _btnSave.TabIndex = 0;
        _btnSave.Text = "저장";
        _btnSave.UseVisualStyleBackColor = false;
        _btnSave.Click += Save_Click;
        _toolTip.SetToolTip(_btnSave, "Ctrl+S");
        // 
        // _lblSeparator
        // 
        _lblSeparator.AutoSize = true;
        _lblSeparator.ForeColor = Color.Silver;
        _lblSeparator.Location = new Point(58, 5);
        _lblSeparator.Margin = new Padding(0, 0, 4, 0);
        _lblSeparator.Name = "_lblSeparator";
        _lblSeparator.Padding = new Padding(2, 4, 2, 0);
        _lblSeparator.Size = new Size(19, 24);
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
        _btnExportHtml.Size = new Size(119, 30);
        _btnExportHtml.TabIndex = 2;
        _btnExportHtml.Text = "HTML\uB0B4\uBCF4\uB0B4\uAE30";
        _btnExportHtml.UseVisualStyleBackColor = true;
        _btnExportHtml.Click += ExportHtml_Click;
        // 
        // _btnExportWord
        // 
        _btnExportWord.AutoSize = true;
        _btnExportWord.Location = new Point(204, 0);
        _btnExportWord.Margin = new Padding(0, 0, 4, 0);
        _btnExportWord.Name = "_btnExportWord";
        _btnExportWord.Size = new Size(119, 30);
        _btnExportWord.TabIndex = 3;
        _btnExportWord.Text = "Word\uB0B4\uBCF4\uB0B4\uAE30";
        _btnExportWord.UseVisualStyleBackColor = true;
        _btnExportWord.Click += ExportWord_Click;
        // 
        // _btnExportPdf
        // 
        _btnExportPdf.AutoSize = true;
        _btnExportPdf.Enabled = false;
        _btnExportPdf.Location = new Point(327, 0);
        _btnExportPdf.Margin = new Padding(0, 0, 4, 0);
        _btnExportPdf.Name = "_btnExportPdf";
        _btnExportPdf.Size = new Size(112, 30);
        _btnExportPdf.TabIndex = 4;
        _btnExportPdf.Text = "PDF\uB0B4\uBCF4\uB0B4\uAE30";
        _btnExportPdf.UseVisualStyleBackColor = true;
        _btnExportPdf.Click += ExportPdf_Click;
        // 
        // _lblStatus
        // 
        _lblStatus.Anchor = AnchorStyles.Top | AnchorStyles.Right | AnchorStyles.Left;
        _lblStatus.AutoEllipsis = true;
        _lblStatus.Font = new Font("Segoe UI", 8.5F);
        _lblStatus.ForeColor = Color.FromArgb(80, 80, 80);
        _lblStatus.Location = new Point(566, 8);
        _lblStatus.Name = "_lblStatus";
        _lblStatus.Size = new Size(600, 36);
        _lblStatus.TabIndex = 1;
        _lblStatus.TextAlign = ContentAlignment.MiddleRight;
        // 
        // DocumentViewForm
        // 
        AutoScaleDimensions = new SizeF(8F, 20F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(1120, 720);
        Controls.Add(_root);
        KeyPreview = true;
        MinimumSize = new Size(750, 500);
        Name = "DocumentViewForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "미리보기 — MD Maker";
        KeyDown += OnKeyDown;
        _root.ResumeLayout(false);
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
