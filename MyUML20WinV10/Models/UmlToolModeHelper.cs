using MyUML20WinV10.Rendering;

namespace MyUML20WinV10.Models;

public static class UmlToolModeHelper
{
    public static bool IsNodeCreateTool(UmlToolMode mode) => mode is
        UmlToolMode.CreateClass or UmlToolMode.CreateInterface or UmlToolMode.CreateEnumeration
        or UmlToolMode.CreatePackage or UmlToolMode.CreateActor or UmlToolMode.CreateUseCase
        or UmlToolMode.CreateNote;

    public static bool IsRelationshipTool(UmlToolMode mode) => mode is
        UmlToolMode.CreateAssociation or UmlToolMode.CreateDirectedAssociation
        or UmlToolMode.CreateAggregation or UmlToolMode.CreateComposition
        or UmlToolMode.CreateGeneralization or UmlToolMode.CreateRealization
        or UmlToolMode.CreateDependency or UmlToolMode.CreateInclude or UmlToolMode.CreateExtend;

    public static UmlToolMode? FromSelectedObject(object? selected) => selected switch
    {
        UmlClass => UmlToolMode.CreateClass,
        UmlInterface => UmlToolMode.CreateInterface,
        UmlEnumeration => UmlToolMode.CreateEnumeration,
        UmlPackage => UmlToolMode.CreatePackage,
        UmlActor => UmlToolMode.CreateActor,
        UmlUseCase => UmlToolMode.CreateUseCase,
        UmlNote => UmlToolMode.CreateNote,
        UmlAssociation { Aggregation: UmlAggregationKind.Composite } => UmlToolMode.CreateComposition,
        UmlAssociation { Aggregation: UmlAggregationKind.Shared } => UmlToolMode.CreateAggregation,
        UmlAssociation => UmlToolMode.CreateAssociation,
        UmlGeneralization => UmlToolMode.CreateGeneralization,
        UmlRealization => UmlToolMode.CreateRealization,
        UmlDependency => UmlToolMode.CreateDependency,
        UmlInclude => UmlToolMode.CreateInclude,
        UmlExtend => UmlToolMode.CreateExtend,
        UmlDiagramNode node => FromPresentation(node.Presentation),
        _ => null,
    };

    public static string GetDisplayName(UmlToolMode mode) => mode switch
    {
        UmlToolMode.Select => "선택",
        UmlToolMode.Pan => "화면 이동",
        UmlToolMode.CreateClass => "Class",
        UmlToolMode.CreateInterface => "Interface",
        UmlToolMode.CreateEnumeration => "Enumeration",
        UmlToolMode.CreatePackage => "Package",
        UmlToolMode.CreateActor => "Actor",
        UmlToolMode.CreateUseCase => "Use Case",
        UmlToolMode.CreateNote => "Note",
        UmlToolMode.CreateAssociation => "Association",
        UmlToolMode.CreateDirectedAssociation => "Directed Association",
        UmlToolMode.CreateAggregation => "Aggregation",
        UmlToolMode.CreateComposition => "Composition",
        UmlToolMode.CreateGeneralization => "Generalization",
        UmlToolMode.CreateRealization => "Realization",
        UmlToolMode.CreateDependency => "Dependency",
        UmlToolMode.CreateInclude => "Include",
        UmlToolMode.CreateExtend => "Extend",
        _ => mode.ToString(),
    };

    public static void DrawPreview(Graphics g, UmlToolMode mode, RectangleF area, Color fill, Color stroke)
    {
        var draw = GetPreviewDrawer(mode);
        draw?.Invoke(g, area, fill, stroke);
    }

    public static Action<Graphics, RectangleF, Color, Color>? GetPreviewDrawer(UmlToolMode mode) => mode switch
    {
        UmlToolMode.Select => UmlNotationPreview.DrawSelect,
        UmlToolMode.Pan => UmlNotationPreview.DrawPan,
        UmlToolMode.CreateClass => UmlNotationPreview.DrawClass,
        UmlToolMode.CreateInterface => UmlNotationPreview.DrawInterface,
        UmlToolMode.CreateEnumeration => UmlNotationPreview.DrawEnumeration,
        UmlToolMode.CreatePackage => UmlNotationPreview.DrawPackage,
        UmlToolMode.CreateActor => UmlNotationPreview.DrawActor,
        UmlToolMode.CreateUseCase => UmlNotationPreview.DrawUseCase,
        UmlToolMode.CreateNote => UmlNotationPreview.DrawNote,
        UmlToolMode.CreateAssociation => UmlNotationPreview.DrawAssociation,
        UmlToolMode.CreateDirectedAssociation => UmlNotationPreview.DrawDirectedAssociation,
        UmlToolMode.CreateAggregation => UmlNotationPreview.DrawAggregation,
        UmlToolMode.CreateComposition => UmlNotationPreview.DrawComposition,
        UmlToolMode.CreateGeneralization => UmlNotationPreview.DrawGeneralization,
        UmlToolMode.CreateRealization => UmlNotationPreview.DrawRealization,
        UmlToolMode.CreateDependency => UmlNotationPreview.DrawDependency,
        UmlToolMode.CreateInclude => UmlNotationPreview.DrawInclude,
        UmlToolMode.CreateExtend => UmlNotationPreview.DrawExtend,
        _ => null,
    };

    private static UmlToolMode? FromPresentation(UmlNodePresentation presentation) => presentation switch
    {
        UmlNodePresentation.Classifier => UmlToolMode.CreateClass,
        UmlNodePresentation.Package => UmlToolMode.CreatePackage,
        UmlNodePresentation.Actor => UmlToolMode.CreateActor,
        UmlNodePresentation.UseCase => UmlToolMode.CreateUseCase,
        UmlNodePresentation.Note => UmlToolMode.CreateNote,
        _ => null,
    };
}
