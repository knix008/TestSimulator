using CodeAnalyzer.Models;
using CodeAnalyzer.Services;

namespace CodeAnalyzer.Controls;

public sealed class DiagramViewHost : UserControl
{
    private readonly CallGraphTabHost _callGraphTabHost = new() { Dock = DockStyle.Fill, Visible = true };
    private readonly AnalysisSummaryViewer _summaryViewer = new() { Dock = DockStyle.Fill, Visible = false };
    private readonly StructureDiagramViewer _structureViewer = new() { Dock = DockStyle.Fill, Visible = false };
    private readonly CodeMetricsViewer _metricsViewer = new() { Dock = DockStyle.Fill, Visible = false };
    private readonly DuplicateCodeViewer _duplicateViewer = new() { Dock = DockStyle.Fill, Visible = false };
    private readonly GlobalVariableViewer _globalVariableViewer = new() { Dock = DockStyle.Fill, Visible = false };
    private readonly ErdDiagramViewer _erdViewer = new() { Dock = DockStyle.Fill, Visible = false };
    private readonly DatabaseTableViewer _databaseTableViewer = new() { Dock = DockStyle.Fill, Visible = false };
    private readonly BugRiskViewer _bugRiskViewer = new() { Dock = DockStyle.Fill, Visible = false };
    private readonly SecurityViewer _securityViewer = new() { Dock = DockStyle.Fill, Visible = false };
    private DiagramViewKind _viewKind = DiagramViewKind.CallGraph;
    private AnalysisResult? _analysis;
    private IReadOnlyList<string> _rootNodeIds = [];
    private IReadOnlyList<string> _sequenceRootNodeIds = [];

    private CallGraphResult? _callGraphOverride;
    private string? _accessGraphRootId;
    private IReadOnlyList<string> _accessGraphRootIds = [];
    private DiagramViewKind _viewKindBeforeAccessGraph = DiagramViewKind.CallGraph;
    private int _refreshGeneration;
    private AnalysisResult? _loadedAnalysis;
    private IReadOnlyList<string> _loadedRootIds = [];
    private IReadOnlyList<string> _loadedSequenceRootIds = [];
    private readonly HashSet<DiagramViewKind> _readyViews = [];

    public DiagramViewHost()
    {
        Controls.Add(_callGraphTabHost);
        Controls.Add(_summaryViewer);
        Controls.Add(_structureViewer);
        Controls.Add(_metricsViewer);
        Controls.Add(_duplicateViewer);
        Controls.Add(_globalVariableViewer);
        Controls.Add(_erdViewer);
        Controls.Add(_databaseTableViewer);
        Controls.Add(_bugRiskViewer);
        Controls.Add(_securityViewer);
        _metricsViewer.NavigationRequested += request => MetricsNavigationRequested?.Invoke(request);
        _duplicateViewer.NavigationRequested += request => MetricsNavigationRequested?.Invoke(request);
        _globalVariableViewer.NavigationRequested += request => MetricsNavigationRequested?.Invoke(request);
        _globalVariableViewer.AccessGraphRequested += variable => GlobalVariableAccessGraphRequested?.Invoke(variable);
        _databaseTableViewer.AccessGraphRequested += table => DatabaseTableAccessGraphRequested?.Invoke(table);
        _bugRiskViewer.NavigationRequested += request => MetricsNavigationRequested?.Invoke(request);
        _securityViewer.NavigationRequested += request => MetricsNavigationRequested?.Invoke(request);
        _summaryViewer.NavigationRequested += viewKind => SummaryNavigationRequested?.Invoke(viewKind);
        _callGraphTabHost.RootNodeChanged += OnCallGraphRootNodeChanged;
        _structureViewer.FileRootChanged += node => FileRootChanged?.Invoke(node);
        _structureViewer.DirectoryRootChanged += node => DirectoryRootChanged?.Invoke(node);
        _structureViewer.FunctionRootChanged += OnStructureFunctionRootChanged;
    }

    public event Action<CallGraphNode>? CallGraphRootChanged;
    public event Action<FileRelationNode>? FileRootChanged;
    public event Action<DirectoryRelationNode>? DirectoryRootChanged;
    public event Action<MetricsNavigationRequest>? MetricsNavigationRequested;
    public event Action<DiagramViewKind>? SummaryNavigationRequested;
    public event Action<GlobalVariableItem>? GlobalVariableAccessGraphRequested;
    public event Action<DatabaseTable>? DatabaseTableAccessGraphRequested;

    public bool IsShowingGlobalVariableAccessGraph => _callGraphOverride is not null;
    public bool IsShowingAccessGraph => _callGraphOverride is not null;

