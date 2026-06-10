namespace CodeAnalyzer.Controls;

/// <summary>
/// 메인 창 왼쪽 분석 설정 영역. MainForm 디자이너 단순화를 위해 분리했습니다.
/// </summary>
public partial class AnalysisSetupPanel : UserControl
{
    private bool _suppressDirectoryListEvents;
    private bool _splitInitialized;

    public AnalysisSetupPanel()
    {
        InitializeComponent();
        checkedListDirectories.ItemCheck += (_, _) => DirectoryChecksChanged?.Invoke(this, EventArgs.Empty);
        Load += (_, _) => EnsureInitialSplit();
    }

    public CheckedListBox LanguageList => checkedListLanguages;
    public CheckedListBox DirectoryList => checkedListDirectories;
    public TextBox RootPathTextBox => txtRootPath;
    public Button AnalyzeButton => btnAnalyze;
    public Button AnalysisSettingsButton => btnAnalysisSettings;

    public event EventHandler? AnalyzeClicked;
    public event EventHandler? AnalysisSettingsClicked;
    public event EventHandler? BrowseRootClicked;
    public event EventHandler? RootPathLeave;
    public event EventHandler? DirectoryChecksChanged;

    public bool SuppressDirectoryListEvents
    {
        get => _suppressDirectoryListEvents;
        set => _suppressDirectoryListEvents = value;
    }

    public void EnsureInitialSplit()
    {
        if (_splitInitialized)
        {
            return;
        }

        var height = splitLists.Height;
        if (height <= splitLists.SplitterWidth + splitLists.Panel1MinSize + splitLists.Panel2MinSize)
        {
            return;
        }

        splitLists.SplitterDistance = (height - splitLists.SplitterWidth) / 2;
        _splitInitialized = true;
    }

    public void SetAnalyzeButtonIdle()
    {
        btnAnalyze.Text = "분석 실행";
        btnAnalyze.BackColor = Color.FromArgb(74, 108, 155);
        btnAnalyze.ForeColor = Color.White;
        btnAnalyze.UseVisualStyleBackColor = false;
        btnAnalyze.Enabled = true;
    }

    public void SetAnalyzeButtonRunning()
    {
        btnAnalyze.Text = "멈춤";
        btnAnalyze.BackColor = Color.FromArgb(192, 57, 43);
        btnAnalyze.ForeColor = Color.White;
        btnAnalyze.UseVisualStyleBackColor = false;
        btnAnalyze.Enabled = true;
    }

    public void SetAnalysisControlsEnabled(bool enabled)
    {
        btnAnalyze.Enabled = enabled;
        btnAnalysisSettings.Enabled = enabled;
    }

    private static void SetAllCheckedListItems(CheckedListBox list, bool check)
    {
        for (var i = 0; i < list.Items.Count; i++)
        {
            list.SetItemChecked(i, check);
        }
    }

    private void btnLanguagesSelectAll_Click(object sender, EventArgs e) =>
        SetAllCheckedListItems(checkedListLanguages, check: true);

    private void btnLanguagesDeselectAll_Click(object sender, EventArgs e) =>
        SetAllCheckedListItems(checkedListLanguages, check: false);

    private void btnDirectoriesSelectAll_Click(object sender, EventArgs e) =>
        SetAllDirectoryChecks(check: true);

    private void btnDirectoriesDeselectAll_Click(object sender, EventArgs e) =>
        SetAllDirectoryChecks(check: false);

    private void SetAllDirectoryChecks(bool check)
    {
        _suppressDirectoryListEvents = true;
        try
        {
            SetAllCheckedListItems(checkedListDirectories, check);
        }
        finally
        {
            _suppressDirectoryListEvents = false;
        }

        if (IsHandleCreated)
        {
            DirectoryChecksChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    private void btnBrowseRoot_Click(object sender, EventArgs e) => BrowseRootClicked?.Invoke(this, EventArgs.Empty);

    private void txtRootPath_Leave(object sender, EventArgs e) => RootPathLeave?.Invoke(this, EventArgs.Empty);

    private void btnAnalysisSettings_Click(object? sender, EventArgs e) => AnalysisSettingsClicked?.Invoke(this, EventArgs.Empty);

    private void btnAnalyze_Click(object sender, EventArgs e) => AnalyzeClicked?.Invoke(this, EventArgs.Empty);
}
