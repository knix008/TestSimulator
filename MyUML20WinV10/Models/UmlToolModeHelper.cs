using MyUML20WinV10.Rendering;

namespace MyUML20WinV10.Models;
public static class UmlToolModeHelper
{
    public static bool IsNodeCreateTool(UmlToolMode mode) => mode is
        UmlToolMode.CreateClass or UmlToolMode.CreateInterface or UmlToolMode.CreateEnumeration
        or UmlToolMode.CreatePackage or UmlToolMode.CreateActor or UmlToolMode.CreateUseCase
        or UmlToolMode.CreateNote or UmlToolMode.CreateState or UmlToolMode.CreateInitialState
        or UmlToolMode.CreateFinalState or UmlToolMode.CreateAction or UmlToolMode.CreateInitialNode
        or UmlToolMode.CreateActivityFinalNode or UmlToolMode.CreateDecision or UmlToolMode.CreateMerge
        or UmlToolMode.CreateFork or UmlToolMode.CreateJoin or UmlToolMode.CreateLifeline;

    public static bool IsRelationshipTool(UmlToolMode mode) => mode is
        UmlToolMode.CreateAssociation or UmlToolMode.CreateDirectedAssociation
        or UmlToolMode.CreateAggregation or UmlToolMode.CreateComposition
        or UmlToolMode.CreateGeneralization or UmlToolMode.CreateRealization
        or UmlToolMode.CreateDependency or UmlToolMode.CreateInclude or UmlToolMode.CreateExtend
        or UmlToolMode.CreateMessage or UmlToolMode.CreateAsyncMessage or UmlToolMode.CreateReturnMessage
        or UmlToolMode.CreateTransition
        or UmlToolMode.CreateControlFlow or UmlToolMode.CreateObjectFlow;

    public static bool IsSequenceMessageTool(UmlToolMode mode) => mode is
        UmlToolMode.CreateMessage or UmlToolMode.CreateAsyncMessage
        or UmlToolMode.CreateReturnMessage or UmlToolMode.CreateSelfMessage;

    public static UmlToolMode? FromSelectedObject(object? selected) => selected switch
    {
        UmlClass => UmlToolMode.CreateClass,
        UmlInterface => UmlToolMode.CreateInterface,
        UmlEnumeration => UmlToolMode.CreateEnumeration,
        UmlPackage => UmlToolMode.CreatePackage,
        UmlActor => UmlToolMode.CreateActor,
        UmlUseCase => UmlToolMode.CreateUseCase,
        UmlNote => UmlToolMode.CreateNote,
        UmlBehaviorNode behaviorNode => behaviorNode.Kind switch
        {
            UmlBehaviorNodeKind.State => UmlToolMode.CreateState,
            UmlBehaviorNodeKind.InitialState => UmlToolMode.CreateInitialState,
            UmlBehaviorNodeKind.FinalState => UmlToolMode.CreateFinalState,
            UmlBehaviorNodeKind.Action => UmlToolMode.CreateAction,
            UmlBehaviorNodeKind.InitialNode => UmlToolMode.CreateInitialNode,
            UmlBehaviorNodeKind.ActivityFinalNode => UmlToolMode.CreateActivityFinalNode,
            UmlBehaviorNodeKind.Decision => UmlToolMode.CreateDecision,
            UmlBehaviorNodeKind.Merge => UmlToolMode.CreateMerge,
            UmlBehaviorNodeKind.Fork => UmlToolMode.CreateFork,
            UmlBehaviorNodeKind.Join => UmlToolMode.CreateJoin,
            UmlBehaviorNodeKind.Lifeline => UmlToolMode.CreateLifeline,
            _ => null,
        },
        UmlAssociation { Aggregation: UmlAggregationKind.Composite } => UmlToolMode.CreateComposition,
        UmlAssociation { Aggregation: UmlAggregationKind.Shared } => UmlToolMode.CreateAggregation,
        UmlAssociation { IsDirected: true } => UmlToolMode.CreateDirectedAssociation,
        UmlAssociation => UmlToolMode.CreateAssociation,
        UmlGeneralization => UmlToolMode.CreateGeneralization,
        UmlRealization => UmlToolMode.CreateRealization,
        UmlDependency => UmlToolMode.CreateDependency,
        UmlInclude => UmlToolMode.CreateInclude,
        UmlExtend => UmlToolMode.CreateExtend,
        UmlBehaviorConnector behaviorConnector => behaviorConnector.Kind switch
        {
            UmlBehaviorConnectorKind.Message => ToolFromMessageKind(behaviorConnector.MessageKind),
            UmlBehaviorConnectorKind.Transition => UmlToolMode.CreateTransition,
            UmlBehaviorConnectorKind.ControlFlow => UmlToolMode.CreateControlFlow,
            UmlBehaviorConnectorKind.ObjectFlow => UmlToolMode.CreateObjectFlow,
            _ => null,
        },
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
        UmlToolMode.CreateState => "State",
        UmlToolMode.CreateInitialState => "Initial State",
        UmlToolMode.CreateFinalState => "Final State",
        UmlToolMode.CreateAction => "Action",
        UmlToolMode.CreateInitialNode => "Initial Node",
        UmlToolMode.CreateActivityFinalNode => "Activity Final",
        UmlToolMode.CreateDecision => "Decision",
        UmlToolMode.CreateMerge => "Merge",
        UmlToolMode.CreateFork => "Fork",
        UmlToolMode.CreateJoin => "Join",
        UmlToolMode.CreateLifeline => "Lifeline",
        UmlToolMode.CreateAssociation => "Association",
        UmlToolMode.CreateDirectedAssociation => "Directed Association",
        UmlToolMode.CreateAggregation => "Aggregation",
        UmlToolMode.CreateComposition => "Composition",
        UmlToolMode.CreateGeneralization => "Generalization",
        UmlToolMode.CreateRealization => "Realization",
        UmlToolMode.CreateDependency => "Dependency",
        UmlToolMode.CreateInclude => "Include",
        UmlToolMode.CreateExtend => "Extend",
        UmlToolMode.CreateMessage => "Sync Message",
        UmlToolMode.CreateAsyncMessage => "Async Message",
        UmlToolMode.CreateReturnMessage => "Return Message",
        UmlToolMode.CreateSelfMessage => "Self Message",
        UmlToolMode.CreateTransition => "Transition",
        UmlToolMode.CreateControlFlow => "Control Flow",
        UmlToolMode.CreateObjectFlow => "Object Flow",
        _ => mode.ToString(),
    };

