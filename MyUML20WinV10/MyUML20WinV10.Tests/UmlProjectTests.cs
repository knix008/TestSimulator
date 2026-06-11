using MyUML20WinV10.Models;
using Xunit;
using MyUML20WinV10.Serialization;
using MyUML20WinV10.Templates;

namespace MyUML20WinV10.Tests;

public class UmlProjectTests
{
    [Fact]
    public void CreateDefaultDiagrams_Has14Kinds()
    {
        var diagrams = UmlProject.CreateDefaultDiagrams();

        Assert.Equal(14, diagrams.Count);
        Assert.Equal(Enum.GetValues<UmlDiagramKind>().Length, diagrams.Select(d => d.Kind).Distinct().Count());
    }

    [Fact]
    public void TemplateManifest_LoadsAllTemplates()
    {
        var templates = UmlDiagramTemplateLibrary.All;

        Assert.NotEmpty(templates);
        Assert.Contains(templates, t => t.Id == UmlDiagramTemplateLibrary.FullSampleId);
        Assert.All(templates, t => Assert.False(string.IsNullOrWhiteSpace(t.ProjectFileName)));
    }

    [Fact]
    public void Serializer_RoundTrip_PreservesDiagramCount()
    {
        var project = UmlProject.CreateSample();
        var path = Path.Combine(Path.GetTempPath(), $"uml-test-{Guid.NewGuid():N}.umlprj");

        try
        {
            UmlProjectSerializer.Save(project, path);
            var loaded = UmlProjectSerializer.Load(path);

            Assert.Equal(project.Diagrams.Count, loaded.Diagrams.Count);
            Assert.Equal(project.Name, loaded.Name);
        }
        finally
        {
            if (File.Exists(path))
                File.Delete(path);
        }
    }

    [Fact]
    public void Serializer_RoundTrip_PreservesSequenceEnhancements()
    {
        var project = new UmlProject { Name = "Sequence Enhancements" };
        project.Diagrams.Clear();
        project.Diagrams.Add(SequenceDiagramTemplate.Build(project));

        var path = Path.Combine(Path.GetTempPath(), $"uml-seq-test-{Guid.NewGuid():N}.umlprj");

        try
        {
            UmlProjectSerializer.Save(project, path);
            var loaded = UmlProjectSerializer.Load(path);
            var diagram = loaded.Diagrams.Single(d => d.Kind == UmlDiagramKind.SequenceDiagram);
            var behaviors = diagram.Nodes
                .Select(n => loaded.FindElement(n.ModelElementId))
                .OfType<UmlBehaviorNode>()
                .ToList();

            Assert.Contains(behaviors, b => b.CombinedFragmentKind == UmlCombinedFragmentKind.InteractionOccurrence);
            Assert.Contains(behaviors, b => b.ParentLifelineId.HasValue);

            var message = loaded.RootPackage.Relationships
                .OfType<UmlBehaviorConnector>()
                .First(c => c.Kind == UmlBehaviorConnectorKind.Message && c.DurationMin != null);
            Assert.Equal("2", message.DurationMin);
            Assert.Equal("5", message.DurationMax);
        }
        finally
        {
            if (File.Exists(path))
                File.Delete(path);
        }
    }
}