    public DiagramViewKind ViewKind
    {
        get => _viewKind;
        set
        {
            if (_viewKind == value)
            {
                return;
            }

            _readyViews.Remove(value);
            _viewKind = value;
            ApplyVisibility();
            RefreshActiveView();
        }
    }

    public CallGraphViewer CallGraphViewer => _callGraphTabHost.ActiveViewer;

    public GraphLayoutDirection LayoutDirection
    {
        set
        {
            _callGraphTabHost.LayoutDirection = value;
            _structureViewer.LayoutDirection = value;
        }
    }

    public ConnectionLineStyle LineStyle
    {
        set
        {
            _callGraphTabHost.LineStyle = value;
            _structureViewer.LineStyle = value;
            _erdViewer.LineStyle = value;
        }
    }

    public string? ProjectRootDirectory { get; set; }

    public void SetAnalysis(AnalysisResult? analysis, IReadOnlyList<string> rootNodeIds, IReadOnlyList<string>? sequenceRootNodeIds = null)
    {
        var analysisChanged = !ReferenceEquals(_loadedAnalysis, analysis);
        var rootsChanged = !_rootNodeIds.SequenceEqual(rootNodeIds);
        var sequenceRoots = sequenceRootNodeIds ?? [];
        var sequenceRootsChanged = !_sequenceRootNodeIds.SequenceEqual(sequenceRoots);

        if (analysisChanged)
        {
            _readyViews.Clear();
        }
        else if (rootsChanged || sequenceRootsChanged)
        {
            _readyViews.Remove(_viewKind);
        }

        _analysis = analysis;
        _rootNodeIds = rootNodeIds;
        _sequenceRootNodeIds = sequenceRoots;
        _loadedAnalysis = analysis;
        _loadedRootIds = rootNodeIds;
        _loadedSequenceRootIds = _sequenceRootNodeIds;
        ClearGlobalVariableAccessGraph();
        RefreshActiveView();
    }

    private bool IsActiveViewReady()
    {
        if (_callGraphOverride is not null)
        {
            return false;
        }

        if (!ReferenceEquals(_loadedAnalysis, _analysis))
        {
            return false;
        }

        if (!_rootNodeIds.SequenceEqual(_loadedRootIds)
            || !_sequenceRootNodeIds.SequenceEqual(_loadedSequenceRootIds))
        {
            return false;
        }

        return _readyViews.Contains(_viewKind);
    }

    private void MarkActiveViewReady() => _readyViews.Add(_viewKind);

    public void ShowGlobalVariableAccessGraph(
        GlobalVariableItem variable,
        CallGraphResult graph,
        IReadOnlyList<string> rootNodeIds)
    {
        _viewKindBeforeAccessGraph = _viewKind;
        _callGraphOverride = graph;
        _accessGraphRootId = variable.Id;
        _accessGraphRootIds = rootNodeIds;
        _viewKind = DiagramViewKind.CallGraph;
        ApplyVisibility();
        _ = ShowAccessGraphAsync(variable.Id);
    }

    public void ShowDatabaseTableAccessGraph(
        DatabaseTable table,
        CallGraphResult graph,
        IReadOnlyList<string> rootNodeIds)
    {
        _viewKindBeforeAccessGraph = _viewKind;
        _callGraphOverride = graph;
        _accessGraphRootId = table.Id;
        _accessGraphRootIds = rootNodeIds;
        _viewKind = DiagramViewKind.CallGraph;
        ApplyVisibility();
        _ = ShowAccessGraphAsync(table.Id);
    }

    private async Task ShowAccessGraphAsync(string targetNodeId)
    {
        if (_callGraphOverride is null)
        {
            return;
        }

        var graph = _callGraphOverride;
        var accessRoots = _accessGraphRootIds is { Count: > 0 }
            ? _accessGraphRootIds
            : !string.IsNullOrWhiteSpace(_accessGraphRootId)
                ? [_accessGraphRootId!]
                : _rootNodeIds;

        _callGraphTabHost.SetGlobalVariableAccessGraph(
            graph,
            accessRoots,
            targetNodeId);
        await _callGraphTabHost.ExpandAllAsync().ConfigureAwait(true);
    }

    public void ClearGlobalVariableAccessGraph()
    {
        _callGraphOverride = null;
        _accessGraphRootId = null;
        _accessGraphRootIds = [];
    }

