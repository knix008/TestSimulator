using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlProject
{
    [Category("프로젝트")]
    [DisplayName("이름")]
    public string Name { get; set; } = "Untitled";

    [Browsable(false)]
    public UmlPackage RootPackage { get; set; } = new();

    [Browsable(false)]
    public List<UmlDiagram> Diagrams { get; set; } = [new UmlDiagram()];

    public UmlDiagram ActiveDiagram
    {
        get => Diagrams.Count > 0 ? Diagrams[0] : throw new InvalidOperationException("다이어그램이 없습니다.");
        set
        {
            var index = Diagrams.FindIndex(d => d.Id == value.Id);
            if (index < 0)
                Diagrams.Insert(0, value);
            else if (index != 0)
            {
                Diagrams.RemoveAt(index);
                Diagrams.Insert(0, value);
            }
        }
    }

    public UmlClassifier? FindClassifier(Guid id) => RootPackage.FindClassifier(id);

    public UmlRelationship? FindRelationship(Guid id) => RootPackage.FindRelationship(id);

    public UmlElement? FindElement(Guid id) => RootPackage.FindElement(id);

    public void RemoveElement(Guid id)
    {
        RootPackage.RemoveElement(id);
        foreach (var diagram in Diagrams)
        {
            diagram.Nodes.RemoveAll(n => n.ModelElementId == id);
            diagram.Edges.RemoveAll(e => e.ModelElementId == id);
        }
    }

    public static UmlProject CreateSample()
    {
        var project = new UmlProject { Name = "Sample UML" };
        var diagram = project.ActiveDiagram;

        var customer = new UmlClass { Name = "Customer", IsAbstract = false };
        customer.Properties.Add(new UmlProperty { Name = "id", TypeName = "Guid", Visibility = UmlVisibility.Private });
        customer.Properties.Add(new UmlProperty { Name = "name", TypeName = "string", Visibility = UmlVisibility.Private });
        customer.Operations.Add(new UmlOperation { Name = "PlaceOrder", ReturnTypeName = "Order", Visibility = UmlVisibility.Public });

        var order = new UmlClass { Name = "Order" };
        order.Properties.Add(new UmlProperty { Name = "orderDate", TypeName = "DateTime", Visibility = UmlVisibility.Private });
        order.Operations.Add(new UmlOperation { Name = "Total", ReturnTypeName = "decimal", Visibility = UmlVisibility.Public });

        project.RootPackage.AddClassifier(customer);
        project.RootPackage.AddClassifier(order);

        var association = new UmlAssociation
        {
            SourceClassifierId = customer.Id,
            TargetClassifierId = order.Id,
            SourceEndName = "orders",
            TargetEndName = "customer",
            SourceMultiplicity = "1",
            TargetMultiplicity = "0..*",
        };
        project.RootPackage.AddRelationship(association);

        var customerNode = new UmlDiagramNode { ModelElementId = customer.Id, X = 80, Y = 80, Width = 180, Height = 140 };
        var orderNode = new UmlDiagramNode { ModelElementId = order.Id, X = 360, Y = 120, Width = 180, Height = 120 };
        diagram.Nodes.Add(customerNode);
        diagram.Nodes.Add(orderNode);
        diagram.Edges.Add(new UmlDiagramEdge
        {
            ModelElementId = association.Id,
            SourceNodeId = customerNode.Id,
            TargetNodeId = orderNode.Id,
        });

        return project;
    }
}
