using System.ComponentModel;
using System.Text.Json.Serialization;

namespace MyUML20WinV10.Models;

public enum UmlBehaviorNodeKind
{
    State,
    InitialState,
    FinalState,
    Action,
    InitialNode,
    ActivityFinalNode,
    FlowFinalNode,
    Decision,
    Merge,
    Fork,
    Join,
    Choice,
    Junction,
    ShallowHistory,
    DeepHistory,
    ObjectNode,
    Swimlane,
    Lifeline,
    Activation,
    CombinedFragment,
    SequenceEndpoint,
    Gate,
    ExpansionRegion,
    InterruptibleRegion,
    NaryAssociationHub,
    StateInvariant,
    Continuation,
    CompositeState,
    OrthogonalRegion,
    EntryPoint,
    ExitPoint,
    TerminateState,
    SubmachineState,
    ActivityContainer,
    DataStore,
    InputPin,
    OutputPin,
    ExceptionHandler,
    TimingLifeline,
    TimingState,
    InteractionUse,
}

public enum UmlExpansionRegionKind
{
    Iterative,
    Parallel,
    Stream,
}

public enum UmlCombinedFragmentKind
{
    Loop,
    Opt,
    Alt,
    Par,
    Break,
    Ref,
    Seq,
    Strict,
    Neg,
    Critical,
    Ignore,
    Consider,
    Assert,
    InteractionOccurrence,
}

public enum UmlLifelineKind
{
    Object,
    Actor,
}

public enum UmlBehaviorConnectorKind
{
    Message,
    Transition,
    ControlFlow,
    ObjectFlow,
}

public enum UmlMessageKind
{
    Synchronous,
    Asynchronous,
    Return,
    SelfCall,
    Create,
    Destroy,
    Lost,
    Found,
}

public sealed class UmlBehaviorNode : UmlNamedElement
{
    [Category("기본")]
    [DisplayName("행동 종류")]
    public UmlBehaviorNodeKind Kind { get; set; } = UmlBehaviorNodeKind.Action;

    [Category("시퀀스")]
    [DisplayName("결합 프래그먼트")]
    public UmlCombinedFragmentKind? CombinedFragmentKind { get; set; }

    [Category("시퀀스")]
    [DisplayName("가드/조건")]
    public string? Guard { get; set; }

    [Category("시퀀스")]
    [DisplayName("참조 다이어그램")]
    public string? ReferencedDiagramName { get; set; }

    [Category("활동")]
    [DisplayName("확장 영역 종류")]
    public UmlExpansionRegionKind? ExpansionKind { get; set; }

    [Category("시퀀스")]
    [DisplayName("라이프라인 종류")]
    public UmlLifelineKind? LifelineKind { get; set; }

    [Category("시퀀스")]
    [DisplayName("부모 라이프라인")]
    [Description("Part decomposition 시 상위 라이프라인 요소 ID")]
    public Guid? ParentLifelineId { get; set; }

    [Category("시퀀스")]
    [DisplayName("분해 역할")]
    [Description("Part decomposition 역할 이름 (예: :engine)")]
    public string? DecompositionRole { get; set; }

    [Category("활동")]
    [DisplayName("로컬 전제조건")]
    public string? LocalPrecondition { get; set; }

    [Category("활동")]
    [DisplayName("로컬 사후조건")]
    public string? LocalPostcondition { get; set; }
}

public sealed class UmlBehaviorConnector : UmlRelationship
{
    [Category("기본")]
    [DisplayName("연결 종류")]
    public UmlBehaviorConnectorKind Kind { get; set; } = UmlBehaviorConnectorKind.Message;

    [Category("시퀀스")]
    [DisplayName("메시지 종류")]
    public UmlMessageKind MessageKind { get; set; } = UmlMessageKind.Synchronous;

    [Category("전이")]
    [DisplayName("트리거")]
    public string Trigger { get; set; } = string.Empty;

    [Category("전이")]
    [DisplayName("가드 조건")]
    public string Guard { get; set; } = string.Empty;

    [Category("전이")]
    [DisplayName("효과")]
    public string Effect { get; set; } = string.Empty;

    [Category("커뮤니케이션")]
    [DisplayName("시퀀스 번호")]
    public int CommunicationSequenceNumber { get; set; }

    [Category("시퀀스")]
    [DisplayName("지속 제약")]
    public string? DurationConstraint { get; set; }

    [Category("시퀀스")]
    [DisplayName("지속 최소")]
    public string? DurationMin { get; set; }

    [Category("시퀀스")]
    [DisplayName("지속 최대")]
    public string? DurationMax { get; set; }

    public override string RelationshipKind => Kind switch
    {
        UmlBehaviorConnectorKind.Message => MessageKind.ToString(),
        _ => Kind.ToString(),
    };
}