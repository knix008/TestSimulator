using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

internal sealed class CallGraphTabHost : UserControl
{
    private readonly Label _bannerLabel = new()
    {
        Dock = DockStyle.Top,
        Height = 28,
        Padding = new Padding(8, 6, 8, 0),
        ForeColor = Color.FromArgb(30, 85, 130),
        BackColor = Color.FromArgb(224, 242, 255),
        Visible = false
    };

    private readonly EntryPointTabPager _pager = new();
    private readonly Panel _contentPanel = new() { Dock = DockStyle.Fill };
    private readonly NavigationTabControl _tabs = new() { Visible = false };
    private readonly CallGraphViewer _singleViewer = new() { Dock = DockStyle.Fill, Visible = true };
    private readonly List<CallGraphViewer> _tabViewers = [];
    private CallGraphResult? _graph;
    private List<string> _allRootIds = [];
    private GraphLayoutDirection _layoutDirection = GraphLayoutDirection.LeftToRight;
    private ConnectionLineStyle _lineStyle = ConnectionLineStyle.Orthogonal;
    private bool _useTabs;

    public CallGraphTabHost()
    {
        BackColor = Color.White;
        Controls.Add(_contentPanel);
        Controls.Add(_pager);
        Controls.Add(_bannerLabel);
        _contentPanel.Controls.Add(_singleViewer);
        _contentPanel.Controls.Add(_tabs);
        _singleViewer.RootNodeChanged += node => RootNodeChanged?.Invoke(node);
        _pager.PageChanged += RebuildTabsForCurrentPage;
    }

    public event Action<CallGraphNode>? RootNodeChanged;

    public CallGraphViewer ActiveViewer => GetActiveViewer();

    public GraphLayoutDirection LayoutDirection
    {
        set
        {
            _layoutDirection = value;
            _singleViewer.LayoutDirection = value;
            foreach (var viewer in _tabViewers)
            {
                viewer.LayoutDirection = value;
            }
        }
    }

    public ConnectionLineStyle LineStyle
    {
        set
        {
            _lineStyle = value;
            _singleViewer.LineStyle = value;
            foreach (var viewer in _tabViewers)
            {
                viewer.LineStyle = value;
            }
        }
    }

    public void SetGraph(CallGraphResult? graph, IReadOnlyList<string> rootNodeIds)
    {
        _graph = graph;
        _allRootIds = rootNodeIds
            .Where(id => !string.IsNullOrWhiteSpace(id))
            .Where(id => graph is null || graph.NodeMap.ContainsKey(id))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        _bannerLabel.Visible = false;
        if (graph is null || _allRootIds.Count <= 1)
        {
            _pager.Configure(0);
            ShowSingleViewer();
            ViewProgressReporter.Report(20, "호출 그래프를 구성하는 중...");
            _singleViewer.SetGraph(graph, _allRootIds);
            ViewProgressReporter.Report(100, "완료");
            return;
        }

        if (_allRootIds.Count > _pager.PageSize)
        {
            _bannerLabel.Text =
                $"진입점 {_allRootIds.Count:N0}개 — 상단 페이지 선택(예: 0–9, 10–19)으로 나누어 표시합니다.";
            _bannerLabel.Visible = true;
        }

        _pager.Configure(_allRootIds.Count);
        ShowTabs();
        RebuildTabsForCurrentPage();
    }

    public void SetGlobalVariableAccessGraph(
        CallGraphResult graph,
        IReadOnlyList<string> rootNodeIds,
        string targetNodeId)
    {
        _graph = null;
        _allRootIds = [];
        _pager.Configure(0);
        _bannerLabel.Visible = false;
        ShowSingleViewer();
        _singleViewer.SetGlobalVariableAccessGraph(graph, rootNodeIds, targetNodeId);
    }

    public void BeginAnalysis()
    {
        _graph = null;
        _allRootIds = [];
        _pager.Configure(0);
        _bannerLabel.Visible = false;
        ShowSingleViewer();
        ClearTabs();
        _singleViewer.BeginAnalysis();
    }

    public void EndAnalysis() => _singleViewer.EndAnalysis();

    public void ResetView() => GetActiveViewer().ResetView();

    public void ExpandAll()
    {
        if (_useTabs)
        {
            foreach (var viewer in _tabViewers)
            {
                viewer.ExpandAll();
            }

            return;
        }

        _singleViewer.ExpandAll();
    }

    public void CollapseAll()
    {
        if (_useTabs)
        {
            foreach (var viewer in _tabViewers)
            {
                viewer.CollapseAll();
            }

            return;
        }

        _singleViewer.CollapseAll();
    }

    public void ClearSearchHighlight()
    {
        _singleViewer.ClearSearchHighlight();
        foreach (var viewer in _tabViewers)
        {
            viewer.ClearSearchHighlight();
        }
    }

    public void SetSearchHighlight(IEnumerable<string> matchNodeIds, string? currentNodeId)
    {
        _singleViewer.SetSearchHighlight(matchNodeIds, currentNodeId);
        foreach (var viewer in _tabViewers)
        {
            viewer.SetSearchHighlight(matchNodeIds, currentNodeId);
        }
    }

