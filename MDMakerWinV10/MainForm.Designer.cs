namespace MDMakerWinV10;

partial class MainForm
{
    private System.ComponentModel.IContainer components = null;

    private MenuStrip         _menuMain;
    private ToolStripMenuItem _mnuWork;
    private ToolStripMenuItem _miGenerate;
    private ToolStripMenuItem _miPreview;
    private ToolStripMenuItem _mnuTools;
    private ToolStripMenuItem _miExportSettings;

    private SplitContainer    _splitMain;
    private GroupBox          _grpSource;
    private Label             _lblSrcPath;
    private TextBox           _srcDir;
    private Button            _btnBrowseSrc;
    private CheckBox          _chkRecursive;
    private GroupBox          _grpOptions;
    private Label             _lblSort;
    private ComboBox          _cmbSort;
    private CheckBox          _chkNumbering;
    private Label             _lblExclude;
    private TextBox           _txtExclude;
    private GroupBox          _grpFiles;
    private CheckedListBox    _lstFiles;
    private Button            _btnRefresh;
    private Button            _btnUp;
    private Button            _btnDown;
    private Label             _lblCount;
    private GroupBox          _grpOutput;
    private Label             _lblOutPath;
    private TextBox           _txtOutput;
    private Button            _btnBrowseOut;
    private FlowLayoutPanel   _flowActions;
    private Button            _btnGenerate;
    private Button            _btnPreview;
    private Button            _btnExportSettings;
    private GroupBox          _grpLog;
    private RichTextBox       _txtLog;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
            components.Dispose();
        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        System.ComponentModel.ComponentResourceManager resources = new System.ComponentModel.ComponentResourceManager(typeof(MainForm));
        _menuMain = new MenuStrip();
        _mnuWork = new ToolStripMenuItem();
        _miGenerate = new ToolStripMenuItem();
        _miPreview = new ToolStripMenuItem();
        _mnuTools = new ToolStripMenuItem();
        _miExportSettings = new ToolStripMenuItem();
        _splitMain = new SplitContainer();
        _grpFiles = new GroupBox();
        _lblCount = new Label();
        _btnDown = new Button();
        _btnUp = new Button();
        _btnRefresh = new Button();
        _lstFiles = new CheckedListBox();
        _grpOptions = new GroupBox();
        _txtExclude = new TextBox();
        _lblExclude = new Label();
        _chkNumbering = new CheckBox();
        _cmbSort = new ComboBox();
        _lblSort = new Label();
        _grpSource = new GroupBox();
        _chkRecursive = new CheckBox();
        _srcDir = new TextBox();
        _btnBrowseSrc = new Button();
        _lblSrcPath = new Label();
        _grpLog = new GroupBox();
        _txtLog = new RichTextBox();
        _flowActions = new FlowLayoutPanel();
        _btnExportSettings = new Button();
        _btnPreview = new Button();
        _btnGenerate = new Button();
        _grpOutput = new GroupBox();
        _txtOutput = new TextBox();
        _btnBrowseOut = new Button();
        _lblOutPath = new Label();
        _menuMain.SuspendLayout();
        ((System.ComponentModel.ISupportInitialize)_splitMain).BeginInit();
        _splitMain.Panel1.SuspendLayout();
        _splitMain.Panel2.SuspendLayout();
        _splitMain.SuspendLayout();
        _grpFiles.SuspendLayout();
        _grpOptions.SuspendLayout();
        _grpSource.SuspendLayout();
        _grpLog.SuspendLayout();
        _flowActions.SuspendLayout();
        _grpOutput.SuspendLayout();
        SuspendLayout();
        // 
        // _menuMain
        // 
        _menuMain.Items.AddRange(new ToolStripItem[] { _mnuWork, _mnuTools });
        _menuMain.Location = new Point(10, 0);
        _menuMain.Name = "_menuMain";
        _menuMain.Size = new Size(880, 24);
        _menuMain.TabIndex = 0;
        // 
        // _mnuWork
        // 
        _mnuWork.DropDownItems.AddRange(new ToolStripItem[] { _miGenerate, _miPreview });
        _mnuWork.Name = "_mnuWork";
        _mnuWork.Size = new Size(62, 20);
        _mnuWork.Text = "작업(&W)";
        // 
        // _miGenerate
        // 
        _miGenerate.Name = "_miGenerate";
        _miGenerate.ShortcutKeys = Keys.Control | Keys.G;
        _miGenerate.Size = new Size(184, 22);
        _miGenerate.Text = "문서 생성(&G)";
        _miGenerate.Click += Generate_Click;
        // 
        // _miPreview
        // 
        _miPreview.Name = "_miPreview";
        _miPreview.ShortcutKeys = Keys.Control | Keys.P;
        _miPreview.Size = new Size(184, 22);
        _miPreview.Text = "미리보기(&P)";
        _miPreview.Click += Preview_Click;
        // 
        // _mnuTools
        // 
        _mnuTools.DropDownItems.AddRange(new ToolStripItem[] { _miExportSettings });
        _mnuTools.Name = "_mnuTools";
        _mnuTools.Size = new Size(57, 20);
        _mnuTools.Text = "도구(&T)";
        // 
        // _miExportSettings
        // 
        _miExportSettings.Name = "_miExportSettings";
        _miExportSettings.Size = new Size(161, 22);
        _miExportSettings.Text = "보내기 서식(&F)...";
        _miExportSettings.Click += ExportSettings_Click;
        // 
        // _splitMain
        // 
        _splitMain.Dock = DockStyle.Fill;
        _splitMain.Location = new Point(10, 24);
        _splitMain.Name = "_splitMain";
        _splitMain.Orientation = Orientation.Horizontal;
        // 
        // _splitMain.Panel1
        // 
        _splitMain.Panel1.Controls.Add(_grpFiles);
        _splitMain.Panel1.Controls.Add(_grpOptions);
        _splitMain.Panel1.Controls.Add(_grpSource);
        _splitMain.Panel1MinSize = 220;
        // 
        // _splitMain.Panel2
        // 
        _splitMain.Panel2.Controls.Add(_grpLog);
        _splitMain.Panel2.Controls.Add(_flowActions);
        _splitMain.Panel2.Controls.Add(_grpOutput);
        _splitMain.Panel2MinSize = 140;
        _splitMain.Size = new Size(880, 686);
        _splitMain.SplitterDistance = 480;
        _splitMain.TabIndex = 1;
        // 
        // _grpFiles
        // 
        _grpFiles.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        _grpFiles.Controls.Add(_lblCount);
        _grpFiles.Controls.Add(_btnDown);
        _grpFiles.Controls.Add(_btnUp);
        _grpFiles.Controls.Add(_btnRefresh);
        _grpFiles.Controls.Add(_lstFiles);
        _grpFiles.Location = new Point(0, 182);
        _grpFiles.Name = "_grpFiles";
        _grpFiles.Size = new Size(880, 294);
        _grpFiles.TabIndex = 2;
        _grpFiles.TabStop = false;
        _grpFiles.Text = "병합할 파일";
        // 
        // _lblCount
        // 
        _lblCount.Anchor = AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        _lblCount.Location = new Point(12, 276);
        _lblCount.Name = "_lblCount";
        _lblCount.Size = new Size(852, 18);
        _lblCount.TabIndex = 4;
        _lblCount.Text = "0개 파일";
        _lblCount.TextAlign = ContentAlignment.MiddleLeft;
        // 
        // _btnDown
        // 
        _btnDown.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _btnDown.Enabled = false;
        _btnDown.Location = new Point(784, 92);
        _btnDown.Name = "_btnDown";
        _btnDown.Size = new Size(88, 30);
        _btnDown.TabIndex = 3;
        _btnDown.Text = "아래로";
        _btnDown.UseVisualStyleBackColor = true;
        _btnDown.Click += MoveDown_Click;
        // 
        // _btnUp
        // 
        _btnUp.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _btnUp.Enabled = false;
        _btnUp.Location = new Point(784, 56);
        _btnUp.Name = "_btnUp";
        _btnUp.Size = new Size(88, 30);
        _btnUp.TabIndex = 2;
        _btnUp.Text = "위로";
        _btnUp.UseVisualStyleBackColor = true;
        _btnUp.Click += MoveUp_Click;
        // 
        // _btnRefresh
        // 
        _btnRefresh.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _btnRefresh.Location = new Point(784, 20);
        _btnRefresh.Name = "_btnRefresh";
        _btnRefresh.Size = new Size(88, 30);
        _btnRefresh.TabIndex = 1;
        _btnRefresh.Text = "새로고침";
        _btnRefresh.UseVisualStyleBackColor = true;
        _btnRefresh.Click += _btnRefresh_Click;
        // 
        // _lstFiles
        // 
        _lstFiles.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        _lstFiles.BorderStyle = BorderStyle.FixedSingle;
        _lstFiles.FormattingEnabled = true;
        _lstFiles.IntegralHeight = false;
        _lstFiles.Location = new Point(12, 20);
        _lstFiles.Name = "_lstFiles";
        _lstFiles.Size = new Size(764, 250);
        _lstFiles.TabIndex = 0;
        _lstFiles.ItemCheck += _lstFiles_ItemCheck;
        _lstFiles.SelectedIndexChanged += _lstFiles_SelectedIndexChanged;
        _lstFiles.MouseDown += LstFiles_MouseDown;
        // 
        // _grpOptions
        // 
        _grpOptions.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _grpOptions.Controls.Add(_txtExclude);
        _grpOptions.Controls.Add(_lblExclude);
        _grpOptions.Controls.Add(_chkNumbering);
        _grpOptions.Controls.Add(_cmbSort);
        _grpOptions.Controls.Add(_lblSort);
        _grpOptions.Location = new Point(0, 84);
        _grpOptions.Name = "_grpOptions";
        _grpOptions.Size = new Size(880, 92);
        _grpOptions.TabIndex = 1;
        _grpOptions.TabStop = false;
        _grpOptions.Text = "병합 옵션";
        // 
        // _txtExclude
        // 
        _txtExclude.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _txtExclude.Location = new Point(80, 50);
        _txtExclude.Name = "_txtExclude";
        _txtExclude.PlaceholderText = "제외: _draft, temp*, *.bak (쉼표 구분)";
        _txtExclude.Size = new Size(784, 23);
        _txtExclude.TabIndex = 5;
        _txtExclude.Leave += _txtExclude_Leave;
        // 
        // _lblExclude
        // 
        _lblExclude.AutoSize = true;
        _lblExclude.Location = new Point(12, 54);
        _lblExclude.Name = "_lblExclude";
        _lblExclude.Size = new Size(58, 15);
        _lblExclude.TabIndex = 4;
        _lblExclude.Text = "제외 패턴";
        // 
        // _chkNumbering
        // 
        _chkNumbering.AutoSize = true;
        _chkNumbering.Checked = true;
        _chkNumbering.CheckState = CheckState.Checked;
        _chkNumbering.Location = new Point(264, 20);
        _chkNumbering.Name = "_chkNumbering";
        _chkNumbering.Size = new Size(116, 19);
        _chkNumbering.TabIndex = 3;
        _chkNumbering.Text = "제목 번호 매기기";
        _chkNumbering.UseVisualStyleBackColor = true;
        _chkNumbering.CheckedChanged += _chkNumbering_CheckedChanged;
        // 
        // _cmbSort
        // 
        _cmbSort.DropDownStyle = ComboBoxStyle.DropDownList;
        _cmbSort.FormattingEnabled = true;
        _cmbSort.Items.AddRange(new object[] { "이름 오름차순", "이름 내림차순", "날짜 최신순", "날짜 오래된순", "직접 지정" });
        _cmbSort.Location = new Point(80, 16);
        _cmbSort.Name = "_cmbSort";
        _cmbSort.Size = new Size(168, 23);
        _cmbSort.TabIndex = 1;
        _cmbSort.SelectedIndexChanged += OnSortChanged;
        // 
        // _lblSort
        // 
        _lblSort.AutoSize = true;
        _lblSort.Location = new Point(12, 22);
        _lblSort.Name = "_lblSort";
        _lblSort.Size = new Size(31, 15);
        _lblSort.TabIndex = 0;
        _lblSort.Text = "정렬";
        // 
        // _grpSource
        // 
        _grpSource.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _grpSource.Controls.Add(_chkRecursive);
        _grpSource.Controls.Add(_srcDir);
        _grpSource.Controls.Add(_btnBrowseSrc);
        _grpSource.Controls.Add(_lblSrcPath);
        _grpSource.Location = new Point(0, 0);
        _grpSource.Name = "_grpSource";
        _grpSource.Size = new Size(880, 78);
        _grpSource.TabIndex = 0;
        _grpSource.TabStop = false;
        _grpSource.Text = "파일 소스";
        // 
        // _chkRecursive
        // 
        _chkRecursive.AutoSize = true;
        _chkRecursive.Checked = true;
        _chkRecursive.CheckState = CheckState.Checked;
        _chkRecursive.Location = new Point(12, 50);
        _chkRecursive.Name = "_chkRecursive";
        _chkRecursive.Size = new Size(104, 19);
        _chkRecursive.TabIndex = 3;
        _chkRecursive.Text = "하위 폴더 포함";
        _chkRecursive.UseVisualStyleBackColor = true;
        _chkRecursive.CheckedChanged += _chkRecursive_CheckedChanged;
        // 
        // _srcDir
        // 
        _srcDir.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _srcDir.Location = new Point(80, 20);
        _srcDir.Name = "_srcDir";
        _srcDir.Size = new Size(688, 23);
        _srcDir.TabIndex = 1;
        _srcDir.Leave += _srcDir_Leave;
        // 
        // _btnBrowseSrc
        // 
        _btnBrowseSrc.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _btnBrowseSrc.Location = new Point(776, 15);
        _btnBrowseSrc.Name = "_btnBrowseSrc";
        _btnBrowseSrc.Size = new Size(96, 32);
        _btnBrowseSrc.TabIndex = 2;
        _btnBrowseSrc.Text = "찾기";
        _btnBrowseSrc.UseVisualStyleBackColor = true;
        _btnBrowseSrc.Click += BrowseSrc_Click;
        // 
        // _lblSrcPath
        // 
        _lblSrcPath.AutoSize = true;
        _lblSrcPath.Location = new Point(12, 22);
        _lblSrcPath.Name = "_lblSrcPath";
        _lblSrcPath.Size = new Size(58, 15);
        _lblSrcPath.TabIndex = 0;
        _lblSrcPath.Text = "소스 폴더";
        // 
        // _grpLog
        // 
        _grpLog.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        _grpLog.Controls.Add(_txtLog);
        _grpLog.Location = new Point(0, 102);
        _grpLog.Name = "_grpLog";
        _grpLog.Size = new Size(880, 100);
        _grpLog.TabIndex = 2;
        _grpLog.TabStop = false;
        _grpLog.Text = "작업 로그";
        // 
        // _txtLog
        // 
        _txtLog.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
        _txtLog.BackColor = Color.FromArgb(30, 30, 30);
        _txtLog.BorderStyle = BorderStyle.None;
        _txtLog.Font = new Font("Consolas", 9F);
        _txtLog.ForeColor = Color.FromArgb(212, 212, 212);
        _txtLog.Location = new Point(6, 20);
        _txtLog.Name = "_txtLog";
        _txtLog.ReadOnly = true;
        _txtLog.Size = new Size(866, 72);
        _txtLog.TabIndex = 0;
        _txtLog.Text = "";
        // 
        // _flowActions
        // 
        _flowActions.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _flowActions.Controls.Add(_btnExportSettings);
        _flowActions.Controls.Add(_btnPreview);
        _flowActions.Controls.Add(_btnGenerate);
        _flowActions.FlowDirection = FlowDirection.RightToLeft;
        _flowActions.Location = new Point(0, 58);
        _flowActions.Name = "_flowActions";
        _flowActions.Padding = new Padding(0, 4, 4, 4);
        _flowActions.Size = new Size(880, 40);
        _flowActions.TabIndex = 1;
        _flowActions.WrapContents = false;
        // 
        // _btnExportSettings
        // 
        _btnExportSettings.Location = new Point(740, 8);
        _btnExportSettings.Margin = new Padding(0, 4, 8, 4);
        _btnExportSettings.Name = "_btnExportSettings";
        _btnExportSettings.Size = new Size(128, 32);
        _btnExportSettings.TabIndex = 2;
        _btnExportSettings.Text = "보내기 서식";
        _btnExportSettings.UseVisualStyleBackColor = true;
        _btnExportSettings.Click += ExportSettings_Click;
        // 
        // _btnPreview
        // 
        _btnPreview.Location = new Point(620, 8);
        _btnPreview.Margin = new Padding(0, 4, 8, 4);
        _btnPreview.Name = "_btnPreview";
        _btnPreview.Size = new Size(112, 32);
        _btnPreview.TabIndex = 1;
        _btnPreview.Text = "미리보기";
        _btnPreview.UseVisualStyleBackColor = true;
        _btnPreview.Click += Preview_Click;
        // 
        // _btnGenerate
        // 
        _btnGenerate.Location = new Point(500, 8);
        _btnGenerate.Margin = new Padding(0, 4, 8, 4);
        _btnGenerate.Name = "_btnGenerate";
        _btnGenerate.Size = new Size(112, 32);
        _btnGenerate.TabIndex = 0;
        _btnGenerate.Text = "생성";
        _btnGenerate.UseVisualStyleBackColor = true;
        _btnGenerate.Click += Generate_Click;
        // 
        // _grpOutput
        // 
        _grpOutput.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _grpOutput.Controls.Add(_txtOutput);
        _grpOutput.Controls.Add(_btnBrowseOut);
        _grpOutput.Controls.Add(_lblOutPath);
        _grpOutput.Location = new Point(0, 0);
        _grpOutput.Name = "_grpOutput";
        _grpOutput.Size = new Size(880, 54);
        _grpOutput.TabIndex = 0;
        _grpOutput.TabStop = false;
        _grpOutput.Text = "출력 파일";
        // 
        // _txtOutput
        // 
        _txtOutput.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        _txtOutput.Location = new Point(80, 20);
        _txtOutput.Name = "_txtOutput";
        _txtOutput.Size = new Size(688, 23);
        _txtOutput.TabIndex = 1;
        _txtOutput.Leave += _txtOutput_Leave;
        // 
        // _btnBrowseOut
        // 
        _btnBrowseOut.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        _btnBrowseOut.Location = new Point(776, 14);
        _btnBrowseOut.Name = "_btnBrowseOut";
        _btnBrowseOut.Size = new Size(96, 32);
        _btnBrowseOut.TabIndex = 2;
        _btnBrowseOut.Text = "찾기";
        _btnBrowseOut.UseVisualStyleBackColor = true;
        _btnBrowseOut.Click += BrowseOut_Click;
        // 
        // _lblOutPath
        // 
        _lblOutPath.AutoSize = true;
        _lblOutPath.Location = new Point(12, 22);
        _lblOutPath.Name = "_lblOutPath";
        _lblOutPath.Size = new Size(58, 15);
        _lblOutPath.TabIndex = 0;
        _lblOutPath.Text = "저장 경로";
        // 
        // MainForm
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(900, 720);
        Controls.Add(_splitMain);
        Controls.Add(_menuMain);
        Font = new Font("Segoe UI", 9F);
        Icon = (Icon)resources.GetObject("$this.Icon");
        MainMenuStrip = _menuMain;
        MinimumSize = new Size(640, 560);
        Name = "MainForm";
        Padding = new Padding(10, 0, 10, 10);
        StartPosition = FormStartPosition.CenterScreen;
        Text = "MD Merge v1.0";
        _menuMain.ResumeLayout(false);
        _menuMain.PerformLayout();
        _splitMain.Panel1.ResumeLayout(false);
        _splitMain.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)_splitMain).EndInit();
        _splitMain.ResumeLayout(false);
        _grpFiles.ResumeLayout(false);
        _grpOptions.ResumeLayout(false);
        _grpOptions.PerformLayout();
        _grpSource.ResumeLayout(false);
        _grpSource.PerformLayout();
        _grpLog.ResumeLayout(false);
        _flowActions.ResumeLayout(false);
        _grpOutput.ResumeLayout(false);
        _grpOutput.PerformLayout();
        ResumeLayout(false);
        PerformLayout();
    }
}
