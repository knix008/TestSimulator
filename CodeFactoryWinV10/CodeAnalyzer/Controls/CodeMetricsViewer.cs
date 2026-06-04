using System.Collections;
using System.Diagnostics;
using CodeAnalyzer.Models;
using CodeAnalyzer.Services;
using CodeAnalyzer.Services.Metrics;

namespace CodeAnalyzer.Controls;

public sealed class CodeMetricsViewer : UserControl
{
    private readonly TabControl _tabs = new()
    {
        Dock = DockStyle.Fill,
        Padding = new Point(0, 0),
        Margin = new Padding(0)
    };
    private readonly ListView _functionList = CreateListView();
    private readonly ListView _fileList = CreateListView();
    private readonly ListView _architectureList = CreateListView();

    private readonly ListViewColumnHeaderToolTip _functionHeaderToolTip;
    private readonly ListViewColumnHeaderToolTip _fileHeaderToolTip;
    private readonly ListViewColumnHeaderToolTip _architectureHeaderToolTip;

    private readonly ListViewSorter _functionSorter = new(3, 4, 5, 6, 7, 8, 9, 10);
    private readonly ListViewSorter _fileSorter = new(2, 3, 4, 5, 6, 7, 8, 9, 10, 11);
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
        AddColumns(_architectureList, ArchitectureColumns);

        _functionList.ListViewItemSorter = _functionSorter;
        _fileList.ListViewItemSorter = _fileSorter;
        _architectureList.ListViewItemSorter = _archSorter;

        var tabFiles = new TabPage("파일") { Padding = new Padding(0) };
        tabFiles.Controls.Add(_fileList);

        var tabFunctions = new TabPage("함수") { Padding = new Padding(0) };
        tabFunctions.Controls.Add(_functionList);

        var tabArchitecture = new TabPage("아키텍처") { Padding = new Padding(0) };
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
        _tabs.SelectedIndexChanged += (_, _) => ScheduleColumnLayoutAdjust();

        _functionHeaderToolTip = new ListViewColumnHeaderToolTip(
            _functionList,
            BuildFunctionHeaderToolTips(_thresholds));
        _fileHeaderToolTip = new ListViewColumnHeaderToolTip(
            _fileList,
            BuildFileHeaderToolTips(_thresholds));
        _architectureHeaderToolTip = new ListViewColumnHeaderToolTip(
            _architectureList,
            ArchitectureHeaderToolTips);

