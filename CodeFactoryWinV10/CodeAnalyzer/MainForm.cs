using CodeAnalyzer.Controls;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer;

public partial class MainForm : Form
{
    private readonly MultiLanguageCallGraphAnalyzer _analyzer = new();
    private readonly UserSettingsService _userSettings = new();
    private AnalysisResult? _lastAnalysis;
    private CancellationTokenSource? _analysisCts;
    private bool _isAnalysisRunning;
    private bool _isStoppingAnalysis;
    private readonly List<RootSelection> _rootHistory = new();
    private int _rootHistoryIndex = -1;
    private bool _suppressRootHistory;
    private IReadOnlyList<SearchResultItem> _searchResults = [];
    private int _searchIndex = -1;
    private string _lastSearchQuery = string.Empty;
    private readonly SearchResultsPopup _searchPopup;
    private bool _suppressRootComboChange;

    public MainForm()
    {
        InitializeComponent();
        _searchPopup = new SearchResultsPopup();
        _searchPopup.ResultSelected += SearchPopup_ResultSelected;
        Load += (_, _) =>
        {
            _searchPopup.Owner = this;
            HookClickOutsideToHideSearch(this);
        };
        diagramViewHost.CallGraphRootChanged += OnCallGraphRootChanged;
        diagramViewHost.FileRootChanged += OnFileRootChanged;
        diagramViewHost.DirectoryRootChanged += OnDirectoryRootChanged;
        InitializeOptionControls();
        LoadLanguageList();
        RestoreLastRootDirectory();
        SetAnalyzeButtonIdle();
        UpdateResultCommandsState();
        UpdateToolbarForViewKind();
        UpdateRootHistoryNavigationState();
    }

    protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
    {
        if (keyData == (Keys.Alt | Keys.Left))
        {
            if (TryGoBackRootSelection())
            {
                return true;
            }
        }

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
        comboDiagramView.Items.AddRange(new object[]
        {
            "호출 그래프",
            "클래스 다이어그램",
            "시퀀스 다이어그램",
            "데이터 흐름도",
            "상속 구조",
            "파일 호출 관계",
            "디렉터리 호출 관계"
        });
        comboDiagramView.SelectedIndex = 0;

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

    private DiagramViewKind GetSelectedViewKind() =>
        comboDiagramView.SelectedIndex switch
        {
            1 => DiagramViewKind.ClassDiagram,
            2 => DiagramViewKind.SequenceDiagram,
            3 => DiagramViewKind.DataFlow,
            4 => DiagramViewKind.Inheritance,
            5 => DiagramViewKind.FileRelations,
            6 => DiagramViewKind.DirectoryRelations,
            _ => DiagramViewKind.CallGraph
        };

    private bool IsClassStructureView() =>
        GetSelectedViewKind() is DiagramViewKind.ClassDiagram or DiagramViewKind.Inheritance;

    private CallGraphViewer CallGraphViewer => diagramViewHost.CallGraphViewer;

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
            await RequestStopAnalysisAsync().ConfigureAwait(true);
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
        var cts = _analysisCts;

        BeginAnalysisSession();

        var uiProgress = new Progress<AnalysisProgressReport>(report =>
        {
            if (cts.IsCancellationRequested || _isStoppingAnalysis)
            {
                return;
            }

            UpdateAnalysisProgress(report.Percent);
            lblStatus.Text = AnalysisProgressFormatter.FormatStatus(report);
        });
        var progress = new ThrottledProgress<AnalysisProgressReport>(uiProgress, intervalMs: 100);

        try
        {
            var excluded = checkedListDirectories.CheckedItems.Cast<string>().ToList();

            var (result, fileCount, directoryCount) = await Task.Run(
                async () => await _analyzer.AnalyzeAsync(
                    rootPath,
                    excluded,
                    enabledLanguages,
                    progress,
                    cts.Token).ConfigureAwait(false),
                cts.Token).ConfigureAwait(true);

            if (cts.IsCancellationRequested)
            {
                throw new OperationCanceledException(cts.Token);
            }

            _lastAnalysis = result;
            PopulateRootMethodList(_lastAnalysis.CallGraph);
            _userSettings.SaveLastRootDirectory(rootPath);
            UpdateAnalysisProgress(100);
            lblStatus.Text =
                $"분석 완료: {directoryCount}개 폴더, {fileCount}개 파일, " +
                $"함수 {result.CallGraph.Nodes.Count}개, 호출 {result.CallGraph.Edges.Count}개, " +
                $"파일 연관 {result.FileRelations.Edges.Count}개, 디렉터리 연관 {result.DirectoryRelations.Edges.Count}개, 타입 {result.Structure.Types.Count}개";
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
            ShowDetailedErrorDialog("분석 오류", ex, "분석 중 오류가 발생했습니다.");
        }
        finally
        {
            EndAnalysisSession();
            _analysisCts?.Dispose();
            _analysisCts = null;
        }
    }