    public void BeginAnalysis()
    {
        _analysis = null;
        _rootNodeIds = [];
        _sequenceRootNodeIds = [];
        _readyViews.Clear();
        _loadedAnalysis = null;
        _callGraphTabHost.BeginAnalysis();
        _summaryViewer.BeginAnalysis();
        _structureViewer.BeginAnalysis();
        _metricsViewer.BeginAnalysis();
        _duplicateViewer.BeginAnalysis();
        _globalVariableViewer.BeginAnalysis();
        _erdViewer.BeginAnalysis();
        _databaseTableViewer.BeginAnalysis();
        _bugRiskViewer.BeginAnalysis();
        _securityViewer.BeginAnalysis();
    }

    public void EndAnalysis()
    {
        _callGraphTabHost.EndAnalysis();
        _summaryViewer.EndAnalysis();
        _structureViewer.EndAnalysis();
        _metricsViewer.EndAnalysis();
        _duplicateViewer.EndAnalysis();
        _globalVariableViewer.EndAnalysis();
        _erdViewer.EndAnalysis();
        _databaseTableViewer.EndAnalysis();
        _bugRiskViewer.EndAnalysis();
        _securityViewer.EndAnalysis();
    }

    public void ClearSearchHighlight()
    {
        _callGraphTabHost.ClearSearchHighlight();
        _structureViewer.ClearSearchHighlight();
    }

    public void ResetView()
    {
        if (_viewKind == DiagramViewKind.CallGraph)
            _callGraphTabHost.ResetView();
        else if (_viewKind == DiagramViewKind.DatabaseErd)
            _erdViewer.ResetView();
        else if (_structureViewer.Visible)
            _structureViewer.ResetView();
    }

    public void SetSearchHighlight(IEnumerable<string> matchIds, string? currentId)
    {
        if (_viewKind == DiagramViewKind.CallGraph)
        {
            _callGraphTabHost.SetSearchHighlight(matchIds, currentId);
        }
        else
        {
            _structureViewer.SetSearchHighlight(matchIds, currentId);
        }
    }

    public void FocusType(string? typeId)
    {
        _structureViewer.FocusType(typeId);
    }

    public bool TryFocusNode(string nodeId)
    {
        if (_analysis is null)
        {
            return false;
        }

        if (_viewKind == DiagramViewKind.CallGraph)
        {
            return _callGraphTabHost.TryFocusNode(nodeId);
        }

        if (_viewKind == DiagramViewKind.FileRelations
            && _analysis.FileRelations.FileMap.ContainsKey(nodeId))
        {
            _structureViewer.ApplyViewState(
                DiagramViewKind.FileRelations,
                _analysis,
                _rootNodeIds,
                ProjectRootDirectory);
            _structureViewer.FocusFile(nodeId);
            return true;
        }

        if (_viewKind == DiagramViewKind.DirectoryRelations
            && _analysis.DirectoryRelations.DirectoryMap.ContainsKey(nodeId))
        {
            _structureViewer.ApplyViewState(
                DiagramViewKind.DirectoryRelations,
                _analysis,
                _rootNodeIds,
                ProjectRootDirectory);
            _structureViewer.FocusDirectory(nodeId);
            return true;
        }

        if (_viewKind == DiagramViewKind.DataFlow
            && _analysis.CallGraph.NodeMap.ContainsKey(nodeId))
        {
            _structureViewer.ApplyViewState(
                DiagramViewKind.DataFlow,
                _analysis,
                [nodeId],
                ProjectRootDirectory);
            _structureViewer.FocusDataFlowNode(nodeId);
            return true;
        }

        if (!_analysis.CallGraph.NodeMap.ContainsKey(nodeId))
        {
            return false;
        }

        _rootNodeIds = [nodeId];
        RefreshActiveView();
        return true;
    }

    public void ClearStructureContainerFocus()
    {
        _structureViewer.ClearContainerFocus();
    }

    public void ClearDataFlowRootOverride()
    {
        _structureViewer.ClearDataFlowRootOverride();
    }

    private void OnStructureFunctionRootChanged(CallGraphNode node)
    {
        _rootNodeIds = [node.Id];
        CallGraphRootChanged?.Invoke(node);
    }

    private void OnCallGraphRootNodeChanged(CallGraphNode node)
    {
        _rootNodeIds = [node.Id];
        CallGraphRootChanged?.Invoke(node);

        if (_viewKind is DiagramViewKind.DataFlow
            or DiagramViewKind.FileRelations
            or DiagramViewKind.DirectoryRelations)
        {
            _structureViewer.ApplyViewState(_viewKind, _analysis, [node.Id], ProjectRootDirectory);
        }
    }

