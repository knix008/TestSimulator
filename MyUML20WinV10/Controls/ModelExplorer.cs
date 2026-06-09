using MyUML20WinV10.Models;

namespace MyUML20WinV10.Controls;

public sealed class ModelExplorerNodeData
{
    public required object Payload { get; init; }

    public UmlDiagram? Diagram { get; init; }

    public bool Matches(ModelExplorerNodeData? other) =>
        other is not null
        && ReferenceEquals(Payload, other.Payload)
        && Diagram?.Id == other.Diagram?.Id;

    public bool MatchesPayload(object? payload) =>
        payload is not null && ReferenceEquals(Payload, payload);
}

public sealed class ModelExplorer : TreeView
{
    private UmlProject? _project;
    private bool _suppressSelection;

    public event EventHandler<UmlElementSelectedEventArgs>? ElementSelected;

    public ModelExplorer()
    {
        HideSelection = false;
        ShowLines = true;
        ShowPlusMinus = true;
        ShowRootLines = true;
        Dock = DockStyle.Fill;
        BackColor = Color.White;
        BorderStyle = BorderStyle.None;
        AfterSelect += OnAfterSelect;
    }

    public void Bind(UmlProject project)
    {
        _project = project;
        Rebuild();
    }

    public void Rebuild()
    {
        if (_project is null)
            return;

        var selectedData = SelectedNode?.Tag as ModelExplorerNodeData;

        _suppressSelection = true;
        Nodes.Clear();

        var root = CreateNode(_project.Name, new ModelExplorerNodeData { Payload = _project });
        foreach (var diagram in _project.Diagrams)
            root.Nodes.Add(BuildDiagramNode(diagram));

        root.Expand();
        Nodes.Add(root);

        RestoreSelection(selectedData);
        _suppressSelection = false;
    }

    private TreeNode BuildDiagramNode(UmlDiagram diagram)
    {
        var diagramNode = CreateNode(
            UmlDiagramCatalog.GetDiagramTreeLabel(diagram),
            new ModelExplorerNodeData { Payload = diagram, Diagram = diagram });

        var elements = UmlDiagramCatalog.GetDiagramElements(_project!, diagram).ToList();
        if (elements.Count > 0)
        {
            var elementsGroup = CreateNode(
                $"요소 ({elements.Count})",
                new ModelExplorerNodeData { Payload = diagram, Diagram = diagram });

            foreach (var (_, element) in elements)
                elementsGroup.Nodes.Add(BuildElementNode(diagram, element));

            diagramNode.Nodes.Add(elementsGroup);
        }

        var relationships = UmlDiagramCatalog.GetDiagramRelationships(_project!, diagram).ToList();
        if (relationships.Count > 0)
        {
            var relationsGroup = CreateNode(
                $"관계 ({relationships.Count})",
                new ModelExplorerNodeData { Payload = diagram, Diagram = diagram });

            foreach (var (diagramEdge, relationship) in relationships)
            {
                relationsGroup.Nodes.Add(CreateNode(
                    UmlDiagramCatalog.GetRelationshipTreeLabel(_project!, diagram, diagramEdge, relationship),
                    new ModelExplorerNodeData { Payload = relationship, Diagram = diagram }));
            }

            diagramNode.Nodes.Add(relationsGroup);
        }

        if (elements.Count == 0 && relationships.Count == 0)
            diagramNode.Nodes.Add(CreateNode("(비어 있음)", new ModelExplorerNodeData { Payload = diagram, Diagram = diagram }));

        diagramNode.Expand();
        return diagramNode;
    }

