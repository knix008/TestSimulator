using System.Diagnostics;
using CodeAnalyzer.Controls;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services;
using CodeAnalyzer.Services.Metrics;
using CodeAnalyzer.Services.GlobalVariables;
using CodeAnalyzer.Services.Database;
using CodeAnalyzer.Services.Reports;

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
    private readonly System.Windows.Forms.Timer _searchDebounceTimer;
    private readonly System.Windows.Forms.Timer _analysisElapsedTimer;
    private readonly Stopwatch _analysisElapsedStopwatch = new();
    private AnalysisProgressReport? _lastAnalysisProgressReport;
    private bool _suppressRootComboChange;
    private bool _suppressDiagramViewChange;
    private bool _suppressDirectoryListEvents;
    private UserAnalysisSettings _analysisSettings = UserAnalysisSettings.CreateDefaults();
    private MetricInspectionKind _enabledInspections = MetricInspectionKind.All;
    private TimeSpan? _lastCompletedAnalysisElapsed;
    private int _lastCompletedDirectoryCount;
    private int _lastCompletedFileCount;
    private readonly List<Image> _menuImages = [];

    public MainForm()
    {
        InitializeComponent();
        InitializeMenuIcons();
        _analysisSettings = UserAnalysisSettings.ResolveForAnalysis(_userSettings.LoadSettings());
        _enabledInspections = MetricInspectionCatalog.NormalizeScope(_analysisSettings.EnabledInspections);
        UserAnalysisSettings.RegisterDesignerDefaults(_analysisSettings);
        _searchPopup = new SearchResultsPopup();
        _searchPopup.ResultSelected += SearchPopup_ResultSelected;
        _searchDebounceTimer = new System.Windows.Forms.Timer { Interval = 150 };
        _searchDebounceTimer.Tick += (_, _) =>
        {
            _searchDebounceTimer.Stop();
            ExecuteSearch(resetIndex: true, showPopup: true);
            // Restore focus to search box in case the popup grabbed it
            toolStripSearchBox.Control?.Focus();
        };
        _analysisElapsedTimer = new System.Windows.Forms.Timer { Interval = 500 };
        _analysisElapsedTimer.Tick += (_, _) => RefreshAnalysisElapsedStatus();
        FormClosed += (_, _) =>
        {
            _analysisElapsedTimer.Stop();
            DisposeMenuImages();
        };
        Load += (_, _) =>
        {
            _searchPopup.Owner = this;
            HookClickOutsideToHideSearch(this);
        };
        diagramViewHost.CallGraphRootChanged += OnCallGraphRootChanged;
        diagramViewHost.FileRootChanged += OnFileRootChanged;
        diagramViewHost.DirectoryRootChanged += OnDirectoryRootChanged;
        diagramViewHost.MetricsNavigationRequested += OnMetricsNavigationRequested;
        diagramViewHost.GlobalVariableAccessGraphRequested += OnGlobalVariableAccessGraphRequested;
        diagramViewHost.DatabaseTableAccessGraphRequested += OnDatabaseTableAccessGraphRequested;
        InitializeOptionControls();
        LoadLanguageList();
        RestoreUserSettings();
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

    private void RefreshAnalysisElapsedStatus()
    {
        if (!_isAnalysisRunning)
        {
            return;
        }

        var elapsed = _analysisElapsedStopwatch.Elapsed;
        if (_isStoppingAnalysis)
        {
            lblStatus.Text = $"분석 중지 요청됨... · 경과 {AnalysisProgressFormatter.FormatDuration(elapsed)}";
            return;
        }

        if (_lastAnalysisProgressReport is null)
        {
            lblStatus.Text = $"백그라운드에서 분석 중... · 경과 {AnalysisProgressFormatter.FormatDuration(elapsed)}";
            return;
        }

        lblStatus.Text = AnalysisProgressFormatter.FormatStatus(new AnalysisProgressReport
        {
            Percent = _lastAnalysisProgressReport.Percent,
            Message = _lastAnalysisProgressReport.Message,
            Elapsed = elapsed,
            EstimatedRemaining = _lastAnalysisProgressReport.EstimatedRemaining
        });
    }

    private void InitializeMenuIcons()
    {
        menuStrip.Renderer = new MenuStripIconRenderer();
        menuStrip.ImageScalingSize = new Size(16, 16);

        menuFile.AutoSize = true;
        menuFile.Image = RegisterMenuImage(MenuIconFactory.CreateFileIcon());
        menuOpen.Image = RegisterMenuImage(MenuIconFactory.CreateOpenIcon());
        menuSave.Image = RegisterMenuImage(MenuIconFactory.CreateSaveIcon());
        menuExportMetrics.Image = RegisterMenuImage(MenuIconFactory.CreateExportMetricsIcon());
        menuExportReport.Image = RegisterMenuImage(MenuIconFactory.CreateExportReportIcon());
        menuExportImage.Image = RegisterMenuImage(MenuIconFactory.CreateExportImageIcon());
    }

    private Image RegisterMenuImage(Bitmap image)
    {
        _menuImages.Add(image);
        return image;
    }

    private void DisposeMenuImages()
    {
        foreach (var image in _menuImages)
        {
            image.Dispose();
        }

        _menuImages.Clear();
    }

    private void InitializeOptionControls()
    {
        checkedListDirectories.ItemCheck += (_, _) =>
        {
            if (!_suppressDirectoryListEvents && IsHandleCreated)
                BeginInvoke(PersistDirectoryExclusionsFromSidebar);
        };

        comboDiagramView.Items.AddRange(new object[]
        {
            "호출 그래프",
            "클래스 다이어그램",
            "시퀀스 다이어그램",
            "데이터 흐름도",
            "상속 구조",
            "파일 호출 관계",
            "디렉터리 호출 관계",
            "코드 메트릭",
            "중복 코드",
            "전역 변수",
            "DB ERD",
            "DB 테이블 접근"
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
            7 => DiagramViewKind.CodeMetrics,
            8 => DiagramViewKind.DuplicateCode,
            9 => DiagramViewKind.GlobalVariables,
            10 => DiagramViewKind.DatabaseErd,
            11 => DiagramViewKind.DatabaseTableAccess,
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

    private void RestoreUserSettings()
    {
        if (_userSettings.HasSettingsFile())
        {
            _analysisSettings = UserAnalysisSettings.ResolveForAnalysis(_userSettings.LoadSettings());
            _enabledInspections = MetricInspectionCatalog.NormalizeScope(_analysisSettings.EnabledInspections);
            UserAnalysisSettings.RegisterDesignerDefaults(_analysisSettings);
        }

        if (string.IsNullOrWhiteSpace(_analysisSettings.LastRootDirectory))
        {
            return;
        }

        txtRootPath.Text = _analysisSettings.LastRootDirectory;
        ApplyRootDirectory(_analysisSettings.LastRootDirectory, saveSettings: false);
    }

    private void btnAnalysisSettings_Click(object? sender, EventArgs e)
    {
        using var dialog = new AnalysisSettingsDialog(_analysisSettings);
        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        _analysisSettings = UserAnalysisSettings.ResolveForAnalysis(dialog.Settings);
        _enabledInspections = MetricInspectionCatalog.NormalizeScope(_analysisSettings.EnabledInspections);
        UserAnalysisSettings.RegisterDesignerDefaults(_analysisSettings);
        _userSettings.SaveQualityThresholds(BuildAnalysisSettingsForPersistence());

        if (_lastAnalysis is not null)
        {
            diagramViewHost.SetAnalysis(_lastAnalysis, ResolveRootNodeIds());
        }
    }

    private UserAnalysisSettings BuildAnalysisSettingsForPersistence()
    {
        var settings = UserAnalysisSettings.CloneThresholds(_analysisSettings);
        settings.EnabledInspections = _enabledInspections;
        settings.ExcludedDirectoryPaths = GetExcludedDirectoriesFromSidebar();
        settings.LastRootDirectory = _userSettings.LoadSettings().LastRootDirectory;
        return settings;
    }

    private UserAnalysisSettings ReadQualityThresholdsFromControls() =>
        UserAnalysisSettings.ResolveForAnalysis(BuildAnalysisSettingsForPersistence());

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
        _suppressDirectoryListEvents = true;
        try
        {
            checkedListDirectories.Items.Clear();

            var directories = DirectoryScanService.ScanSubdirectories(rootPath);
            foreach (var directory in directories)
            {
                checkedListDirectories.Items.Add(directory, isChecked: true);
            }

            var settings = _userSettings.LoadSettings();
            var hadLegacyIncludeList = settings.IncludedDirectoryPaths.Count > 0;
            DirectoryScopeSettings.MigrateLegacyIncludedPaths(settings, directories);
            if (hadLegacyIncludeList)
            {
                _userSettings.SaveSettings(settings);
            }

            ApplyDirectoryChecksToSidebar(settings.ExcludedDirectoryPaths);
        }
        finally
        {
            _suppressDirectoryListEvents = false;
        }
    }

    private void ApplyDirectoryChecksToSidebar(IReadOnlyList<string> excludedPaths)
    {
        _suppressDirectoryListEvents = true;
        try
        {
            var excluded = new HashSet<string>(excludedPaths, StringComparer.OrdinalIgnoreCase);
            for (var i = 0; i < checkedListDirectories.Items.Count; i++)
            {
                if (checkedListDirectories.Items[i] is string path)
                {
                    checkedListDirectories.SetItemChecked(i, !excluded.Contains(path));
                }
            }
        }
        finally
        {
            _suppressDirectoryListEvents = false;
        }
    }

    private void PersistDirectoryExclusionsFromSidebar()
    {
        if (_suppressDirectoryListEvents || _isAnalysisRunning)
        {
            return;
        }

        var settings = _userSettings.LoadSettings();
        settings.IncludedDirectoryPaths = [];
        settings.ExcludedDirectoryPaths = GetExcludedDirectoriesFromSidebar();
        _userSettings.SaveSettings(settings);
    }

    private List<string> GetExcludedDirectoriesFromSidebar()
    {
        var excluded = new List<string>();
        for (var i = 0; i < checkedListDirectories.Items.Count; i++)
        {
            if (!checkedListDirectories.GetItemChecked(i) && checkedListDirectories.Items[i] is string path)
            {
                excluded.Add(path);
            }
        }

        return excluded;
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

            _lastAnalysisProgressReport = report;
            UpdateAnalysisProgress(report.Percent);
            RefreshAnalysisElapsedStatus();
        });
        var progress = new ThrottledProgress<AnalysisProgressReport>(uiProgress, intervalMs: 100);

        try
        {
            PersistDirectoryExclusionsFromSidebar();

            var qualityThresholds = UserAnalysisSettings.ResolveForAnalysis(ReadQualityThresholdsFromControls());
            qualityThresholds.LastRootDirectory = _userSettings.LoadSettings().LastRootDirectory;
            _userSettings.SaveSettings(qualityThresholds);

            var (result, fileCount, directoryCount) = await Task.Run(
                async () => await _analyzer.AnalyzeAsync(
                    rootPath,
                    enabledLanguages,
                    qualityThresholds,
                    progress,
                    cts.Token).ConfigureAwait(false),
                cts.Token).ConfigureAwait(true);

            if (cts.IsCancellationRequested)
            {
                throw new OperationCanceledException(cts.Token);
            }

            TryCompactMemoryAfterAnalysis();
            _analysisElapsedStopwatch.Stop();
            var elapsed = _analysisElapsedStopwatch.Elapsed;

            _lastAnalysis = result;
            ApplyAnalysisResultsToUi(result);
            _userSettings.SaveLastRootDirectory(rootPath);
            UpdateAnalysisProgress(100);
            RememberAnalysisCompletionStats(elapsed, directoryCount, fileCount);

            AnalysisCompletionDialog.Show(
                this,
                result,
                directoryCount,
                fileCount,
                elapsed,
                rootPath);

            if (result.Issues.Count > 0)
            {
                DetailedErrorDialog.ShowIssues(
                    this,
                    "분석 중 오류 발생",
                    $"{result.Issues.Count}개 단계에서 오류가 발생했습니다. 일부 결과만 표시될 수 있습니다. 아래 상세 내용을 확인하고 필요 시 복사하세요.",
                    result.Issues);
            }

            UpdateAnalysisCompleteStatusBar(result);
        }
        catch (OperationCanceledException)
        {
            ClearAnalysisCompletionStats();
            ClearAnalysisResults();
            lblStatus.Text = "분석이 취소되었습니다.";
        }
        catch (Exception ex)
        {
            ClearAnalysisCompletionStats();
            ClearAnalysisResults();
            lblStatus.Text = "분석 실패";
            DetailedErrorDialog.Show(this, "분석 오류", ex, "분석 중 오류가 발생했습니다. 아래 상세 내용을 확인하고 필요 시 복사하세요.");
        }
        finally
        {
            EndAnalysisSession();
            if (_lastAnalysis is not null && _lastCompletedAnalysisElapsed is { } elapsed)
            {
                UpdateAnalysisCompleteStatusBar(_lastAnalysis, elapsed);
            }

            _analysisCts?.Dispose();
            _analysisCts = null;
        }
    }

    private void RememberAnalysisCompletionStats(TimeSpan elapsed, int directoryCount, int fileCount)
    {
        _lastCompletedAnalysisElapsed = elapsed;
        _lastCompletedDirectoryCount = directoryCount;
        _lastCompletedFileCount = fileCount;
    }

    private void ClearAnalysisCompletionStats()
    {
        _lastCompletedAnalysisElapsed = null;
        _lastCompletedDirectoryCount = 0;
        _lastCompletedFileCount = 0;
    }

    private void UpdateAnalysisCompleteStatusBar(AnalysisResult result)
    {
        if (_lastCompletedAnalysisElapsed is not { } elapsed)
        {
            return;
        }

        UpdateAnalysisCompleteStatusBar(result, elapsed);
    }

    private void UpdateAnalysisCompleteStatusBar(AnalysisResult result, TimeSpan elapsed)
    {
        lblStatus.Text =
            $"분석 완료 · 소요 시간 {AnalysisProgressFormatter.FormatDuration(elapsed)} · " +
            $"폴더 {_lastCompletedDirectoryCount:N0}개 · 파일 {_lastCompletedFileCount:N0}개 · " +
            $"함수 {result.CallGraph.Nodes.Count:N0}개 · 호출 {result.CallGraph.Edges.Count:N0}개 · " +
            $"메트릭 {result.Metrics.Functions.Count:N0}개 · 중복 {result.Duplicates.Groups.Count:N0}건 · " +
            $"파일 연관 {result.FileRelations.Edges.Count:N0} · 디렉터리 연관 {result.DirectoryRelations.Edges.Count:N0} · " +
            $"타입 {result.Structure.Types.Count:N0}개";
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
        RefreshAnalysisElapsedStatus();

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
        btnAnalysisSettings.Enabled = false;
        ResetAnalysisProgress(isActive: true);
        _lastAnalysisProgressReport = null;
        _analysisElapsedStopwatch.Restart();
        _analysisElapsedTimer.Start();
        RefreshAnalysisElapsedStatus();
        UpdateRootHistoryNavigationState();
    }

    private void EndAnalysisSession()
    {
        _analysisElapsedTimer.Stop();
        _analysisElapsedStopwatch.Stop();
        _lastAnalysisProgressReport = null;
        UseWaitCursor = false;
        _isAnalysisRunning = false;
        _isStoppingAnalysis = false;
        diagramViewHost.EndAnalysis();
        SetAnalyzeButtonIdle();
        SetToolbarEnabled(true);
        btnAnalysisSettings.Enabled = true;
        ResetAnalysisProgress(isActive: false);

        if (_lastAnalysis is not null && GetSelectedViewKind() is DiagramViewKind.CodeMetrics
            or DiagramViewKind.DuplicateCode
            or DiagramViewKind.GlobalVariables
            or DiagramViewKind.DatabaseErd
            or DiagramViewKind.DatabaseTableAccess)
        {
            try
            {
                diagramViewHost.SetAnalysis(_lastAnalysis, ResolveRootNodeIds());
            }
            catch (Exception ex)
            {
                DetailedErrorDialog.Show(this, "뷰 갱신 오류", ex, "분석 뷰를 갱신하는 중 오류가 발생했습니다.");
            }
        }
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
        var isTabularView = viewKind is DiagramViewKind.CodeMetrics
            or DiagramViewKind.DuplicateCode
            or DiagramViewKind.GlobalVariables
            or DiagramViewKind.DatabaseTableAccess;
        var isAccessGraph = diagramViewHost.IsShowingAccessGraph;
        var supportsTreeExpand = viewKind == DiagramViewKind.CallGraph || isAccessGraph;
        var supportsLineStyle = viewKind is DiagramViewKind.CallGraph
            or DiagramViewKind.ClassDiagram
            or DiagramViewKind.SequenceDiagram
            or DiagramViewKind.DataFlow
            or DiagramViewKind.Inheritance
            or DiagramViewKind.FileRelations
            or DiagramViewKind.DirectoryRelations
            or DiagramViewKind.DatabaseErd;
        var needsRoot = viewKind is DiagramViewKind.CallGraph
            or DiagramViewKind.SequenceDiagram
            or DiagramViewKind.DataFlow
            or DiagramViewKind.FileRelations
            or DiagramViewKind.DirectoryRelations;
        var needsTypeRoot = viewKind is DiagramViewKind.ClassDiagram or DiagramViewKind.Inheritance;

        comboLayoutDirection.Enabled = !isTabularView || isAccessGraph;
        comboLineStyle.Enabled = (supportsLineStyle && !isTabularView) || isAccessGraph;
        btnExpandAll.Enabled = supportsTreeExpand;
        btnCollapseAll.Enabled = supportsTreeExpand;
        comboRootMethod.Enabled = (needsRoot || needsTypeRoot) && _lastAnalysis is not null;
        lblRootMethod.Enabled = needsRoot || needsTypeRoot;
        lblRootMethod.Text = needsTypeRoot ? "클래스" : "시작 함수";
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

    private static void TryCompactMemoryAfterAnalysis()
    {
        try
        {
            GC.Collect(GC.MaxGeneration, GCCollectionMode.Optimized, blocking: true, compacting: true);
            GC.WaitForPendingFinalizers();
        }
        catch
        {
            // ignore
        }
    }

    private void ApplyAnalysisResultsToUi(AnalysisResult result)
    {
        try
        {
            PopulateRootMethodList(result.CallGraph);
        }
        catch (Exception ex)
        {
            DetailedErrorDialog.Show(
                this,
                "결과 표시 오류",
                ex,
                "분석 결과를 화면에 반영하는 중 오류가 발생했습니다. 아래 상세 내용을 확인하고 필요 시 복사하세요.");
        }
    }

    private void PopulateRootMethodList(CallGraphResult result)
    {
        if (IsClassStructureView() && _lastAnalysis is not null)
        {
            PopulateClassTypeList();
            UpdateResultCommandsState();
            return;
        }

        FillRootMethodCombo(result);
        UpdateResultCommandsState();
    }

    private void FillRootMethodCombo(CallGraphResult result)
    {
        comboRootMethod.Items.Clear();
        comboRootMethod.Items.Add(RootMethodItem.AutoEntryPoints);

        var entryPointIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var entryPoint in CallGraphEntryPointResolver.FindEntryPoints(result))
        {
            entryPointIds.Add(entryPoint.Id);
        }

        var candidates = new List<CallGraphNode>();
        foreach (var id in entryPointIds)
        {
            if (result.NodeMap.TryGetValue(id, out var entryNode))
            {
                candidates.Add(entryNode);
            }
        }

        var remainingSlots = Math.Max(0, AnalysisScaleLimits.MaxRootMethodComboItems - candidates.Count);
        if (remainingSlots > 0)
        {
            var extras = result.Nodes
                .Where(node => !entryPointIds.Contains(node.Id))
                .OrderByDescending(node => result.Outgoing.TryGetValue(node.Id, out var outgoing) ? outgoing.Count : 0)
                .ThenBy(node => node.FullName, StringComparer.OrdinalIgnoreCase)
                .Take(remainingSlots);
            candidates.AddRange(extras);
        }

        foreach (var node in candidates.OrderBy(node => node.FullName, StringComparer.OrdinalIgnoreCase))
        {
            comboRootMethod.Items.Add(RootMethodItem.FromNode(node));
        }

        comboRootMethod.SelectedItem = RootMethodItem.AutoEntryPoints;
        FitComboDropDownWidth();

        if (result.Nodes.Count == 0)
        {
            diagramViewHost.SetAnalysis(_lastAnalysis, Array.Empty<string>());
            return;
        }

        ApplyRootMethodSelection();
    }

    private void PopulateClassTypeList()
    {
        if (_lastAnalysis is null)
        {
            return;
        }

        _suppressRootComboChange = true;
        try
        {
            comboRootMethod.Items.Clear();
            comboRootMethod.Items.Add(RootTypeItem.AllTypes);

            foreach (var type in _lastAnalysis.Structure.Types
                .OrderBy(t => t.DisplayName, StringComparer.OrdinalIgnoreCase))
            {
                comboRootMethod.Items.Add(RootTypeItem.FromType(type));
            }

            comboRootMethod.SelectedItem = RootTypeItem.AllTypes;
        }
        finally
        {
            _suppressRootComboChange = false;
        }

        FitComboDropDownWidth();
        ApplyRootTypeSelection();
    }

    private void ApplyRootTypeSelection()
    {
        if (_lastAnalysis is null)
        {
            return;
        }

        string? focusedTypeId = null;
        if (comboRootMethod.SelectedItem is RootTypeItem item && !item.IsAllTypes)
        {
            focusedTypeId = item.Type!.Id;
        }

        // SetAnalysis first so the analysis is loaded before FocusType triggers the final rebuild.
        diagramViewHost.ViewKind = GetSelectedViewKind();
        diagramViewHost.SetAnalysis(_lastAnalysis, []);
        diagramViewHost.FocusType(focusedTypeId);
    }

    private void comboDiagramView_SelectedIndexChanged(object sender, EventArgs e)
    {
        if (!_suppressDiagramViewChange)
        {
            diagramViewHost.ClearGlobalVariableAccessGraph();
        }

        diagramViewHost.ViewKind = GetSelectedViewKind();
        UpdateToolbarForViewKind();

        if (_lastAnalysis is not null && IsClassStructureView())
        {
            // Switching into a class/inheritance view — populate combo with types.
            if (comboRootMethod.Items.Count == 0 || comboRootMethod.Items[0] is not RootTypeItem)
            {
                PopulateClassTypeList(); // internally calls ApplyRootTypeSelection
                ApplySearchHighlightToViewer();
                return;
            }
        }
        else if (_lastAnalysis is not null && !IsClassStructureView()
            && comboRootMethod.Items.Count > 0 && comboRootMethod.Items[0] is RootTypeItem)
        {
            // Switching away from a class/inheritance view — restore function list.
            _suppressRootComboChange = true;
            try
            {
                FillRootMethodCombo(_lastAnalysis.CallGraph); // internally calls ApplyRootMethodSelection
            }
            finally
            {
                _suppressRootComboChange = false;
            }

            ApplySearchHighlightToViewer();
            return;
        }

        ApplyRootMethodSelection();
        ApplySearchHighlightToViewer();
    }

    private void comboRootMethod_SelectedIndexChanged(object sender, EventArgs e)
    {
        if (_suppressRootComboChange)
        {
            return;
        }

        if (comboRootMethod.SelectedItem is RootTypeItem)
        {
            ApplyRootTypeSelection();
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
                DiagramViewKind.CodeMetrics => 7,
                DiagramViewKind.DuplicateCode => 8,
                DiagramViewKind.GlobalVariables => 9,
                DiagramViewKind.DatabaseErd => 10,
                DiagramViewKind.DatabaseTableAccess => 11,
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

        try
        {
            var rootIds = ResolveRootNodeIds();
            diagramViewHost.ProjectRootDirectory = txtRootPath.Text.Trim();
            diagramViewHost.ViewKind = GetSelectedViewKind();
            diagramViewHost.SetAnalysis(_lastAnalysis, rootIds);
            ApplySearchHighlightToViewer();
            RecordCurrentRootSelectionBaseline();
        }
        catch (Exception ex)
        {
            DetailedErrorDialog.Show(
                this,
                "다이어그램 표시 오류",
                ex,
                "호출 그래프/다이어그램을 그리는 중 오류가 발생했습니다.");
        }
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
        diagramViewHost.ExpandAll();
    }

    private void btnCollapseAll_Click(object sender, EventArgs e)
    {
        diagramViewHost.CollapseAll();
    }

    private void btnResetView_Click(object sender, EventArgs e)
    {
        diagramViewHost.ResetView();
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

    private void OnGlobalVariableAccessGraphRequested(GlobalVariableItem variable)
    {
        if (_lastAnalysis is null)
        {
            return;
        }

        var accesses = _lastAnalysis.GlobalVariables.GetAccessesFor(variable.Id);
        var accessGraph = GlobalVariableAccessGraphBuilder.Build(
            variable,
            accesses,
            _lastAnalysis.CallGraph);

        _suppressDiagramViewChange = true;
        try
        {
            comboDiagramView.SelectedIndex = 0;
            diagramViewHost.ShowGlobalVariableAccessGraph(
                variable,
                accessGraph.Graph,
                accessGraph.RootNodeIds);
        }
        finally
        {
            _suppressDiagramViewChange = false;
        }

        UpdateToolbarForViewKind();
        lblStatus.Text = accesses.Count > 0
            ? $"전역 변수 '{variable.Name}' — 접근 함수 {accesses.Count}개를 그래프로 표시했습니다."
            : $"전역 변수 '{variable.Name}' — 접근 함수가 없어 선언 노드만 표시했습니다.";
    }

    private void OnDatabaseTableAccessGraphRequested(DatabaseTable table)
    {
        if (_lastAnalysis is null)
        {
            return;
        }

        var accesses = _lastAnalysis.DatabaseSchema.GetAccessesFor(table.Id);
        var accessGraph = DatabaseTableAccessGraphBuilder.Build(
            table,
            accesses,
            _lastAnalysis.CallGraph);

        _suppressDiagramViewChange = true;
        try
        {
            comboDiagramView.SelectedIndex = 0;
            diagramViewHost.ShowDatabaseTableAccessGraph(
                table,
                accessGraph.Graph,
                accessGraph.RootNodeIds);
        }
        finally
        {
            _suppressDiagramViewChange = false;
        }

        UpdateToolbarForViewKind();
        lblStatus.Text = accesses.Count > 0
            ? $"DB 테이블 '{table.Name}' — 접근 함수 {accesses.Count}개를 그래프로 표시했습니다."
            : $"DB 테이블 '{table.Name}' — 접근 함수가 없어 테이블 노드만 표시했습니다.";
    }

    private void OnMetricsNavigationRequested(MetricsNavigationRequest request)
    {
        if (_lastAnalysis is null)
        {
            return;
        }

        if (request.ShowGlobalVariableAccessGraph is not null)
        {
            OnGlobalVariableAccessGraphRequested(request.ShowGlobalVariableAccessGraph);
            return;
        }

        if (request.ShowDatabaseTableAccessGraph is not null)
        {
            OnDatabaseTableAccessGraphRequested(request.ShowDatabaseTableAccessGraph);
            return;
        }

        if (!string.IsNullOrWhiteSpace(request.CallGraphNodeId)
            && _lastAnalysis.CallGraph.NodeMap.ContainsKey(request.CallGraphNodeId))
        {
            comboDiagramView.SelectedIndex = 0;
            diagramViewHost.ViewKind = DiagramViewKind.CallGraph;
            diagramViewHost.SetAnalysis(_lastAnalysis, [request.CallGraphNodeId]);
            diagramViewHost.TryFocusNode(request.CallGraphNodeId);

            if (request.HighlightCallGraphNodeIds is { Count: > 0 })
            {
                diagramViewHost.SetSearchHighlight(request.HighlightCallGraphNodeIds, request.CallGraphNodeId);
            }

            lblStatus.Text = "호출 그래프에서 선택한 위치로 이동했습니다.";
            return;
        }

        if (!string.IsNullOrWhiteSpace(request.FilePath))
        {
            if (SourceFileOpener.TryOpen(request.FilePath, request.LineNumber))
            {
                lblStatus.Text = request.LineNumber > 1
                    ? $"파일을 열었습니다: {request.FilePath}:{request.LineNumber}"
                    : $"파일을 열었습니다: {request.FilePath}";
            }
            else
            {
                DetailedErrorDialog.Show(
                    this,
                    "파일 열기 오류",
                    new FileNotFoundException(request.FilePath),
                    "파일을 찾을 수 없거나 기본 편집기로 열 수 없습니다.");
            }
        }
    }

    private void menuExportReport_Click(object sender, EventArgs e)
    {
        if (_lastAnalysis is null)
        {
            MessageBox.Show(this, "보낼 분석 결과가 없습니다. 먼저 분석을 실행하세요.", "보고서보내기",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dialog = new SaveFileDialog
        {
            Title = "분석 보고서보내기",
            Filter =
                "HTML 보고서 (*.html)|*.html|" +
                "Markdown (*.md)|*.md|" +
                "Word 문서 (*.docx)|*.docx|" +
                "PDF (*.pdf)|*.pdf|" +
                "모든 지원 형식|*.html;*.md;*.docx;*.pdf",
            DefaultExt = "html",
            FileName = AnalysisReportExportService.BuildDefaultFileName(AnalysisReportFormat.Html)
        };

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        var savePath = dialog.FileName;

        try
        {
            AnalysisReportExportService.Save(
                _lastAnalysis,
                txtRootPath.Text.Trim(),
                savePath);
            lblStatus.Text = $"분석 보고서 저장됨: {savePath}";
            ShowFileSaveSuccess(this, "분석 보고서 내보내기", savePath);
        }
        catch (Exception ex)
        {
            ShowFileSaveError(this, "분석 보고서 내보내기 오류", ex, "보고서 생성 중 오류가 발생했습니다.", savePath);
        }
    }

    private void menuExportMetrics_Click(object sender, EventArgs e)
    {
        if (_lastAnalysis is null || _lastAnalysis.Metrics.Functions.Count == 0)
        {
            MessageBox.Show(this, "보낼 메트릭이 없습니다. 먼저 분석을 실행하세요.", "메트릭보내기",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var dialog = new SaveFileDialog
        {
            Title = "코드 메트릭 CSV보내기",
            Filter = "CSV 파일 (*.csv)|*.csv|모든 파일 (*.*)|*.*",
            DefaultExt = "csv",
            FileName = $"CodeMetrics_{DateTime.Now:yyyyMMdd_HHmmss}.csv"
        };

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        var savePath = dialog.FileName;

        try
        {
            CodeMetricsExportService.SaveToCsv(_lastAnalysis.Metrics, _lastAnalysis.GlobalVariables, savePath);
            lblStatus.Text = $"메트릭 CSV 저장됨: {savePath}";
            ShowFileSaveSuccess(
                this,
                "메트릭 CSV 내보내기",
                savePath,
                $"함수 {_lastAnalysis.Metrics.Functions.Count:N0}개, 파일 {_lastAnalysis.Metrics.Files.Count:N0}개, " +
                $"전역 변수 {_lastAnalysis.GlobalVariables.Variables.Count:N0}개, " +
                $"접근 {_lastAnalysis.GlobalVariables.Accesses.Count:N0}건");
        }
        catch (Exception ex)
        {
            ShowFileSaveError(this, "메트릭 CSV 내보내기 오류", ex, "CSV 저장 중 오류가 발생했습니다.", savePath);
        }
    }

    private void menuExportImage_Click(object sender, EventArgs e)
    {
        Bitmap? bmp;
        try
        {
            bmp = diagramViewHost.ExportToBitmap();
        }
        catch (Exception ex)
        {
            DetailedErrorDialog.Show(this,"이미지 내보내기 오류", ex, "다이어그램 렌더링 중 오류가 발생했습니다.");
            return;
        }

        if (bmp is null)
        {
            MessageBox.Show(this, "내보낼 다이어그램이 없습니다.", "이미지 내보내기",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        using var _ = bmp;

        using var dialog = new SaveFileDialog
        {
            Title = "이미지로 내보내기",
            Filter = "PNG 이미지 (*.png)|*.png",
            DefaultExt = "png",
            FileName = $"diagram_{DateTime.Now:yyyyMMdd_HHmmss}.png"
        };

        if (dialog.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        var savePath = dialog.FileName;

        try
        {
            bmp.Save(savePath, System.Drawing.Imaging.ImageFormat.Png);
            lblStatus.Text = $"이미지 저장됨: {savePath}";
            ShowFileSaveSuccess(this, "이미지 내보내기", savePath);
        }
        catch (Exception ex)
        {
            ShowFileSaveError(this, "이미지 저장 오류", ex, "이미지 파일 저장 중 오류가 발생했습니다.", savePath);
        }
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

        var savePath = dialog.FileName;

        try
        {
            CallGraphExportService.SaveToFile(_lastAnalysis, txtRootPath.Text.Trim(), savePath);
            lblStatus.Text =
                $"결과 저장 완료: 함수 {_lastAnalysis.CallGraph.Nodes.Count:N0}개, " +
                $"메트릭 {_lastAnalysis.Metrics.Functions.Count:N0}개, " +
                $"중복 {_lastAnalysis.Duplicates.Groups.Count:N0}건 · {savePath}";
            ShowFileSaveSuccess(
                this,
                "분석 결과 저장",
                savePath,
                $"함수 {_lastAnalysis.CallGraph.Nodes.Count:N0}개, " +
                $"메트릭 {_lastAnalysis.Metrics.Functions.Count:N0}개, " +
                $"중복 {_lastAnalysis.Duplicates.Groups.Count:N0}건");
        }
        catch (Exception ex)
        {
            ShowFileSaveError(this, "결과 저장 오류", ex, "분석 결과 저장 중 오류가 발생했습니다.", savePath);
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
            ApplyLoadedAnalysisResult(analysis, rootDirectory);
        }
        catch (Exception ex)
        {
            DetailedErrorDialog.Show(this, "결과 불러오기 오류", ex, "분석 결과 불러오기 중 오류가 발생했습니다.");
        }
    }

    private void ApplyLoadedAnalysisResult(AnalysisResult analysis, string rootDirectory)
    {
        if (!string.IsNullOrWhiteSpace(rootDirectory))
        {
            txtRootPath.Text = rootDirectory;
        }

        if (analysis.QualityThresholds is not null)
        {
            _analysisSettings = UserAnalysisSettings.ResolveForAnalysis(analysis.QualityThresholds);
            _enabledInspections = MetricInspectionCatalog.NormalizeScope(_analysisSettings.EnabledInspections);
            UserAnalysisSettings.RegisterDesignerDefaults(_analysisSettings);
        }

        ApplyAnalysisResultsToUi(analysis);

        try
        {
            diagramViewHost.ProjectRootDirectory = txtRootPath.Text.Trim();
            diagramViewHost.ViewKind = GetSelectedViewKind();
            diagramViewHost.SetAnalysis(_lastAnalysis, ResolveRootNodeIds());
            ApplySearchHighlightToViewer();
        }
        catch (Exception ex)
        {
            DetailedErrorDialog.Show(
                this,
                "결과 표시 오류",
                ex,
                "불러온 분석 결과를 화면에 반영하는 중 오류가 발생했습니다.");
        }

        UpdateResultCommandsState();
        lblStatus.Text =
            $"결과 불러오기 완료: 함수 {analysis.CallGraph.Nodes.Count:N0}개, " +
            $"호출 {analysis.CallGraph.Edges.Count:N0}개, " +
            $"메트릭 {analysis.Metrics.Functions.Count:N0}개, " +
            $"중복 {analysis.Duplicates.Groups.Count:N0}건, " +
            $"파일 {analysis.FileRelations.Files.Count:N0}개, " +
            $"타입 {analysis.Structure.Types.Count:N0}개";
    }

    private void toolStripSearchBox_TextChanged(object sender, EventArgs e)
    {
        // Debounce to avoid interrupting Korean IME composition on every keystroke
        _searchDebounceTimer.Stop();
        _searchDebounceTimer.Start();
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
                _searchPopup.ShowResults(_searchResults, GetSearchBoxScreenBounds(), _lastAnalysis);
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
                SelectSearchResult(_searchResults[index], showInfoDialog: true);
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
        SelectSearchResult(item, showInfoDialog: true);
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
                _searchPopup.ShowResults(_searchResults, GetSearchBoxScreenBounds(), _lastAnalysis);
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
            _searchPopup.ShowResults(_searchResults, GetSearchBoxScreenBounds(), _lastAnalysis);
        }
    }

    private void SelectSearchResult(SearchResultItem item, bool showInfoDialog = false)
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
        else if (item.Kind == SearchResultKind.Type)
        {
            if (!IsClassStructureView())
            {
                comboDiagramView.SelectedIndex = 1;
            }

            EnsureClassTypeComboPopulated();
            SelectTypeInRootCombo(item.Id);

            diagramViewHost.ViewKind = GetSelectedViewKind();
            diagramViewHost.SetAnalysis(_lastAnalysis, []);
            diagramViewHost.FocusType(item.Id);
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

        ApplySearchHighlightToViewer();
        _searchPopup.HidePopup();
        lblStatus.Text = SearchResultDetailBuilder.BuildStatusSummary(_lastAnalysis, item);

        if (showInfoDialog)
        {
            SearchResultInfoDialog.ShowForItem(this, _lastAnalysis, item);
        }
    }

    private void EnsureClassTypeComboPopulated()
    {
        if (_lastAnalysis is null)
        {
            return;
        }

        if (comboRootMethod.Items.Count > 0 && comboRootMethod.Items[0] is RootTypeItem)
        {
            return;
        }

        _suppressRootComboChange = true;
        try
        {
            comboRootMethod.Items.Clear();
            comboRootMethod.Items.Add(RootTypeItem.AllTypes);

            foreach (var type in _lastAnalysis.Structure.Types
                         .OrderBy(t => t.DisplayName, StringComparer.OrdinalIgnoreCase))
            {
                comboRootMethod.Items.Add(RootTypeItem.FromType(type));
            }
        }
        finally
        {
            _suppressRootComboChange = false;
        }

        FitComboDropDownWidth();
    }

    private void SelectTypeInRootCombo(string typeId)
    {
        for (var index = 0; index < comboRootMethod.Items.Count; index++)
        {
            if (comboRootMethod.Items[index] is RootTypeItem { IsAllTypes: false, Type: { } type }
                && string.Equals(type.Id, typeId, StringComparison.Ordinal))
            {
                _suppressRootComboChange = true;
                try
                {
                    comboRootMethod.SelectedIndex = index;
                }
                finally
                {
                    _suppressRootComboChange = false;
                }

                return;
            }
        }
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

    private static void ShowFileSaveSuccess(IWin32Window owner, string operationName, string filePath, string? details = null)
    {
        var fullPath = TryGetFullPath(filePath);
        var directory = Path.GetDirectoryName(fullPath) ?? fullPath;
        var message =
            $"{operationName}이(가) 완료되었습니다." +
            $"{Environment.NewLine}{Environment.NewLine}" +
            $"저장된 파일:{Environment.NewLine}{fullPath}{Environment.NewLine}{Environment.NewLine}" +
            $"저장 폴더:{Environment.NewLine}{directory}";

        if (!string.IsNullOrWhiteSpace(details))
        {
            message += $"{Environment.NewLine}{Environment.NewLine}{details}";
        }

        MessageBox.Show(owner, message, $"{operationName} 완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private static string TryGetFullPath(string filePath)
    {
        try
        {
            return Path.GetFullPath(filePath);
        }
        catch
        {
            return filePath;
        }
    }

    private static void ShowFileSaveError(
        IWin32Window owner,
        string title,
        Exception ex,
        string summary,
        string? targetPath = null)
    {
        var message = summary;
        if (!string.IsNullOrWhiteSpace(targetPath))
        {
            var fullPath = TryGetFullPath(targetPath);
            var directory = Path.GetDirectoryName(fullPath) ?? fullPath;
            message +=
                $"{Environment.NewLine}{Environment.NewLine}" +
                $"저장 경로:{Environment.NewLine}{fullPath}{Environment.NewLine}{Environment.NewLine}" +
                $"저장 폴더:{Environment.NewLine}{directory}";
        }

        DetailedErrorDialog.Show(owner, title, ex, message);
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

    private sealed class RootTypeItem
    {
        public static RootTypeItem AllTypes { get; } = new() { IsAllTypes = true };

        public bool IsAllTypes { get; init; }
        public StructureTypeNode? Type { get; init; }

        public static RootTypeItem FromType(StructureTypeNode type) => new() { Type = type };

        public override string ToString() =>
            IsAllTypes ? "(전체 클래스)" : Type!.FullName;
    }

    private void FitComboDropDownWidth()
    {
        if (comboRootMethod.Items.Count == 0)
        {
            return;
        }

        var maxWidth = 0;
        var measured = 0;
        foreach (var item in comboRootMethod.Items)
        {
            if (measured >= AnalysisScaleLimits.MaxComboDropDownMeasureItems)
            {
                break;
            }

            measured++;
            var text = item?.ToString() ?? string.Empty;
            var w = TextRenderer.MeasureText(text, comboRootMethod.Font).Width;
            if (w > maxWidth)
            {
                maxWidth = w;
            }
        }

        comboRootMethod.DropDownWidth = Math.Max(comboRootMethod.Width, Math.Min(maxWidth + 24, 900));
    }

    private void lblLayout_Click(object sender, EventArgs e)
    {

    }
}
