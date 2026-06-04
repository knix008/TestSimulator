using System.Collections;
using System.Diagnostics;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services;
using CodeAnalyzer.Services.Metrics;

namespace CodeAnalyzer.Controls;

public sealed class CodeMetricsViewer : UserControl
{
    private readonly TabControl _tabs = new() { Dock = DockStyle.Fill };
    private readonly ListView _functionList = CreateListView();
    private readonly ListView _fileList = CreateListView();
    private readonly ListView _architectureList = CreateListView();

    private readonly ListViewSorter _functionSorter = new(3, 4, 5, 6, 7, 8, 9, 10);
    private readonly ListViewSorter _fileSorter = new(2, 3, 4, 5, 6, 7, 8, 9, 10, 11);
    private readonly ListViewSorter _archSorter = new(0);

    private readonly Label _summaryLabel = new()
    {
        Dock = DockStyle.Top,
        Height = 56,
        Padding = new Padding(8, 6, 8, 4),
        AutoEllipsis = true
    };

    private CodeMetricsResult? _metrics;
    private AnalysisResult? _analysis;
    private UserAnalysisSettings _thresholds = new();
    private bool _isAnalyzing;

    public event Action<MetricsNavigationRequest>? NavigationRequested;

    public CodeMetricsViewer()
    {
        DoubleBuffered = true;
        BackColor = Color.White;

        AddColumns(_functionList, FunctionColumns);
        AddColumns(_fileList, FileColumns);
        AddColumns(_architectureList, ArchitectureColumns);

        _functionList.ListViewItemSorter = _functionSorter;
        _fileList.ListViewItemSorter = _fileSorter;
        _architectureList.ListViewItemSorter = _archSorter;

        var tabFiles = new TabPage("파일") { Padding = new Padding(4) };
        tabFiles.Controls.Add(_fileList);

        var tabFunctions = new TabPage("함수") { Padding = new Padding(4) };
        tabFunctions.Controls.Add(_functionList);

        var tabArchitecture = new TabPage("아키텍처") { Padding = new Padding(4) };
        tabArchitecture.Controls.Add(_architectureList);

        _tabs.TabPages.Add(tabFiles);
        _tabs.TabPages.Add(tabFunctions);
        _tabs.TabPages.Add(tabArchitecture);

        _functionList.ColumnClick += (_, e) => SortList(_functionList, _functionSorter, e.Column);
        _fileList.ColumnClick += (_, e) => SortList(_fileList, _fileSorter, e.Column);
        _architectureList.ColumnClick += (_, e) => SortList(_architectureList, _archSorter, e.Column);

        _functionList.DoubleClick += OnListDoubleClick;
        _fileList.DoubleClick += OnListDoubleClick;
        _architectureList.DoubleClick += OnListDoubleClick;

        Controls.Add(_tabs);
        Controls.Add(_summaryLabel);
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

    private static ListView CreateListView() => new()
    {
        Dock = DockStyle.Fill,
        View = View.Details,
        FullRowSelect = true,
        GridLines = true,
        MultiSelect = false
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
        new() { Text = "In", Width = 44, TextAlign = HorizontalAlignment.Right },
        new() { Text = "Out", Width = 44, TextAlign = HorizontalAlignment.Right },
        new() { Text = "MI", Width = 48, TextAlign = HorizontalAlignment.Right },
        new() { Text = "정밀", Width = 56 }
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
        new() { Text = "MI↓", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "TODO", Width = 56, TextAlign = HorizontalAlignment.Right },
        new() { Text = "TODO/100", Width = 76, TextAlign = HorizontalAlignment.Right },
        new() { Text = "경고", Width = 52, TextAlign = HorizontalAlignment.Right }
    ];

    private static readonly ColumnHeader[] ArchitectureColumns =
    [
        new() { Text = "#", Width = 32, TextAlign = HorizontalAlignment.Right },
        new() { Text = "유형", Width = 72 },
        new() { Text = "내용", Width = 520 }
    ];

    public void SetMetrics(
        CodeMetricsResult? metrics,
        UserAnalysisSettings? thresholds = null,
        AnalysisResult? analysis = null)
    {
        try
        {
            _metrics = metrics;
            _analysis = analysis;
            _thresholds = thresholds ?? analysis?.QualityThresholds ?? new UserAnalysisSettings();
            RebuildLists();
        }
        catch (Exception ex)
        {
            _metrics = null;
            _functionList.Items.Clear();
            _fileList.Items.Clear();
            _architectureList.Items.Clear();
            _summaryLabel.Text = $"메트릭 표시 오류: {ex.Message}";
            DetailedErrorDialog.Show(
                FindForm(),
                "코드 메트릭 표시 오류",
                ex,
                "메트릭 화면을 구성하는 중 오류가 발생했습니다.");
        }
    }

    public void BeginAnalysis()
    {
        _isAnalyzing = true;
        _metrics = null;
        _functionList.Items.Clear();
        _fileList.Items.Clear();
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
        _architectureList.BeginUpdate();
        _functionList.Items.Clear();
        _fileList.Items.Clear();
        _architectureList.Items.Clear();

        if (_metrics is null || (_metrics.Functions.Count == 0 && _metrics.FileAggregates.Count == 0))
        {
            _summaryLabel.Text = _isAnalyzing
                ? "코드 메트릭 분석 중..."
                : "표시할 메트릭이 없습니다. 분석 실행 후 결과가 여기에 표시됩니다.";
            _functionList.EndUpdate();
            _fileList.EndUpdate();
            _architectureList.EndUpdate();
            return;
        }

        var summary = _metrics.Summary;
        var functionTruncated = _metrics.Functions.Count > AnalysisScaleLimits.MaxCodeMetricsUiFunctions;
        var fileTruncated = (_metrics.FileAggregates.Count > 0 ? _metrics.FileAggregates.Count : _metrics.Files.Count)
            > AnalysisScaleLimits.MaxCodeMetricsUiFiles;
        _summaryLabel.Text =
            $"파일 {_metrics.Files.Count} · 코드 줄 {summary.TotalCodeLines:N0} · 함수 {_metrics.Functions.Count:N0} · " +
            $"중복 {summary.ProjectDuplicateLinePercent:F1}% · 순환 {summary.CircularCallChainCount} · TODO {summary.TotalTodoMarkers} · " +
            $"경고 CC {summary.HighCyclomaticCount} · 인지 {summary.HighCognitiveCount} · FanOut {summary.HighFanOutCount} · " +
            $"MI↓ {summary.LowMaintenanceIndexCount} · TODO밀도 {summary.HighTodoDensityFileCount}" +
            (functionTruncated || fileTruncated ? " · 목록 상위만 표시" : "") +
            " · 더블클릭: 호출 그래프/파일 이동";

        BuildFunctionList();
        BuildFileList();
        BuildArchitectureList();

        _functionList.EndUpdate();
        _fileList.EndUpdate();
        _architectureList.EndUpdate();
    }

    private void BuildFunctionList()
    {
        foreach (var func in _metrics!.Functions
                     .OrderByDescending(f => FileMetricsAggregator.GetFunctionWarningLevel(f, _thresholds))
                     .ThenByDescending(f => f.CyclomaticComplexity)
                     .ThenByDescending(f => f.CognitiveComplexity)
                     .Take(AnalysisScaleLimits.MaxCodeMetricsUiFunctions))
        {
            var item = new ListViewItem(GetLanguageDisplay(func.LanguageId));
            item.SubItems.Add(func.DisplayName);
            item.SubItems.Add(Path.GetFileName(func.FilePath));
            item.SubItems.Add(func.LineCount.ToString());
            item.SubItems.Add(func.CyclomaticComplexity.ToString());
            item.SubItems.Add(func.CognitiveComplexity.ToString());
            item.SubItems.Add(func.MaxNestingDepth.ToString());
            item.SubItems.Add(func.ParameterCount.ToString());
            item.SubItems.Add(func.FanIn.ToString());
            item.SubItems.Add(func.FanOut.ToString());
            item.SubItems.Add(func.MaintenanceIndex.ToString("F0"));
            item.SubItems.Add(FormatPrecision(func.Precision));
            item.Tag = func;

            ApplyWarningColor(item, FileMetricsAggregator.GetFunctionWarningLevel(func, _thresholds));

            _functionList.Items.Add(item);
        }
    }

    private void BuildFileList()
    {
        var fileRows = _metrics!.FileAggregates.Count > 0
            ? _metrics.FileAggregates
            : BuildFallbackFileRows();

        foreach (var file in fileRows
                     .OrderByDescending(f => FileMetricsAggregator.GetFileWarningLevel(f, _thresholds))
                     .ThenByDescending(f => f.MaxCyclomaticComplexity)
                     .Take(AnalysisScaleLimits.MaxCodeMetricsUiFiles))
        {
            var item = new ListViewItem(GetLanguageDisplay(file.LanguageId));
            item.SubItems.Add(Path.GetFileName(file.FilePath));
            item.SubItems.Add(file.CodeLines.ToString());
            item.SubItems.Add(file.FunctionCount.ToString());
            item.SubItems.Add(file.MaxCyclomaticComplexity.ToString());
            item.SubItems.Add(file.MaxCognitiveComplexity.ToString());
            item.SubItems.Add(file.MaxNestingDepth.ToString());
            item.SubItems.Add(file.MaxFanOut.ToString());
            item.SubItems.Add(file.MinMaintenanceIndex.ToString("F0"));
            item.SubItems.Add(file.TodoMarkerCount.ToString());
            item.SubItems.Add(file.TodoDensityPer100Lines.ToString("F1"));
            item.SubItems.Add(file.WarningFunctionCount.ToString());
            item.Tag = file;

            ApplyWarningColor(item, FileMetricsAggregator.GetFileWarningLevel(file, _thresholds));

            _fileList.Items.Add(item);
        }
    }

    private void BuildArchitectureList()
    {
        if (_analysis is null)
        {
            var summary = _metrics!.Summary;
            var fallbackItem = new ListViewItem("1");
            fallbackItem.SubItems.Add("요약");
            fallbackItem.SubItems.Add(
                $"중복 줄 {summary.DuplicateLineCount:N0} ({summary.ProjectDuplicateLinePercent:F1}%) · " +
                $"순환 호출 {summary.CircularCallChainCount}건 · TODO 표식 {summary.TotalTodoMarkers}개");
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
            _thresholds);

        var index = 1;
        foreach (var insight in insights)
        {
            var item = new ListViewItem(index.ToString());
            item.SubItems.Add(insight.Category);
            item.SubItems.Add(insight.Description);
            item.Tag = insight.NavigationTag;
            ApplyWarningColor(item, insight.Severity);
            _architectureList.Items.Add(item);
            index++;
        }
    }

    private void OnListDoubleClick(object? sender, EventArgs e)
    {
        if (sender is not ListView list || list.SelectedItems.Count == 0)
        {
            return;
        }

        var tag = list.SelectedItems[0].Tag;
        MetricsNavigationRequest? request = tag switch
        {
            FunctionMetric func => BuildFunctionNavigation(func),
            CircularCallChain chain => BuildCycleNavigation(chain),
            FileRelationEdge edge => BuildFileEdgeNavigation(edge),
            DirectoryRelationEdge edge => BuildDirectoryEdgeNavigation(edge),
            DuplicateCodeGroup group => BuildDuplicateNavigation(group),
            FileAggregateMetric file => new MetricsNavigationRequest { FilePath = file.FilePath },
            _ => null
        };

        if (request is not null && HasNavigationTarget(request))
        {
            NavigationRequested?.Invoke(request);
            return;
        }

        string? filePath = tag switch
        {
            FunctionMetric func => func.FilePath,
            FileAggregateMetric file => file.FilePath,
            _ => null
        };

        if (filePath is not null && File.Exists(filePath))
        {
            try { Process.Start(new ProcessStartInfo(filePath) { UseShellExecute = true }); }
            catch { /* silently ignore launch failures */ }
        }
    }

    private MetricsNavigationRequest BuildFunctionNavigation(FunctionMetric func)
    {
        if (_analysis?.CallGraph.NodeMap.ContainsKey(func.Id) == true)
        {
            return new MetricsNavigationRequest
            {
                CallGraphNodeId = func.Id,
                HighlightCallGraphNodeIds = [func.Id]
            };
        }

        return new MetricsNavigationRequest
        {
            FilePath = func.FilePath,
            LineNumber = func.StartLine
        };
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
        !string.IsNullOrWhiteSpace(request.CallGraphNodeId)
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
