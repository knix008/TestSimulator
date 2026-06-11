using System.ComponentModel;
using System.Text.Json.Serialization;
using MyUML20WinV10.Templates;

namespace MyUML20WinV10.Models;

public sealed class UmlProject
{
    [Category("프로젝트")]
    [DisplayName("이름")]
    public string Name { get; set; } = "Untitled";

    [Browsable(false)]
    public UmlPackage RootPackage { get; set; } = new();

    [Browsable(false)]
    public List<UmlDiagram> Diagrams { get; set; } = CreateDefaultDiagrams();

    public static readonly UmlDiagramKind[] BasicDiagramKinds =
    [
        UmlDiagramKind.UseCaseDiagram,
        UmlDiagramKind.ClassDiagram,
        UmlDiagramKind.SequenceDiagram,
        UmlDiagramKind.ActivityDiagram,
        UmlDiagramKind.StateMachineDiagram,
        UmlDiagramKind.ComponentDiagram,
    ];

    public static List<UmlDiagram> CreateDefaultDiagrams() =>
        BasicDiagramKinds
            .Select(kind => new UmlDiagram
            {
                Kind = kind,
                Name = UmlDiagramCatalog.GetDiagramKindDisplayName(kind),
            })
            .ToList();

    // Serialized as a Guid — Diagrams list order is never reordered by activation.
    // Old files without this field default to Guid.Empty → falls back to Diagrams[0].
    public Guid ActiveDiagramId { get; set; }

    [JsonIgnore]
    public UmlDiagram ActiveDiagram
    {
        get
        {
            if (ActiveDiagramId != Guid.Empty)
            {
                var found = Diagrams.Find(d => d.Id == ActiveDiagramId);
                if (found is not null) return found;
            }
            return Diagrams.Count > 0 ? Diagrams[0] : throw new InvalidOperationException("다이어그램이 없습니다.");
        }
        set => ActiveDiagramId = value.Id;
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

    /// <summary>
    /// Reference template covering every diagram kind and tool the editor supports,
    /// used both as the "샘플 불러오기" starter project and as a save/load smoke test.
    /// </summary>
    public static UmlProject CreateSample() => UmlDiagramTemplateLibrary.CreateFullSample();
}
