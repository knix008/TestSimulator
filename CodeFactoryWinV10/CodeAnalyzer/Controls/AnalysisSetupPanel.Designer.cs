namespace CodeAnalyzer.Controls;

partial class AnalysisSetupPanel
{
    private System.ComponentModel.IContainer components = null;

    protected override void Dispose(bool disposing)
    {
        if (disposing && components != null)
        {
            components.Dispose();
        }

        base.Dispose(disposing);
    }

    private void InitializeComponent()
    {
        panelRootPath = new Panel();
        btnBrowseRoot = new Button();
        txtRootPath = new TextBox();
        lblRootPath = new Label();
        splitLists = new SplitContainer();
        checkedListLanguages = new CheckedListBox();
        flowLanguageButtons = new TableLayoutPanel();
        btnLanguagesSelectAll = new Button();
        btnLanguagesDeselectAll = new Button();
        lblLanguages = new Label();
        checkedListDirectories = new CheckedListBox();
        lblExcludeHint = new Label();
        flowDirectoryButtons = new TableLayoutPanel();
        btnDirectoriesSelectAll = new Button();
        btnDirectoriesDeselectAll = new Button();
        lblDirectories = new Label();
        btnAnalysisSettings = new Button();
        btnAnalyze = new Button();
        ((System.ComponentModel.ISupportInitialize)splitLists).BeginInit();
        splitLists.Panel1.SuspendLayout();
        splitLists.Panel2.SuspendLayout();
        splitLists.SuspendLayout();
        panelRootPath.SuspendLayout();
        flowLanguageButtons.SuspendLayout();
        flowDirectoryButtons.SuspendLayout();
        SuspendLayout();
        // 
        // panelRootPath
        // 
        panelRootPath.Controls.Add(btnBrowseRoot);
        panelRootPath.Controls.Add(txtRootPath);
        panelRootPath.Controls.Add(lblRootPath);
        panelRootPath.Dock = DockStyle.Top;
        panelRootPath.Location = new Point(0, 0);
        panelRootPath.Name = "panelRootPath";
        panelRootPath.Padding = new Padding(0, 0, 0, 4);
        panelRootPath.Size = new Size(320, 52);
        panelRootPath.TabIndex = 0;
        // 
        // btnBrowseRoot
        // 
        btnBrowseRoot.Anchor = AnchorStyles.Top | AnchorStyles.Right;
        btnBrowseRoot.Location = new Point(246, 22);
        btnBrowseRoot.Name = "btnBrowseRoot";
        btnBrowseRoot.Size = new Size(74, 27);
        btnBrowseRoot.TabIndex = 2;
        btnBrowseRoot.Text = "찾아보기";
        btnBrowseRoot.UseVisualStyleBackColor = true;
        btnBrowseRoot.Click += btnBrowseRoot_Click;
        // 
        // txtRootPath
        // 
        txtRootPath.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
        txtRootPath.Location = new Point(0, 24);
        txtRootPath.Name = "txtRootPath";
        txtRootPath.PlaceholderText = "C:\\Projects\\MyApp";
        txtRootPath.Size = new Size(240, 23);
        txtRootPath.TabIndex = 1;
        txtRootPath.Leave += txtRootPath_Leave;
        // 
        // lblRootPath
        // 
        lblRootPath.AutoSize = true;
        lblRootPath.Location = new Point(0, 4);
        lblRootPath.Name = "lblRootPath";
        lblRootPath.Size = new Size(83, 15);
        lblRootPath.TabIndex = 0;
        lblRootPath.Text = "루트 디렉터리";
        // 
        // splitLists
        // 
        splitLists.Dock = DockStyle.Fill;
        splitLists.Location = new Point(0, 52);
        splitLists.Name = "splitLists";
        splitLists.Orientation = Orientation.Horizontal;
        // 
        // splitLists.Panel1
        // 
        splitLists.Panel1.Controls.Add(checkedListLanguages);
        splitLists.Panel1.Controls.Add(flowLanguageButtons);
        splitLists.Panel1.Controls.Add(lblLanguages);
        splitLists.Panel1.Padding = new Padding(0, 0, 0, 3);
        splitLists.Panel1MinSize = 120;
        // 
        // splitLists.Panel2
        // 
        splitLists.Panel2.Controls.Add(checkedListDirectories);
        splitLists.Panel2.Controls.Add(lblExcludeHint);
        splitLists.Panel2.Controls.Add(flowDirectoryButtons);
        splitLists.Panel2.Controls.Add(lblDirectories);
        splitLists.Panel2.Padding = new Padding(0, 3, 0, 0);
        splitLists.Panel2MinSize = 120;
        splitLists.Size = new Size(320, 848);
        splitLists.SplitterDistance = 400;
        splitLists.SplitterWidth = 6;
        splitLists.TabIndex = 1;
        // 
        // checkedListLanguages
        // 
        checkedListLanguages.CheckOnClick = true;
        checkedListLanguages.Dock = DockStyle.Fill;
        checkedListLanguages.FormattingEnabled = true;
        checkedListLanguages.IntegralHeight = false;
        checkedListLanguages.Location = new Point(0, 47);
        checkedListLanguages.Name = "checkedListLanguages";
        checkedListLanguages.Size = new Size(320, 347);
        checkedListLanguages.TabIndex = 2;
        // 
        // flowLanguageButtons
        // 
        flowLanguageButtons.AutoSize = true;
        flowLanguageButtons.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        flowLanguageButtons.ColumnCount = 2;
        flowLanguageButtons.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        flowLanguageButtons.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        flowLanguageButtons.Controls.Add(btnLanguagesSelectAll, 0, 0);
        flowLanguageButtons.Controls.Add(btnLanguagesDeselectAll, 1, 0);
        flowLanguageButtons.Dock = DockStyle.Top;
        flowLanguageButtons.Location = new Point(0, 19);
        flowLanguageButtons.Margin = new Padding(0);
        flowLanguageButtons.Name = "flowLanguageButtons";
        flowLanguageButtons.Padding = new Padding(0, 0, 0, 2);
        flowLanguageButtons.RowCount = 1;
        flowLanguageButtons.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        flowLanguageButtons.Size = new Size(320, 29);
        flowLanguageButtons.TabIndex = 1;
        // 
        // btnLanguagesSelectAll
        // 
        btnLanguagesSelectAll.Anchor = AnchorStyles.Left;
        btnLanguagesSelectAll.AutoSize = true;
        btnLanguagesSelectAll.Margin = new Padding(0, 0, 6, 0);
        btnLanguagesSelectAll.Name = "btnLanguagesSelectAll";
        btnLanguagesSelectAll.TabIndex = 0;
        btnLanguagesSelectAll.Text = "전체 선택";
        btnLanguagesSelectAll.UseVisualStyleBackColor = true;
        btnLanguagesSelectAll.Click += btnLanguagesSelectAll_Click;
        // 
        // btnLanguagesDeselectAll
        // 
        btnLanguagesDeselectAll.Anchor = AnchorStyles.Left;
        btnLanguagesDeselectAll.AutoSize = true;
        btnLanguagesDeselectAll.Margin = new Padding(0);
        btnLanguagesDeselectAll.Name = "btnLanguagesDeselectAll";
        btnLanguagesDeselectAll.TabIndex = 1;
        btnLanguagesDeselectAll.Text = "전체 해제";
        btnLanguagesDeselectAll.UseVisualStyleBackColor = true;
        btnLanguagesDeselectAll.Click += btnLanguagesDeselectAll_Click;
        // 
        // lblLanguages
        // 
        lblLanguages.Dock = DockStyle.Top;
        lblLanguages.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
        lblLanguages.Location = new Point(0, 0);
        lblLanguages.Name = "lblLanguages";
        lblLanguages.Padding = new Padding(0, 0, 0, 2);
        lblLanguages.Size = new Size(320, 19);
        lblLanguages.TabIndex = 0;
        lblLanguages.Text = "분석할 프로그래밍 언어";
        // 
        // checkedListDirectories
        // 
        checkedListDirectories.CheckOnClick = true;
        checkedListDirectories.Dock = DockStyle.Fill;
        checkedListDirectories.FormattingEnabled = true;
        checkedListDirectories.IntegralHeight = false;
        checkedListDirectories.Location = new Point(0, 50);
        checkedListDirectories.Name = "checkedListDirectories";
        checkedListDirectories.Size = new Size(320, 352);
        checkedListDirectories.TabIndex = 3;
        // 
        // lblExcludeHint
        // 
        lblExcludeHint.Dock = DockStyle.Bottom;
        lblExcludeHint.ForeColor = Color.DimGray;
        lblExcludeHint.Location = new Point(0, 402);
        lblExcludeHint.Name = "lblExcludeHint";
        lblExcludeHint.Padding = new Padding(0, 4, 0, 0);
        lblExcludeHint.Size = new Size(320, 36);
        lblExcludeHint.TabIndex = 2;
        lblExcludeHint.Text = "체크한 디렉터리만 분석합니다. 하나 이상 선택해야 분석을 실행할 수 있습니다.";
        // 
        // flowDirectoryButtons
        // 
        flowDirectoryButtons.AutoSize = true;
        flowDirectoryButtons.AutoSizeMode = AutoSizeMode.GrowAndShrink;
        flowDirectoryButtons.ColumnCount = 2;
        flowDirectoryButtons.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        flowDirectoryButtons.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        flowDirectoryButtons.Controls.Add(btnDirectoriesSelectAll, 0, 0);
        flowDirectoryButtons.Controls.Add(btnDirectoriesDeselectAll, 1, 0);
        flowDirectoryButtons.Dock = DockStyle.Top;
        flowDirectoryButtons.Location = new Point(0, 19);
        flowDirectoryButtons.Margin = new Padding(0);
        flowDirectoryButtons.Name = "flowDirectoryButtons";
        flowDirectoryButtons.Padding = new Padding(0, 0, 0, 2);
        flowDirectoryButtons.RowCount = 1;
        flowDirectoryButtons.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        flowDirectoryButtons.Size = new Size(320, 29);
        flowDirectoryButtons.TabIndex = 1;
        // 
        // btnDirectoriesSelectAll
        // 
        btnDirectoriesSelectAll.Anchor = AnchorStyles.Left;
        btnDirectoriesSelectAll.AutoSize = true;
        btnDirectoriesSelectAll.Margin = new Padding(0, 0, 6, 0);
        btnDirectoriesSelectAll.Name = "btnDirectoriesSelectAll";
        btnDirectoriesSelectAll.TabIndex = 0;
        btnDirectoriesSelectAll.Text = "전체 선택";
        btnDirectoriesSelectAll.UseVisualStyleBackColor = true;
        btnDirectoriesSelectAll.Click += btnDirectoriesSelectAll_Click;
        // 
        // btnDirectoriesDeselectAll
        // 
        btnDirectoriesDeselectAll.Anchor = AnchorStyles.Left;
        btnDirectoriesDeselectAll.AutoSize = true;
        btnDirectoriesDeselectAll.Margin = new Padding(0);
        btnDirectoriesDeselectAll.Name = "btnDirectoriesDeselectAll";
        btnDirectoriesDeselectAll.TabIndex = 1;
        btnDirectoriesDeselectAll.Text = "전체 해제";
        btnDirectoriesDeselectAll.UseVisualStyleBackColor = true;
        btnDirectoriesDeselectAll.Click += btnDirectoriesDeselectAll_Click;
        // 
        // lblDirectories
        // 
        lblDirectories.Dock = DockStyle.Top;
        lblDirectories.Font = new Font("Segoe UI Semibold", 9F, FontStyle.Bold);
        lblDirectories.Location = new Point(0, 0);
        lblDirectories.Name = "lblDirectories";
        lblDirectories.Padding = new Padding(0, 0, 0, 2);
        lblDirectories.Size = new Size(320, 19);
        lblDirectories.TabIndex = 0;
        lblDirectories.Text = "하위 디렉터리";
        // 
        // btnAnalysisSettings
        // 
        btnAnalysisSettings.Dock = DockStyle.Bottom;
        btnAnalysisSettings.Location = new Point(0, 900);
        btnAnalysisSettings.Name = "btnAnalysisSettings";
        btnAnalysisSettings.Size = new Size(320, 32);
        btnAnalysisSettings.TabIndex = 2;
        btnAnalysisSettings.Text = "분석 설정...";
        btnAnalysisSettings.UseVisualStyleBackColor = true;
        btnAnalysisSettings.Click += btnAnalysisSettings_Click;
        // 
        // btnAnalyze
        // 
        btnAnalyze.Dock = DockStyle.Bottom;
        btnAnalyze.Location = new Point(0, 932);
        btnAnalyze.Name = "btnAnalyze";
        btnAnalyze.Size = new Size(320, 36);
        btnAnalyze.TabIndex = 3;
        btnAnalyze.Text = "분석 실행";
        btnAnalyze.UseVisualStyleBackColor = false;
        btnAnalyze.Click += btnAnalyze_Click;
        // 
        // AnalysisSetupPanel
        // 
        AutoScaleDimensions = new SizeF(7F, 15F);
        AutoScaleMode = AutoScaleMode.Font;
        Controls.Add(splitLists);
        Controls.Add(panelRootPath);
        Controls.Add(btnAnalysisSettings);
        Controls.Add(btnAnalyze);
        Name = "AnalysisSetupPanel";
        Size = new Size(320, 968);
        splitLists.Panel1.ResumeLayout(false);
        splitLists.Panel2.ResumeLayout(false);
        ((System.ComponentModel.ISupportInitialize)splitLists).EndInit();
        splitLists.ResumeLayout(false);
        panelRootPath.ResumeLayout(false);
        panelRootPath.PerformLayout();
        flowLanguageButtons.ResumeLayout(false);
        flowDirectoryButtons.ResumeLayout(false);
        ResumeLayout(false);
    }

    private Panel panelRootPath;
    private Label lblRootPath;
    private TextBox txtRootPath;
    private Button btnBrowseRoot;
    private SplitContainer splitLists;
    private Label lblLanguages;
    private TableLayoutPanel flowLanguageButtons;
    private Button btnLanguagesSelectAll;
    private Button btnLanguagesDeselectAll;
    private CheckedListBox checkedListLanguages;
    private Label lblDirectories;
    private TableLayoutPanel flowDirectoryButtons;
    private Button btnDirectoriesSelectAll;
    private Button btnDirectoriesDeselectAll;
    private CheckedListBox checkedListDirectories;
    private Label lblExcludeHint;
    private Button btnAnalysisSettings;
    private Button btnAnalyze;
}