    private Task RequestStopAnalysisAsync()
    {
        if (_analysisCts is null || _analysisCts.IsCancellationRequested || _isStoppingAnalysis)
        {
            return Task.CompletedTask;
        }

        _isStoppingAnalysis = true;
        UseWaitCursor = false;
        btnAnalyze.Enabled = false;
        lblStatus.Text = "분석 중지 요청됨... 현재 작업 정리 후 종료합니다.";

        try
        {
            // CancelAsync는 등록된 콜백 완료까지 기다리므로, UI 입장에서는 중지 체감이 늦어질 수 있습니다.
            // 즉시 취소 신호만 전파하고 반환합니다.
            _analysisCts.Cancel();
        }
        catch (ObjectDisposedException)
        {
            // 종료 타이밍 경합 시 무시
        }

        // EndAnalysisSession()가 호출될 때까지 stopping 상태를 유지해
        // 진행 갱신/추가 입력을 최소화합니다.
        if (_isAnalysisRunning)
        {
            btnAnalyze.Enabled = false;
        }

        return Task.CompletedTask;
    }

    private void BeginAnalysisSession()
    {
        UseWaitCursor = true;
        _isAnalysisRunning = true;
        _isStoppingAnalysis = false;
        _lastAnalysis = null;
        ClearSearchState();
        comboRootMethod.Items.Clear();
        comboRootMethod.SelectedIndex = -1;
        diagramViewHost.BeginAnalysis();

        SetAnalyzeButtonRunning();
        SetToolbarEnabled(false);
        ResetAnalysisProgress(isActive: true);
        lblStatus.Text = "백그라운드에서 분석 중...";
        UpdateRootHistoryNavigationState();
    }

    private void EndAnalysisSession()
    {
        UseWaitCursor = false;
        _isAnalysisRunning = false;
        _isStoppingAnalysis = false;
        diagramViewHost.EndAnalysis();
        SetAnalyzeButtonIdle();
        SetToolbarEnabled(true);
        ResetAnalysisProgress(isActive: false);
        UpdateToolbarForViewKind();
        UpdateRootHistoryNavigationState();
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
        _lastAnalysis = null;
        _rootHistory.Clear();
        _rootHistoryIndex = -1;
        ClearSearchState();
        comboRootMethod.Items.Clear();
        comboRootMethod.SelectedIndex = -1;
        diagramViewHost.SetAnalysis(null, Array.Empty<string>());
        UpdateRootHistoryNavigationState();
    }

    private void SetToolbarEnabled(bool enabled)
    {
        comboDiagramView.Enabled = enabled;
        comboRootMethod.Enabled = enabled;
        UpdateToolbarForViewKind();
    }

    private void UpdateToolbarForViewKind()
    {
        if (_isAnalysisRunning)
        {
            comboLayoutDirection.Enabled = false;
            comboLineStyle.Enabled = false;
            btnExpandAll.Enabled = false;
            btnCollapseAll.Enabled = false;
            comboRootMethod.Enabled = false;
            return;
        }

        var viewKind = GetSelectedViewKind();
        var isCallGraph = viewKind == DiagramViewKind.CallGraph;
        var supportsLineStyle = true;
        var needsRoot = viewKind is DiagramViewKind.CallGraph
            or DiagramViewKind.SequenceDiagram
            or DiagramViewKind.DataFlow
            or DiagramViewKind.FileRelations
            or DiagramViewKind.DirectoryRelations;

        // 레이아웃 방향 선택은 다른 뷰(예: 클래스/상속)에서도 사용자가 미리 고를 수 있어야 합니다.
        // 실제로 방향을 반영하는 뷰는 StructureDiagramViewer/CallGraphViewer 내부에서 처리합니다.
        comboLayoutDirection.Enabled = true;
        comboLineStyle.Enabled = supportsLineStyle;
        btnExpandAll.Enabled = isCallGraph;
        btnCollapseAll.Enabled = isCallGraph;
        comboRootMethod.Enabled = needsRoot && _lastAnalysis is not null;
        lblRootMethod.Enabled = needsRoot;
        btnBackView.Enabled = !_isAnalysisRunning && _rootHistoryIndex > 0;
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
            diagramViewHost.SetAnalysis(_lastAnalysis, Array.Empty<string>());
            return;
        }