    private void ApplyVisibility()
    {
        _callGraphTabHost.Visible = _viewKind == DiagramViewKind.CallGraph;
        _summaryViewer.Visible = _viewKind == DiagramViewKind.Summary;
        _structureViewer.Visible = _viewKind is DiagramViewKind.ClassDiagram
            or DiagramViewKind.SequenceDiagram
            or DiagramViewKind.DataFlow
            or DiagramViewKind.Inheritance
            or DiagramViewKind.FileRelations
            or DiagramViewKind.DirectoryRelations;
        _metricsViewer.Visible = _viewKind == DiagramViewKind.CodeMetrics;
        _duplicateViewer.Visible = _viewKind == DiagramViewKind.DuplicateCode;
        _globalVariableViewer.Visible = _viewKind == DiagramViewKind.GlobalVariables;
        _erdViewer.Visible = _viewKind == DiagramViewKind.DatabaseErd;
        _databaseTableViewer.Visible = _viewKind == DiagramViewKind.DatabaseTableAccess;
        _bugRiskViewer.Visible = _viewKind == DiagramViewKind.BugRisk;
        _securityViewer.Visible = _viewKind == DiagramViewKind.InformationSecurity;
    }

    public void ExpandAll()
    {
        if (_viewKind == DiagramViewKind.CallGraph)
        {
            _callGraphTabHost.ExpandAll();
        }
    }

    public void CollapseAll()
    {
        if (_viewKind == DiagramViewKind.CallGraph)
        {
            _callGraphTabHost.CollapseAll();
        }
    }

    public bool IsCallGraphView => _viewKind == DiagramViewKind.CallGraph;

    public Bitmap? ExportToBitmap()
    {
        return _viewKind switch
        {
            DiagramViewKind.CallGraph => _callGraphTabHost.ExportToBitmap(),
            DiagramViewKind.CodeMetrics => null,
            DiagramViewKind.DuplicateCode => null,
            DiagramViewKind.GlobalVariables => null,
            DiagramViewKind.DatabaseTableAccess => null,
            DiagramViewKind.BugRisk => null,
            DiagramViewKind.InformationSecurity => null,
            DiagramViewKind.DatabaseErd => _erdViewer.ExportToBitmap(),
            _ => _structureViewer.ExportToBitmap()
        };
    }

    private void RefreshActiveView()
    {
        _ = RefreshActiveViewAsync();
    }

    private async Task RefreshActiveViewAsync()
    {
        if (IsActiveViewReady())
        {
            return;
        }

        var generation = ++_refreshGeneration;

        if (_viewKind == DiagramViewKind.CallGraph)
        {
            await RefreshCallGraphAsync().ConfigureAwait(true);
            if (generation == _refreshGeneration)
            {
                MarkActiveViewReady();
            }

            return;
        }

        if (_viewKind == DiagramViewKind.CodeMetrics)
        {
            await _metricsViewer.SetMetricsAsync(
                _analysis?.Metrics,
                _analysis?.QualityThresholds,
                _analysis).ConfigureAwait(true);
            if (generation == _refreshGeneration)
            {
                MarkActiveViewReady();
            }

            return;
        }

        if (_viewKind == DiagramViewKind.DuplicateCode)
        {
            await _duplicateViewer.SetDuplicatesAsync(_analysis?.Duplicates, ProjectRootDirectory)
                .ConfigureAwait(true);
            if (generation == _refreshGeneration)
            {
                MarkActiveViewReady();
            }

            return;
        }

        if (_viewKind == DiagramViewKind.GlobalVariables)
        {
            await _globalVariableViewer.SetGlobalsAsync(_analysis?.GlobalVariables, ProjectRootDirectory)
                .ConfigureAwait(true);
            if (generation == _refreshGeneration)
            {
                MarkActiveViewReady();
            }

            return;
        }

        if (_viewKind == DiagramViewKind.DatabaseTableAccess)
        {
            await _databaseTableViewer.SetSchemaAsync(_analysis?.DatabaseSchema, ProjectRootDirectory)
                .ConfigureAwait(true);
            if (generation == _refreshGeneration)
            {
                MarkActiveViewReady();
            }

            return;
        }

        if (_viewKind == DiagramViewKind.BugRisk)
        {
            await _bugRiskViewer.SetResultAsync(_analysis?.BugRisk, ProjectRootDirectory).ConfigureAwait(true);
            if (generation == _refreshGeneration)
            {
                MarkActiveViewReady();
            }

            return;
        }

        if (_viewKind == DiagramViewKind.InformationSecurity)
        {
            await _securityViewer.SetResultAsync(_analysis?.Security, ProjectRootDirectory).ConfigureAwait(true);
            if (generation == _refreshGeneration)
            {
                MarkActiveViewReady();
            }

            return;
        }

        if (_viewKind == DiagramViewKind.Summary)
        {
            await _summaryViewer.SetAnalysisAsync(_analysis, ProjectRootDirectory).ConfigureAwait(true);
            if (generation == _refreshGeneration)
            {
                MarkActiveViewReady();
            }

            return;
        }

        if (generation != _refreshGeneration)
        {
            return;
        }

        RefreshActiveViewCore();
        MarkActiveViewReady();
    }

