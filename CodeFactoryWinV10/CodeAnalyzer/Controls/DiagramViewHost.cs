using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

public sealed class DiagramViewHost : UserControl
{
    private readonly CallGraphViewer _callGraphViewer = new() { Dock = DockStyle.Fill, Visible = true };
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

    private CallGraphResult? _callGraphOverride;
    private string? _accessGraphRootId;
    private IReadOnlyList<string> _accessGraphRootIds = [];
    private DiagramViewKind _viewKindBeforeAccessGraph = DiagramViewKind.CallGraph;

    public DiagramViewHost()
    {
        Controls.Add(_callGraphViewer);
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
        _callGraphViewer.RootNodeChanged += OnCallGraphRootNodeChanged;
        _structureViewer.FileRootChanged += node => FileRootChanged?.Invoke(node);
        _structureViewer.DirectoryRootChanged += node => DirectoryRootChanged?.Invoke(node);
        _structureViewer.FunctionRootChanged += OnStructureFunctionRootChanged;
    }

    public event Action<CallGraphNode>? CallGraphRootChanged;
    public event Action<FileRelationNode>? FileRootChanged;
    public event Action<DirectoryRelationNode>? DirectoryRootChanged;
    public event Action<MetricsNavigationRequest>? MetricsNavigationRequested;
    public event Action<GlobalVariableItem>? GlobalVariableAccessGraphRequested;
    public event Action<DatabaseTable>? DatabaseTableAccessGraphRequested;

    public bool IsShowingGlobalVariableAccessGraph => _callGraphOverride is not null;
    public bool IsShowingAccessGraph => _callGraphOverride is not null;

    public DiagramViewKind ViewKind
    {
        get => _viewKind;
        set
        {
            _viewKind = value;
            ApplyVisibility();
            RefreshActiveView();
        }
    }

    public CallGraphViewer CallGraphViewer => _callGraphViewer;

    public GraphLayoutDirection LayoutDirection
    {
        set
        {
            _callGraphViewer.LayoutDirection = value;
            _structureViewer.LayoutDirection = value;
        }
    }

    public ConnectionLineStyle LineStyle
    {
        set
        {
            _callGraphViewer.LineStyle = value;
            _structureViewer.LineStyle = value;
            _erdViewer.LineStyle = value;
        }
    }

    public string? ProjectRootDirectory { get; set; }

    public void SetAnalysis(AnalysisResult? analysis, IReadOnlyList<string> rootNodeIds)
    {
        _analysis = analysis;
        _rootNodeIds = rootNodeIds;
        ClearGlobalVariableAccessGraph();
        _summaryViewer.SetAnalysis(_analysis, ProjectRootDirectory);
        RefreshActiveView();
    }

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
        _callGraphViewer.SetGlobalVariableAccessGraph(
            graph,
            rootNodeIds,
            variable.Id);
        _callGraphViewer.ExpandAll();
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
        _callGraphViewer.SetGlobalVariableAccessGraph(
            graph,
            rootNodeIds,
            table.Id);
        _callGraphViewer.ExpandAll();
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
        _callGraphViewer.BeginAnalysis();
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
        _callGraphViewer.EndAnalysis();
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
        _callGraphViewer.ClearSearchHighlight();
        _structureViewer.ClearSearchHighlight();
    }

    public void ResetView()
    {
        if (_viewKind == DiagramViewKind.CallGraph)
            _callGraphViewer.ResetView();
        else if (_viewKind == DiagramViewKind.DatabaseErd)
            _erdViewer.ResetView();
        else if (_structureViewer.Visible)
            _structureViewer.ResetView();
    }

    public void SetSearchHighlight(IEnumerable<string> matchIds, string? currentId)
    {
        if (_viewKind == DiagramViewKind.CallGraph)
        {
            _callGraphViewer.SetSearchHighlight(matchIds, currentId);
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
            return _callGraphViewer.TryFocusNode(nodeId);
        }

        if (_viewKind == DiagramViewKind.FileRelations
            && _analysis.FileRelations.FileMap.ContainsKey(nodeId))
        {
            _structureViewer.ViewKind = DiagramViewKind.FileRelations;
            _structureViewer.SetAnalysis(_analysis, _rootNodeIds, ProjectRootDirectory);
            _structureViewer.FocusFile(nodeId);
            return true;
        }

        if (_viewKind == DiagramViewKind.DirectoryRelations
            && _analysis.DirectoryRelations.DirectoryMap.ContainsKey(nodeId))
        {
            _structureViewer.ViewKind = DiagramViewKind.DirectoryRelations;
            _structureViewer.SetAnalysis(_analysis, _rootNodeIds, ProjectRootDirectory);
            _structureViewer.FocusDirectory(nodeId);
            return true;
        }

        if (_viewKind == DiagramViewKind.DataFlow
            && _analysis.CallGraph.NodeMap.ContainsKey(nodeId))
        {
            _structureViewer.ViewKind = DiagramViewKind.DataFlow;
            _structureViewer.SetAnalysis(_analysis, [nodeId], ProjectRootDirectory);
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

    private void OnStructureFunctionRootChanged(CallGraphNode node)
    {
        _rootNodeIds = [node.Id];
        CallGraphRootChanged?.Invoke(node);
    }

    private void OnCallGraphRootNodeChanged(CallGraphNode node)
    {
        _rootNodeIds = [node.Id];
        CallGraphRootChanged?.Invoke(node);

        if (_viewKind is DiagramViewKind.SequenceDiagram
            or DiagramViewKind.DataFlow
            or DiagramViewKind.FileRelations
            or DiagramViewKind.DirectoryRelations)
        {
            _structureViewer.ViewKind = _viewKind;
            _structureViewer.SetAnalysis(_analysis, [node.Id], ProjectRootDirectory);
        }
    }

    private void ApplyVisibility()
    {
        _callGraphViewer.Visible = _viewKind == DiagramViewKind.CallGraph;
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
            _callGraphViewer.ExpandAll();
        }
    }

    public void CollapseAll()
    {
        if (_viewKind == DiagramViewKind.CallGraph)
        {
            _callGraphViewer.CollapseAll();
        }
    }

    public bool IsCallGraphView => _viewKind == DiagramViewKind.CallGraph;

    public Bitmap? ExportToBitmap()
    {
        return _viewKind switch
        {
            DiagramViewKind.CallGraph => _callGraphViewer.ExportToBitmap(),
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
            if (_analysis is null && _callGraphOverride is null)
            {
                _callGraphViewer.SetGraph(null, Array.Empty<string>());
                return;
            }

            var graph = _callGraphOverride ?? _analysis!.CallGraph;
            var roots = _callGraphOverride is not null && _accessGraphRootIds is { Count: > 0 }
                ? _accessGraphRootIds
                : _callGraphOverride is not null && !string.IsNullOrWhiteSpace(_accessGraphRootId)
                    ? [_accessGraphRootId!]
                    : _rootNodeIds;
            _callGraphViewer.SetGraph(graph, roots);
            _callGraphViewer.ExpandAll();
            return;
        }

        if (_structureViewer.ViewKind != _viewKind)
        {
            _structureViewer.ViewKind = _viewKind;
        }

        _structureViewer.SetAnalysis(_analysis, _rootNodeIds, ProjectRootDirectory);
    }
}