    public static UmlMessageKind MessageKindFromTool(UmlToolMode mode) => mode switch
    {
        UmlToolMode.CreateAsyncMessage => UmlMessageKind.Asynchronous,
        UmlToolMode.CreateReturnMessage => UmlMessageKind.Return,
        UmlToolMode.CreateSelfMessage => UmlMessageKind.SelfCall,
        _ => UmlMessageKind.Synchronous,
    };

    public static UmlToolMode? ToolFromMessageKind(UmlMessageKind kind) => kind switch
    {
        UmlMessageKind.Asynchronous => UmlToolMode.CreateAsyncMessage,
        UmlMessageKind.Return => UmlToolMode.CreateReturnMessage,
        UmlMessageKind.SelfCall => UmlToolMode.CreateSelfMessage,
        _ => UmlToolMode.CreateMessage,
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
        UmlToolMode.CreateState => UmlNotationPreview.DrawState,
        UmlToolMode.CreateInitialState => UmlNotationPreview.DrawInitialState,
        UmlToolMode.CreateFinalState => UmlNotationPreview.DrawFinalState,
        UmlToolMode.CreateAction => UmlNotationPreview.DrawAction,
        UmlToolMode.CreateInitialNode => UmlNotationPreview.DrawInitialNode,
        UmlToolMode.CreateActivityFinalNode => UmlNotationPreview.DrawActivityFinalNode,
        UmlToolMode.CreateDecision => UmlNotationPreview.DrawDecision,
        UmlToolMode.CreateMerge => UmlNotationPreview.DrawMerge,
        UmlToolMode.CreateFork => UmlNotationPreview.DrawFork,
        UmlToolMode.CreateJoin => UmlNotationPreview.DrawJoin,
        UmlToolMode.CreateLifeline => UmlNotationPreview.DrawLifeline,
        UmlToolMode.CreateAssociation => UmlNotationPreview.DrawAssociation,
        UmlToolMode.CreateDirectedAssociation => UmlNotationPreview.DrawDirectedAssociation,
        UmlToolMode.CreateAggregation => UmlNotationPreview.DrawAggregation,
        UmlToolMode.CreateComposition => UmlNotationPreview.DrawComposition,
        UmlToolMode.CreateGeneralization => UmlNotationPreview.DrawGeneralization,
        UmlToolMode.CreateRealization => UmlNotationPreview.DrawRealization,
        UmlToolMode.CreateDependency => UmlNotationPreview.DrawDependency,
        UmlToolMode.CreateInclude => UmlNotationPreview.DrawInclude,
        UmlToolMode.CreateExtend => UmlNotationPreview.DrawExtend,
        UmlToolMode.CreateMessage => UmlNotationPreview.DrawSyncMessage,
        UmlToolMode.CreateAsyncMessage => UmlNotationPreview.DrawAsyncMessage,
        UmlToolMode.CreateReturnMessage => UmlNotationPreview.DrawReturnMessage,
        UmlToolMode.CreateSelfMessage => UmlNotationPreview.DrawSelfMessage,
        UmlToolMode.CreateTransition => UmlNotationPreview.DrawTransition,
        UmlToolMode.CreateControlFlow => UmlNotationPreview.DrawControlFlow,
        UmlToolMode.CreateObjectFlow => UmlNotationPreview.DrawObjectFlow,
        _ => null,
    };

    private static UmlToolMode? FromPresentation(UmlNodePresentation presentation) => presentation switch
    {
        UmlNodePresentation.Classifier => UmlToolMode.CreateClass,
        UmlNodePresentation.Package => UmlToolMode.CreatePackage,
        UmlNodePresentation.Actor => UmlToolMode.CreateActor,
        UmlNodePresentation.UseCase => UmlToolMode.CreateUseCase,
        UmlNodePresentation.Note => UmlToolMode.CreateNote,
        UmlNodePresentation.Behavior => null,
        _ => null,
    };
}