    private async Task RefreshCallGraphAsync()
    {
        if (_analysis is null && _callGraphOverride is null)
        {
            await _callGraphTabHost.SetGraphAsync(null, Array.Empty<string>()).ConfigureAwait(true);
            return;
        }

        var graph = _callGraphOverride ?? _analysis!.CallGraph;
        if (_callGraphOverride is not null)
        {
            var accessRoots = _accessGraphRootIds is { Count: > 0 }
                ? _accessGraphRootIds
                : !string.IsNullOrWhiteSpace(_accessGraphRootId)
                    ? [_accessGraphRootId!]
                    : _rootNodeIds;
            _callGraphTabHost.SetGlobalVariableAccessGraph(
                graph,
                accessRoots,
                _accessGraphRootId ?? accessRoots.FirstOrDefault() ?? string.Empty);
            return;
        }

        var roots = ResolveCallGraphTabRoots();
        await _callGraphTabHost.SetGraphAsync(graph, roots).ConfigureAwait(true);
    }

    private void RefreshActiveViewCore()
    {
        if (_viewKind == DiagramViewKind.Summary)
        {
            _summaryViewer.SetAnalysis(_analysis, ProjectRootDirectory);
            return;
        }

        if (_viewKind == DiagramViewKind.CodeMetrics)
        {
            _metricsViewer.SetMetrics(_analysis?.Metrics, _analysis?.QualityThresholds, _analysis);
            return;
        }

        if (_viewKind == DiagramViewKind.DuplicateCode)
        {
            _duplicateViewer.SetDuplicates(_analysis?.Duplicates, ProjectRootDirectory);
            return;
        }

        if (_viewKind == DiagramViewKind.GlobalVariables)
        {
            _globalVariableViewer.SetGlobals(_analysis?.GlobalVariables, ProjectRootDirectory);
            return;
        }

        if (_viewKind == DiagramViewKind.DatabaseErd)
        {
            _erdViewer.SetSchema(_analysis?.DatabaseSchema);
            return;
        }

        if (_viewKind == DiagramViewKind.DatabaseTableAccess)
        {
            _databaseTableViewer.SetSchema(_analysis?.DatabaseSchema, ProjectRootDirectory);
            return;
        }

        if (_viewKind == DiagramViewKind.BugRisk)
        {
            _bugRiskViewer.SetResult(_analysis?.BugRisk, ProjectRootDirectory);
            return;
        }

        if (_viewKind == DiagramViewKind.InformationSecurity)
        {
            _securityViewer.SetResult(_analysis?.Security, ProjectRootDirectory);
            return;
        }

        if (_viewKind == DiagramViewKind.CallGraph)
        {
            return;
        }

        var structureRoots = _viewKind == DiagramViewKind.SequenceDiagram
            ? ResolveSequenceRootNodeIds()
            : _rootNodeIds;
        _structureViewer.ApplyViewState(_viewKind, _analysis, structureRoots, ProjectRootDirectory);
    }

    private IReadOnlyList<string> ResolveSequenceRootNodeIds()
    {
        if (_analysis is null)
        {
            return _sequenceRootNodeIds.Count > 0 ? _sequenceRootNodeIds : _rootNodeIds;
        }

        var selected = _sequenceRootNodeIds.Count > 0 ? _sequenceRootNodeIds : _rootNodeIds;
        return SequenceDiagramBuilder.ResolveSequenceEntryRoots(_analysis.CallGraph, selected);
    }

    private IReadOnlyList<string> ResolveCallGraphTabRoots()
    {
        if (_analysis is null)
        {
            return _rootNodeIds;
        }

        if (_rootNodeIds.Count > 0)
        {
            return _rootNodeIds
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Where(id => _analysis.CallGraph.NodeMap.ContainsKey(id))
                .Distinct(StringComparer.Ordinal)
                .ToList();
        }

        return SequenceDiagramBuilder.ResolveSequenceEntryRoots(_analysis.CallGraph, []);
    }
}
