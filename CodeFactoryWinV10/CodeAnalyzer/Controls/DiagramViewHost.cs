using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

public sealed class DiagramViewHost : UserControl
{
    private readonly CallGraphViewer _callGraphViewer = new() { Dock = DockStyle.Fill, Visible = true };
    private readonly StructureDiagramViewer _structureViewer = new() { Dock = DockStyle.Fill, Visible = false };
    private DiagramViewKind _viewKind = DiagramViewKind.CallGraph;
    private AnalysisResult? _analysis;
    private IReadOnlyList<string> _rootNodeIds = [];

    public DiagramViewHost()
    {
        Controls.Add(_callGraphViewer);
        Controls.Add(_structureViewer);
        _callGraphViewer.RootNodeChanged += OnCallGraphRootNodeChanged;
        _structureViewer.FileRootChanged += node => FileRootChanged?.Invoke(node);
        _structureViewer.DirectoryRootChanged += node => DirectoryRootChanged?.Invoke(node);
    }

    public event Action<CallGraphNode>? CallGraphRootChanged;
    public event Action<FileRelationNode>? FileRootChanged;
    public event Action<DirectoryRelationNode>? DirectoryRootChanged;

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
        }
    }

    public void SetAnalysis(AnalysisResult? analysis, IReadOnlyList<string> rootNodeIds)
    {
        _analysis = analysis;
        _rootNodeIds = rootNodeIds;
        RefreshActiveView();
    }

    public void BeginAnalysis()
    {
        _analysis = null;
        _rootNodeIds = [];
        _callGraphViewer.BeginAnalysis();
        _structureViewer.BeginAnalysis();
    }

    public void EndAnalysis()
    {
        _callGraphViewer.EndAnalysis();
        _structureViewer.EndAnalysis();
    }

    public void ClearSearchHighlight()
    {
        _callGraphViewer.ClearSearchHighlight();
        _structureViewer.ClearSearchHighlight();
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
            _structureViewer.SetAnalysis(_analysis, _rootNodeIds);
            _structureViewer.FocusFile(nodeId);
            return true;
        }

        if (_viewKind == DiagramViewKind.DirectoryRelations
            && _analysis.DirectoryRelations.DirectoryMap.ContainsKey(nodeId))
        {
            _structureViewer.ViewKind = DiagramViewKind.DirectoryRelations;
            _structureViewer.SetAnalysis(_analysis, _rootNodeIds);
            _structureViewer.FocusDirectory(nodeId);
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
            _structureViewer.SetAnalysis(_analysis, [node.Id]);
        }
    }

    private void ApplyVisibility()
    {
        var isCallGraph = _viewKind == DiagramViewKind.CallGraph;
        _callGraphViewer.Visible = isCallGraph;
        _structureViewer.Visible = !isCallGraph;
    }

    public bool IsCallGraphView => _viewKind == DiagramViewKind.CallGraph;

    public Bitmap? ExportToBitmap()
    {
        return _viewKind == DiagramViewKind.CallGraph
            ? _callGraphViewer.ExportToBitmap()
            : _structureViewer.ExportToBitmap();
    }

    private void RefreshActiveView()
    {
        if (_viewKind == DiagramViewKind.CallGraph)
        {
            if (_analysis is null)
            {
                _callGraphViewer.SetGraph(null, Array.Empty<string>());
                return;
            }

            _callGraphViewer.SetGraph(_analysis.CallGraph, _rootNodeIds);
            return;
        }

        if (_structureViewer.ViewKind != _viewKind)
        {
            _structureViewer.ViewKind = _viewKind;
        }

        _structureViewer.SetAnalysis(_analysis, _rootNodeIds);
    }
}