        Controls.Add(_tabs);
        Controls.Add(_summaryLabel);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _functionHeaderToolTip.Dispose();
            _fileHeaderToolTip.Dispose();
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
            AdjustDescriptionColumnWidth(_functionList, 13);
            AdjustDescriptionColumnWidth(_fileList, 13);
            AdjustArchitectureContentColumnWidth();
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
        new() { Text = "In", Width = 44, TextAlign = HorizontalAlignment.Right },
        new() { Text = "Out", Width = 44, TextAlign = HorizontalAlignment.Right },
        new() { Text = "MI", Width = 48, TextAlign = HorizontalAlignment.Right },
        new() { Text = "정밀", Width = 56 },
        new() { Text = "상태", Width = 52 },
        new() { Text = "설명", Width = 360 }
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
        new() { Text = "경고", Width = 52, TextAlign = HorizontalAlignment.Right },
        new() { Text = "상태", Width = 52 },
        new() { Text = "설명", Width = 360 }
    ];

    private static readonly ColumnHeader[] ArchitectureColumns =
    [
        new() { Text = "#", Width = 40, TextAlign = HorizontalAlignment.Right },
        new() { Text = "유형", Width = 96 },
        new() { Text = "내용", Width = 320 }
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
            _functionHeaderToolTip.UpdateColumnToolTips(BuildFunctionHeaderToolTips(_thresholds));
            _fileHeaderToolTip.UpdateColumnToolTips(BuildFileHeaderToolTips(_thresholds));
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
            item.SubItems.Add(func.FanIn.ToString());
            item.SubItems.Add(func.FanOut.ToString());
            item.SubItems.Add(func.MaintenanceIndex.ToString("F0"));
            item.SubItems.Add(FormatPrecision(func.Precision));
            var level = FileMetricsAggregator.GetFunctionWarningLevel(func, _thresholds);
            var description = FileMetricsAggregator.BuildFunctionDescription(func, _thresholds);
            item.SubItems.Add(FormatWarningLevel(level));
            item.SubItems.Add(description);
            item.Tag = func;
            item.ToolTipText = description;

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
            item.SubItems.Add(file.MinMaintenanceIndex.ToString("F0"));
            item.SubItems.Add(file.TodoMarkerCount.ToString());
            item.SubItems.Add(file.TodoDensityPer100Lines.ToString("F1"));
            item.SubItems.Add(file.WarningFunctionCount.ToString());
            var level = FileMetricsAggregator.GetFileWarningLevel(file, _thresholds);
            var description = FileMetricsAggregator.BuildFileDescription(file, _thresholds);
            item.SubItems.Add(FormatWarningLevel(level));
            item.SubItems.Add(description);
            item.Tag = file;
            item.ToolTipText = description;

            ApplyWarningColor(item, level);

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
            fallbackItem.ToolTipText = fallbackItem.SubItems[2].Text;
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
            item.ToolTipText = insight.Description;
            ApplyWarningColor(item, insight.Severity);
            _architectureList.Items.Add(item);
            index++;
        }
    }

    private void AdjustArchitectureContentColumnWidth()
    {
        if (_architectureList.Columns.Count < 3
            || _architectureList.ClientSize.Width <= 0
            || !_architectureList.IsHandleCreated)
        {
            return;
        }

        const int indexWidth = 40;
        const int categoryWidth = 96;
        const int minContentWidth = 120;

        SetColumnWidthIfChanged(_architectureList.Columns[0], indexWidth);
        SetColumnWidthIfChanged(_architectureList.Columns[1], categoryWidth);

        var availableWidth = GetAvailableListClientWidth(_architectureList) - indexWidth - categoryWidth;
        // 내용 열은 창(리스트) 우측 끝까지 남은 폭을 모두 사용합니다. 잘리면 행 Tooltip으로 전체 확인.
        SetColumnWidthIfChanged(
            _architectureList.Columns[2],
            Math.Max(minContentWidth, availableWidth));
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

    private static void AdjustDescriptionColumnWidth(ListView list, int descriptionColumnIndex, int minWidth = 240)
    {
        if (list.Columns.Count <= descriptionColumnIndex
            || list.ClientSize.Width <= 0
            || !list.IsHandleCreated)
        {
            return;
        }

        var fixedWidth = 0;
        for (var i = 0; i < list.Columns.Count; i++)
        {
            if (i != descriptionColumnIndex)
            {
                fixedWidth += list.Columns[i].Width;
            }
        }

        var availableWidth = GetAvailableListClientWidth(list);
        SetColumnWidthIfChanged(
            list.Columns[descriptionColumnIndex],
            Math.Max(minWidth, Math.Max(0, availableWidth - fixedWidth)));
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

    private static string FormatWarningLevel(WarningLevel level) =>
        level switch
        {
            WarningLevel.Critical => "심각",
            WarningLevel.Warning => "경고",
            _ => "정상"
        };

    private static bool ThresholdsEqual(UserAnalysisSettings a, UserAnalysisSettings b) =>
        a.WarnCyclomaticComplexity == b.WarnCyclomaticComplexity
        && a.WarnCognitiveComplexity == b.WarnCognitiveComplexity
        && a.WarnMaxNestingDepth == b.WarnMaxNestingDepth
        && a.WarnParameterCount == b.WarnParameterCount
        && a.WarnFanOut == b.WarnFanOut
        && Math.Abs(a.WarnMaintenanceIndex - b.WarnMaintenanceIndex) < 0.001
        && Math.Abs(a.WarnTodoDensityPer100Lines - b.WarnTodoDensityPer100Lines) < 0.001;

    private static string[] BuildFunctionHeaderToolTips(UserAnalysisSettings t) =>
    [
        "함수가 속한 프로그래밍 언어입니다.",
        "분석된 함수 또는 메서드 이름입니다.",
        "함수가 정의된 소스 파일 이름입니다.",
        "함수 본문의 줄 수입니다.",
        $"순환 복잡도(Cyclomatic Complexity, CC). 분기·루프가 많을수록 증가합니다. 경고 기준: {t.WarnCyclomaticComplexity} 이상.",
        $"인지 복잡도(Cognitive Complexity). 읽기 어려운 중첩·조건을 반영합니다. 경고 기준: {t.WarnCognitiveComplexity} 이상.",
        $"함수 내부 최대 중첩 깊이입니다. 경고 기준: {t.WarnMaxNestingDepth} 이상.",
        $"매개변수 개수입니다. 경고 기준: {t.WarnParameterCount}개 이상.",
        "Fan-In: 다른 코드에서 이 함수를 호출하는 횟수입니다.",
        $"Fan-Out: 이 함수가 호출하는 대상 수입니다. 경고 기준: {t.WarnFanOut} 이상.",
        $"유지보수 지수(Maintenance Index, MI). 높을수록 유지보수가 쉽습니다. 경고 기준: {t.WarnMaintenanceIndex} 미만.",
        "메트릭 계산 정밀도입니다. 의미(Roslyn) > 구문(Tree-sitter) > 근사(패턴) 순으로 신뢰도가 높습니다.",
        "품질 경고 수준입니다. 정상 · 경고(기준 초과) · 심각(기준 대비 매우 높음).",
        "품질 기준 대비 권장 개선 조치입니다. 행에 마우스를 올리면 전체 설명을 볼 수 있습니다."
    ];

    private static string[] BuildFileHeaderToolTips(UserAnalysisSettings t) =>
    [
        "파일의 프로그래밍 언어입니다.",
        "분석 대상 소스 파일 이름입니다.",
        "주석·공백을 제외한 코드 줄 수입니다.",
        "파일에서 분석된 함수 개수입니다.",
        $"파일 내 함수들의 최대 순환 복잡도(CC)입니다. 경고 기준: {t.WarnCyclomaticComplexity} 이상.",
        $"파일 내 함수들의 최대 인지 복잡도입니다. 경고 기준: {t.WarnCognitiveComplexity} 이상.",
        $"파일 내 함수들의 최대 중첩 깊이입니다. 경고 기준: {t.WarnMaxNestingDepth} 이상.",
        $"파일 내 함수들의 최대 Fan-Out입니다. 경고 기준: {t.WarnFanOut} 이상.",
        $"파일 내 함수들의 최소 유지보수 지수(MI)입니다. 낮을수록 유지보수가 어렵습니다. 경고 기준: {t.WarnMaintenanceIndex} 미만.",
        "TODO, FIXME 등 미완료 작업 표식의 개수입니다.",
        $"100줄당 TODO 표식 밀도입니다. 경고 기준: {t.WarnTodoDensityPer100Lines:F1} 이상.",
        "품질 경고 기준을 하나 이상 넘긴 함수 개수입니다.",
        "파일 전체 품질 경고 수준입니다. 정상 · 경고 · 심각.",
        "파일 단위 권장 개선 조치입니다. 행에 마우스를 올리면 전체 설명을 볼 수 있습니다."
    ];

    private static readonly string[] ArchitectureHeaderToolTips =
    [
        "아키텍처 인사이트 목록 순번입니다.",
        "인사이트 유형(순환 호출, 결합, 중복 등)입니다.",
        "발견된 구조적 이슈 설명입니다. 열은 창 우측까지 넓어지며, 잘린 내용은 행에 마우스를 올려 확인하세요."
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
