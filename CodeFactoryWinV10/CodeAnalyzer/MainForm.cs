using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer;

public partial class MainForm : Form
{
    private readonly MultiLanguageCallGraphAnalyzer _analyzer = new();
    private readonly UserSettingsService _userSettings = new();
    private CallGraphResult? _lastResult;
    private CancellationTokenSource? _analysisCts;
    private bool _isAnalysisRunning;
    private IReadOnlyList<CallGraphNode> _searchMatches = [];
    private int _searchIndex = -1;
    private string _lastSearchQuery = string.Empty;

    public MainForm()
    {
        InitializeComponent();
        InitializeOptionControls();
        LoadLanguageList();
        RestoreLastRootDirectory();
        SetAnalyzeButtonIdle();
        UpdateResultCommandsState();
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (keyData == (Keys.Control | Keys.F))
        {
            FocusSearchBox();
            return true;
        }

        if (keyData == Keys.F3)
        {
            FindNextMatch();
            return true;
        }

        if (keyData == (Keys.Shift | Keys.F3))
        {
            FindPreviousMatch();
            return true;
        }

        return base.ProcessCmdKey(ref msg, keyData);
    }

    private void FocusSearchBox()
    {
        if (!toolStripSearchBox.Enabled)
        {
            return;
        }

        menuStrip.Focus();
        toolStripSearchBox.Focus();
        toolStripSearchBox.SelectAll();
    }

    private void UpdateAnalysisProgress(int percent)
    {
        percent = Math.Clamp(percent, 0, 100);
        progressBarAnalysis.Value = percent;
        lblProgressPercent.Text = $"{percent}%";
    }

    private void InitializeOptionControls()
    {
        comboLayoutDirection.Items.AddRange(new object[]
        {
            "좌→우 (트리)",
            "위→아래 (트리)"
        });
        comboLayoutDirection.SelectedIndex = 0;

        comboLineStyle.Items.AddRange(new object[]
        {
            "직선",
            "직각 (꺾임)",
            "베지어 곡선"
        });
        comboLineStyle.SelectedIndex = 1;
    }

    private void LoadLanguageList()
    {
        checkedListLanguages.Items.Clear();

        foreach (var language in LanguageRegistry.All)
        {
            var index = checkedListLanguages.Items.Add(language);
            checkedListLanguages.SetItemChecked(index, true);
        }
    }

    private void btnBrowseRoot_Click(object sender, EventArgs e)
    {
        using var dialog = new FolderBrowserDialog
        {
            Description = "분석할 루트 디렉터리를 선택하세요.",
            UseDescriptionForTitle = true,
            SelectedPath = string.IsNullOrWhiteSpace(txtRootPath.Text) ? Environment.CurrentDirectory : txtRootPath.Text
        };

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        txtRootPath.Text = dialog.SelectedPath;
        ApplyRootDirectory(dialog.SelectedPath, saveSettings: true);
    }

    private void txtRootPath_Leave(object sender, EventArgs e)
    {
        ApplyRootDirectory(txtRootPath.Text.Trim(), saveSettings: true);
    }

    private void RestoreLastRootDirectory()
    {
        var lastRootDirectory = _userSettings.LoadLastRootDirectory();
        if (string.IsNullOrWhiteSpace(lastRootDirectory))
        {
            return;
        }

        txtRootPath.Text = lastRootDirectory;
        ApplyRootDirectory(lastRootDirectory, saveSettings: false);
    }

    private void ApplyRootDirectory(string rootPath, bool saveSettings)
    {
        if (!Directory.Exists(rootPath))
        {
            return;
        }

        txtRootPath.Text = rootPath;
        LoadDirectoryList(rootPath);

        if (saveSettings)
        {
            _userSettings.SaveLastRootDirectory(rootPath);
        }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (_analysisCts is not null && !_analysisCts.IsCancellationRequested)
        {
            _analysisCts.Cancel();
        }

        ApplyRootDirectory(txtRootPath.Text.Trim(), saveSettings: true);
        base.OnFormClosing(e);
    }

    private void LoadDirectoryList(string rootPath)
    {
        checkedListDirectories.Items.Clear();

        foreach (var directory in DirectoryScanService.ScanSubdirectories(rootPath))
        {
            var index = checkedListDirectories.Items.Add(directory);
            if (DirectoryScanService.ShouldExcludeByDefault(directory))
            {
                checkedListDirectories.SetItemChecked(index, true);
            }
        }
    }

    private IEnumerable<string> GetSelectedLanguageIds()
    {
        foreach (ProgrammingLanguage language in checkedListLanguages.CheckedItems)
        {
            yield return language.Id;
        }
    }

