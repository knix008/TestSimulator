using System.Collections;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services;
using CodeAnalyzer.Services.Metrics;
using CodeAnalyzer.Services.Reports;

namespace CodeAnalyzer.Controls;

public sealed class CodeMetricsViewer : UserControl
{
    private readonly TabControl _tabs = new()
    {
        Dock = DockStyle.Fill,
        Padding = new Point(0, 0),
        Margin = new Padding(0)
    };
    private readonly TabPage _tabFiles;
    private readonly TabPage _tabFunctions;
    private readonly TabPage _tabTypes;
    private readonly TabPage _tabPackages;
    private readonly TabPage _tabArchitecture;
    private readonly ListView _functionList = CreateListView();
    private readonly ListView _fileList = CreateListView();
    private readonly ListView _typeList = CreateListView();
    private readonly ListView _packageList = CreateListView();
    private readonly ListView _architectureList = CreateListView();

    private readonly TextBox _archSummaryBox = new()
    {
        Dock = DockStyle.Fill,
        Multiline = true,
        ReadOnly = true,
        ScrollBars = ScrollBars.Vertical,
        Font = SystemFonts.DefaultFont,
        BackColor = Color.FromArgb(245, 247, 252),
        BorderStyle = BorderStyle.None,
        WordWrap = true
    };

    private readonly TextBox _typeCodePreview = new()
    {
        Dock = DockStyle.Fill,
        Multiline = true,
        ReadOnly = true,
        ScrollBars = ScrollBars.Both,
        Font = new Font(FontFamily.GenericMonospace, 9f),
        BackColor = Color.FromArgb(248, 248, 252),
        BorderStyle = BorderStyle.None,
        WordWrap = false
    };

    private readonly ListViewColumnHeaderToolTip _functionHeaderToolTip;
    private readonly ListViewColumnHeaderToolTip _fileHeaderToolTip;
    private readonly ListViewColumnHeaderToolTip _typeHeaderToolTip;
    private readonly ListViewColumnHeaderToolTip _packageHeaderToolTip;
    private readonly ListViewColumnHeaderToolTip _architectureHeaderToolTip;

    private readonly ListViewSorter _functionSorter = new(3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 18, 19);
    private readonly ListViewSorter _fileSorter = new(2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21);
    private readonly ListViewSorter _typeSorter = new(3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16);
    private readonly ListViewSorter _packageSorter = new(1, 2, 3, 4, 5, 6);
    private readonly ListViewSorter _archSorter = new(0);

    private readonly Label _summaryLabel = new()
    {
        Dock = DockStyle.Top,
        Height = 40,
        Padding = new Padding(8, 4, 8, 2),
        AutoEllipsis = true
    };

    private CodeMetricsResult? _metrics;
    private AnalysisResult? _analysis;
    private UserAnalysisSettings _thresholds = new();
    private bool _isAnalyzing;
    private bool _adjustingColumnLayout;
    private bool _columnLayoutScheduled;

    public event Action<MetricsNavigationRequest>? NavigationRequested;

    public CodeMetricsViewer()
    {
        DoubleBuffered = true;
        BackColor = Color.White;

        AddColumns(_functionList, FunctionColumns);
        AddColumns(_fileList, FileColumns);
        AddColumns(_typeList, TypeColumns);
        AddColumns(_packageList, PackageColumns);
        AddColumns(_architectureList, ArchitectureColumns);

        _functionList.ListViewItemSorter = _functionSorter;
        _fileList.ListViewItemSorter = _fileSorter;
        _typeList.ListViewItemSorter = _typeSorter;
        _packageList.ListViewItemSorter = _packageSorter;
        _architectureList.ListViewItemSorter = _archSorter;

        _tabFiles = new TabPage("파일") { Padding = new Padding(0) };
        _tabFiles.Controls.Add(_fileList);

        _tabFunctions = new TabPage("함수") { Padding = new Padding(0) };
        _tabFunctions.Controls.Add(_functionList);

        _tabTypes = new TabPage("타입") { Padding = new Padding(0) };
        var typeSplit = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Horizontal,
            SplitterDistance = 280,
            Panel1MinSize = 80,
            Panel2MinSize = 60
        };
        typeSplit.Panel1.Controls.Add(_typeList);
        typeSplit.Panel2.Controls.Add(_typeCodePreview);
        _tabTypes.Controls.Add(typeSplit);

        _tabPackages = new TabPage("패키지") { Padding = new Padding(0) };
        _tabPackages.Controls.Add(_packageList);

        var archSummaryHeader = new Label
        {
            Dock = DockStyle.Top,
            Height = 20,
            Padding = new Padding(6, 2, 0, 0),
            Text = "요약 정보",
            ForeColor = Color.FromArgb(80, 80, 100),
            Font = new Font(SystemFonts.DefaultFont, FontStyle.Bold),
            BackColor = Color.FromArgb(235, 239, 248)
        };
        var archSummaryPanel = new Panel
        {
            Dock = DockStyle.Fill,
            BackColor = Color.FromArgb(245, 247, 252),
            Padding = new Padding(6, 4, 6, 4)
        };
        archSummaryPanel.Controls.Add(_archSummaryBox);
        archSummaryPanel.Controls.Add(archSummaryHeader);

        var archSplit = new SplitContainer
        {
            Dock = DockStyle.Fill,
            Orientation = Orientation.Horizontal,
            SplitterDistance = 340,
            Panel2MinSize = 60
        };
        archSplit.Panel1.Controls.Add(_architectureList);
        archSplit.Panel2.Controls.Add(archSummaryPanel);

        _tabArchitecture = new TabPage("아키텍처") { Padding = new Padding(0) };
        _tabArchitecture.Controls.Add(archSplit);

        _tabs.TabPages.Add(_tabFiles);
        _tabs.TabPages.Add(_tabFunctions);
        _tabs.TabPages.Add(_tabTypes);
        _tabs.TabPages.Add(_tabPackages);
        _tabs.TabPages.Add(_tabArchitecture);
        ApplyInspectionTabVisibility();

        _functionList.ColumnClick += (_, e) => SortList(_functionList, _functionSorter, e.Column);
        _fileList.ColumnClick += (_, e) => SortList(_fileList, _fileSorter, e.Column);
        _typeList.ColumnClick += (_, e) => SortList(_typeList, _typeSorter, e.Column);
        _packageList.ColumnClick += (_, e) => SortList(_packageList, _packageSorter, e.Column);
        _architectureList.ColumnClick += (_, e) => SortList(_architectureList, _archSorter, e.Column);

        _functionList.DoubleClick += OnListDoubleClick;
        _fileList.DoubleClick += OnListDoubleClick;
        _typeList.DoubleClick += OnListDoubleClick;
        _typeList.SelectedIndexChanged += (_, _) => ShowTypeCode();
        _packageList.DoubleClick += OnListDoubleClick;
        _architectureList.DoubleClick += OnListDoubleClick;
        _tabs.SelectedIndexChanged += (_, _) => ScheduleColumnLayoutAdjust();

        _functionHeaderToolTip = new ListViewColumnHeaderToolTip(
            _functionList,
            EnsureColumnToolTips(FunctionColumns, BuildFunctionHeaderToolTips(_thresholds)));
        _fileHeaderToolTip = new ListViewColumnHeaderToolTip(
            _fileList,
            EnsureColumnToolTips(FileColumns, BuildFileHeaderToolTips(_thresholds)));
        _typeHeaderToolTip = new ListViewColumnHeaderToolTip(
            _typeList,
            EnsureColumnToolTips(TypeColumns, BuildTypeHeaderToolTips(_thresholds)));
        _packageHeaderToolTip = new ListViewColumnHeaderToolTip(
            _packageList,
            EnsureColumnToolTips(PackageColumns, BuildPackageHeaderToolTips(_thresholds)));
        _architectureHeaderToolTip = new ListViewColumnHeaderToolTip(
            _architectureList,
            EnsureColumnToolTips(ArchitectureColumns, ArchitectureHeaderToolTips));