    private TreeNode BuildElementNode(UmlDiagram diagram, UmlElement element)
    {
        var node = CreateNode(
            UmlDiagramCatalog.GetElementTreeLabel(element),
            new ModelExplorerNodeData { Payload = element, Diagram = diagram });

        if (element is UmlClassifier classifier)
        {
            foreach (var property in classifier.Properties)
                node.Nodes.Add(CreateNode(property.SignatureText, new ModelExplorerNodeData { Payload = property, Diagram = diagram }));
            foreach (var operation in classifier.Operations)
                node.Nodes.Add(CreateNode(operation.SignatureText, new ModelExplorerNodeData { Payload = operation, Diagram = diagram }));
            if (classifier is UmlEnumeration enumeration)
            {
                foreach (var literal in enumeration.Literals)
                    node.Nodes.Add(CreateNode(literal, new ModelExplorerNodeData { Payload = literal, Diagram = diagram }));
            }
        }

        return node;
    }

    private static TreeNode CreateNode(string text, ModelExplorerNodeData tag) =>
        new(text) { Tag = tag };

    private void RestoreSelection(ModelExplorerNodeData? selectedData)
    {
        if (selectedData is null)
            return;

        var node = FindNodeByData(Nodes, selectedData);
        if (node is not null)
            SelectedNode = node;
    }

    public void SelectElement(Guid elementId, Guid? diagramId = null)
    {
        if (_project is null)
            return;

        TreeNode? node = null;
        if (diagramId is Guid preferredDiagramId)
            node = FindElementInDiagram(Nodes, elementId, preferredDiagramId);

        node ??= FindNodeByElementId(Nodes, elementId);
        if (node is not null)
            SelectedNode = node;
    }

    public void SelectDiagram(Guid diagramId)
    {
        var node = FindDiagramNode(Nodes, diagramId);
        if (node is not null)
            SelectedNode = node;
    }

    private void OnAfterSelect(object? sender, TreeViewEventArgs e)
    {
        if (_suppressSelection || e.Node?.Tag is not ModelExplorerNodeData data)
            return;

        ElementSelected?.Invoke(this, new UmlElementSelectedEventArgs(data));
    }

    private static TreeNode? FindNodeByData(TreeNodeCollection nodes, ModelExplorerNodeData target)
    {
        foreach (TreeNode node in nodes)
        {
            if (node.Tag is ModelExplorerNodeData data && data.Matches(target))
                return node;

            var nested = FindNodeByData(node.Nodes, target);
            if (nested is not null)
                return nested;
        }

        return null;
    }

    private static TreeNode? FindElementInDiagram(TreeNodeCollection nodes, Guid elementId, Guid diagramId)
    {
        foreach (TreeNode node in nodes)
        {
            if (node.Tag is ModelExplorerNodeData { Payload: UmlDiagram diagram } && diagram.Id == diagramId)
                return FindNodeByElementId(node.Nodes, elementId);

            var nested = FindElementInDiagram(node.Nodes, elementId, diagramId);
            if (nested is not null)
                return nested;
        }

        return null;
    }

    private static TreeNode? FindDiagramNode(TreeNodeCollection nodes, Guid diagramId)
    {
        foreach (TreeNode node in nodes)
        {
            if (node.Tag is ModelExplorerNodeData { Payload: UmlDiagram diagram } && diagram.Id == diagramId)
                return node;

            var nested = FindDiagramNode(node.Nodes, diagramId);
            if (nested is not null)
                return nested;
        }

        return null;
    }

    private static TreeNode? FindNodeByElementId(TreeNodeCollection nodes, Guid elementId)
    {
        foreach (TreeNode node in nodes)
        {
            if (node.Tag is ModelExplorerNodeData { Payload: UmlElement element } && element.Id == elementId)
                return node;

            var nested = FindNodeByElementId(node.Nodes, elementId);
            if (nested is not null)
                return nested;
        }

        return null;
    }
}

public sealed class UmlElementSelectedEventArgs : EventArgs
{
    public UmlElementSelectedEventArgs(ModelExplorerNodeData data)
    {
        NodeData = data;
        SelectedObject = data.Payload;
        Diagram = data.Diagram;
    }

    public ModelExplorerNodeData NodeData { get; }

    public object SelectedObject { get; }

    public UmlDiagram? Diagram { get; }
}