        comboRootMethod.SelectedItem = RootMethodItem.AutoEntryPoints;
        ApplyRootMethodSelection();
        UpdateResultCommandsState();
    }

    private void comboDiagramView_SelectedIndexChanged(object sender, EventArgs e)
    {
        diagramViewHost.ViewKind = GetSelectedViewKind();
        UpdateToolbarForViewKind();
        ApplyRootMethodSelection();
        ApplySearchHighlightToViewer();
    }

    private void comboRootMethod_SelectedIndexChanged(object sender, EventArgs e)
    {
        if (_suppressRootComboChange)
        {
            return;
        }

        ApplyRootMethodSelection();
    }

    private void OnDirectoryRootChanged(DirectoryRelationNode directory)
    {
        if (_lastAnalysis is null)
        {
            return;
        }

        if (GetSelectedViewKind() != DiagramViewKind.DirectoryRelations)
        {
            comboDiagramView.SelectedIndex = 6;
        }

        lblStatus.Text =
            $"디렉터리 기준: {directory.FullName} — 이 디렉터리에서 호출되는 관계 표시 (디렉터리 클릭으로 기준 변경)";

        RecordRootSelection(
            viewKind: DiagramViewKind.DirectoryRelations,
            rootMethod: GetCurrentRootMethodSelection(),
            fileIdOverride: null,
            directoryIdOverride: directory.Id);
    }

    private void OnCallGraphRootChanged(CallGraphNode node)
    {
        if (_suppressRootComboChange || _lastAnalysis is null)
        {
            return;
        }

        _suppressRootComboChange = true;
        try
        {
            foreach (RootMethodItem item in comboRootMethod.Items)
            {
                if (item.Node is not null && string.Equals(item.Node.Id, node.Id, StringComparison.Ordinal))
                {
                    comboRootMethod.SelectedItem = item;
                    break;
                }
            }

            lblStatus.Text = $"호출 기준: {node.FullName} (노드 클릭 시 이 함수부터 표시)";

            RecordRootSelection(
                viewKind: GetSelectedViewKind(),
                rootMethod: GetCurrentRootMethodSelection(),
                fileIdOverride: null,
                directoryIdOverride: null);
        }
        finally
        {
            _suppressRootComboChange = false;
        }
    }

    private void OnFileRootChanged(FileRelationNode file)
    {
        if (_lastAnalysis is null)
        {
            return;
        }

        if (GetSelectedViewKind() != DiagramViewKind.FileRelations)
        {
            comboDiagramView.SelectedIndex = 5;
        }

        lblStatus.Text = $"파일 기준: {file.FullName} — 이 파일에서 호출되는 관계 표시 (파일 클릭으로 기준 변경)";

        RecordRootSelection(
            viewKind: DiagramViewKind.FileRelations,
            rootMethod: GetCurrentRootMethodSelection(),
            fileIdOverride: file.Id,
            directoryIdOverride: null);
    }

    private readonly record struct RootMethodSelection(bool IsAutoEntryPoints, string? NodeId);

    private readonly record struct RootSelection(
        DiagramViewKind ViewKind,
        RootMethodSelection RootMethod,
        string? FileIdOverride,
        string? DirectoryIdOverride);

    private RootMethodSelection GetCurrentRootMethodSelection()
    {
        if (comboRootMethod.SelectedItem is RootMethodItem item)
        {
            return new RootMethodSelection(item.IsAutoEntryPoints, item.Node?.Id);
        }

        // Fallback: should not happen after analysis, but keep it safe.
        return new RootMethodSelection(true, null);
    }

    private void RecordCurrentRootSelectionBaseline()
    {
        if (_suppressRootHistory || _lastAnalysis is null)
        {
            return;
        }

        RecordRootSelection(
            viewKind: GetSelectedViewKind(),
            rootMethod: GetCurrentRootMethodSelection(),
            fileIdOverride: null,
            directoryIdOverride: null);
    }

    private void RecordRootSelection(
        DiagramViewKind viewKind,
        RootMethodSelection rootMethod,
        string? fileIdOverride,
        string? directoryIdOverride)
    {
        if (_suppressRootHistory || _lastAnalysis is null)
        {
            return;
        }

        var selection = new RootSelection(viewKind, rootMethod, fileIdOverride, directoryIdOverride);

        if (_rootHistoryIndex >= 0
            && _rootHistoryIndex < _rootHistory.Count
            && selection.Equals(_rootHistory[_rootHistoryIndex]))
        {
            return;
        }

        // If user went back, truncate the forward history.
        if (_rootHistoryIndex < _rootHistory.Count - 1 && _rootHistoryIndex >= 0)
        {
            _rootHistory.RemoveRange(_rootHistoryIndex + 1, _rootHistory.Count - _rootHistoryIndex - 1);
        }

        _rootHistory.Add(selection);
        _rootHistoryIndex = _rootHistory.Count - 1;
        UpdateRootHistoryNavigationState();
    }

    private bool TryGoBackRootSelection()
    {
        if (_lastAnalysis is null)
        {
            return false;
        }

        if (_rootHistoryIndex <= 0)
        {
            return false;
        }

        var target = _rootHistory[_rootHistoryIndex - 1];
        _rootHistoryIndex--;
        UpdateRootHistoryNavigationState();
        ApplyRootSelection(target);
        return true;
    }

    private void UpdateRootHistoryNavigationState()
    {
        if (btnBackView is null)
        {
            return;
        }

        btnBackView.Enabled = !_isAnalysisRunning && _rootHistoryIndex > 0;
    }

    private void ApplyRootSelection(RootSelection selection)
    {
        if (_lastAnalysis is null)
        {
            return;
        }

        _suppressRootHistory = true;
        _suppressRootComboChange = true;

        try
        {
            // 1) restore root method (comboRootMethod)
            if (selection.RootMethod.IsAutoEntryPoints)
            {
                comboRootMethod.SelectedItem = RootMethodItem.AutoEntryPoints;
            }
            else if (!string.IsNullOrWhiteSpace(selection.RootMethod.NodeId))
            {
                foreach (RootMethodItem item in comboRootMethod.Items)
                {
                    if (item.Node is not null && string.Equals(item.Node.Id, selection.RootMethod.NodeId, StringComparison.Ordinal))
                    {
                        comboRootMethod.SelectedItem = item;
                        break;
                    }
                }
            }

            // 2) restore view kind (comboDiagramView + host)
            comboDiagramView.SelectedIndex = selection.ViewKind switch
            {
                DiagramViewKind.CallGraph => 0,
                DiagramViewKind.ClassDiagram => 1,
                DiagramViewKind.SequenceDiagram => 2,
                DiagramViewKind.DataFlow => 3,
                DiagramViewKind.Inheritance => 4,
                DiagramViewKind.FileRelations => 5,
                DiagramViewKind.DirectoryRelations => 6,
                _ => 0
            };

            // 3) apply root method selection (clears file/directory overrides)
            ApplyRootMethodSelection();

            // 4) re-apply overrides if needed
            if (selection.ViewKind == DiagramViewKind.FileRelations && !string.IsNullOrWhiteSpace(selection.FileIdOverride))
            {
                diagramViewHost.TryFocusNode(selection.FileIdOverride);
            }
            else if (selection.ViewKind == DiagramViewKind.DirectoryRelations && !string.IsNullOrWhiteSpace(selection.DirectoryIdOverride))
            {
                diagramViewHost.TryFocusNode(selection.DirectoryIdOverride);
            }

            lblStatus.Text = "이전 보기로 되돌렸습니다.";
        }
        finally
        {
            _suppressRootComboChange = false;
            _suppressRootHistory = false;
            UpdateRootHistoryNavigationState();
        }
    }

    private IReadOnlyList<string> ResolveRootNodeIds()
    {
        if (_lastAnalysis is null)
        {
            return [];
        }

        if (comboRootMethod.SelectedItem is not RootMethodItem item)
        {
            return [];
        }

        if (item.IsAutoEntryPoints)
        {
            var entryPoints = CallGraphEntryPointResolver.FindEntryPoints(_lastAnalysis.CallGraph);
            if (entryPoints.Count > 0)
            {
                return entryPoints.Select(node => node.Id).ToList();
            }

            var fallback = CallGraphEntryPointResolver.FindFallbackRoot(_lastAnalysis.CallGraph);
            return fallback is null ? [] : [fallback.Id];
        }

        return item.Node is null ? [] : [item.Node.Id];
    }

    private void ApplyRootMethodSelection()
    {
        if (_lastAnalysis is null)
        {
            return;
        }

        var rootIds = ResolveRootNodeIds();
        diagramViewHost.ViewKind = GetSelectedViewKind();
        diagramViewHost.SetAnalysis(_lastAnalysis, rootIds);
        ApplySearchHighlightToViewer();

        RecordCurrentRootSelectionBaseline();
    }

    private void comboLayoutDirection_SelectedIndexChanged(object sender, EventArgs e)
    {
        diagramViewHost.LayoutDirection = comboLayoutDirection.SelectedIndex switch
        {
            1 => GraphLayoutDirection.TopToBottom,
            _ => GraphLayoutDirection.LeftToRight
        };
    }

    private void comboLineStyle_SelectedIndexChanged(object sender, EventArgs e)
    {
        diagramViewHost.LineStyle = comboLineStyle.SelectedIndex switch
        {
            0 => ConnectionLineStyle.Straight,
            2 => ConnectionLineStyle.Bezier,
            _ => ConnectionLineStyle.Orthogonal
        };
    }

    private void btnExpandAll_Click(object sender, EventArgs e)
    {
        CallGraphViewer.ExpandAll();
    }

    private void btnCollapseAll_Click(object sender, EventArgs e)
    {
        CallGraphViewer.CollapseAll();
    }

    private void btnBackView_Click(object sender, EventArgs e)
    {
        if (!TryGoBackRootSelection())
        {
            lblStatus.Text = "되돌릴 이전 보기가 없습니다.";
        }
    }

    private void menuSave_Click(object sender, EventArgs e)
    {
        SaveAnalysisResult();
    }

    private void menuOpen_Click(object sender, EventArgs e)
    {
        LoadAnalysisResult();
    }

    private void SaveAnalysisResult()
    {
        if (_lastAnalysis is null || _lastAnalysis.CallGraph.Nodes.Count == 0)
        {
            MessageBox.Show(this, "저장할 분석 결과가 없습니다.", "결과 저장", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dialog = new SaveFileDialog
        {
            Title = "분석 결과 저장",
            Filter = "JSON 파일 (*.json)|*.json|모든 파일 (*.*)|*.*",
            DefaultExt = "json",
            FileName = $"CodeAnalyzer_{DateTime.Now:yyyyMMdd_HHmmss}.json"
        };

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        try
        {
            CallGraphExportService.SaveToFile(_lastAnalysis, txtRootPath.Text.Trim(), dialog.FileName);
            lblStatus.Text = $"결과 저장 완료: {dialog.FileName}";
        }
        catch (Exception ex)
        {
            ShowDetailedErrorDialog("결과 저장 오류", ex, "분석 결과 저장 중 오류가 발생했습니다.");
        }
    }

    private void LoadAnalysisResult()
    {
        if (_isAnalysisRunning)
        {
            MessageBox.Show(this, "분석이 실행 중입니다. 완료 후 불러오기를 시도하세요.", "결과 불러오기", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        using var dialog = new OpenFileDialog
        {
            Title = "분석 결과 불러오기",
            Filter = "JSON 파일 (*.json)|*.json|모든 파일 (*.*)|*.*",
            DefaultExt = "json"
        };

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        try
        {
            var (analysis, rootDirectory) = CallGraphExportService.LoadFromFile(dialog.FileName);

            ClearAnalysisResults();

            _lastAnalysis = analysis;
            if (!string.IsNullOrWhiteSpace(rootDirectory))
            {
                txtRootPath.Text = rootDirectory;
            }

            PopulateRootMethodList(_lastAnalysis.CallGraph);

            lblStatus.Text =
                $"결과 불러오기 완료: 함수 {analysis.CallGraph.Nodes.Count}개, " +
                $"호출 {analysis.CallGraph.Edges.Count}개, " +
                $"파일 {analysis.FileRelations.Files.Count}개, " +
                $"타입 {analysis.Structure.Types.Count}개";
        }
        catch (Exception ex)
        {
            ShowDetailedErrorDialog("결과 불러오기 오류", ex, "분석 결과 불러오기 중 오류가 발생했습니다.");
        }
    }

    private void ShowDetailedErrorDialog(string title, Exception exception, string summaryMessage)
    {
        using var dialog = new Form
        {
            Text = title,
            StartPosition = FormStartPosition.CenterParent,
            ClientSize = new Size(900, 560),
            MinimumSize = new Size(760, 420),
            FormBorderStyle = FormBorderStyle.Sizable,
            MaximizeBox = true,
            MinimizeBox = false,
            ShowInTaskbar = false
        };

        var summaryLabel = new Label
        {
            Dock = DockStyle.Top,
            Height = 56,
            Padding = new Padding(12, 12, 12, 8),
            AutoEllipsis = true,
            Text = summaryMessage
        };

        var detailBox = new TextBox
        {
            Dock = DockStyle.Fill,
            Multiline = true,
            ScrollBars = ScrollBars.Both,
            ReadOnly = true,
            WordWrap = false,
            Font = new Font("Consolas", 9f),
            Text = BuildErrorDetails(exception)
        };

        var buttonPanel = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            FlowDirection = FlowDirection.RightToLeft,
            AutoSize = true,
            Padding = new Padding(8)
        };

        var closeButton = new Button
        {
            Text = "닫기",
            AutoSize = true,
            Margin = new Padding(6)
        };
        closeButton.Click += (_, _) => dialog.Close();

        var copyButton = new Button
        {
            Text = "오류 내용 복사",
            AutoSize = true,
            Margin = new Padding(6)
        };
        copyButton.Click += (_, _) =>
        {
            try
            {
                Clipboard.SetText(detailBox.Text);
                lblStatus.Text = "오류 내용을 클립보드에 복사했습니다.";
            }
            catch (Exception clipboardEx)
            {
                MessageBox.Show(
                    dialog,
                    $"클립보드 복사 실패: {clipboardEx.Message}",
                    "복사 오류",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
        };

        buttonPanel.Controls.Add(closeButton);
        buttonPanel.Controls.Add(copyButton);

        dialog.Controls.Add(detailBox);
        dialog.Controls.Add(summaryLabel);
        dialog.Controls.Add(buttonPanel);
        dialog.AcceptButton = closeButton;
        dialog.CancelButton = closeButton;

        dialog.ShowDialog(this);
    }

    private static string BuildErrorDetails(Exception exception)
    {
        var lines = new List<string>
        {
            $"발생 시각: {DateTime.Now:yyyy-MM-dd HH:mm:ss}",
            $"예외 형식: {exception.GetType().FullName}",
            $"메시지: {exception.Message}",
            string.Empty,
            "스택 추적:",
            exception.StackTrace ?? "(스택 추적 없음)"
        };

        var inner = exception.InnerException;
        var depth = 1;
        while (inner is not null)
        {
            lines.Add(string.Empty);
            lines.Add($"내부 예외 #{depth}: {inner.GetType().FullName}");
            lines.Add(inner.Message);
            lines.Add(inner.StackTrace ?? "(스택 추적 없음)");
            inner = inner.InnerException;
            depth++;
        }

        return string.Join(Environment.NewLine, lines);
    }

    private void toolStripSearchBox_TextChanged(object sender, EventArgs e)
    {
        ExecuteSearch(resetIndex: true, showPopup: true);
    }

    private void toolStripSearchBox_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Down)
        {
            if (_searchResults.Count == 0)
            {
                ExecuteSearch(resetIndex: true, showPopup: true);
            }

            if (_searchResults.Count > 0)
            {
                _searchPopup.ShowResults(_searchResults, GetSearchBoxScreenBounds());
                if (_searchPopup.SelectedIndex < 0)
                {
                    _searchPopup.SelectedIndex = 0;
                }
                else
                {
                    _searchPopup.MoveSelection(1);
                }

                _searchPopup.FocusList();
            }

            e.Handled = true;
            e.SuppressKeyPress = true;
            return;
        }

        if (e.KeyCode == Keys.Up && _searchPopup.Visible)
        {
            _searchPopup.MoveSelection(-1);
            e.Handled = true;
            e.SuppressKeyPress = true;
            return;
        }

        if (e.KeyCode == Keys.Escape)
        {
            _searchPopup.HidePopup();
            e.Handled = true;
            e.SuppressKeyPress = true;
            return;
        }

        if (e.KeyCode == Keys.Enter)
        {
            if (_searchPopup.Visible && _searchPopup.SelectedIndex >= 0 && _searchResults.Count > 0)
            {
                var index = Math.Clamp(_searchPopup.SelectedIndex, 0, _searchResults.Count - 1);
                SelectSearchResult(_searchResults[index]);
            }
            else if (e.Shift)
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

    private void HideSearchPopupIfClickedOutside(Point screenPoint)
    {
        if (!_searchPopup.Visible)
        {
            return;
        }

        if (GetSearchBoxScreenBounds().Contains(screenPoint) || _searchPopup.Bounds.Contains(screenPoint))
        {
            return;
        }

        _searchPopup.HidePopup();
    }

    private void HookClickOutsideToHideSearch(Control control)
    {
        control.MouseDown += (_, e) =>
        {
            if (e.Button == MouseButtons.Left)
            {
                HideSearchPopupIfClickedOutside(control.PointToScreen(e.Location));
            }
        };

        foreach (Control child in control.Controls)
        {
            HookClickOutsideToHideSearch(child);
        }
    }

    private void SearchPopup_ResultSelected(SearchResultItem item)
    {
        SelectSearchResult(item);
    }

    private Rectangle GetSearchBoxScreenBounds()
    {
        return menuStrip.RectangleToScreen(toolStripSearchBox.Bounds);
    }

    private void toolStripFindNext_Click(object sender, EventArgs e)
    {
        FindNextMatch();
    }

    private void toolStripFindPrevious_Click(object sender, EventArgs e)
    {
        FindPreviousMatch();
    }

    private void ExecuteSearch(bool resetIndex, bool showPopup = false)
    {
        if (_lastAnalysis is null)
        {
            return;
        }

        var query = toolStripSearchBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(query))
        {
            ClearSearchState(clearQuery: false);
            return;
        }

        if (!resetIndex && string.Equals(query, _lastSearchQuery, StringComparison.OrdinalIgnoreCase) && _searchResults.Count > 0)
        {
            if (showPopup)
            {
                _searchPopup.ShowResults(_searchResults, GetSearchBoxScreenBounds());
            }

            return;
        }

        _lastSearchQuery = query;
        _searchResults = AnalysisSearchService.Search(_lastAnalysis, query);
        _searchIndex = _searchResults.Count > 0 ? 0 : -1;

        toolStripFindNext.Enabled = _searchResults.Count > 0;
        toolStripFindPrevious.Enabled = _searchResults.Count > 0;

        if (_searchResults.Count == 0)
        {
            diagramViewHost.ClearSearchHighlight();
            _searchPopup.HidePopup();
            lblStatus.Text = $"'{query}' 검색 결과 없음";
            return;
        }

        lblStatus.Text = $"'{query}' 검색 결과 {_searchResults.Count}개 — 목록에서 항목을 선택하세요";

        if (showPopup)
        {
            _searchPopup.ShowResults(_searchResults, GetSearchBoxScreenBounds());
        }
    }

    private void SelectSearchResult(SearchResultItem item)
    {
        _searchIndex = -1;
        for (var index = 0; index < _searchResults.Count; index++)
        {
            if (_searchResults[index].Id == item.Id && _searchResults[index].Kind == item.Kind)
            {
                _searchIndex = index;
                break;
            }
        }

        if (_searchIndex < 0)
        {
            _searchIndex = 0;
        }

        if (item.Kind == SearchResultKind.Function)
        {
            if (GetSelectedViewKind() is DiagramViewKind.ClassDiagram
                or DiagramViewKind.Inheritance
                or DiagramViewKind.FileRelations
                or DiagramViewKind.DirectoryRelations)
            {
                comboDiagramView.SelectedIndex = 0;
            }

            SetCallGraphRootFromSearch(item.Id);
        }
        else if (item.Kind == SearchResultKind.File)
        {
            comboDiagramView.SelectedIndex = 5;
            diagramViewHost.ViewKind = DiagramViewKind.FileRelations;
            diagramViewHost.SetAnalysis(_lastAnalysis, ResolveRootNodeIds());
            diagramViewHost.TryFocusNode(item.Id);

            RecordRootSelection(
                viewKind: DiagramViewKind.FileRelations,
                rootMethod: GetCurrentRootMethodSelection(),
                fileIdOverride: item.Id,
                directoryIdOverride: null);
        }
        else if (item.Kind == SearchResultKind.Directory)
        {
            comboDiagramView.SelectedIndex = 6;
            diagramViewHost.ViewKind = DiagramViewKind.DirectoryRelations;
            diagramViewHost.SetAnalysis(_lastAnalysis, ResolveRootNodeIds());
            diagramViewHost.TryFocusNode(item.Id);

            RecordRootSelection(
                viewKind: DiagramViewKind.DirectoryRelations,
                rootMethod: GetCurrentRootMethodSelection(),
                fileIdOverride: null,
                directoryIdOverride: item.Id);
        }
        else
        {
            if (GetSelectedViewKind() is DiagramViewKind.CallGraph
                or DiagramViewKind.SequenceDiagram
                or DiagramViewKind.DataFlow
                or DiagramViewKind.FileRelations
                or DiagramViewKind.DirectoryRelations)
            {
                comboDiagramView.SelectedIndex = 1;
            }
            else
            {
                ApplyRootMethodSelection();
            }
        }

        ApplySearchHighlightToViewer();
        _searchPopup.HidePopup();
        lblStatus.Text = $"선택: [{item.KindLabel}] {item.Title}";
    }

    private void FindNextMatch()
    {
        if (_lastAnalysis is null || !toolStripSearchBox.Enabled)
        {
            return;
        }

        if (_searchResults.Count == 0 || !string.Equals(toolStripSearchBox.Text.Trim(), _lastSearchQuery, StringComparison.OrdinalIgnoreCase))
        {
            ExecuteSearch(resetIndex: true, showPopup: false);
            if (_searchResults.Count == 0)
            {
                return;
            }
        }

        _searchIndex = (_searchIndex + 1) % _searchResults.Count;
        SelectSearchResult(_searchResults[_searchIndex]);
    }

    private void FindPreviousMatch()
    {
        if (_lastAnalysis is null || !toolStripSearchBox.Enabled)
        {
            return;
        }

        if (_searchResults.Count == 0 || !string.Equals(toolStripSearchBox.Text.Trim(), _lastSearchQuery, StringComparison.OrdinalIgnoreCase))
        {
            ExecuteSearch(resetIndex: true, showPopup: false);
            if (_searchResults.Count == 0)
            {
                return;
            }
        }

        _searchIndex = (_searchIndex - 1 + _searchResults.Count) % _searchResults.Count;
        SelectSearchResult(_searchResults[_searchIndex]);
    }

    private void FocusSearchNode(string nodeId)
    {
        SetCallGraphRootFromSearch(nodeId);
    }

    private void SetCallGraphRootFromSearch(string nodeId)
    {
        if (_lastAnalysis is null || !_lastAnalysis.CallGraph.NodeMap.ContainsKey(nodeId))
        {
            return;
        }

        _suppressRootComboChange = true;
        try
        {
            foreach (RootMethodItem item in comboRootMethod.Items)
            {
                if (item.Node is not null && string.Equals(item.Node.Id, nodeId, StringComparison.Ordinal))
                {
                    comboRootMethod.SelectedItem = item;
                    break;
                }
            }

            var rootIds = ResolveRootNodeIds();
            if (rootIds.Count == 0 || !rootIds.Contains(nodeId, StringComparer.Ordinal))
            {
                rootIds = [nodeId];
            }

            diagramViewHost.ViewKind = GetSelectedViewKind();
            diagramViewHost.SetAnalysis(_lastAnalysis, rootIds);

            if (GetSelectedViewKind() == DiagramViewKind.CallGraph)
            {
                diagramViewHost.CallGraphViewer.TryFocusNode(nodeId);
            }

            // Root 변경이 이벤트로만 기록되지 않는 경우도 있어 히스토리를 함께 남깁니다.
            RecordCurrentRootSelectionBaseline();
        }
        finally
        {
            _suppressRootComboChange = false;
        }
    }

    private void ApplySearchHighlightToViewer()
    {
        if (_searchResults.Count == 0 || _searchIndex < 0)
        {
            diagramViewHost.ClearSearchHighlight();
            return;
        }

        var current = _searchResults[_searchIndex];

        if (GetSelectedViewKind() == DiagramViewKind.FileRelations)
        {
            var fileIds = _searchResults
                .Where(result => result.Kind == SearchResultKind.File)
                .Select(result => result.Id);
            var currentId = current.Kind == SearchResultKind.File ? current.Id : null;
            diagramViewHost.SetSearchHighlight(fileIds, currentId);
            return;
        }

        if (GetSelectedViewKind() == DiagramViewKind.DirectoryRelations)
        {
            var directoryIds = _searchResults
                .Where(result => result.Kind == SearchResultKind.Directory)
                .Select(result => result.Id);
            var currentId = current.Kind == SearchResultKind.Directory ? current.Id : null;
            diagramViewHost.SetSearchHighlight(directoryIds, currentId);
            return;
        }

        if (IsClassStructureView())
        {
            var typeIds = _searchResults
                .Where(result => result.Kind == SearchResultKind.Type)
                .Select(result => result.Id);
            var currentId = current.Kind == SearchResultKind.Type ? current.Id : null;
            diagramViewHost.SetSearchHighlight(typeIds, currentId);
            return;
        }

        var nodeIds = _searchResults
            .Where(result => result.Kind == SearchResultKind.Function)
            .Select(result => result.Id);
        var currentNodeId = current.Kind == SearchResultKind.Function ? current.Id : null;
        diagramViewHost.SetSearchHighlight(nodeIds, currentNodeId);
    }

    private void ClearSearchState(bool clearQuery = true)
    {
        _searchResults = [];
        _searchIndex = -1;
        _lastSearchQuery = string.Empty;
        diagramViewHost.ClearSearchHighlight();
        _searchPopup.HidePopup();
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
        var hasGraph = _lastAnalysis is not null && _lastAnalysis.CallGraph.Nodes.Count > 0;
        var hasStructure = _lastAnalysis is not null && _lastAnalysis.Structure.Types.Count > 0;
        var hasFileRelations = _lastAnalysis is not null && _lastAnalysis.FileRelations.Files.Count > 0;
        var hasDirectoryRelations = _lastAnalysis is not null && _lastAnalysis.DirectoryRelations.Directories.Count > 0;
        menuSave.Enabled = hasGraph;
        toolStripSearchBox.Enabled = hasGraph || hasStructure || hasFileRelations || hasDirectoryRelations;

        if (!hasGraph && !hasStructure && !hasFileRelations && !hasDirectoryRelations)
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

    private void lblLayout_Click(object sender, EventArgs e)
    {

    }
}