        Controls.Add(_tabs);
        Controls.Add(_summaryLabel);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _functionHeaderToolTip.Dispose();
            _fileHeaderToolTip.Dispose();
            _typeHeaderToolTip.Dispose();
            _packageHeaderToolTip.Dispose();
            _architectureHeaderToolTip.Dispose();
        }

        base.Dispose(disposing);
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        ScheduleColumnLayoutAdjust();
    }

    private void ScheduleColumnLayoutAdjust()
    {
        if (_columnLayoutScheduled || IsDisposed || !IsHandleCreated)
        {
            return;
        }

        _columnLayoutScheduled = true;
        BeginInvoke(ApplyColumnLayout);
    }

    private void ApplyColumnLayout()
    {
        _columnLayoutScheduled = false;
        if (IsDisposed || !IsHandleCreated || _adjustingColumnLayout)
        {
            return;
        }

        _adjustingColumnLayout = true;
        try
        {
            AdjustGuidanceColumnWidths(_functionList, 22, 23);
            AdjustGuidanceColumnWidths(_fileList, 23, 24);
            AdjustGuidanceColumnWidths(_typeList, 18, 19);
            AdjustGuidanceColumnWidths(_packageList, 7, 8);
            AdjustGuidanceColumnWidths(_architectureList, 4, 5);
        }
        finally
        {
            _adjustingColumnLayout = false;
        }
    }

    private static void SortList(ListView list, ListViewSorter sorter, int column)
    {
        sorter.SetColumn(column);
        list.Sort();
    }

    private static void AddColumns(ListView list, ColumnHeader[] columns)
    {
        foreach (var column in columns)
        {
            list.Columns.Add(column);
        }
    }

    private void ShowTypeCode()
    {
        if (_typeList.SelectedItems.Count == 0
            || _typeList.SelectedItems[0].Tag is not TypeMetric type
            || string.IsNullOrWhiteSpace(type.FilePath))
        {
            _typeCodePreview.Clear();
            return;
        }

        if (!File.Exists(type.FilePath))
        {
            _typeCodePreview.Text = $"파일을 찾을 수 없습니다:\n{type.FilePath}";
            return;
        }

        try
        {
            var lines = File.ReadAllLines(type.FilePath);
            var start = Math.Max(0, type.LineNumber - 1);
            var end = Math.Min(lines.Length, start + 150);
            var sb = new System.Text.StringBuilder();
            for (var i = start; i < end; i++)
                sb.AppendLine($"{i + 1,6}  {lines[i]}");
            _typeCodePreview.Text = sb.ToString();
            _typeCodePreview.SelectionStart = 0;
            _typeCodePreview.ScrollToCaret();
        }
        catch (Exception ex)
        {
            _typeCodePreview.Text = $"코드를 불러오는 중 오류:\n{ex.Message}";
        }
    }

    private static ListView CreateListView() => new()
    {
        Dock = DockStyle.Fill,
        View = View.Details,
        FullRowSelect = true,
        GridLines = true,
        MultiSelect = false,
        ShowItemToolTips = true,
        Scrollable = true
    };

    private static readonly ColumnHeader[] FunctionColumns =
    [
        new() { Text = "언어", Width = 72 },
        new() { Text = "함수", Width = 140 },
        new() { Text = "파일", Width = 150 },
        new() { Text = "줄", Width = 48, TextAlign = HorizontalAlignment.Right },
        new() { Text = "CC", Width = 48, TextAlign = HorizontalAlignment.Right },
        new() { Text = "인지", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "중첩", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "매개", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "return", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "매직", Width = 48, TextAlign = HorizontalAlignment.Right },
        new() { Text = "In", Width = 44, TextAlign = HorizontalAlignment.Right },
        new() { Text = "Out", Width = 44, TextAlign = HorizontalAlignment.Right },
        new() { Text = "MI", Width = 48, TextAlign = HorizontalAlignment.Right },
        new() { Text = "문장", Width = 48, TextAlign = HorizontalAlignment.Right },
        new() { Text = "case", Width = 44, TextAlign = HorizontalAlignment.Right },
        new() { Text = "catch", Width = 48, TextAlign = HorizontalAlignment.Right },
        new() { Text = "async", Width = 44, TextAlign = HorizontalAlignment.Center },
        new() { Text = "미사용?", Width = 52, TextAlign = HorizontalAlignment.Center },
        new() { Text = "Halstead", Width = 64, TextAlign = HorizontalAlignment.Right },
        new() { Text = "WMC", Width = 44, TextAlign = HorizontalAlignment.Right },
        new() { Text = "정밀", Width = 56 },
        new() { Text = "상태", Width = 52 },
        new() { Text = "설명", Width = 220 },
        new() { Text = "대처 방안", Width = 220 }
    ];

    private static readonly ColumnHeader[] FileColumns =
    [
        new() { Text = "언어", Width = 72 },
        new() { Text = "파일", Width = 180 },
        new() { Text = "코드줄", Width = 64, TextAlign = HorizontalAlignment.Right },
        new() { Text = "함수", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "CC↑", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "인지↑", Width = 56, TextAlign = HorizontalAlignment.Right },
        new() { Text = "중첩↑", Width = 56, TextAlign = HorizontalAlignment.Right },
        new() { Text = "Out↑", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "In↑", Width = 48, TextAlign = HorizontalAlignment.Right },
        new() { Text = "매직Σ", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "MI↓", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "TODO", Width = 56, TextAlign = HorizontalAlignment.Right },
        new() { Text = "TODO/100", Width = 76, TextAlign = HorizontalAlignment.Right },
        new() { Text = "경고", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "주석%", Width = 56, TextAlign = HorizontalAlignment.Right },
        new() { Text = "중복줄", Width = 56, TextAlign = HorizontalAlignment.Right },
        new() { Text = "public", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "Git줄", Width = 56, TextAlign = HorizontalAlignment.Right },
        new() { Text = "보안", Width = 44, TextAlign = HorizontalAlignment.Right },
        new() { Text = "문장↑", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "case↑", Width = 48, TextAlign = HorizontalAlignment.Right },
        new() { Text = "asyncΣ", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "상태", Width = 52 },
        new() { Text = "설명", Width = 220 },
        new() { Text = "대처 방안", Width = 220 }
    ];

    private static readonly ColumnHeader[] TypeColumns =
    [
        new() { Text = "종류", Width = 64 },
        new() { Text = "타입", Width = 160 },
        new() { Text = "파일", Width = 150 },
        new() { Text = "멤버", Width = 48, TextAlign = HorizontalAlignment.Right },
        new() { Text = "연산", Width = 48, TextAlign = HorizontalAlignment.Right },
        new() { Text = "함수", Width = 48, TextAlign = HorizontalAlignment.Right },
        new() { Text = "CC↑", Width = 48, TextAlign = HorizontalAlignment.Right },
        new() { Text = "인지↑", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "MI↓", Width = 48, TextAlign = HorizontalAlignment.Right },
        new() { Text = "의존→", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "←의존", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "LCOM", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "DIT", Width = 44, TextAlign = HorizontalAlignment.Right },
        new() { Text = "NOC", Width = 44, TextAlign = HorizontalAlignment.Right },
        new() { Text = "WMC", Width = 44, TextAlign = HorizontalAlignment.Right },
        new() { Text = "RFC", Width = 44, TextAlign = HorizontalAlignment.Right },
        new() { Text = "상태", Width = 52 },
        new() { Text = "설명", Width = 220 },
        new() { Text = "대처 방안", Width = 220 }
    ];

    private static readonly ColumnHeader[] PackageColumns =
    [
        new() { Text = "디렉터리", Width = 220 },
        new() { Text = "Ca", Width = 44, TextAlign = HorizontalAlignment.Right },
        new() { Text = "Ce", Width = 44, TextAlign = HorizontalAlignment.Right },
        new() { Text = "I", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "A", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "D", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "상태", Width = 52 },
        new() { Text = "설명", Width = 220 },
        new() { Text = "대처 방안", Width = 220 }
    ];

    private static readonly ColumnHeader[] ArchitectureColumns =
    [
        new() { Text = "#", Width = 40, TextAlign = HorizontalAlignment.Right },
        new() { Text = "유형", Width = 96 },
        new() { Text = "내용", Width = 280 },
        new() { Text = "상태", Width = 52 },
        new() { Text = "설명", Width = 220 },
        new() { Text = "대처 방안", Width = 220 }
    ];

    public void SetMetrics(
        CodeMetricsResult? metrics,
        UserAnalysisSettings? thresholds = null,
        AnalysisResult? analysis = null)
    {
        try
        {
            var nextThresholds = thresholds ?? analysis?.QualityThresholds ?? new UserAnalysisSettings();
            if (ReferenceEquals(_metrics, metrics)
                && ReferenceEquals(_analysis, analysis)
                && ThresholdsEqual(_thresholds, nextThresholds))
            {
                ScheduleColumnLayoutAdjust();
                return;
            }

            _metrics = metrics;
            _analysis = analysis;
            _thresholds = nextThresholds;
            _functionHeaderToolTip.UpdateColumnToolTips(
                EnsureColumnToolTips(FunctionColumns, BuildFunctionHeaderToolTips(_thresholds)));
            _fileHeaderToolTip.UpdateColumnToolTips(
                EnsureColumnToolTips(FileColumns, BuildFileHeaderToolTips(_thresholds)));
            _typeHeaderToolTip.UpdateColumnToolTips(
                EnsureColumnToolTips(TypeColumns, BuildTypeHeaderToolTips(_thresholds)));
            _packageHeaderToolTip.UpdateColumnToolTips(
                EnsureColumnToolTips(PackageColumns, BuildPackageHeaderToolTips(_thresholds)));
            ApplyInspectionTabVisibility();
            ViewFailureReporter.Clear(this);
            RebuildLists();
        }
        catch (Exception ex)
        {
            _metrics = null;
            _functionList.Items.Clear();
            _fileList.Items.Clear();
            _typeList.Items.Clear();
            _packageList.Items.Clear();
            _architectureList.Items.Clear();
            _summaryLabel.Text = $"메트릭 표시 오류: {ex.Message}";
            ViewFailureReporter.Report(
                this,
                DiagramViewDisplayNames.Get(DiagramViewKind.CodeMetrics),
                "구성",
                ex);
        }
    }

    public void BeginAnalysis()
    {
        _isAnalyzing = true;
        _metrics = null;
        _functionList.Items.Clear();
        _fileList.Items.Clear();
        _typeList.Items.Clear();
        _packageList.Items.Clear();
        _architectureList.Items.Clear();
        _summaryLabel.Text = "코드 메트릭 분석 중...";
    }

    public void EndAnalysis()
    {
        _isAnalyzing = false;
    }

    private void RebuildLists()
    {
        _functionList.BeginUpdate();
        _fileList.BeginUpdate();
        _typeList.BeginUpdate();
        _packageList.BeginUpdate();
        _architectureList.BeginUpdate();
        _functionList.Items.Clear();
        _fileList.Items.Clear();
        _typeList.Items.Clear();
        _packageList.Items.Clear();
        _architectureList.Items.Clear();

        if (_metrics is null || (_metrics.Functions.Count == 0 && _metrics.FileAggregates.Count == 0))
        {
            _summaryLabel.Text = _isAnalyzing
                ? "코드 메트릭 분석 중..."
                : "표시할 메트릭이 없습니다. 분석 실행 후 결과가 여기에 표시됩니다.";
            _functionList.EndUpdate();
            _fileList.EndUpdate();
            _typeList.EndUpdate();
            _packageList.EndUpdate();
            _architectureList.EndUpdate();
            return;
        }

        var summary = _metrics.Summary;
        var functionTruncated = _metrics.Functions.Count > AnalysisScaleLimits.MaxCodeMetricsUiFunctions;
        var fileTruncated = (_metrics.FileAggregates.Count > 0 ? _metrics.FileAggregates.Count : _metrics.Files.Count)
            > AnalysisScaleLimits.MaxCodeMetricsUiFiles;
        var typeCount = _analysis?.Structure.Types.Count ?? 0;
        _summaryLabel.Text = BuildSummaryText(summary, typeCount, functionTruncated, fileTruncated);

        if (MetricInspectionScope.IsEnabled(_thresholds.EnabledInspections, MetricInspectionKind.ShowFunctionsTab))
        {
            ViewProgressReporter.Report(25, "함수 메트릭 목록을 구성하는 중...");
            BuildFunctionList();
        }

        if (MetricInspectionScope.IsEnabled(_thresholds.EnabledInspections, MetricInspectionKind.ShowFilesTab))
        {
            ViewProgressReporter.Report(45, "파일 메트릭 목록을 구성하는 중...");
            BuildFileList();
        }

        if (MetricInspectionScope.IsEnabled(_thresholds.EnabledInspections, MetricInspectionKind.ShowTypesTab))
        {
            ViewProgressReporter.Report(60, "타입 메트릭 목록을 구성하는 중...");
            BuildTypeList();
        }

        if (MetricInspectionScope.IsEnabled(_thresholds.EnabledInspections, MetricInspectionKind.ShowPackagesTab))
        {
            ViewProgressReporter.Report(75, "패키지 메트릭 목록을 구성하는 중...");
            BuildPackageList();
        }

        if (MetricInspectionScope.IsEnabled(_thresholds.EnabledInspections, MetricInspectionKind.ShowArchitectureTab))
        {
            ViewProgressReporter.Report(90, "아키텍처 인사이트를 구성하는 중...");
            BuildArchitectureList();
        }

        _functionList.EndUpdate();
        _fileList.EndUpdate();
        _typeList.EndUpdate();
        _packageList.EndUpdate();
        _architectureList.EndUpdate();
        ScheduleColumnLayoutAdjust();
    }

    private static List<FunctionMetric> SelectFunctionsForUi(
        IReadOnlyList<FunctionMetric> functions,
        UserAnalysisSettings thresholds,
        int maxCount)
    {
        if (functions.Count <= maxCount)
        {
            return functions
                .OrderByDescending(f => FileMetricsAggregator.GetFunctionWarningLevel(f, thresholds))
                .ThenByDescending(f => f.CyclomaticComplexity)
                .ThenByDescending(f => f.CognitiveComplexity)
                .ToList();
        }

        var queue = new PriorityQueue<FunctionMetric, (int Level, int Cc, int Cog)>();
        foreach (var func in functions)
        {
            var level = (int)FileMetricsAggregator.GetFunctionWarningLevel(func, thresholds);
            queue.Enqueue(func, (level, func.CyclomaticComplexity, func.CognitiveComplexity));
            if (queue.Count > maxCount)
            {
                queue.Dequeue();
            }
        }

        var selected = new List<FunctionMetric>(queue.Count);
        while (queue.Count > 0)
        {
            selected.Add(queue.Dequeue());
        }

        selected.Sort((a, b) =>
        {
            var levelCompare = ((int)FileMetricsAggregator.GetFunctionWarningLevel(b, thresholds))
                .CompareTo((int)FileMetricsAggregator.GetFunctionWarningLevel(a, thresholds));
            if (levelCompare != 0)
            {
                return levelCompare;
            }

            var ccCompare = b.CyclomaticComplexity.CompareTo(a.CyclomaticComplexity);
            return ccCompare != 0 ? ccCompare : b.CognitiveComplexity.CompareTo(a.CognitiveComplexity);
        });

        return selected;
    }

    private static List<FileAggregateMetric> SelectFilesForUi(
        IReadOnlyList<FileAggregateMetric> files,
        UserAnalysisSettings thresholds,
        int maxCount)
    {
        if (files.Count <= maxCount)
        {
            return files
                .OrderByDescending(f => FileMetricsAggregator.GetFileWarningLevel(f, thresholds))
                .ThenByDescending(f => f.MaxCyclomaticComplexity)
                .ToList();
        }

        var queue = new PriorityQueue<FileAggregateMetric, (int Level, int MaxCc)>();
        foreach (var file in files)
        {
            var level = (int)FileMetricsAggregator.GetFileWarningLevel(file, thresholds);
            queue.Enqueue(file, (level, file.MaxCyclomaticComplexity));
            if (queue.Count > maxCount)
            {
                queue.Dequeue();
            }
        }

        var selected = new List<FileAggregateMetric>(queue.Count);
        while (queue.Count > 0)
        {
            selected.Add(queue.Dequeue());
        }

        selected.Sort((a, b) =>
        {
            var levelCompare = ((int)FileMetricsAggregator.GetFileWarningLevel(b, thresholds))
                .CompareTo((int)FileMetricsAggregator.GetFileWarningLevel(a, thresholds));
            return levelCompare != 0
                ? levelCompare
                : b.MaxCyclomaticComplexity.CompareTo(a.MaxCyclomaticComplexity);
        });

        return selected;
    }

    private void BuildFunctionList()
    {
        foreach (var func in SelectFunctionsForUi(
                     _metrics!.Functions,
                     _thresholds,
                     AnalysisScaleLimits.MaxCodeMetricsUiFunctions))
        {
            var item = new ListViewItem(GetLanguageDisplay(func.LanguageId));
            item.SubItems.Add(func.DisplayName);
            item.SubItems.Add(Path.GetFileName(func.FilePath));
            item.SubItems.Add(func.LineCount.ToString());
            item.SubItems.Add(func.CyclomaticComplexity.ToString());
            item.SubItems.Add(func.CognitiveComplexity.ToString());
            item.SubItems.Add(func.MaxNestingDepth.ToString());
            item.SubItems.Add(func.ParameterCount.ToString());
            item.SubItems.Add(func.ReturnCount.ToString());
            item.SubItems.Add(func.MagicNumberCount.ToString());
            item.SubItems.Add(func.FanIn.ToString());
            item.SubItems.Add(func.FanOut.ToString());
            item.SubItems.Add(func.MaintenanceIndex.ToString("F0"));
            item.SubItems.Add(func.StatementCount.ToString());
            item.SubItems.Add(func.SwitchCaseCount.ToString());
            item.SubItems.Add(FormatCatchCounts(func));
            item.SubItems.Add(FormatFlag(func.IsAsyncVoid));
            item.SubItems.Add(FormatFlag(func.IsPossiblyUnused));
            item.SubItems.Add(func.HalsteadVolume > 0 ? func.HalsteadVolume.ToString() : "-");
            item.SubItems.Add(func.WeightedMethodComplexity > 0 ? func.WeightedMethodComplexity.ToString() : "-");
            item.SubItems.Add(FormatPrecision(func.Precision));
            var level = FileMetricsAggregator.GetFunctionWarningLevel(func, _thresholds);
            var guidance = FileMetricsAggregator.BuildFunctionGuidance(func, _thresholds);
            item.SubItems.Add(FormatWarningLevel(level));
            item.SubItems.Add(guidance.Meaning);
            item.SubItems.Add(guidance.Action);
            item.Tag = func;
            item.ToolTipText = $"{guidance.Meaning}{Environment.NewLine}{Environment.NewLine}대처: {guidance.Action}";

            ApplyWarningColor(item, level);

            _functionList.Items.Add(item);
        }
    }

    private void BuildFileList()
    {
        var fileRows = _metrics!.FileAggregates.Count > 0
            ? _metrics.FileAggregates
            : BuildFallbackFileRows();

        foreach (var file in SelectFilesForUi(
                     fileRows,
                     _thresholds,
                     AnalysisScaleLimits.MaxCodeMetricsUiFiles))
        {
            var item = new ListViewItem(GetLanguageDisplay(file.LanguageId));
            item.SubItems.Add(Path.GetFileName(file.FilePath));
            item.SubItems.Add(file.CodeLines.ToString());
            item.SubItems.Add(file.FunctionCount.ToString());
            item.SubItems.Add(file.MaxCyclomaticComplexity.ToString());
            item.SubItems.Add(file.MaxCognitiveComplexity.ToString());
            item.SubItems.Add(file.MaxNestingDepth.ToString());
            item.SubItems.Add(file.MaxFanOut.ToString());
            item.SubItems.Add(file.MaxFanIn.ToString());
            item.SubItems.Add(file.TotalMagicNumbers.ToString());
            item.SubItems.Add(file.MinMaintenanceIndex.ToString("F0"));
            item.SubItems.Add(file.TodoMarkerCount.ToString());
            item.SubItems.Add(file.TodoDensityPer100Lines.ToString("F1"));
            item.SubItems.Add(file.WarningFunctionCount.ToString());
            item.SubItems.Add(file.CommentPercentPer100Code.ToString("F1"));
            item.SubItems.Add(file.DuplicateLineCount.ToString());
            item.SubItems.Add(file.PublicApiCount.ToString());
            item.SubItems.Add(file.GitChangeLineCount > 0 ? file.GitChangeLineCount.ToString() : "-");
            item.SubItems.Add(file.SecuritySmellCount.ToString());
            item.SubItems.Add(file.MaxStatementCount.ToString());
            item.SubItems.Add(file.MaxSwitchCaseCount.ToString());
            item.SubItems.Add(file.AsyncVoidCount.ToString());
            var level = FileMetricsAggregator.GetFileWarningLevel(file, _thresholds);
            var guidance = FileMetricsAggregator.BuildFileGuidance(file, _thresholds);
            item.SubItems.Add(FormatWarningLevel(level));
            item.SubItems.Add(guidance.Meaning);
            item.SubItems.Add(guidance.Action);
            item.Tag = file;
            item.ToolTipText = $"{guidance.Meaning}{Environment.NewLine}{Environment.NewLine}대처: {guidance.Action}";

            ApplyWarningColor(item, level);

            _fileList.Items.Add(item);
        }
    }

    private void BuildTypeList()
    {
        if (_analysis is null || _analysis.Structure.Types.Count == 0)
        {
            return;
        }

        var typeMetrics = TypeMetricsBuilder.Build(
            _analysis.Structure,
            _metrics!.Functions,
            _thresholds);

        var maxCount = AnalysisScaleLimits.MaxCodeMetricsUiFiles;
        var rows = typeMetrics.Count <= maxCount
            ? typeMetrics
            : typeMetrics
                .OrderByDescending(metric => FileMetricsAggregator.GetTypeWarningLevel(metric, _thresholds))
                .ThenByDescending(metric => metric.MemberCount + metric.OperationCount)
                .Take(maxCount)
                .ToList();

        foreach (var type in rows)
        {
            var level = FileMetricsAggregator.GetTypeWarningLevel(type, _thresholds);
            var guidance = FileMetricsAggregator.BuildTypeGuidance(type, _thresholds);
            var item = new ListViewItem(type.Kind);
            item.SubItems.Add(type.DisplayName);
            item.SubItems.Add(Path.GetFileName(type.FilePath));
            item.SubItems.Add(type.MemberCount.ToString());
            item.SubItems.Add(type.OperationCount.ToString());
            item.SubItems.Add(type.MatchedFunctionCount.ToString());
            item.SubItems.Add(type.MaxCyclomaticComplexity.ToString());
            item.SubItems.Add(type.MaxCognitiveComplexity.ToString());
            item.SubItems.Add(type.MinMaintenanceIndex.ToString("F0"));
            item.SubItems.Add(type.DependencyOutCount.ToString());
            item.SubItems.Add(type.DependencyInCount.ToString());
            item.SubItems.Add(type.LackOfCohesion > 0 ? type.LackOfCohesion.ToString("F2") : "-");
            item.SubItems.Add(type.DepthOfInheritance > 0 ? type.DepthOfInheritance.ToString() : "-");
            item.SubItems.Add(type.NumberOfChildren > 0 ? type.NumberOfChildren.ToString() : "-");
            item.SubItems.Add(type.WeightedMethodCount > 0 ? type.WeightedMethodCount.ToString() : "-");
            item.SubItems.Add(type.ResponseForClass > 0 ? type.ResponseForClass.ToString() : "-");
            item.SubItems.Add(FormatWarningLevel(level));
            item.SubItems.Add(guidance.Meaning);
            item.SubItems.Add(guidance.Action);
            item.Tag = type;
            item.ToolTipText = $"{guidance.Meaning}{Environment.NewLine}{Environment.NewLine}대처: {guidance.Action}";
            ApplyWarningColor(item, level);
            _typeList.Items.Add(item);
        }
    }

    private void BuildPackageList()
    {
        if (_metrics!.Packages.Count == 0)
        {
            return;
        }

        foreach (var package in _metrics.Packages
                     .OrderByDescending(pkg => pkg.Instability)
                     .ThenByDescending(pkg => pkg.EfferentCoupling + pkg.AfferentCoupling))
        {
            var level = package.Instability >= _thresholds.WarnInstability
                ? WarningLevel.Warning
                : WarningLevel.None;
            var item = new ListViewItem(package.DirectoryPath);
            item.SubItems.Add(package.AfferentCoupling.ToString());
            item.SubItems.Add(package.EfferentCoupling.ToString());
            item.SubItems.Add(package.Instability.ToString("F2"));
            item.SubItems.Add(package.Abstractness.ToString("F2"));
            item.SubItems.Add(package.DistanceFromMainSequence.ToString("F2"));
            item.SubItems.Add(FormatWarningLevel(level));
            var guidance = FileMetricsAggregator.BuildPackageGuidance(package, _thresholds);
            item.SubItems.Add(guidance.Meaning);
            item.SubItems.Add(guidance.Action);
            item.Tag = package;
            item.ToolTipText =
                $"{package.DirectoryPath} · Ca {package.AfferentCoupling} · Ce {package.EfferentCoupling} · " +
                $"I {package.Instability:F2} · A {package.Abstractness:F2} · D {package.DistanceFromMainSequence:F2}" +
                $"{Environment.NewLine}{Environment.NewLine}{guidance.Meaning}{Environment.NewLine}대처: {guidance.Action}";
            ApplyWarningColor(item, level);
            _packageList.Items.Add(item);
        }
    }

    private static bool IsArchitectureSummaryInsight(ArchitectureInsight insight) =>
        insight.IsCategorySummary;

    private void BuildArchitectureList()
    {
        _archSummaryBox.Clear();

        if (_analysis is null)
        {
            var summary = _metrics!.Summary;
            var fallbackItem = new ListViewItem("1");
            fallbackItem.SubItems.Add("요약");
            fallbackItem.SubItems.Add(
                $"중복 줄 {summary.DuplicateLineCount:N0} ({summary.ProjectDuplicateLinePercent:F1}%) · " +
                $"순환 호출 {summary.CircularCallChainCount}건 · TODO 표식 {summary.TotalTodoMarkers}개");
            fallbackItem.SubItems.Add(FormatWarningLevel(WarningLevel.None));
            fallbackItem.SubItems.Add("분석 결과가 없어 상세 인사이트 설명을 표시할 수 없습니다.");
            fallbackItem.SubItems.Add("프로젝트를 분석한 뒤 다시 확인하세요.");
            fallbackItem.ToolTipText = fallbackItem.SubItems[4].Text;
            _architectureList.Items.Add(fallbackItem);
            return;
        }

        var insights = ArchitectureMetricsBuilder.BuildInsights(
            _metrics!,
            _analysis.CallGraph,
            _analysis.FileRelations,
            _analysis.DirectoryRelations,
            _analysis.Structure,
            _analysis.Duplicates,
            _thresholds,
            _analysis.GlobalVariables,
            _analysis.DatabaseSchema);

        // 요약 항목 → 하단 요약 패널
        var summaryLines = insights
            .Where(IsArchitectureSummaryInsight)
            .Select(i => $"[{i.Category}]  {i.Description}");
        _archSummaryBox.Text = string.Join(Environment.NewLine + Environment.NewLine, summaryLines);

        // 상세 항목 → 리스트
        var index = 1;
        foreach (var insight in insights.Where(i => !IsArchitectureSummaryInsight(i)))
        {
            var meaning = AnalysisReportRemediationTexts.ForInsightMeaning(insight);
            var remediation = AnalysisReportRemediationTexts.ForInsight(insight);
            var item = new ListViewItem(index.ToString());
            item.SubItems.Add(insight.Category);
            item.SubItems.Add(insight.Description);
            item.SubItems.Add(FormatWarningLevel(insight.Severity));
            item.SubItems.Add(meaning);
            item.SubItems.Add(remediation);
            item.Tag = insight.NavigationTag;
            item.ToolTipText = $"{meaning}{Environment.NewLine}{Environment.NewLine}대처: {remediation}";
            ApplyWarningColor(item, insight.Severity);
            _architectureList.Items.Add(item);
            index++;
        }
    }

    private static int GetAvailableListClientWidth(ListView list)
    {
        if (list.ClientSize.Width <= 0)
        {
            return 0;
        }

        var width = list.ClientSize.Width - 4;
        if (list.Items.Count == 0 || list.ClientSize.Height <= 0)
        {
            return Math.Max(0, width);
        }

        // GetItemRect는 BeginUpdate·레이아웃 중 ArgumentOutOfRangeException을 일으킬 수 있어 추정치를 사용합니다.
        var estimatedItemHeight = Math.Max(18, list.Font.Height + 4);
        if (list.Items.Count * estimatedItemHeight > list.ClientSize.Height)
        {
            width -= SystemInformation.VerticalScrollBarWidth;
        }

        return Math.Max(0, width);
    }

    private static void AdjustGuidanceColumnWidths(
        ListView list,
        int meaningColumnIndex,
        int actionColumnIndex,
        int minWidth = 160)
    {
        if (list.Columns.Count <= actionColumnIndex
            || list.ClientSize.Width <= 0
            || !list.IsHandleCreated)
        {
            return;
        }

        var fixedWidth = 0;
        for (var i = 0; i < list.Columns.Count; i++)
        {
            if (i != meaningColumnIndex && i != actionColumnIndex)
            {
                fixedWidth += list.Columns[i].Width;
            }
        }

        var availableWidth = Math.Max(minWidth * 2, GetAvailableListClientWidth(list) - fixedWidth);
        var meaningWidth = Math.Max(minWidth, (int)(availableWidth * 0.48));
        var actionWidth = Math.Max(minWidth, availableWidth - meaningWidth);
        SetColumnWidthIfChanged(list.Columns[meaningColumnIndex], meaningWidth);
        SetColumnWidthIfChanged(list.Columns[actionColumnIndex], actionWidth);
    }

    private static void SetColumnWidthIfChanged(ColumnHeader column, int targetWidth)
    {
        if (Math.Abs(column.Width - targetWidth) <= 2)
        {
            return;
        }

        column.Width = targetWidth;
    }

    private void OnListDoubleClick(object? sender, EventArgs e)
    {
        if (sender is not ListView list || list.SelectedItems.Count == 0)
        {
            return;
        }

        var tag = list.SelectedItems[0].Tag;

        if (tag is FunctionMetric functionMetric)
        {
            SourceFileOpener.TryOpen(functionMetric.FilePath, functionMetric.StartLine);
            return;
        }

        MetricsNavigationRequest? request = tag switch
        {
            CircularCallChain chain => BuildCycleNavigation(chain),
            FileRelationEdge edge => BuildFileEdgeNavigation(edge),
            DirectoryRelationEdge edge => BuildDirectoryEdgeNavigation(edge),
            DuplicateCodeGroup group => BuildDuplicateNavigation(group),
            FileAggregateMetric file => new MetricsNavigationRequest { FilePath = file.FilePath },
            TypeMetric type => new MetricsNavigationRequest { FilePath = type.FilePath, LineNumber = type.LineNumber },
            GlobalVariableItem variable => new MetricsNavigationRequest
            {
                ShowGlobalVariableAccessGraph = variable
            },
            DatabaseTable table => new MetricsNavigationRequest
            {
                FilePath = table.FilePath,
                LineNumber = table.LineNumber
            },
            _ => null
        };

        if (request is not null && HasNavigationTarget(request))
        {
            NavigationRequested?.Invoke(request);
            return;
        }

        string? filePath = tag switch
        {
            FileAggregateMetric file => file.FilePath,
            TypeMetric type => type.FilePath,
            GlobalVariableItem variable => variable.FilePath,
            DatabaseTable table => table.FilePath,
            _ => null
        };

        if (filePath is not null)
        {
            var line = tag switch
            {
                TypeMetric type => type.LineNumber,
                GlobalVariableItem variable => variable.LineNumber,
                DatabaseTable table => table.LineNumber,
                _ => 1
            };
            SourceFileOpener.TryOpen(filePath, line);
        }
    }

    private MetricsNavigationRequest BuildCycleNavigation(CircularCallChain chain)
    {
        if (chain.NodeIds.Count == 0)
        {
            return new MetricsNavigationRequest();
        }

        return new MetricsNavigationRequest
        {
            CallGraphNodeId = chain.NodeIds[0],
            HighlightCallGraphNodeIds = chain.NodeIds
        };
    }

    private MetricsNavigationRequest? BuildFileEdgeNavigation(FileRelationEdge edge)
    {
        if (_analysis is null
            || !_analysis.FileRelations.FileMap.TryGetValue(edge.FromFileId, out var file))
        {
            return null;
        }

        return new MetricsNavigationRequest
        {
            FilePath = file.FilePath
        };
    }

    private MetricsNavigationRequest? BuildDirectoryEdgeNavigation(DirectoryRelationEdge edge)
    {
        if (_analysis is null
            || !_analysis.DirectoryRelations.DirectoryMap.TryGetValue(edge.FromDirectoryId, out var directory)
            || !Directory.Exists(directory.DirectoryPath))
        {
            return null;
        }

        var extensions = LanguageRegistry.All
            .SelectMany(language => language.Extensions)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        try
        {
            var filePath = Directory.EnumerateFiles(directory.DirectoryPath, "*.*", SearchOption.AllDirectories)
                .FirstOrDefault(path => extensions.Contains(Path.GetExtension(path)));

            return filePath is null
                ? null
                : new MetricsNavigationRequest { FilePath = filePath };
        }
        catch
        {
            return null;
        }
    }

    private static bool HasNavigationTarget(MetricsNavigationRequest request) =>
        request.ShowGlobalVariableAccessGraph is not null
        || !string.IsNullOrWhiteSpace(request.CallGraphNodeId)
        || (!string.IsNullOrWhiteSpace(request.FilePath) && File.Exists(request.FilePath));

    private static MetricsNavigationRequest? BuildDuplicateNavigation(DuplicateCodeGroup group)
    {
        var fragment = group.Fragments.FirstOrDefault();
        if (fragment is null)
        {
            return null;
        }

        return new MetricsNavigationRequest
        {
            FilePath = fragment.FilePath,
            LineNumber = fragment.StartLine
        };
    }

    private IReadOnlyList<FileAggregateMetric> BuildFallbackFileRows()
    {
        return _metrics!.Files.Select(file => new FileAggregateMetric
        {
            FilePath = file.FilePath,
            LanguageId = file.LanguageId,
            PhysicalLines = file.PhysicalLines,
            CodeLines = file.CodeLines,
            TodoMarkerCount = file.TodoMarkerCount,
            TodoDensityPer100Lines = file.TodoDensityPer100Lines,
            CommentPercentPer100Code = file.CommentPercentPer100Code,
            FunctionCount = 0,
            MinMaintenanceIndex = 100
        }).ToList();
    }

    private static void ApplyWarningColor(ListViewItem item, WarningLevel level)
    {
        switch (level)
        {
            case WarningLevel.Warning:
                item.BackColor = Color.FromArgb(255, 245, 190);
                item.ForeColor = Color.FromArgb(120, 90, 0);
                break;
            case WarningLevel.Critical:
                item.BackColor = Color.FromArgb(255, 205, 205);
                item.ForeColor = Color.FromArgb(160, 30, 30);
                break;
        }
    }

    private static string GetLanguageDisplay(string languageId) =>
        LanguageRegistry.All
            .FirstOrDefault(language => language.Id.Equals(languageId, StringComparison.OrdinalIgnoreCase))
            ?.DisplayName ?? languageId;

    private static string FormatPrecision(MetricsPrecision precision) =>
        precision switch
        {
            MetricsPrecision.Semantic => "의미",
            MetricsPrecision.Syntax => "구문",
            _ => "근사"
        };

    private static string FormatWarningLevel(WarningLevel level) =>
        level switch
        {
            WarningLevel.Critical => "심각",
            WarningLevel.Warning => "경고",
            _ => "정상"
        };

    private static string FormatCatchCounts(FunctionMetric func) =>
        func.EmptyCatchCount == 0 && func.BroadCatchCount == 0
            ? "-"
            : $"{func.EmptyCatchCount}+{func.BroadCatchCount}";

    private static string FormatFlag(bool value) => value ? "Y" : "-";

    private void ApplyInspectionTabVisibility()
    {
        var scope = _thresholds.EnabledInspections;
        SetTabVisible(_tabFiles, MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ShowFilesTab));
        SetTabVisible(_tabFunctions, MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ShowFunctionsTab));
        SetTabVisible(_tabTypes, MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ShowTypesTab));
        SetTabVisible(
            _tabPackages,
            MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ShowPackagesTab)
            && _metrics?.Packages.Count > 0);
        SetTabVisible(_tabArchitecture, MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ShowArchitectureTab));
    }

    private void SetTabVisible(TabPage tab, bool visible)
    {
        if (visible)
        {
            if (!_tabs.TabPages.Contains(tab))
            {
                var order = tab switch
                {
                    _ when ReferenceEquals(tab, _tabFiles) => 0,
                    _ when ReferenceEquals(tab, _tabFunctions) => 1,
                    _ when ReferenceEquals(tab, _tabTypes) => 2,
                    _ when ReferenceEquals(tab, _tabPackages) => 3,
                    _ => 4
                };
                _tabs.TabPages.Insert(Math.Min(order, _tabs.TabPages.Count), tab);
            }
        }
        else if (_tabs.TabPages.Contains(tab))
        {
            _tabs.TabPages.Remove(tab);
        }
    }

    private string BuildSummaryText(
        CodeQualitySummary summary,
        int typeCount,
        bool functionTruncated,
        bool fileTruncated)
    {
        var scope = _thresholds.EnabledInspections;
        var parts = new List<string>
        {
            $"파일 {_metrics!.Files.Count}",
            $"코드 줄 {summary.TotalCodeLines:N0}",
            $"함수 {_metrics.Functions.Count:N0}"
        };

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ShowTypesTab))
        {
            parts.Add($"타입 {typeCount:N0}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.DuplicateCodeGroups)
            || MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.FileDuplicateLines))
        {
            parts.Add($"중복 {summary.ProjectDuplicateLinePercent:F1}%");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CircularCalls))
        {
            parts.Add($"순환 {summary.CircularCallChainCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.TodoDensity))
        {
            parts.Add($"TODO {summary.TotalTodoMarkers}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.ReturnCount))
        {
            parts.Add($"return↑ {summary.HighReturnCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.MagicNumbers))
        {
            parts.Add($"매직↑ {summary.HighMagicNumberCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.GodFile))
        {
            parts.Add($"God파일 {summary.GodFileCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.LowCommentRatio))
        {
            parts.Add($"주석↓ {summary.LowCommentFileCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.PossiblyUnusedCode))
        {
            parts.Add($"미사용? {summary.PossiblyUnusedCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.TestCodeRatio))
        {
            parts.Add($"테스트 {summary.TestCodeLinePercent:F1}%");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.SecuritySmells))
        {
            parts.Add($"보안 {summary.SecuritySmellFileCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.GitHotspot))
        {
            parts.Add($"핫스팟 {summary.GitHotspotFileCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.StatementCount))
        {
            parts.Add($"문장↑ {summary.HighStatementCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.SwitchCaseCount))
        {
            parts.Add($"case↑ {summary.HighSwitchCaseCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.CatchQuality))
        {
            parts.Add($"catch {summary.EmptyCatchFunctionCount}+{summary.BroadCatchFunctionCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.AsyncVoid))
        {
            parts.Add($"async void {summary.AsyncVoidCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.PublicApiDensity))
        {
            parts.Add($"public↑ {summary.HighPublicApiFileCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.PackageInstability))
        {
            parts.Add($"불안정 {summary.HighInstabilityPackageCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.LayerViolation))
        {
            parts.Add($"계층위반 {summary.LayerViolationCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.TypeCohesion))
        {
            parts.Add($"LCOM↓ {summary.LowCohesionTypeCount}");
        }

        if (MetricInspectionScope.IsEnabled(scope, MetricInspectionKind.InheritanceDepth))
        {
            parts.Add($"DIT↑ {summary.DeepInheritanceTypeCount}");
        }

        if (functionTruncated || fileTruncated)
        {
            parts.Add("목록 상위만 표시");
        }

        parts.Add("더블클릭: 함수·파일은 편집기, 아키텍처는 그래프/파일 이동");
        return string.Join(" · ", parts);
    }

    private static bool ThresholdsEqual(UserAnalysisSettings a, UserAnalysisSettings b) =>
        a.EnabledInspections == b.EnabledInspections
        && a.WarnCyclomaticComplexity == b.WarnCyclomaticComplexity
        && a.WarnCognitiveComplexity == b.WarnCognitiveComplexity
        && a.WarnMaxNestingDepth == b.WarnMaxNestingDepth
        && a.WarnParameterCount == b.WarnParameterCount
        && a.WarnFanOut == b.WarnFanOut
        && Math.Abs(a.WarnMaintenanceIndex - b.WarnMaintenanceIndex) < 0.001
        && Math.Abs(a.WarnTodoDensityPer100Lines - b.WarnTodoDensityPer100Lines) < 0.001
        && a.WarnReturnCount == b.WarnReturnCount
        && a.WarnMagicNumbers == b.WarnMagicNumbers
        && a.WarnGodFileCodeLines == b.WarnGodFileCodeLines
        && Math.Abs(a.WarnMinCommentPercent - b.WarnMinCommentPercent) < 0.001
        && a.WarnGodTypeMemberCount == b.WarnGodTypeMemberCount
        && a.WarnStatementCount == b.WarnStatementCount
        && a.WarnSwitchCaseCount == b.WarnSwitchCaseCount
        && a.WarnPublicApiCount == b.WarnPublicApiCount
        && Math.Abs(a.WarnMinTestCodePercent - b.WarnMinTestCodePercent) < 0.001
        && Math.Abs(a.WarnInstability - b.WarnInstability) < 0.001
        && Math.Abs(a.WarnLackOfCohesion - b.WarnLackOfCohesion) < 0.001
        && a.WarnInheritanceDepth == b.WarnInheritanceDepth
        && a.WarnGitChangeLines == b.WarnGitChangeLines
        && a.WarnSecuritySmellCount == b.WarnSecuritySmellCount;

    private static string[] EnsureColumnToolTips(ColumnHeader[] columns, string[] tooltips)
    {
        var aligned = new string[columns.Length];
        for (var i = 0; i < columns.Length; i++)
        {
            aligned[i] = i < tooltips.Length && !string.IsNullOrWhiteSpace(tooltips[i])
                ? tooltips[i]
                : columns[i].Text;
        }

        return aligned;
    }

    private static string[] BuildFunctionHeaderToolTips(UserAnalysisSettings t) =>
    [
        "함수가 속한 프로그래밍 언어입니다.",
        "분석된 함수 또는 메서드 이름입니다. 더블클릭하면 소스 편집기에서 해당 위치를 엽니다.",
        "함수가 정의된 소스 파일 이름입니다.",
        "함수 본문의 물리 줄 수입니다.",
        $"{QualityThresholdToolTipTexts.Cyclomatic} 현재 경고 기준: {t.WarnCyclomaticComplexity} 이상.",
        $"{QualityThresholdToolTipTexts.Cognitive} 현재 경고 기준: {t.WarnCognitiveComplexity} 이상.",
        $"{QualityThresholdToolTipTexts.Nesting} 현재 경고 기준: {t.WarnMaxNestingDepth} 이상.",
        $"{QualityThresholdToolTipTexts.ParameterCount} 현재 경고 기준: {t.WarnParameterCount}개 이상.",
        $"{QualityThresholdToolTipTexts.ReturnCount} 현재 경고 기준: {t.WarnReturnCount}개 이상.",
        $"{QualityThresholdToolTipTexts.MagicNumbers} 현재 경고 기준: {t.WarnMagicNumbers}개 이상.",
        "Fan-In: 호출 그래프에서 이 함수를 호출하는 다른 함수·대상의 수입니다.",
        $"{QualityThresholdToolTipTexts.FanOut} 현재 경고 기준: {t.WarnFanOut} 이상.",
        $"{QualityThresholdToolTipTexts.MaintenanceIndex} 현재 경고 기준: {t.WarnMaintenanceIndex} 미만.",
        $"함수 본문의 실행 문장 수입니다. 현재 경고 기준: {t.WarnStatementCount}개 이상.",
        $"switch/case 분기 수입니다. 현재 경고 기준: {t.WarnSwitchCaseCount}개 이상.",
        "빈 catch와 광범위 catch(Exception) 개수입니다. 형식은 「빈+광범위」이며, 예외 삼키기·디버깅 어려움 신호입니다.",
        "async void 메서드 여부(Y/-)입니다. 예외 전파·테스트 어려움이 있어 일반적으로 async Task를 권장합니다.",
        "호출 그래프 기준 미사용 가능 코드 여부(Y/-)입니다. public이 아니고 fan-in이 0인 경우 등을 표시합니다.",
        "Halstead Volume: 연산자·피연산자 어휘와 길이로 계산한 복잡도 지표입니다.",
        "Weighted Method Complexity(WMC): 메서드 복잡도의 가중 합입니다.",
        "메트릭 계산 정밀도입니다. 의미(Roslyn) > 구문(Tree-sitter) > 근사(정규식/패턴) 순으로 신뢰도가 높습니다.",
        "품질 경고 수준입니다. 정상 · 경고(기준 초과) · 심각(기준 대비 매우 높음).",
        "검출된 이슈의 의미·맥락 설명입니다. 지표가 무엇을 나타내는지, 현재 값이 왜 주의 대상인지 요약합니다.",
        "권장 대처 방안입니다. 구체적인 개선·리팩터링·보안 조치를 안내합니다."
    ];

    private static string[] BuildFileHeaderToolTips(UserAnalysisSettings t) =>
    [
        "파일의 프로그래밍 언어입니다.",
        "분석 대상 소스 파일 이름입니다. 더블클릭하면 편집기에서 파일을 엽니다.",
        "주석·공백을 제외한 코드 줄 수입니다.",
        "파일에서 분석된 함수·메서드 개수입니다.",
        $"파일 내 함수들의 최대 CC입니다. {QualityThresholdToolTipTexts.Cyclomatic} 현재 경고 기준: {t.WarnCyclomaticComplexity} 이상.",
        $"파일 내 함수들의 최대 인지 복잡도입니다. {QualityThresholdToolTipTexts.Cognitive} 현재 경고 기준: {t.WarnCognitiveComplexity} 이상.",
        $"파일 내 함수들의 최대 중첩 깊이입니다. {QualityThresholdToolTipTexts.Nesting} 현재 경고 기준: {t.WarnMaxNestingDepth} 이상.",
        $"파일 내 함수들의 최대 Fan-Out입니다. {QualityThresholdToolTipTexts.FanOut} 현재 경고 기준: {t.WarnFanOut} 이상.",
        "파일 내 함수들의 최대 Fan-In(다른 코드에서 이 파일 함수를 호출하는 수)입니다.",
        $"파일 내 함수들의 매직 넘버 합계입니다. {QualityThresholdToolTipTexts.MagicNumbers}",
        $"파일 내 함수들의 최소 MI입니다. {QualityThresholdToolTipTexts.MaintenanceIndex} 현재 경고 기준: {t.WarnMaintenanceIndex} 미만.",
        "TODO, FIXME, HACK 등 미완료 작업 표식의 총 개수입니다.",
        $"{QualityThresholdToolTipTexts.TodoDensity} 현재 경고 기준: {t.WarnTodoDensityPer100Lines:F1} 이상.",
        "품질 경고 기준을 하나 이상 넘긴 함수 개수입니다.",
        $"{QualityThresholdToolTipTexts.CommentPercent} 현재 경고 기준: {t.WarnMinCommentPercent:F0}% 미만(코드 {FileMetricsAggregator.MinCodeLinesForCommentWarning}줄 이상 파일).",
        "중복 코드 그룹에 참여한 줄 수(파일별 합계)입니다.",
        $"public API(공개 타입·멤버) 수입니다. 현재 경고 기준: {t.WarnPublicApiCount}개 이상.",
        $"Git 변경 줄 수(핫스팟)입니다. 자주 수정되는 파일일수록 유지보수·결함 위험이 큽니다. 현재 경고 기준: {t.WarnGitChangeLines}줄 이상.",
        $"보안 smell(언어별 위험 패턴: 하드코딩 비밀, SQL 연결, eval 등) 개수입니다. 현재 경고 기준: {t.WarnSecuritySmellCount}개 이상.",
        "파일 내 함수들의 최대 문장 수입니다.",
        "파일 내 함수들의 최대 switch/case 수입니다.",
        "파일 내 async void 함수 개수입니다.",
        "파일 전체 품질 경고 수준입니다. 정상 · 경고 · 심각.",
        "파일에서 검출된 이슈의 의미·맥락 설명입니다.",
        "파일 단위 권장 대처 방안입니다."
    ];

    private static string[] BuildTypeHeaderToolTips(UserAnalysisSettings t) =>
    [
        "타입 종류(class, interface, struct, enum 등)입니다.",
        "분석된 타입 이름입니다. 더블클릭하면 정의 위치를 편집기에서 엽니다.",
        "타입이 정의된 소스 파일입니다.",
        "필드·속성 멤버 수입니다.",
        "UML/구조 분석상 연산(메서드) 수입니다.",
        "코드 메트릭 함수와 이름·시그니처로 매칭된 함수 수입니다.",
        $"매칭 함수 중 최대 CC입니다. {QualityThresholdToolTipTexts.Cyclomatic} 현재 경고 기준: {t.WarnCyclomaticComplexity} 이상.",
        $"매칭 함수 중 최대 인지 복잡도입니다. {QualityThresholdToolTipTexts.Cognitive} 현재 경고 기준: {t.WarnCognitiveComplexity} 이상.",
        $"매칭 함수 중 최소 MI입니다. {QualityThresholdToolTipTexts.MaintenanceIndex} 현재 경고 기준: {t.WarnMaintenanceIndex} 미만.",
        "이 타입이 의존하는(참조하는) 다른 타입 수입니다.",
        "이 타입에 의존하는(참조되는) 타입 수입니다.",
        $"LCOM(Lack of Cohesion) 응집도입니다. 높을수록 책임이 분산되었습니다. 현재 경고 기준: {t.WarnLackOfCohesion:F2} 이상.",
        $"상속 깊이(DIT, Depth of Inheritance)입니다. 현재 경고 기준: {t.WarnInheritanceDepth} 이상.",
        "자식 타입 수(NOC, Number of Children)입니다.",
        "Weighted Method Count(WMC): 타입 메서드 복잡도의 가중 합입니다.",
        "Response For Class(RFC): 타입이 호출할 수 있는 메서드 수 추정치입니다.",
        "타입 품질 경고 수준입니다. 정상 · 경고 · 심각.",
        "타입에서 검출된 구조·품질 이슈의 의미 설명입니다.",
        "타입 단위 권장 대처 방안입니다."
    ];

    private static string[] BuildPackageHeaderToolTips(UserAnalysisSettings t) =>
    [
        "패키지(디렉터리) 경로입니다. 파일 간 의존을 디렉터리 단위로 묶어 분석합니다.",
        "Ca(Afferent Coupling): 다른 패키지에서 이 패키지로 들어오는 의존(안쪽 결합) 수입니다.",
        "Ce(Efferent Coupling): 이 패키지에서 다른 패키지로 나가는 의존(바깥 결합) 수입니다.",
        $"I(Instability): Ce/(Ca+Ce). 1에 가까울수록 불안정(변경 영향 큼)합니다. 현재 경고 기준: {t.WarnInstability:F2} 이상.",
        "A(Abstractness): 추상 타입·인터페이스 비율입니다. Main Sequence 분석에 사용됩니다.",
        "D(Distance): Main Sequence(|A+I-1|)에서의 거리입니다. 0에 가까울수록 이상적인 균형입니다.",
        "패키지 불안정성 경고 수준입니다. 정상 · 경고 · 심각.",
        "패키지 결합·불안정 지표의 의미 설명입니다.",
        "패키지 구조 개선을 위한 권장 대처 방안입니다."
    ];

    private static readonly string[] ArchitectureHeaderToolTips =
    [
        "아키텍처 인사이트 목록 순번입니다.",
        "인사이트 유형입니다. 순환 호출, 파일·디렉터리 결합, 중복 코드, 계층 위반, Git 핫스팟 등이 표시됩니다.",
        "검출된 구조적 이슈의 측정·위치 정보입니다. 더블클릭하면 관련 그래프·파일로 이동할 수 있습니다.",
        "경고 수준입니다. 정상 · 경고 · 심각.",
        "인사이트 유형의 의미·위험 설명입니다.",
        "구조·품질 개선을 위한 권장 대처 방안입니다."
    ];

    private sealed class ListViewSorter : IComparer
    {
        private readonly HashSet<int> _numericColumns;
        private int _sortColumn = -1;
        private SortOrder _order = SortOrder.None;

        public ListViewSorter(params int[] numericColumns)
        {
            _numericColumns = new HashSet<int>(numericColumns);
        }

        public void SetColumn(int column)
        {
            if (column == _sortColumn)
            {
                _order = _order == SortOrder.Ascending ? SortOrder.Descending : SortOrder.Ascending;
            }
            else
            {
                _sortColumn = column;
                _order = SortOrder.Ascending;
            }
        }

        public int Compare(object? x, object? y)
        {
            if (x is not ListViewItem itemX || y is not ListViewItem itemY || _sortColumn < 0)
                return 0;

            var textX = _sortColumn < itemX.SubItems.Count ? itemX.SubItems[_sortColumn].Text : "";
            var textY = _sortColumn < itemY.SubItems.Count ? itemY.SubItems[_sortColumn].Text : "";

            int result;
            if (_numericColumns.Contains(_sortColumn)
                && double.TryParse(textX, out double numX)
                && double.TryParse(textY, out double numY))
                result = numX.CompareTo(numY);
            else
                result = string.Compare(textX, textY, StringComparison.CurrentCultureIgnoreCase);

            return _order == SortOrder.Descending ? -result : result;
        }
    }
}