    public bool TryFocusNode(string nodeId)
    {
        if (!_useTabs || _graph is null)
        {
            return _singleViewer.TryFocusNode(nodeId);
        }

        var globalIndex = FindRootIndexForNode(_graph, _allRootIds, nodeId);
        if (globalIndex < 0)
        {
            return false;
        }

        _pager.SelectPageForGlobalIndex(globalIndex);

        var (pageStart, _) = _pager.GetCurrentPageSlice();
        var tabIndex = globalIndex - pageStart;
        if (tabIndex >= 0 && tabIndex < _tabs.TabPages.Count)
        {
            _tabs.SelectedIndex = tabIndex;
        }

        return GetActiveViewer().TryFocusNode(nodeId);
    }

    public Bitmap? ExportToBitmap() => GetActiveViewer().ExportToBitmap();

    private CallGraphViewer GetActiveViewer()
    {
        if (!_useTabs)
        {
            return _singleViewer;
        }

        if (_tabs.SelectedTab?.Controls.Count > 0
            && _tabs.SelectedTab.Controls[0] is CallGraphViewer viewer)
        {
            return viewer;
        }

        return _tabViewers.FirstOrDefault() ?? _singleViewer;
    }

    private void ShowSingleViewer()
    {
        _useTabs = false;
        _tabs.Visible = false;
        ClearTabs();
        _singleViewer.Visible = true;
    }

    private void ShowTabs()
    {
        _useTabs = true;
        _singleViewer.Visible = false;
        _tabs.Visible = true;
    }

    private void RebuildTabsForCurrentPage()
    {
        if (_graph is null || _allRootIds.Count <= 1)
        {
            return;
        }

        using var _ = ViewProgressScope.BeginIfNeeded(FindForm(), DiagramViewDisplayNames.Get(DiagramViewKind.CallGraph));

        var (startIndex, count) = _pager.GetCurrentPageSlice();
        _tabs.SuspendLayout();
        ClearTabs();
        _tabs.TabPages.Clear();

        for (var offset = 0; offset < count; offset++)
        {
            var globalIndex = startIndex + offset;
            ViewProgressReporter.ReportStep(
                offset,
                count,
                $"호출 그래프 탭을 구성하는 중... ({globalIndex + 1}/{_allRootIds.Count})");

            var rootId = _allRootIds[globalIndex];
            if (!_graph.NodeMap.TryGetValue(rootId, out var node))
            {
                continue;
            }

            var viewer = CreateTabViewer();
            viewer.SetGraph(_graph, [rootId]);
            viewer.ExpandAll();

            var tab = new TabPage(FormatTabTitle(node, globalIndex, _allRootIds.Count))
            {
                Padding = new Padding(2),
                ToolTipText = string.IsNullOrWhiteSpace(node.FullName) ? node.DisplayName : node.FullName
            };
            tab.Controls.Add(viewer);
            _tabs.TabPages.Add(tab);
            _tabViewers.Add(viewer);
        }

        if (_tabs.TabPages.Count > 0)
        {
            _tabs.SelectedIndex = 0;
        }

        _tabs.ResumeLayout();
    }

    private CallGraphViewer CreateTabViewer()
    {
        var viewer = new CallGraphViewer
        {
            Dock = DockStyle.Fill
        };
        viewer.LayoutDirection = _layoutDirection;
        viewer.LineStyle = _lineStyle;
        viewer.RootNodeChanged += node => RootNodeChanged?.Invoke(node);
        return viewer;
    }

    private void ClearTabs()
    {
        foreach (var viewer in _tabViewers)
        {
            viewer.Dispose();
        }

        _tabViewers.Clear();
        _tabs.TabPages.Clear();
    }

    private static int FindRootIndexForNode(
        CallGraphResult graph,
        IReadOnlyList<string> roots,
        string nodeId)
    {
        for (var index = 0; index < roots.Count; index++)
        {
            var rootId = roots[index];
            if (string.Equals(rootId, nodeId, StringComparison.Ordinal))
            {
                return index;
            }

            if (FindPath(graph, rootId, nodeId) is not null)
            {
                return index;
            }
        }

        return -1;
    }

    private static List<string>? FindPath(CallGraphResult graph, string rootId, string targetId)
    {
        if (string.Equals(rootId, targetId, StringComparison.Ordinal))
        {
            return [rootId];
        }

        var queue = new Queue<List<string>>();
        queue.Enqueue([rootId]);
        var visited = new HashSet<string>(StringComparer.Ordinal) { rootId };

        while (queue.Count > 0)
        {
            var path = queue.Dequeue();
            var currentId = path[^1];

            if (!graph.Outgoing.TryGetValue(currentId, out var children))
            {
                continue;
            }

            foreach (var childId in children)
            {
                if (!visited.Add(childId))
                {
                    continue;
                }

                var nextPath = new List<string>(path) { childId };
                if (string.Equals(childId, targetId, StringComparison.Ordinal))
                {
                    return nextPath;
                }

                queue.Enqueue(nextPath);
            }
        }

        return null;
    }

    private static string FormatTabTitle(CallGraphNode node, int index, int total)
    {
        var title = string.IsNullOrWhiteSpace(node.FullName) ? node.DisplayName : node.FullName;
        if (title.Length > 36)
        {
            title = title[..33] + "...";
        }

        return total > 1 ? $"{index + 1}. {title}" : title;
    }
}
