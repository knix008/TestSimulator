namespace MDMakerWinV10;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null;

    private Panel _body;
    private Panel _pnlSource;
    private Label _lblSrcPath;
    private TextBox _srcDir;
    private Button _btnBrowseSrc;
    private CheckBox _chkRecursive;
    private Panel _pnlOptions;
    private Label _lblSort;
    private ComboBox _cmbSort;
    private CheckBox _chkHeader;
    private Label _lblExclude;
    private TextBox _txtExclude;
    private Panel _pnlFiles;
    private CheckedListBox _lstFiles;
    private Label _lblCount;
    private Panel _pnlFileBtns;
    private Button _btnRefresh;
    private Button _btnUp;
    private Button _btnDown;
    private Panel _pnlOutput;
    private Label _lblOutPath;
    private TextBox _txtOutput;
    private Button _btnBrowseOut;
    private FlowLayoutPanel _flowButtons;
    private Button _btnGenerate;
    private Button _btnPreview;
    private Panel _pnlLog;
    private RichTextBox _txtLog;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
        _body = new Panel();
        _pnlLog = new Panel();
        _txtLog = new RichTextBox();
        _flowButtons = new FlowLayoutPanel();
        _btnGenerate = new Button();
        _btnPreview = new Button();
        _pnlOutput = new Panel();
        _lblOutPath = new Label();
        _txtOutput = new TextBox();
        _btnBrowseOut = new Button();
        _pnlFiles = new Panel();
        _pnlFileBtns = new Panel();
        _btnDown = new Button();
        _btnUp = new Button();
        _btnRefresh = new Button();
        _lblCount = new Label();
        _lstFiles = new CheckedListBox();
        _pnlOptions = new Panel();
        _txtExclude = new TextBox();
        _lblExclude = new Label();
        _chkHeader = new CheckBox();
        _cmbSort = new ComboBox();
        _lblSort = new Label();
        _pnlSource = new Panel();
        _chkRecursive = new CheckBox();
        _btnBrowseSrc = new Button();
        _srcDir = new TextBox();
        _lblSrcPath = new Label();
        _body.SuspendLayout();
        _pnlLog.SuspendLayout();
        _flowButtons.SuspendLayout();
        _pnlOutput.SuspendLayout();
        _pnlFiles.SuspendLayout();
        _pnlFileBtns.SuspendLayout();
        _pnlOptions.SuspendLayout();
        _pnlSource.SuspendLayout();
        SuspendLayout();
        // 
        // _body
        // 
        _body.Controls.Add(_pnlFiles);
        _body.Controls.Add(_pnlOptions);
        _body.Controls.Add(_pnlSource);
        _body.Controls.Add(_pnlLog);
        _body.Controls.Add(_flowButtons);
        _body.Controls.Add(_pnlOutput);
        _body.Dock = DockStyle.Fill;
        _body.Location = new Point(0, 0);
        _body.Name = "_body";
        _body.Padding = new Padding(10, 8, 10, 8);
        _body.Size = new Size(784, 703);
        _body.TabIndex = 0;
        // 
        // _pnlLog
        // 
        _pnlLog.Controls.Add(_txtLog);
        _pnlLog.Dock = DockStyle.Bottom;
        _pnlLog.Location = new Point(10, 583);
        _pnlLog.Name = "_pnlLog";
        _pnlLog.Size = new Size(764, 112);
        _pnlLog.TabIndex = 5;
        // 
        // _txtLog
        // 
        _txtLog.BackColor = Color.FromArgb(25, 25, 25);
        _txtLog.BorderStyle = BorderStyle.FixedSingle;
        _txtLog.Dock = DockStyle.Fill;
        _txtLog.Font = new Font("Consolas", 9F);
        _txtLog.ForeColor = Color.FromArgb(200, 200, 200);
        _txtLog.Location = new Point(0, 0);
        _txtLog.Name = "_txtLog";
        _txtLog.ReadOnly = true;
        _txtLog.Size = new Size(764, 112);
        _txtLog.TabIndex = 0;
        _txtLog.Text = "";
        // 
        // _flowButtons
        // 
        _flowButtons.Controls.Add(_btnGenerate);
        _flowButtons.Controls.Add(_btnPreview);
        _flowButtons.Dock = DockStyle.Bottom;
        _flowButtons.FlowDirection = FlowDirection.RightToLeft;
        _flowButtons.Location = new Point(10, 543);
        _flowButtons.Name = "_flowButtons";
        _flowButtons.Padding = new Padding(0, 4, 0, 4);
        _flowButtons.Size = new Size(764, 40);
        _flowButtons.TabIndex = 4;
        _flowButtons.WrapContents = false;
        // 
        // _btnGenerate
        // 
        _btnGenerate.BackColor = Color.FromArgb(0, 120, 212);
        _btnGenerate.FlatAppearance.BorderSize = 0;
        _btnGenerate.FlatStyle = FlatStyle.Flat;
        _btnGenerate.ForeColor = Color.White;
        _btnGenerate.Location = new Point(676, 4);
        _btnGenerate.Margin = new Padding(6, 0, 0, 0);
        _btnGenerate.Name = "_btnGenerate";
        _btnGenerate.Size = new Size(88, 32);
        _btnGenerate.TabIndex = 0;
        _btnGenerate.Text = "생성";
        _btnGenerate.UseVisualStyleBackColor = false;
        _btnGenerate.Click += Generate_Click;
        // 
        // _btnPreview
        // 
        _btnPreview.Location = new Point(582, 4);
        _btnPreview.Margin = new Padding(6, 0, 0, 0);
        _btnPreview.Name = "_btnPreview";
        _btnPreview.Size = new Size(88, 32);
        _btnPreview.TabIndex = 1;
        _btnPreview.Text = "미리보기";
        _btnPreview.UseVisualStyleBackColor = true;
        _btnPreview.Click += Preview_Click;
        // 
        // _pnlOutput
        // 
        _pnlOutput.Controls.Add(_btnBrowseOut);
        _pnlOutput.Controls.Add(_txtOutput);
        _pnlOutput.Controls.Add(_lblOutPath);
        _pnlOutput.Dock = DockStyle.Bottom;
        _pnlOutput.Location = new Point(10, 503);
        _pnlOutput.Name = "_pnlOutput";
        _pnlOutput.Size = new Size(764, 40);
        _pnlOutput.TabIndex = 3;
        // 
        // _lblOutPath
        // 
        _lblOutPath.AutoSize = true;
        _lblOutPath.Location = new Point(0, 12);
        _lblOutPath.Name = "_lblOutPath";
        _lblOutPath.Size = new Size(34, 15);
        _lblOutPath.TabIndex = 0;
        _lblOutPath.Text = "출력:";
        // 
        // _txtOutput
        // 
        _txtOutput.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _txtOutput.Location = new Point(40, 8);
        _txtOutput.Name = "_txtOutput";
        _txtOutput.Size = new Size(628, 23);
        _txtOutput.TabIndex = 1;
        _txtOutput.Leave += _txtOutput_Leave;
        // 
        // _btnBrowseOut
        // 
        _btnBrowseOut.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _btnBrowseOut.Location = new Point(674, 7);
        _btnBrowseOut.Name = "_btnBrowseOut";
        _btnBrowseOut.Size = new Size(88, 25);
        _btnBrowseOut.TabIndex = 2;
        _btnBrowseOut.Text = "찾아보기...";
        _btnBrowseOut.UseVisualStyleBackColor = true;
        _btnBrowseOut.Click += BrowseOut_Click;
        // 
        // _pnlFiles
        // 
        _pnlFiles.Controls.Add(_lstFiles);
        _pnlFiles.Controls.Add(_lblCount);
        _pnlFiles.Controls.Add(_pnlFileBtns);
        _pnlFiles.Dock = DockStyle.Fill;
        _pnlFiles.Location = new Point(10, 138);
        _pnlFiles.Name = "_pnlFiles";
        _pnlFiles.Padding = new Padding(0, 4, 0, 0);
        _pnlFiles.Size = new Size(764, 365);
        _pnlFiles.TabIndex = 2;
        // 
        // _pnlFileBtns
        // 
        _pnlFileBtns.Controls.Add(_btnDown);
        _pnlFileBtns.Controls.Add(_btnUp);
        _pnlFileBtns.Controls.Add(_btnRefresh);
        _pnlFileBtns.Dock = DockStyle.Right;
        _pnlFileBtns.Location = new Point(674, 4);
        _pnlFileBtns.Name = "_pnlFileBtns";
        _pnlFileBtns.Padding = new Padding(4, 0, 0, 0);
        _pnlFileBtns.Size = new Size(90, 361);
        _pnlFileBtns.TabIndex = 2;
        // 
        // _btnDown
        // 
        _btnDown.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _btnDown.Enabled = false;
        _btnDown.Location = new Point(4, 68);
        _btnDown.Name = "_btnDown";
        _btnDown.Size = new Size(82, 26);
        _btnDown.TabIndex = 2;
        _btnDown.Text = "▼ 아래";
        _btnDown.UseVisualStyleBackColor = true;
        _btnDown.Click += MoveDown_Click;
        // 
        // _btnUp
        // 
        _btnUp.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _btnUp.Enabled = false;
        _btnUp.Location = new Point(4, 36);
        _btnUp.Name = "_btnUp";
        _btnUp.Size = new Size(82, 26);
        _btnUp.TabIndex = 1;
        _btnUp.Text = "▲ 위";
        _btnUp.UseVisualStyleBackColor = true;
        _btnUp.Click += MoveUp_Click;
        // 
        // _btnRefresh
        // 
        _btnRefresh.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _btnRefresh.Location = new Point(4, 4);
        _btnRefresh.Name = "_btnRefresh";
        _btnRefresh.Size = new Size(82, 26);
        _btnRefresh.TabIndex = 0;
        _btnRefresh.Text = "새로고침";
        _btnRefresh.UseVisualStyleBackColor = true;
        _btnRefresh.Click += _btnRefresh_Click;
        // 
        // _lblCount
        // 
        _lblCount.Dock = DockStyle.Bottom;
        _lblCount.Location = new Point(0, 345);
        _lblCount.Name = "_lblCount";
        _lblCount.Padding = new Padding(2, 2, 0, 4);
        _lblCount.Size = new Size(674, 20);
        _lblCount.TabIndex = 1;
        _lblCount.Text = "0개 파일";
        _lblCount.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // _lstFiles
        // 
        _lstFiles.Dock = DockStyle.Fill;
        _lstFiles.FormattingEnabled = true;
        _lstFiles.IntegralHeight = false;
        _lstFiles.Location = new Point(0, 4);
        _lstFiles.Name = "_lstFiles";
        _lstFiles.Size = new Size(674, 341);
        _lstFiles.TabIndex = 0;
        _lstFiles.ItemCheck += _lstFiles_ItemCheck;
        _lstFiles.SelectedIndexChanged += _lstFiles_SelectedIndexChanged;
        _lstFiles.MouseDown += LstFiles_MouseDown;
        // 
        // _pnlOptions
        // 
        _pnlOptions.Controls.Add(_txtExclude);
        _pnlOptions.Controls.Add(_lblExclude);
        _pnlOptions.Controls.Add(_chkHeader);
        _pnlOptions.Controls.Add(_cmbSort);
        _pnlOptions.Controls.Add(_lblSort);
        _pnlOptions.Dock = DockStyle.Top;
        _pnlOptions.Location = new Point(10, 66);
        _pnlOptions.Name = "_pnlOptions";
        _pnlOptions.Size = new Size(764, 72);
        _pnlOptions.TabIndex = 1;
        // 
        // _txtExclude
        // 
        _txtExclude.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _txtExclude.Location = new Point(72, 40);
        _txtExclude.Name = "_txtExclude";
        _txtExclude.PlaceholderText = "제외: _draft, temp*, *.bak (쉼표 구분)";
        _txtExclude.Size = new Size(692, 23);
        _txtExclude.TabIndex = 4;
        _txtExclude.Leave += _txtExclude_Leave;
        // 
        // _lblExclude
        // 
        _lblExclude.AutoSize = true;
        _lblExclude.Location = new Point(0, 44);
        _lblExclude.Name = "_lblExclude";
        _lblExclude.Size = new Size(62, 15);
        _lblExclude.TabIndex = 3;
        _lblExclude.Text = "제외 패턴:";
        // 
        // _chkHeader
        // 
        _chkHeader.AutoSize = true;
        _chkHeader.Checked = true;
        _chkHeader.CheckState = CheckState.Checked;
        _chkHeader.Location = new Point(280, 10);
        _chkHeader.Name = "_chkHeader";
        _chkHeader.Size = new Size(142, 19);
        _chkHeader.TabIndex = 2;
        _chkHeader.Text = "파일명을 헤더로 삽입";
        _chkHeader.UseVisualStyleBackColor = true;
        // 
        // _cmbSort
        // 
        _cmbSort.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _cmbSort.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbSort.FormattingEnabled = true;
        _cmbSort.Items.AddRange(new object[] { "이름 오름차순", "이름 내림차순", "날짜 최신순", "날짜 오래된순", "직접 지정" });
        _cmbSort.Location = new Point(40, 8);
        _cmbSort.Name = "_cmbSort";
        _cmbSort.Size = new Size(224, 23);
        _cmbSort.TabIndex = 1;
        _cmbSort.SelectedIndexChanged += OnSortChanged;
        // 
        // _lblSort
        // 
        _lblSort.AutoSize = true;
        _lblSort.Location = new Point(0, 12);
        _lblSort.Name = "_lblSort";
        _lblSort.Size = new Size(34, 15);
        _lblSort.TabIndex = 0;
        _lblSort.Text = "정렬:";
        // 
        // _pnlSource
        // 
        _pnlSource.Controls.Add(_chkRecursive);
        _pnlSource.Controls.Add(_btnBrowseSrc);
        _pnlSource.Controls.Add(_srcDir);
        _pnlSource.Controls.Add(_lblSrcPath);
        _pnlSource.Dock = DockStyle.Top;
        _pnlSource.Location = new Point(10, 8);
        _pnlSource.Name = "_pnlSource";
        _pnlSource.Size = new Size(764, 58);
        _pnlSource.TabIndex = 0;
        // 
        // _chkRecursive
        // 
        _chkRecursive.AutoSize = true;
        _chkRecursive.Checked = true;
        _chkRecursive.CheckState = CheckState.Checked;
        _chkRecursive.Location = new Point(40, 34);
        _chkRecursive.Name = "_chkRecursive";
        _chkRecursive.Size = new Size(106, 19);
        _chkRecursive.TabIndex = 3;
        _chkRecursive.Text = "하위 폴더 포함";
        _chkRecursive.UseVisualStyleBackColor = true;
        _chkRecursive.CheckedChanged += _chkRecursive_CheckedChanged;
        // 
        // _btnBrowseSrc
        // 
        _btnBrowseSrc.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _btnBrowseSrc.Location = new Point(674, 5);
        _btnBrowseSrc.Name = "_btnBrowseSrc";
        _btnBrowseSrc.Size = new Size(88, 25);
        _btnBrowseSrc.TabIndex = 2;
        _btnBrowseSrc.Text = "찾아보기...";
        _btnBrowseSrc.UseVisualStyleBackColor = true;
        _btnBrowseSrc.Click += BrowseSrc_Click;
        // 
        // _srcDir
        // 
        _srcDir.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _srcDir.Location = new Point(40, 6);
        _srcDir.Name = "_srcDir";
        _srcDir.Size = new Size(628, 23);
        _srcDir.TabIndex = 1;
        _srcDir.Leave += _srcDir_Leave;
        // 
        // _lblSrcPath
        // 
        _lblSrcPath.AutoSize = true;
        _lblSrcPath.Location = new Point(0, 10);
        _lblSrcPath.Name = "_lblSrcPath";
        _lblSrcPath.Size = new Size(34, 15);
        _lblSrcPath.TabIndex = 0;
        _lblSrcPath.Text = "소스:";
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(784, 703);
        Controls.Add(_body);
        Icon = (Icon)resources.GetObject("$this.Icon");
        MinimumSize = new Size(560, 480);
        Name = "MainForm";
        StartPosition = FormStartPosition.CenterScreen;
        Text = "MD Maker v1.0";
        _body.ResumeLayout(false);
        _pnlLog.ResumeLayout(false);
        _flowButtons.ResumeLayout(false);
        _pnlOutput.ResumeLayout(false);
        _pnlOutput.PerformLayout();
        _pnlFiles.ResumeLayout(false);
        _pnlFileBtns.ResumeLayout(false);
        _pnlOptions.ResumeLayout(false);
        _pnlOptions.PerformLayout();
        _pnlSource.ResumeLayout(false);
        _pnlSource.PerformLayout();
        ResumeLayout(false);
    }
}
