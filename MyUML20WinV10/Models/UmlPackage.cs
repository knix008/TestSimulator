using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlPackage : UmlNamedElement
{
    [Category("기본")]
    [DisplayName("스테레오타입")]
    public string Stereotype { get; set; } = string.Empty;

    public UmlPackage()
    {
        Name = "Model";
    }

    [Browsable(false)]
    public List<UmlPackage> NestedPackages { get; set; } = [];

    [Browsable(false)]
    public List<UmlClassifier> Classifiers { get; set; } = [];

    [Browsable(false)]
    public List<UmlActor> Actors { get; set; } = [];

    [Browsable(false)]
    public List<UmlUseCase> UseCases { get; set; } = [];

    [Browsable(false)]
    public List<UmlSystemBoundary> SystemBoundaries { get; set; } = [];

    [Browsable(false)]
    public List<UmlNote> Notes { get; set; } = [];

    [Browsable(false)]
    public List<UmlBehaviorNode> BehaviorNodes { get; set; } = [];

    [Browsable(false)]
    public List<UmlComponent> Components { get; set; } = [];

    [Browsable(false)]
    public List<UmlComponentInterface> ComponentInterfaces { get; set; } = [];

    [Browsable(false)]
    public List<UmlComponentPort> ComponentPorts { get; set; } = [];

    [Browsable(false)]
    public List<UmlObjectInstance> ObjectInstances { get; set; } = [];

    [Browsable(false)]
    public List<UmlDeploymentHost> DeploymentHosts { get; set; } = [];

    [Browsable(false)]
    public List<UmlArtifact> Artifacts { get; set; } = [];

    [Browsable(false)]
    public List<UmlRelationship> Relationships { get; set; } = [];

    public IEnumerable<UmlElement> OwnedElements =>
        NestedPackages.Cast<UmlElement>()
            .Concat(Classifiers)
            .Concat(Actors)
            .Concat(UseCases)
            .Concat(SystemBoundaries)
            .Concat(Notes)
            .Concat(BehaviorNodes)
            .Concat(Components)
            .Concat(ComponentInterfaces)
            .Concat(ComponentPorts)
            .Concat(ObjectInstances)
            .Concat(DeploymentHosts)
            .Concat(Artifacts)
            .Concat(Relationships);

    public UmlClassifier? FindClassifier(Guid id) =>
        Classifiers.FirstOrDefault(c => c.Id == id)
        ?? NestedPackages.Select(p => p.FindClassifier(id)).FirstOrDefault(c => c is not null);

    public UmlRelationship? FindRelationship(Guid id) =>
        Relationships.FirstOrDefault(r => r.Id == id)
        ?? NestedPackages.Select(p => p.FindRelationship(id)).FirstOrDefault(r => r is not null);

    public UmlElement? FindElement(Guid id)
    {
        if (Id == id)
            return this;

        foreach (var nested in NestedPackages)
        {
            if (nested.Id == id)
                return nested;
            var found = nested.FindElement(id);
            if (found is not null)
                return found;
        }

        foreach (var classifier in Classifiers)
            if (classifier.Id == id) return classifier;
        foreach (var actor in Actors)
            if (actor.Id == id) return actor;
        foreach (var useCase in UseCases)
            if (useCase.Id == id) return useCase;
        foreach (var boundary in SystemBoundaries)
            if (boundary.Id == id) return boundary;
        foreach (var note in Notes)
            if (note.Id == id) return note;
        foreach (var behaviorNode in BehaviorNodes)
            if (behaviorNode.Id == id) return behaviorNode;
        foreach (var component in Components)
            if (component.Id == id) return component;
        foreach (var componentInterface in ComponentInterfaces)
            if (componentInterface.Id == id) return componentInterface;
        foreach (var componentPort in ComponentPorts)
            if (componentPort.Id == id) return componentPort;
        foreach (var objectInstance in ObjectInstances)
            if (objectInstance.Id == id) return objectInstance;
        foreach (var deploymentHost in DeploymentHosts)
            if (deploymentHost.Id == id) return deploymentHost;
        foreach (var artifact in Artifacts)
            if (artifact.Id == id) return artifact;
        foreach (var relationship in Relationships)
            if (relationship.Id == id) return relationship;

        return null;
    }

    public void AddClassifier(UmlClassifier classifier) => Classifiers.Add(classifier);

    public void AddActor(UmlActor actor) => Actors.Add(actor);

    public void AddUseCase(UmlUseCase useCase) => UseCases.Add(useCase);

    public void AddSystemBoundary(UmlSystemBoundary boundary) => SystemBoundaries.Add(boundary);

    public void AddNote(UmlNote note) => Notes.Add(note);

    public void AddBehaviorNode(UmlBehaviorNode node) => BehaviorNodes.Add(node);

    public void AddComponent(UmlComponent component) => Components.Add(component);

    public void AddComponentInterface(UmlComponentInterface componentInterface) =>
        ComponentInterfaces.Add(componentInterface);

    public void AddComponentPort(UmlComponentPort port) => ComponentPorts.Add(port);

    public void AddObjectInstance(UmlObjectInstance objectInstance) => ObjectInstances.Add(objectInstance);

    public void AddDeploymentHost(UmlDeploymentHost host) => DeploymentHosts.Add(host);

    public void AddArtifact(UmlArtifact artifact) => Artifacts.Add(artifact);

    public UmlObjectInstance? FindObjectInstance(Guid id) =>
        ObjectInstances.FirstOrDefault(o => o.Id == id)
        ?? NestedPackages.Select(p => p.FindObjectInstance(id)).FirstOrDefault(o => o is not null);

    public UmlDeploymentHost? FindDeploymentHost(Guid id) =>
        DeploymentHosts.FirstOrDefault(h => h.Id == id)
        ?? NestedPackages.Select(p => p.FindDeploymentHost(id)).FirstOrDefault(h => h is not null);

    public UmlArtifact? FindArtifact(Guid id) =>
        Artifacts.FirstOrDefault(a => a.Id == id)
        ?? NestedPackages.Select(p => p.FindArtifact(id)).FirstOrDefault(a => a is not null);

    public void AddNestedPackage(UmlPackage package) => NestedPackages.Add(package);

    public void AddRelationship(UmlRelationship relationship) => Relationships.Add(relationship);

    public bool RemoveElement(Guid id)
    {
        if (NestedPackages.RemoveAll(p => p.Id == id) > 0)
            return true;
        if (Classifiers.RemoveAll(c => c.Id == id) > 0)
            return true;
        if (Actors.RemoveAll(a => a.Id == id) > 0)
            return true;
        if (UseCases.RemoveAll(u => u.Id == id) > 0)
            return true;
        if (SystemBoundaries.RemoveAll(b => b.Id == id) > 0)
            return true;
        if (Notes.RemoveAll(n => n.Id == id) > 0)
            return true;
        if (BehaviorNodes.RemoveAll(n => n.Id == id) > 0)
            return true;
        if (Components.RemoveAll(c => c.Id == id) > 0)
            return true;
        if (ComponentInterfaces.RemoveAll(i => i.Id == id) > 0)
            return true;
        if (ComponentPorts.RemoveAll(p => p.Id == id) > 0)
            return true;
        if (ObjectInstances.RemoveAll(o => o.Id == id) > 0)
            return true;
        if (DeploymentHosts.RemoveAll(h => h.Id == id) > 0)
            return true;
        if (Artifacts.RemoveAll(a => a.Id == id) > 0)
            return true;
        if (Relationships.RemoveAll(r => r.Id == id) > 0)
            return true;

        foreach (var nested in NestedPackages)
        {
            if (nested.RemoveElement(id))
                return true;
        }

        return false;
    }
}
