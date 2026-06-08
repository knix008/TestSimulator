using System.ComponentModel;

namespace MyUML20WinV10.Models;

public sealed class UmlPackage : UmlNamedElement
{
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
    public List<UmlNote> Notes { get; set; } = [];

    [Browsable(false)]
    public List<UmlBehaviorNode> BehaviorNodes { get; set; } = [];

    [Browsable(false)]
    public List<UmlRelationship> Relationships { get; set; } = [];

    public IEnumerable<UmlElement> OwnedElements =>
        NestedPackages.Cast<UmlElement>()
            .Concat(Classifiers)
            .Concat(Actors)
            .Concat(UseCases)
            .Concat(Notes)
            .Concat(BehaviorNodes)
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
        foreach (var note in Notes)
            if (note.Id == id) return note;
        foreach (var behaviorNode in BehaviorNodes)
            if (behaviorNode.Id == id) return behaviorNode;
        foreach (var relationship in Relationships)
            if (relationship.Id == id) return relationship;

        return null;
    }

    public void AddClassifier(UmlClassifier classifier) => Classifiers.Add(classifier);

    public void AddActor(UmlActor actor) => Actors.Add(actor);

    public void AddUseCase(UmlUseCase useCase) => UseCases.Add(useCase);

    public void AddNote(UmlNote note) => Notes.Add(note);

    public void AddBehaviorNode(UmlBehaviorNode node) => BehaviorNodes.Add(node);

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
        if (Notes.RemoveAll(n => n.Id == id) > 0)
            return true;
        if (BehaviorNodes.RemoveAll(n => n.Id == id) > 0)
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
