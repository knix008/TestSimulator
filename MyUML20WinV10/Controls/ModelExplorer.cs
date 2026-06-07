using MyUML20WinV10.Models;

namespace MyUML20WinV10.Controls;

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

        _suppressSelection = true;
        Nodes.Clear();

        var root = new TreeNode(_project.Name)
        {
            Tag = _project,
            ImageKey = "project",
            SelectedImageKey = "project",
        };
        BuildPackageNode(root, _project.RootPackage);
        foreach (var diagram in _project.Diagrams)
            root.Nodes.Add(CreateDiagramNode(diagram));

        root.Expand();
        Nodes.Add(root);
        _suppressSelection = false;
    }

    public void SelectElement(Guid elementId)
    {
        if (_project is null)
            return;

        var node = FindNodeById(Nodes, elementId);
        if (node is not null)
            SelectedNode = node;
    }

    private void BuildPackageNode(TreeNode parent, UmlPackage package)
    {
        var packageNode = new TreeNode(package.Name)
        {
            Tag = package,
        };
        parent.Nodes.Add(packageNode);

        foreach (var nested in package.NestedPackages)
            BuildPackageNode(packageNode, nested);

        foreach (var classifier in package.Classifiers)
            packageNode.Nodes.Add(CreateClassifierNode(classifier));

        foreach (var actor in package.Actors)
            packageNode.Nodes.Add(new TreeNode($"Actor {actor.DisplayLabel}") { Tag = actor });

        foreach (var useCase in package.UseCases)
            packageNode.Nodes.Add(new TreeNode($"UseCase {useCase.DisplayLabel}") { Tag = useCase });

        foreach (var note in package.Notes)
            packageNode.Nodes.Add(new TreeNode($"Note {note.DisplayLabel}") { Tag = note });

        foreach (var relationship in package.Relationships)
            packageNode.Nodes.Add(CreateRelationshipNode(relationship));
    }

    private static TreeNode CreateClassifierNode(UmlClassifier classifier)
    {
        var node = new TreeNode(classifier.DisplayLabel) { Tag = classifier };
        foreach (var property in classifier.Properties)
            node.Nodes.Add(new TreeNode(property.SignatureText) { Tag = property });
        foreach (var operation in classifier.Operations)
            node.Nodes.Add(new TreeNode(operation.SignatureText) { Tag = operation });
        if (classifier is UmlEnumeration enumeration)
        {
            foreach (var literal in enumeration.Literals)
                node.Nodes.Add(new TreeNode(literal) { Tag = literal });
        }

        return node;
    }

    private static TreeNode CreateRelationshipNode(UmlRelationship relationship) =>
        new(relationship.DisplayLabel) { Tag = relationship };

    private static TreeNode CreateDiagramNode(UmlDiagram diagram) =>
        new($"Diagram: {diagram.Name}") { Tag = diagram };

    private void OnAfterSelect(object? sender, TreeViewEventArgs e)
    {
        if (_suppressSelection || e.Node?.Tag is not object tag)
            return;

        ElementSelected?.Invoke(this, new UmlElementSelectedEventArgs(tag));
    }

    private static TreeNode? FindNodeById(TreeNodeCollection nodes, Guid id)
    {
        foreach (TreeNode node in nodes)
        {
            if (node.Tag is UmlElement element && element.Id == id)
                return node;

            var nested = FindNodeById(node.Nodes, id);
            if (nested is not null)
                return nested;
        }

        return null;
    }
}

public sealed class UmlElementSelectedEventArgs : EventArgs
{
    public UmlElementSelectedEventArgs(object selectedObject) => SelectedObject = selectedObject;

    public object SelectedObject { get; }
}
