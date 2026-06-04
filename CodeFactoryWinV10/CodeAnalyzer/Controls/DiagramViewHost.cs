using CodeAnalyzer.Models;

namespace CodeAnalyzer.Controls;

public sealed class DiagramViewHost : UserControl
{
    private readonly CallGraphViewer _callGraphViewer = new() { Dock = DockStyle.Fill, Visible = true };
    private readonly StructureDiagramViewer _structureViewer = new() { Dock = DockStyle.Fill, Visible = false };
    private readonly CodeMetricsViewer _metricsViewer = new() { Dock = DockStyle.Fill, Visible = false };
    private readonly DuplicateCodeViewer _duplicateViewer = new() { Dock = DockStyle.Fill, Visible = false };
    private DiagramViewKind _viewKind = DiagramViewKind.CallGraph;
    private AnalysisResult? _analysis;
    private IReadOnlyList<string> _rootNodeIds = [];

    private readonly Button _btnResetView = new()
    {
        Text = "⟳ 뷰 초기화",
        Size = new Size(88, 26),
        Anchor = AnchorStyles.Top | AnchorStyles.Right,
        BackColor = Color.FromArgb(240, 240, 245),
        FlatStyle = FlatStyle.Flat,
        Cursor = Cursors.Hand,
        Visible = false
    };

    public DiagramViewHost()
    {
        Controls.Add(_callGraphViewer);
        Controls.Add(_structureViewer);
        Controls.Add(_metricsViewer);
        Controls.Add(_duplicateViewer);
        _btnResetView.Location = new Point(ClientSize.Width - _btnResetView.Width - 6, 6);
        _btnResetView.FlatAppearance.BorderColor = Color.FromArgb(180, 180, 195);
        Controls.Add(_btnResetView);
        _btnResetView.BringToFront();
        _btnResetView.Click += (_, _) => ResetView();
        SizeChanged += (_, _) =>
            _btnResetView.Location = new Point(ClientSize.Width - _btnResetView.Width - 6, 6);
        _metricsViewer.NavigationRequested += request => MetricsNavigationRequested?.Invoke(request);
        _duplicateViewer.NavigationRequested += request => MetricsNavigationRequested?.Invoke(request);
        _callGraphViewer.RootNodeChanged += OnCallGraphRootNodeChanged;
        _structureViewer.FileRootChanged += node => FileRootChanged?.Invoke(node);
        _structureViewer.DirectoryRootChanged += node => DirectoryRootChanged?.Invoke(node);
    }

    public event Action<CallGraphNode>? CallGraphRootChanged;
    public event Action<FileRelationNode>? FileRootChanged;
    public event Action<DirectoryRelationNode>? DirectoryRootChanged;
    public event Action<MetricsNavigationRequest>? MetricsNavigationRequested;

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
        _metricsViewer.BeginAnalysis();
        _duplicateViewer.BeginAnalysis();
    }

    public void EndAnalysis()
    {
        _callGraphViewer.EndAnalysis();
        _structureViewer.EndAnalysis();
        _metricsViewer.EndAnalysis();
        _duplicateViewer.EndAnalysis();
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
        _callGraphViewer.Visible = _viewKind == DiagramViewKind.CallGraph;
        _structureViewer.Visible = _viewKind is DiagramViewKind.ClassDiagram
            or DiagramViewKind.SequenceDiagram
            or DiagramViewKind.DataFlow
            or DiagramViewKind.Inheritance
            or DiagramViewKind.FileRelations
            or DiagramViewKind.DirectoryRelations;
        _metricsViewer.Visible = _viewKind == DiagramViewKind.CodeMetrics;
        _duplicateViewer.Visible = _viewKind == DiagramViewKind.DuplicateCode;

        // Show reset button only for zoomable diagram views
        _btnResetView.Visible = _callGraphViewer.Visible || _structureViewer.Visible;
        _btnResetView.BringToFront();
    }

    public bool IsCallGraphView => _viewKind == DiagramViewKind.CallGraph;

    public Bitmap? ExportToBitmap()
    {
        return _viewKind switch
        {
            DiagramViewKind.CallGraph => _callGraphViewer.ExportToBitmap(),
            DiagramViewKind.CodeMetrics => null,
            DiagramViewKind.DuplicateCode => null,
            _ => _structureViewer.ExportToBitmap()
        };
    }

    private void RefreshActiveView()
    {
        if (_viewKind == DiagramViewKind.CodeMetrics)
        {
            _metricsViewer.SetMetrics(_analysis?.Metrics, _analysis?.QualityThresholds, _analysis?.CallGraph);
            return;
        }

        if (_viewKind == DiagramViewKind.DuplicateCode)
        {
            _duplicateViewer.SetDuplicates(_analysis?.Duplicates);
            return;
        }

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
