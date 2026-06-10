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
    Lifeline,
    Activation,
    CombinedFragment,
}

public enum UmlCombinedFragmentKind
{
    Loop,
    Opt,
    Alt,
    Par,
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

    public override string RelationshipKind => Kind switch
    {
        UmlBehaviorConnectorKind.Message => MessageKind.ToString(),
        _ => Kind.ToString(),
    };
}