    private async void btnAnalyze_Click(object sender, EventArgs e)
    {
        if (_isAnalysisRunning)
        {
            RequestStopAnalysis();
            return;
        }

        var rootPath = txtRootPath.Text.Trim();
        if (!Directory.Exists(rootPath))
        {
            MessageBox.Show(this, "유효한 디렉터리를 선택하세요.", "분석", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        var enabledLanguages = GetSelectedLanguageIds().ToList();
        if (enabledLanguages.Count == 0)
        {
            MessageBox.Show(this, "분석할 프로그래밍 언어를 하나 이상 선택하세요.", "분석", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _analysisCts = new CancellationTokenSource();

        BeginAnalysisSession();

        var uiProgress = new Progress<AnalysisProgressReport>(report =>
        {
            UpdateAnalysisProgress(report.Percent);
            lblStatus.Text = AnalysisProgressFormatter.FormatStatus(report);
        });
        var progress = new ThrottledProgress<AnalysisProgressReport>(uiProgress, intervalMs: 100);

        try
        {
            var excluded = checkedListDirectories.CheckedItems.Cast<string>().ToList();

            // Start analysis entirely on a worker thread so sync work and async continuations
            // never capture the WinForms synchronization context.
            var (result, fileCount, directoryCount) = await Task.Run(
                async () => await _analyzer.AnalyzeAsync(
                    rootPath,
                    excluded,
                    enabledLanguages,
                    progress,
                    _analysisCts.Token).ConfigureAwait(false),
                _analysisCts.Token).ConfigureAwait(true);

            _lastResult = result;
            PopulateRootMethodList(_lastResult);
            _userSettings.SaveLastRootDirectory(rootPath);
            UpdateAnalysisProgress(100);
            lblStatus.Text = $"분석 완료: {directoryCount}개 폴더, {fileCount}개 파일, 함수 {result.Nodes.Count}개, 호출 {result.Edges.Count}개";
        }
        catch (OperationCanceledException)
        {
            ClearAnalysisResults();
            lblStatus.Text = "분석이 취소되었습니다.";
        }
        catch (Exception ex)
        {
            ClearAnalysisResults();
            lblStatus.Text = "분석 실패";
            MessageBox.Show(this, ex.Message, "분석 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            EndAnalysisSession();
        }
    }

    private void RequestStopAnalysis()
    {
        if (_analysisCts is null || _analysisCts.IsCancellationRequested)
        {
            return;
        }

        btnAnalyze.Enabled = false;
        lblStatus.Text = "분석 중지 요청 중...";
        _analysisCts.Cancel();
    }

    private void BeginAnalysisSession()
    {
        _isAnalysisRunning = true;
        _lastResult = null;
        ClearSearchState();
        comboRootMethod.Items.Clear();
        comboRootMethod.SelectedIndex = -1;
        callGraphViewer.BeginAnalysis();

        SetAnalyzeButtonRunning();
        SetToolbarEnabled(false);
        ResetAnalysisProgress(isActive: true);
        lblStatus.Text = "백그라운드에서 분석 중...";
    }

    private void EndAnalysisSession()
    {
        _isAnalysisRunning = false;
        callGraphViewer.EndAnalysis();
        SetAnalyzeButtonIdle();
        SetToolbarEnabled(true);
        ResetAnalysisProgress(isActive: false);
    }

    private void SetAnalyzeButtonIdle()
    {
        btnAnalyze.Text = "분석 실행";
        btnAnalyze.BackColor = Color.FromArgb(74, 108, 155);
        btnAnalyze.ForeColor = Color.White;
        btnAnalyze.UseVisualStyleBackColor = false;
        btnAnalyze.Enabled = true;
    }

    private void SetAnalyzeButtonRunning()
    {
        btnAnalyze.Text = "멈춤";
        btnAnalyze.BackColor = Color.FromArgb(192, 57, 43);
        btnAnalyze.ForeColor = Color.White;
        btnAnalyze.UseVisualStyleBackColor = false;
        btnAnalyze.Enabled = true;
    }

    private void ClearAnalysisResults()
    {
        _lastResult = null;
        ClearSearchState();
        comboRootMethod.Items.Clear();
        comboRootMethod.SelectedIndex = -1;
        callGraphViewer.SetGraph(null, Array.Empty<string>());
    }

    private void SetToolbarEnabled(bool enabled)
    {
        comboRootMethod.Enabled = enabled;
        comboLayoutDirection.Enabled = enabled;
        comboLineStyle.Enabled = enabled;
        btnExpandAll.Enabled = enabled;
        btnCollapseAll.Enabled = enabled;
    }

    private void ResetAnalysisProgress(bool isActive)
    {
        progressBarAnalysis.Visible = isActive;
        lblProgressPercent.Visible = isActive;

        if (isActive)
        {
            UpdateAnalysisProgress(0);
        }
    }

    private void PopulateRootMethodList(CallGraphResult result)
    {
        comboRootMethod.Items.Clear();

        comboRootMethod.Items.Add(RootMethodItem.AutoEntryPoints);

        var candidates = result.Nodes
            .OrderBy(node => node.FullName, StringComparer.OrdinalIgnoreCase)
            .Select(node => RootMethodItem.FromNode(node))
            .ToList();

        foreach (var candidate in candidates)
        {
            comboRootMethod.Items.Add(candidate);
        }

        if (candidates.Count == 0)
        {
            callGraphViewer.SetGraph(null, Array.Empty<string>());
            return;
        }

        comboRootMethod.SelectedItem = RootMethodItem.AutoEntryPoints;
        ApplyRootMethodSelection();
        UpdateResultCommandsState();
    }

    private void comboRootMethod_SelectedIndexChanged(object sender, EventArgs e)
    {
        ApplyRootMethodSelection();
    }

    private void ApplyRootMethodSelection()
    {
        if (_lastResult is null)
        {
            return;
        }

        if (comboRootMethod.SelectedItem is not RootMethodItem item)
        {
            return;
        }

        if (item.IsAutoEntryPoints)
        {
            var entryPoints = CallGraphEntryPointResolver.FindEntryPoints(_lastResult);
            if (entryPoints.Count > 0)
            {
                callGraphViewer.SetGraph(_lastResult, entryPoints.Select(node => node.Id).ToList());
            }
            else
            {
                var fallback = CallGraphEntryPointResolver.FindFallbackRoot(_lastResult);
                callGraphViewer.SetGraph(_lastResult, fallback?.Id);
            }
        }
        else if (item.Node is not null)
        {
            callGraphViewer.SetGraph(_lastResult, item.Node.Id);
        }

        ApplySearchHighlightToViewer();
    }

    private void comboLayoutDirection_SelectedIndexChanged(object sender, EventArgs e)
    {
        callGraphViewer.LayoutDirection = comboLayoutDirection.SelectedIndex switch
        {
            1 => GraphLayoutDirection.TopToBottom,
            _ => GraphLayoutDirection.LeftToRight
        };
    }

    private void comboLineStyle_SelectedIndexChanged(object sender, EventArgs e)
    {
        callGraphViewer.LineStyle = comboLineStyle.SelectedIndex switch
        {
            0 => ConnectionLineStyle.Straight,
            2 => ConnectionLineStyle.Bezier,
            _ => ConnectionLineStyle.Orthogonal
        };
    }

    private void btnExpandAll_Click(object sender, EventArgs e)
    {
        callGraphViewer.ExpandAll();
    }

    private void btnCollapseAll_Click(object sender, EventArgs e)
    {
        callGraphViewer.CollapseAll();
    }

    private void menuSave_Click(object sender, EventArgs e)
    {
        SaveAnalysisResult();
    }

    private void SaveAnalysisResult()
    {
        if (_lastResult is null || _lastResult.Nodes.Count == 0)
        {
            MessageBox.Show(this, "저장할 분석 결과가 없습니다.", "결과 저장", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dialog = new SaveFileDialog
        {
            Title = "분석 결과 저장",
            Filter = "JSON 파일 (*.json)|*.json|모든 파일 (*.*)|*.*",
            DefaultExt = "json",
            FileName = $"CallGraph_{DateTime.Now:yyyyMMdd_HHmmss}.json"
        };

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        try
        {
            CallGraphExportService.SaveToFile(_lastResult, txtRootPath.Text.Trim(), dialog.FileName);
            lblStatus.Text = $"결과 저장 완료: {dialog.FileName}";
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "결과 저장 오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void toolStripSearchBox_TextChanged(object sender, EventArgs e)
    {
        ExecuteSearch(resetIndex: true);
    }

    private void toolStripSearchBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Enter)
        {
            if (e.Shift)
            {
                FindPreviousMatch();
            }
            else
            {
                FindNextMatch();
            }

            e.Handled = true;
            e.SuppressKeyPress = true;
        }
    }

    private void toolStripFindNext_Click(object sender, EventArgs e)
    {
        FindNextMatch();
    }

    private void toolStripFindPrevious_Click(object sender, EventArgs e)
    {
        FindPreviousMatch();
    }

    private void ExecuteSearch(bool resetIndex)
    {
        if (_lastResult is null)
        {
            return;
        }

        var query = toolStripSearchBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(query))
        {
            ClearSearchState(clearQuery: false);
            return;
        }

        if (!resetIndex && string.Equals(query, _lastSearchQuery, StringComparison.OrdinalIgnoreCase) && _searchMatches.Count > 0)
        {
            return;
        }

        _lastSearchQuery = query;
        _searchMatches = CallGraphNodeSearch.FindNodes(_lastResult, query);
        _searchIndex = _searchMatches.Count > 0 ? 0 : -1;

        if (_searchMatches.Count == 0)
        {
            callGraphViewer.ClearSearchHighlight();
            toolStripFindNext.Enabled = false;
            toolStripFindPrevious.Enabled = false;
            lblStatus.Text = $"'{query}' 검색 결과 없음";
            return;
        }

        toolStripFindNext.Enabled = true;
        toolStripFindPrevious.Enabled = true;
        NavigateToCurrentSearchMatch();
    }

    private void FindNextMatch()
    {
        if (_lastResult is null || !toolStripSearchBox.Enabled)
        {
            return;
        }

        if (_searchMatches.Count == 0 || !string.Equals(toolStripSearchBox.Text.Trim(), _lastSearchQuery, StringComparison.OrdinalIgnoreCase))
        {
            ExecuteSearch(resetIndex: true);
            if (_searchMatches.Count == 0)
            {
                return;
            }
        }

        _searchIndex = (_searchIndex + 1) % _searchMatches.Count;
        NavigateToCurrentSearchMatch();
    }

    private void FindPreviousMatch()
    {
        if (_lastResult is null || !toolStripSearchBox.Enabled)
        {
            return;
        }

        if (_searchMatches.Count == 0 || !string.Equals(toolStripSearchBox.Text.Trim(), _lastSearchQuery, StringComparison.OrdinalIgnoreCase))
        {
            ExecuteSearch(resetIndex: true);
            if (_searchMatches.Count == 0)
            {
                return;
            }
        }

        _searchIndex = (_searchIndex - 1 + _searchMatches.Count) % _searchMatches.Count;
        NavigateToCurrentSearchMatch();
    }

    private void NavigateToCurrentSearchMatch()
    {
        if (_searchIndex < 0 || _searchIndex >= _searchMatches.Count)
        {
            return;
        }

        var node = _searchMatches[_searchIndex];
        FocusSearchNode(node.Id);
        ApplySearchHighlightToViewer();

        var status = $"{_searchIndex + 1} / {_searchMatches.Count} — {node.FullName}";
        lblStatus.Text = $"찾기: {status}";
    }

    private void FocusSearchNode(string nodeId)
    {
        if (_lastResult is null)
        {
            return;
        }

        if (callGraphViewer.TryFocusNode(nodeId))
        {
            return;
        }

        foreach (RootMethodItem item in comboRootMethod.Items)
        {
            if (item.IsAutoEntryPoints || item.Node is null)
            {
                continue;
            }

            if (!string.Equals(item.Node.Id, nodeId, StringComparison.Ordinal))
            {
                continue;
            }

            comboRootMethod.SelectedItem = item;
            callGraphViewer.TryFocusNode(nodeId);
            return;
        }
    }

    private void ApplySearchHighlightToViewer()
    {
        if (_searchMatches.Count == 0 || _searchIndex < 0)
        {
            callGraphViewer.ClearSearchHighlight();
            return;
        }

        var matchIds = _searchMatches.Select(node => node.Id);
        var currentId = _searchMatches[_searchIndex].Id;
        callGraphViewer.SetSearchHighlight(matchIds, currentId);
    }

    private void ClearSearchState(bool clearQuery = true)
    {
        _searchMatches = [];
        _searchIndex = -1;
        _lastSearchQuery = string.Empty;
        callGraphViewer.ClearSearchHighlight();
        toolStripFindNext.Enabled = false;
        toolStripFindPrevious.Enabled = false;

        if (clearQuery)
        {
            toolStripSearchBox.Text = string.Empty;
        }

        UpdateResultCommandsState();
    }

    private void UpdateResultCommandsState()
    {
        var hasGraph = _lastResult is not null && _lastResult.Nodes.Count > 0;
        menuSave.Enabled = hasGraph;
        toolStripSearchBox.Enabled = hasGraph;

        if (!hasGraph)
        {
            toolStripFindNext.Enabled = false;
            toolStripFindPrevious.Enabled = false;
        }
    }

    private sealed class RootMethodItem
    {
        public static RootMethodItem AutoEntryPoints { get; } = new() { IsAutoEntryPoints = true };

        public bool IsAutoEntryPoints { get; init; }
        public CallGraphNode? Node { get; init; }

        public static RootMethodItem FromNode(CallGraphNode node) => new() { Node = node };

        public override string ToString() =>
            IsAutoEntryPoints ? "[자동] 언어별 진입점" : Node!.FullName;
    }
}
