using MyUML20WinV10.Rendering;

namespace MyUML20WinV10.Models;
public static class UmlToolModeHelper
{
    public static bool IsNodeCreateTool(UmlToolMode mode) => mode is
        UmlToolMode.CreateClass or UmlToolMode.CreateInterface or UmlToolMode.CreateEnumeration
        or UmlToolMode.CreatePackage or UmlToolMode.CreateActor or UmlToolMode.CreateUseCase
        or UmlToolMode.CreateSystemBoundary
        or UmlToolMode.CreateNote or UmlToolMode.CreateState or UmlToolMode.CreateInitialState
        or UmlToolMode.CreateFinalState or UmlToolMode.CreateAction or UmlToolMode.CreateInitialNode
        or UmlToolMode.CreateActivityFinalNode or UmlToolMode.CreateFlowFinalNode
        or UmlToolMode.CreateDecision or UmlToolMode.CreateMerge
        or UmlToolMode.CreateFork or UmlToolMode.CreateJoin
        or UmlToolMode.CreateChoice or UmlToolMode.CreateJunction
        or UmlToolMode.CreateShallowHistory or UmlToolMode.CreateDeepHistory
        or UmlToolMode.CreateLifeline or UmlToolMode.CreateActivation
        or UmlToolMode.CreateLoopFragment or UmlToolMode.CreateAltFragment
        or UmlToolMode.CreateOptFragment or UmlToolMode.CreateParFragment
        or UmlToolMode.CreateBreakFragment or UmlToolMode.CreateRefFragment
        or UmlToolMode.CreateComponent or UmlToolMode.CreateProvidedInterface
        or UmlToolMode.CreateRequiredInterface or UmlToolMode.CreatePort
        or UmlToolMode.CreateSwimlane or UmlToolMode.CreateObjectNode
        or UmlToolMode.CreateObjectInstance or UmlToolMode.CreateDeploymentHost
        or UmlToolMode.CreateArtifact or UmlToolMode.CreateSequenceEndpoint
        or UmlToolMode.CreateGate or UmlToolMode.CreateExpansionRegion
        or UmlToolMode.CreateInterruptibleRegion
        or UmlToolMode.CreateNaryAssociationHub
        or UmlToolMode.CreateSeqFragment or UmlToolMode.CreateStrictFragment or UmlToolMode.CreateNegFragment
        or UmlToolMode.CreateCriticalFragment or UmlToolMode.CreateIgnoreFragment or UmlToolMode.CreateConsiderFragment
        or UmlToolMode.CreateAssertFragment or UmlToolMode.CreateStateInvariant or UmlToolMode.CreateContinuation
        or UmlToolMode.CreateCompositeState or UmlToolMode.CreateOrthogonalRegion or UmlToolMode.CreateEntryPoint
        or UmlToolMode.CreateExitPoint or UmlToolMode.CreateTerminateState or UmlToolMode.CreateSubmachineState
        or UmlToolMode.CreateActivityContainer or UmlToolMode.CreateDataStore or UmlToolMode.CreateInputPin
        or UmlToolMode.CreateOutputPin or UmlToolMode.CreateExceptionHandler or UmlToolMode.CreateProfilePackage
        or UmlToolMode.CreateMetaclass         or UmlToolMode.CreateTimingLifeline or UmlToolMode.CreateTimingState
        or UmlToolMode.CreateInteractionUse or UmlToolMode.CreateInteractionOccurrence
        or UmlToolMode.CreateDecomposedLifeline;

    public static bool IsLifelineCreateTool(UmlToolMode mode) =>
        mode is UmlToolMode.CreateLifeline or UmlToolMode.CreateDecomposedLifeline;

    public static bool IsRelationshipTool(UmlToolMode mode) => mode is
        UmlToolMode.CreateAssociation or UmlToolMode.CreateDirectedAssociation
        or UmlToolMode.CreateAggregation or UmlToolMode.CreateComposition
        or UmlToolMode.CreateGeneralization or UmlToolMode.CreateRealization
        or UmlToolMode.CreateDependency or UmlToolMode.CreateInclude or UmlToolMode.CreateExtend
        or UmlToolMode.CreateNoteLink
        or UmlToolMode.CreateMessage or UmlToolMode.CreateAsyncMessage or UmlToolMode.CreateReturnMessage
        or UmlToolMode.CreateCreateMessage or UmlToolMode.CreateDestroyMessage
        or UmlToolMode.CreateTransition
        or UmlToolMode.CreateControlFlow or UmlToolMode.CreateObjectFlow
        or UmlToolMode.CreateAssembly
        or UmlToolMode.CreatePackageMerge or UmlToolMode.CreatePackageImport
        or UmlToolMode.CreatePackageNesting or UmlToolMode.CreateAssociationClass
        or UmlToolMode.CreateClassNesting or UmlToolMode.CreateTrace or UmlToolMode.CreateApplyDependency
        or UmlToolMode.CreateDeployment or UmlToolMode.CreateDeploymentPath;

    public static bool IsSequenceMessageTool(UmlToolMode mode) => mode is
        UmlToolMode.CreateMessage or UmlToolMode.CreateAsyncMessage
        or UmlToolMode.CreateReturnMessage or UmlToolMode.CreateSelfMessage
        or UmlToolMode.CreateCreateMessage or UmlToolMode.CreateDestroyMessage;

    public static UmlToolMode? FromSelectedObject(object? selected) => selected switch
    {

        UmlClass { Stereotype: "metaclass" } => UmlToolMode.CreateMetaclass,
        UmlClass => UmlToolMode.CreateClass,
        UmlInterface => UmlToolMode.CreateInterface,
        UmlEnumeration => UmlToolMode.CreateEnumeration,
        UmlPackage { Stereotype: "profile" } => UmlToolMode.CreateProfilePackage,
        UmlPackage => UmlToolMode.CreatePackage,
        UmlActor => UmlToolMode.CreateActor,
        UmlUseCase => UmlToolMode.CreateUseCase,
        UmlSystemBoundary => UmlToolMode.CreateSystemBoundary,
        UmlNote => UmlToolMode.CreateNote,
        UmlComponent => UmlToolMode.CreateComponent,
        UmlComponentInterface { InterfaceKind: UmlComponentInterfaceKind.Provided } => UmlToolMode.CreateProvidedInterface,
        UmlComponentInterface { InterfaceKind: UmlComponentInterfaceKind.Required } => UmlToolMode.CreateRequiredInterface,
        UmlComponentPort => UmlToolMode.CreatePort,
        UmlObjectInstance => UmlToolMode.CreateObjectInstance,
        UmlDeploymentHost => UmlToolMode.CreateDeploymentHost,
        UmlArtifact => UmlToolMode.CreateArtifact,
        UmlDeploymentLink => UmlToolMode.CreateDeployment,
        UmlDeploymentPath => UmlToolMode.CreateDeploymentPath,
        UmlBehaviorNode behaviorNode => behaviorNode.Kind switch
        {
            UmlBehaviorNodeKind.State => UmlToolMode.CreateState,
            UmlBehaviorNodeKind.InitialState => UmlToolMode.CreateInitialState,
            UmlBehaviorNodeKind.FinalState => UmlToolMode.CreateFinalState,
            UmlBehaviorNodeKind.Action => UmlToolMode.CreateAction,
            UmlBehaviorNodeKind.InitialNode => UmlToolMode.CreateInitialNode,
            UmlBehaviorNodeKind.ActivityFinalNode => UmlToolMode.CreateActivityFinalNode,
            UmlBehaviorNodeKind.FlowFinalNode => UmlToolMode.CreateFlowFinalNode,
            UmlBehaviorNodeKind.Decision => UmlToolMode.CreateDecision,
            UmlBehaviorNodeKind.Merge => UmlToolMode.CreateMerge,
            UmlBehaviorNodeKind.Fork => UmlToolMode.CreateFork,
            UmlBehaviorNodeKind.Join => UmlToolMode.CreateJoin,
            UmlBehaviorNodeKind.Choice => UmlToolMode.CreateChoice,
            UmlBehaviorNodeKind.Junction => UmlToolMode.CreateJunction,
            UmlBehaviorNodeKind.ShallowHistory => UmlToolMode.CreateShallowHistory,
            UmlBehaviorNodeKind.DeepHistory => UmlToolMode.CreateDeepHistory,
            UmlBehaviorNodeKind.Lifeline => behaviorNode.ParentLifelineId.HasValue
                ? UmlToolMode.CreateDecomposedLifeline
                : UmlToolMode.CreateLifeline,
            UmlBehaviorNodeKind.CombinedFragment => behaviorNode.CombinedFragmentKind switch {
                UmlCombinedFragmentKind.Alt => UmlToolMode.CreateAltFragment,
                UmlCombinedFragmentKind.Opt => UmlToolMode.CreateOptFragment,
                UmlCombinedFragmentKind.Par => UmlToolMode.CreateParFragment,
                UmlCombinedFragmentKind.Break => UmlToolMode.CreateBreakFragment,
                UmlCombinedFragmentKind.Ref => UmlToolMode.CreateRefFragment,
                UmlCombinedFragmentKind.InteractionOccurrence => UmlToolMode.CreateInteractionOccurrence,
                UmlCombinedFragmentKind.Seq => UmlToolMode.CreateSeqFragment,
                UmlCombinedFragmentKind.Strict => UmlToolMode.CreateStrictFragment,
                UmlCombinedFragmentKind.Neg => UmlToolMode.CreateNegFragment,
                UmlCombinedFragmentKind.Critical => UmlToolMode.CreateCriticalFragment,
                UmlCombinedFragmentKind.Ignore => UmlToolMode.CreateIgnoreFragment,
                UmlCombinedFragmentKind.Consider => UmlToolMode.CreateConsiderFragment,
                UmlCombinedFragmentKind.Assert => UmlToolMode.CreateAssertFragment,
                _ => UmlToolMode.CreateLoopFragment,
            },
            UmlBehaviorNodeKind.NaryAssociationHub => UmlToolMode.CreateNaryAssociationHub,
            UmlBehaviorNodeKind.StateInvariant => UmlToolMode.CreateStateInvariant,
            UmlBehaviorNodeKind.Continuation => UmlToolMode.CreateContinuation,
            UmlBehaviorNodeKind.CompositeState => UmlToolMode.CreateCompositeState,
            UmlBehaviorNodeKind.OrthogonalRegion => UmlToolMode.CreateOrthogonalRegion,
            UmlBehaviorNodeKind.EntryPoint => UmlToolMode.CreateEntryPoint,
            UmlBehaviorNodeKind.ExitPoint => UmlToolMode.CreateExitPoint,
            UmlBehaviorNodeKind.TerminateState => UmlToolMode.CreateTerminateState,
            UmlBehaviorNodeKind.SubmachineState => UmlToolMode.CreateSubmachineState,
            UmlBehaviorNodeKind.ActivityContainer => UmlToolMode.CreateActivityContainer,
            UmlBehaviorNodeKind.DataStore => UmlToolMode.CreateDataStore,
            UmlBehaviorNodeKind.InputPin => UmlToolMode.CreateInputPin,
            UmlBehaviorNodeKind.OutputPin => UmlToolMode.CreateOutputPin,
            UmlBehaviorNodeKind.ExceptionHandler => UmlToolMode.CreateExceptionHandler,
            UmlBehaviorNodeKind.TimingLifeline => UmlToolMode.CreateTimingLifeline,
            UmlBehaviorNodeKind.TimingState => UmlToolMode.CreateTimingState,
            UmlBehaviorNodeKind.InteractionUse => UmlToolMode.CreateInteractionUse,
            UmlBehaviorNodeKind.Swimlane => UmlToolMode.CreateSwimlane,
            UmlBehaviorNodeKind.ObjectNode => UmlToolMode.CreateObjectNode,
            UmlBehaviorNodeKind.Activation => UmlToolMode.CreateActivation,
            UmlBehaviorNodeKind.SequenceEndpoint => UmlToolMode.CreateSequenceEndpoint,
            UmlBehaviorNodeKind.Gate => UmlToolMode.CreateGate,
            UmlBehaviorNodeKind.ExpansionRegion => UmlToolMode.CreateExpansionRegion,
            UmlBehaviorNodeKind.InterruptibleRegion => UmlToolMode.CreateInterruptibleRegion,
            _ => null,
        },
        UmlAssociation { Aggregation: UmlAggregationKind.Composite } => UmlToolMode.CreateComposition,
        UmlAssociation { Aggregation: UmlAggregationKind.Shared } => UmlToolMode.CreateAggregation,
        UmlAssociation { IsDirected: true } => UmlToolMode.CreateDirectedAssociation,
        UmlAssociation => UmlToolMode.CreateAssociation,
        UmlGeneralization => UmlToolMode.CreateGeneralization,
        UmlRealization => UmlToolMode.CreateRealization,
        UmlDependency { Stereotype: "trace" } => UmlToolMode.CreateTrace,
        UmlDependency { Stereotype: "apply" } => UmlToolMode.CreateApplyDependency,
        UmlDependency => UmlToolMode.CreateDependency,
        UmlAssembly => UmlToolMode.CreateAssembly,
        UmlPackageRelationship { PackageKind: UmlPackageRelationshipKind.Import } => UmlToolMode.CreatePackageImport,
        UmlPackageRelationship { PackageKind: UmlPackageRelationshipKind.Nesting } => UmlToolMode.CreatePackageNesting,
        UmlPackageRelationship => UmlToolMode.CreatePackageMerge,
        UmlAssociationClass => UmlToolMode.CreateAssociationClass,
        UmlClassNesting => UmlToolMode.CreateClassNesting,
        UmlInclude => UmlToolMode.CreateInclude,
        UmlExtend => UmlToolMode.CreateExtend,
        UmlNoteLink => UmlToolMode.CreateNoteLink,
        UmlBehaviorConnector behaviorConnector => behaviorConnector.Kind switch
        {
            UmlBehaviorConnectorKind.Message when behaviorConnector.MessageKind is UmlMessageKind.Lost or UmlMessageKind.Found =>
                UmlToolMode.CreateMessage,
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
        UmlToolMode.CreateSystemBoundary => "System Boundary",
        UmlToolMode.CreateNote => "Note",
        UmlToolMode.CreateNoteLink => "Note Link",
        UmlToolMode.CreateState => "State",
        UmlToolMode.CreateInitialState => "Initial State",
        UmlToolMode.CreateFinalState => "Final State",
        UmlToolMode.CreateAction => "Action",
        UmlToolMode.CreateInitialNode => "Initial Node",
        UmlToolMode.CreateActivityFinalNode => "Activity Final",
        UmlToolMode.CreateFlowFinalNode => "Flow Final",
        UmlToolMode.CreateDecision => "Decision",
        UmlToolMode.CreateMerge => "Merge",
        UmlToolMode.CreateFork => "Fork",
        UmlToolMode.CreateJoin => "Join",
        UmlToolMode.CreateChoice => "Choice",
        UmlToolMode.CreateJunction => "Junction",
        UmlToolMode.CreateShallowHistory => "Shallow H",
        UmlToolMode.CreateDeepHistory => "Deep H",
        UmlToolMode.CreateLifeline => "Lifeline",
        UmlToolMode.CreateActivation => "Activation",
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
        UmlToolMode.CreateCreateMessage => "Create",
        UmlToolMode.CreateDestroyMessage => "Destroy",
        UmlToolMode.CreateLoopFragment => "Loop",
        UmlToolMode.CreateAltFragment => "Alt",
        UmlToolMode.CreateOptFragment => "Opt",
        UmlToolMode.CreateParFragment => "Par",
        UmlToolMode.CreateBreakFragment => "Break",
        UmlToolMode.CreateRefFragment => "Ref",
        UmlToolMode.CreateTransition => "Transition",
        UmlToolMode.CreateControlFlow => "Control Flow",
        UmlToolMode.CreateObjectFlow => "Object Flow",
        UmlToolMode.CreateComponent => "Component",
        UmlToolMode.CreateProvidedInterface => "Provided",
        UmlToolMode.CreateRequiredInterface => "Required",
        UmlToolMode.CreateAssembly => "Assembly",
        UmlToolMode.CreatePackageMerge => "Merge",
        UmlToolMode.CreatePackageImport => "Import",
        UmlToolMode.CreatePackageNesting => "Nesting",
        UmlToolMode.CreatePort => "Port",
        UmlToolMode.CreateSwimlane => "Swimlane",
        UmlToolMode.CreateObjectNode => "Object Node",
        UmlToolMode.CreateAssociationClass => "Assoc. Class",
        UmlToolMode.CreateObjectInstance => "Object",
        UmlToolMode.CreateDeploymentHost => "Node",
        UmlToolMode.CreateArtifact => "Artifact",
        UmlToolMode.CreateDeployment => "Deploy",
        UmlToolMode.CreateDeploymentPath => "Path",
        UmlToolMode.CreateSequenceEndpoint => "Endpoint",
        UmlToolMode.CreateGate => "Gate",
        UmlToolMode.CreateExpansionRegion => "Expansion",
        UmlToolMode.CreateInterruptibleRegion => "Interruptible",
        UmlToolMode.CreateNaryAssociationHub => "N-ary Hub",
        UmlToolMode.CreateClassNesting => "Nesting",

        UmlToolMode.CreateTrace => "Trace",
        UmlToolMode.CreateSeqFragment => "Seq",
        UmlToolMode.CreateStrictFragment => "Strict",
        UmlToolMode.CreateNegFragment => "Neg",
        UmlToolMode.CreateCriticalFragment => "Critical",
        UmlToolMode.CreateIgnoreFragment => "Ignore",
        UmlToolMode.CreateConsiderFragment => "Consider",
        UmlToolMode.CreateAssertFragment => "Assert",
        UmlToolMode.CreateStateInvariant => "Invariant",
        UmlToolMode.CreateContinuation => "Continuation",
        UmlToolMode.CreateCompositeState => "Composite",
        UmlToolMode.CreateOrthogonalRegion => "Orthogonal",
        UmlToolMode.CreateEntryPoint => "Entry",
        UmlToolMode.CreateExitPoint => "Exit",
        UmlToolMode.CreateTerminateState => "Terminate",
        UmlToolMode.CreateSubmachineState => "Submachine",
        UmlToolMode.CreateActivityContainer => "Container",
        UmlToolMode.CreateDataStore => "Data Store",
        UmlToolMode.CreateInputPin => "Input Pin",
        UmlToolMode.CreateOutputPin => "Output Pin",
        UmlToolMode.CreateExceptionHandler => "Exception",
        UmlToolMode.CreateProfilePackage => "Profile",
        UmlToolMode.CreateMetaclass => "Metaclass",
        UmlToolMode.CreateApplyDependency => "Apply",
        UmlToolMode.CreateTimingLifeline => "Timing Line",
        UmlToolMode.CreateTimingState => "Timing State",
        UmlToolMode.CreateInteractionUse => "Interaction",
        UmlToolMode.CreateInteractionOccurrence => "sd",
        UmlToolMode.CreateDecomposedLifeline => "Part Line",
        _ => mode.ToString(),
    };

    public static string GetToolTip(UmlToolMode mode) => mode switch
    {
        UmlToolMode.Select =>
            "선택 도구: 요소를 클릭해 선택하고, 드래그로 이동합니다. 더블클릭하면 이름을 편집합니다. 마우스 휠로 확대/축소, Space+드래그로 화면 이동, Delete로 삭제, Esc로 취소합니다.",
        UmlToolMode.Pan =>
            "화면 이동: 캔버스를 드래그해 보이는 영역을 옮깁니다. 가운데 버튼 드래그 또는 Space+왼쪽 드래그로도 이동할 수 있습니다.",
        UmlToolMode.CreateClass =>
            "Class(클래스): 객체의 속성과 연산을 표현합니다. 캔버스에서 드래그해 크기를 지정하거나, 도구를 더블클릭하면 기본 크기로 배치됩니다. 선택 후 속성 패널에서 멤버를 편집합니다.",
        UmlToolMode.CreateInterface =>
            "Interface(인터페이스): 클래스가 구현해야 할 연산을 정의합니다. 드래그 또는 더블클릭으로 배치합니다. «interface» 스테레오타입이 자동 표시됩니다.",
        UmlToolMode.CreateEnumeration =>
            "Enumeration(열거형): 상수 값 집합을 정의합니다. 드래그 또는 더블클릭으로 배치하고, 속성 패널에서 리터럴을 추가합니다.",
        UmlToolMode.CreatePackage =>
            "Package(패키지): 관련 모델 요소를 논리적으로 그룹화합니다. 드래그 또는 더블클릭으로 배치합니다.",
        UmlToolMode.CreateActor =>
            "Actor(액터): Use Case 다이어그램에서 시스템 외부 사용자·장치를 나타냅니다. 드래그 또는 더블클릭으로 배치합니다.",
        UmlToolMode.CreateUseCase =>
            "Use Case(유스케이스): 시스템이 제공하는 기능 단위를 표현합니다. 타원형으로 드래그 또는 더블클릭하여 배치합니다.",
        UmlToolMode.CreateSystemBoundary =>
            "System Boundary(시스템 경계): Use Case 다이어그램에서 시스템 범위를 사각형으로 표시합니다. 드래그로 크기를 지정하고, 이름은 시스템명으로 편집합니다.",
        UmlToolMode.CreateNote =>
            "Note(메모): 다이어그램에 설명·주석을 추가합니다. 드래그 또는 더블클릭으로 배치하고, 더블클릭으로 내용을 편집합니다.",
        UmlToolMode.CreateNoteLink =>
            "Note Link(노트 연결): Note를 UML 개체에 점선으로 연결합니다. Note → 대상 순으로 클릭하거나, Note 우클릭 메뉴를 사용합니다.",
        UmlToolMode.CreateState =>
            "State(상태): 상태 머신에서 객체의 안정된 조건을 표현합니다. 둥근 사각형으로 드래그 또는 더블클릭하여 배치합니다.",
        UmlToolMode.CreateInitialState =>
            "Initial State(초기 상태): 상태 머신의 시작점입니다. 검은 원으로 표시되며, Transition으로 첫 상태에 연결합니다.",
        UmlToolMode.CreateFinalState =>
            "Final State(최종 상태): 상태 머신의 종료점입니다. 이중 원으로 표시됩니다.",
        UmlToolMode.CreateAction =>
            "Action(액션): 활동 다이어그램에서 수행할 작업 단계를 표현합니다. 둥근 사각형으로 드래그 또는 더블클릭하여 배치합니다.",
        UmlToolMode.CreateInitialNode =>
            "Initial Node(초기 노드): 활동의 시작점입니다. 검은 원으로 표시되며 Control Flow로 첫 액션에 연결합니다.",
        UmlToolMode.CreateActivityFinalNode =>
            "Activity Final(활동 종료): 활동의 끝을 나타냅니다. 이중 원으로 표시됩니다.",
        UmlToolMode.CreateFlowFinalNode =>
            "Flow Final(흐름 종료): 특정 흐름만 종료하며 전체 활동은 계속됩니다. 원 안에 X로 표시됩니다.",
        UmlToolMode.CreateDecision =>
            "Decision(분기): 조건에 따라 흐름이 갈라지는 지점입니다. 마름모꼴로 표시되며, 나가는 Control Flow에 조건 레이블을 붙입니다.",
        UmlToolMode.CreateMerge =>
            "Merge(병합): 여러 분기 흐름을 하나로 합치는 지점입니다. 마름모꼴로 표시됩니다.",
        UmlToolMode.CreateFork =>
            "Fork(분기 바): 활동을 병렬로 나누는 수평 검은 막대입니다. 드래그로 길이를 조절합니다.",
        UmlToolMode.CreateJoin =>
            "Join(동기 바): 병렬 흐름을 다시 하나로 모으는 수평 검은 막대입니다.",
        UmlToolMode.CreateChoice =>
            "Choice(선택): 상태 머신에서 조건 분기점입니다. 실행 시간에 조건을 평가합니다. 마름모꼴로 표시됩니다.",
        UmlToolMode.CreateJunction =>
            "Junction(접합): 상태 머신에서 여러 전이를 합치거나 나누는 정적 분기점입니다. 검은 원으로 표시됩니다.",
        UmlToolMode.CreateShallowHistory =>
            "Shallow History(얕은 이력): 복합 상태를 다시 진입할 때 마지막 활성 하위 상태로 복원합니다. H를 포함한 원으로 표시됩니다.",
        UmlToolMode.CreateDeepHistory =>
            "Deep History(깊은 이력): 중첩된 모든 하위 상태의 이력을 기억하여 복원합니다. H*를 포함한 원으로 표시됩니다.",
        UmlToolMode.CreateLifeline =>
            "Lifeline(라이프라인): 시퀀스 다이어그램에서 참여자를 표현합니다. 가로 드래그로 너비를 조절하고, 높이는 기본값(240px)이 적용됩니다.",
        UmlToolMode.CreateActivation =>
            "Activation(활성화): Lifeline 위에 수동 활성화 기둥을 배치합니다. 드래그로 높이와 위치를 지정합니다.",
        UmlToolMode.CreateAssociation =>
            "Association(연관): 두 요소 간 구조적 연결입니다. 시작 노드 → 대상 노드 순으로 클릭합니다. 다중성·역할 이름은 속성 패널에서 편집합니다.",
        UmlToolMode.CreateDirectedAssociation =>
            "Directed Association(방향 연관): 한쪽 방향으로만 의미 있는 연관입니다. 시작 → 대상 순으로 클릭하면 화살표가 대상 쪽에 그려집니다.",
        UmlToolMode.CreateAggregation =>
            "Aggregation(집합 ◇): 전체-부분 관계(공유 소유)입니다. 시작(전체) → 대상(부분) 순으로 클릭하면 대상 쪽에 빈 다이아몬드가 표시됩니다.",
        UmlToolMode.CreateComposition =>
            "Composition(합성 ◆): 강한 전체-부분 관리 관계입니다. 시작(전체) → 대상(부분) 순으로 클릭하면 대상 쪽에 채운 다이아몬드가 표시됩니다.",
        UmlToolMode.CreateGeneralization =>
            "Generalization(일반화 △): 상속 관계입니다. 자식 클래스 → 부모 클래스 순으로 클릭합니다. 부모 쪽에 빈 삼각형 화살표가 그려집니다.",
        UmlToolMode.CreateRealization =>
            "Realization(실체화): Interface 구현 관계입니다. 구현 클래스 → Interface 순으로 클릭합니다. 점선과 빈 삼각형 화살표로 표시됩니다.",
        UmlToolMode.CreateDependency =>
            "Dependency(의존): 한 요소가 다른 요소를 사용하는 약한 관계입니다. 의존 원본 → 대상 순으로 클릭합니다. 점선 화살표로 표시됩니다.",
        UmlToolMode.CreateInclude =>
            "Include(«include»): Use Case가 다른 Use Case의 기능을 항상 포함함을 나타냅니다. 기본 Use Case → 포함 Use Case 순으로 클릭합니다.",
        UmlToolMode.CreateExtend =>
            "Extend(«extend»): Use Case가 특정 조건에서 다른 Use Case를 확장함을 나타냅니다. 확장 Use Case → 기본 Use Case 순으로 클릭합니다.",
        UmlToolMode.CreateMessage =>
            "Sync Message(동기 호출): 호출자가 응답을 기다리는 메시지입니다. 시작 Lifeline → 대상 Lifeline 순으로 클릭합니다. 활성화 기둥이 자동 생성됩니다.",
        UmlToolMode.CreateAsyncMessage =>
            "Async Message(비동기): 응답을 기다리지 않는 메시지입니다. 시작 Lifeline → 대상 Lifeline 순으로 클릭합니다. 열린 화살표로 표시됩니다.",
        UmlToolMode.CreateReturnMessage =>
            "Return Message(반환): 처리 결과를 돌려주는 메시지입니다. 처리 Lifeline → 호출자 Lifeline 순으로 클릭합니다. 점선 화살표로 표시됩니다.",
        UmlToolMode.CreateSelfMessage =>
            "Self Message(자기 호출): 동일 Lifeline 내부 호출입니다. Lifeline을 한 번 클릭하면 루프 형태 메시지가 추가됩니다.",
        UmlToolMode.CreateCreateMessage =>
            "Create(생성): 대상 Lifeline을 동적으로 생성하는 메시지입니다. 점선 화살표로 표시되며 «create» 스테레오타입이 붙습니다.",
        UmlToolMode.CreateDestroyMessage =>
            "Destroy(소멸): 대상 Lifeline을 종료시키는 메시지입니다. 화살표로 표시되며 대상에 X 표시가 추가됩니다.",
        UmlToolMode.CreateLoopFragment =>
            "Loop(반복): 시퀀스 다이어그램에서 메시지 구간의 반복을 나타내는 결합 프래그먼트입니다. 드래그로 프레임 크기를 지정하고, 속성 패널에서 조건을 편집합니다.",
        UmlToolMode.CreateAltFragment =>
            "Alt(대안): 조건에 따라 다른 경로를 선택하는 결합 프래그먼트입니다. 점선으로 구분된 두 개 이상의 피연산자로 구성됩니다.",
        UmlToolMode.CreateOptFragment =>
            "Opt(선택적): 조건이 참일 때만 실행되는 선택적 결합 프래그먼트입니다.",
        UmlToolMode.CreateParFragment =>
            "Par(병렬): 두 개 이상의 피연산자를 동시에 실행하는 병렬 결합 프래그먼트입니다.",
        UmlToolMode.CreateBreakFragment =>
            "Break(중단): 조건이 참이면 enclosing interaction을 종료하는 결합 프래그먼트입니다.",
        UmlToolMode.CreateRefFragment =>
            "Ref(참조): 다른 다이어그램의 interaction fragment를 참조하는 결합 프래그먼트입니다.",
        UmlToolMode.CreateInteractionOccurrence =>
            "Interaction Occurrence(sd): 다른 상호작용(시퀀스 다이어그램)을 참조하는 이중 점선 프레임입니다. ref와 달리 sd 연산자를 사용합니다.",
        UmlToolMode.CreateDecomposedLifeline =>
            "Part Lifeline(분해 라이프라인): 선택한 라이프라인에서 분해된 내부 파트를 표현합니다. 부모 라이프라인을 선택한 뒤 배치하세요.",
        UmlToolMode.CreateTransition =>
            "Transition(전이): 상태 간 이동을 표현합니다. 시작 상태 → 대상 상태 순으로 클릭합니다. 이벤트/조건은 속성 패널에서 편집합니다.",
        UmlToolMode.CreateControlFlow =>
            "Control Flow(제어 흐름): 활동 간 실행 순서를 연결합니다. 시작 노드 → 대상 노드 순으로 클릭합니다. 조건 레이블을 붙일 수 있습니다.",
        UmlToolMode.CreateObjectFlow =>
            "Object Flow(객체 흐름): 데이터·객체가 흐르는 경로입니다. 시작 → 대상 순으로 클릭합니다. 점선 화살표로 표시됩니다.",
        UmlToolMode.CreateComponent =>
            "Component(컴포넌트): 컴포넌트 다이어그램에서 모듈·서비스 단위를 표현합니다. 드래그 또는 더블클릭으로 배치합니다.",
        UmlToolMode.CreateProvidedInterface =>
            "Provided Interface(제공 인터페이스): 컴포넌트가 외부에 제공하는 인터페이스를 롤리팝(원) 기호로 표현합니다.",
        UmlToolMode.CreateRequiredInterface =>
            "Required Interface(요구 인터페이스): 컴포넌트가 필요로 하는 인터페이스를 소켓(반원) 기호로 표현합니다.",
        UmlToolMode.CreateAssembly =>
            "Assembly(조립): Required 인터페이스 → Provided 인터페이스 순으로 연결합니다. 실선과 원형 끝으로 표시됩니다.",
        UmlToolMode.CreatePackageMerge =>
            "Package Merge(«merge»): 패키지 요소를 대상 패키지에 병합합니다. 시작 패키지 → 대상 패키지 순으로 클릭합니다.",
        UmlToolMode.CreatePackageImport =>
            "Package Import(«import»): 대상 패키지의 public 요소를 가져옵니다. 시작 패키지 → 대상 패키지 순으로 클릭합니다.",
        UmlToolMode.CreatePackageNesting =>
            "Package Nesting: 중첩 자식 패키지 → 부모 패키지 순으로 클릭합니다. 부모 쪽에 nesting 기호가 표시됩니다.",
        UmlToolMode.CreatePort =>
            "Port(포트): 컴포넌트 경계의 연결점을 표현합니다. 드래그 또는 더블클릭으로 배치합니다.",
        UmlToolMode.CreateSwimlane =>
            "Swimlane(수영 레인): 활동 다이어그램에서 역할·조직 단위를 구분하는 수직 영역입니다. 드래그로 크기를 지정합니다.",
        UmlToolMode.CreateObjectNode =>
            "Object Node(객체 노드): 활동 다이어그램에서 데이터·객체를 표현합니다. 드래그 또는 더블클릭으로 배치합니다.",
        UmlToolMode.CreateAssociationClass =>
            "Association Class(연관 클래스): 두 classifier 간 연관과 중간 클래스를 함께 표현합니다. 시작 → 대상 순으로 클릭합니다.",
        UmlToolMode.CreateObjectInstance =>
            "Object Instance(객체 인스턴스): 객체 다이어그램·커뮤니케이션 다이어그램에서 인스턴스를 표현합니다. 밑줄 이름 : 타입 형식으로 표시됩니다.",
        UmlToolMode.CreateDeploymentHost =>
            "Deployment Node(배치 노드): 실행 환경·장치를 3D 박스로 표현합니다.",
        UmlToolMode.CreateArtifact =>
            "Artifact(아티팩트): 배포 가능한 소프트웨어 요소를 «artifact» 탭과 함께 표현합니다.",
        UmlToolMode.CreateDeployment =>
            "Deployment(배치): Artifact → Host 순으로 클릭해 배치 관계를 만듭니다.",
        UmlToolMode.CreateDeploymentPath =>
            "Deployment Path(통신 경로): Host → Host 순으로 클릭해 노드 간 통신 경로를 표현합니다.",
        UmlToolMode.CreateSequenceEndpoint =>
            "Sequence Endpoint(엔드포인트): Lost/Found 메시지의 끝점을 원으로 표현합니다.",
        UmlToolMode.CreateGate =>
            "Gate(게이트): 상호작용 경계의 메시지 게이트를 표현합니다.",
        UmlToolMode.CreateExpansionRegion =>
            "Expansion Region(확장 영역): iterative/parallel/stream 확장 영역 프레임을 배치합니다.",
        UmlToolMode.CreateInterruptibleRegion =>
            "Interruptible Region(중단 가능 영역): 점선 프레임으로 중단 가능 영역을 표현합니다.",
        _ => GetDisplayName(mode),
    };

    public static UmlMessageKind MessageKindFromTool(UmlToolMode mode) => mode switch
    {
        UmlToolMode.CreateAsyncMessage => UmlMessageKind.Asynchronous,
        UmlToolMode.CreateReturnMessage => UmlMessageKind.Return,
        UmlToolMode.CreateSelfMessage => UmlMessageKind.SelfCall,
        UmlToolMode.CreateCreateMessage => UmlMessageKind.Create,
        UmlToolMode.CreateDestroyMessage => UmlMessageKind.Destroy,
        _ => UmlMessageKind.Synchronous,
    };

    public static UmlToolMode? ToolFromMessageKind(UmlMessageKind kind) => kind switch
    {
        UmlMessageKind.Asynchronous => UmlToolMode.CreateAsyncMessage,
        UmlMessageKind.Return => UmlToolMode.CreateReturnMessage,
        UmlMessageKind.SelfCall => UmlToolMode.CreateSelfMessage,
        UmlMessageKind.Create => UmlToolMode.CreateCreateMessage,
        UmlMessageKind.Destroy => UmlToolMode.CreateDestroyMessage,
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
        UmlToolMode.CreateSystemBoundary => UmlNotationPreview.DrawSystemBoundary,
        UmlToolMode.CreateNote => UmlNotationPreview.DrawNote,
        UmlToolMode.CreateNoteLink => UmlNotationPreview.DrawNoteLink,
        UmlToolMode.CreateState => UmlNotationPreview.DrawState,
        UmlToolMode.CreateInitialState => UmlNotationPreview.DrawInitialState,
        UmlToolMode.CreateFinalState => UmlNotationPreview.DrawFinalState,
        UmlToolMode.CreateAction => UmlNotationPreview.DrawAction,
        UmlToolMode.CreateInitialNode => UmlNotationPreview.DrawInitialNode,
        UmlToolMode.CreateActivityFinalNode => UmlNotationPreview.DrawActivityFinalNode,
        UmlToolMode.CreateFlowFinalNode => UmlNotationPreview.DrawFlowFinalNode,
        UmlToolMode.CreateDecision => UmlNotationPreview.DrawDecision,
        UmlToolMode.CreateMerge => UmlNotationPreview.DrawMerge,
        UmlToolMode.CreateFork => UmlNotationPreview.DrawFork,
        UmlToolMode.CreateJoin => UmlNotationPreview.DrawJoin,
        UmlToolMode.CreateChoice => UmlNotationPreview.DrawChoice,
        UmlToolMode.CreateJunction => UmlNotationPreview.DrawJunction,
        UmlToolMode.CreateShallowHistory => UmlNotationPreview.DrawShallowHistory,
        UmlToolMode.CreateDeepHistory => UmlNotationPreview.DrawDeepHistory,
        UmlToolMode.CreateLifeline => UmlNotationPreview.DrawLifeline,
        UmlToolMode.CreateActivation => UmlNotationPreview.DrawActivation,
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
        UmlToolMode.CreateCreateMessage => UmlNotationPreview.DrawCreateMessage,
        UmlToolMode.CreateDestroyMessage => UmlNotationPreview.DrawDestroyMessage,
        UmlToolMode.CreateLoopFragment => UmlNotationPreview.DrawLoopFragment,
        UmlToolMode.CreateAltFragment => UmlNotationPreview.DrawAltFragment,
        UmlToolMode.CreateOptFragment => UmlNotationPreview.DrawOptFragment,
        UmlToolMode.CreateParFragment => UmlNotationPreview.DrawParFragment,
        UmlToolMode.CreateBreakFragment => UmlNotationPreview.DrawBreakFragment,
        UmlToolMode.CreateRefFragment => UmlNotationPreview.DrawRefFragment,
        UmlToolMode.CreateTransition => UmlNotationPreview.DrawTransition,
        UmlToolMode.CreateControlFlow => UmlNotationPreview.DrawControlFlow,
        UmlToolMode.CreateObjectFlow => UmlNotationPreview.DrawObjectFlow,
        UmlToolMode.CreateComponent => UmlNotationPreview.DrawComponent,
        UmlToolMode.CreateProvidedInterface => UmlNotationPreview.DrawProvidedInterface,
        UmlToolMode.CreateRequiredInterface => UmlNotationPreview.DrawRequiredInterface,
        UmlToolMode.CreateAssembly => UmlNotationPreview.DrawAssembly,
        UmlToolMode.CreatePackageMerge => UmlNotationPreview.DrawPackageMerge,
        UmlToolMode.CreatePackageImport => UmlNotationPreview.DrawPackageImport,
        UmlToolMode.CreatePackageNesting => UmlNotationPreview.DrawPackageNesting,
        UmlToolMode.CreatePort => UmlNotationPreview.DrawPort,
        UmlToolMode.CreateSwimlane => UmlNotationPreview.DrawSwimlane,
        UmlToolMode.CreateObjectNode => UmlNotationPreview.DrawObjectNode,
        UmlToolMode.CreateAssociationClass => UmlNotationPreview.DrawAssociationClass,
        UmlToolMode.CreateObjectInstance => UmlNotationPreview.DrawObjectInstance,
        UmlToolMode.CreateDeploymentHost => UmlNotationPreview.DrawDeploymentHost,
        UmlToolMode.CreateArtifact => UmlNotationPreview.DrawArtifact,
        UmlToolMode.CreateDeployment => UmlNotationPreview.DrawDeployment,
        UmlToolMode.CreateDeploymentPath => UmlNotationPreview.DrawDeploymentPath,
        UmlToolMode.CreateSequenceEndpoint => UmlNotationPreview.DrawSequenceEndpoint,
        UmlToolMode.CreateGate => UmlNotationPreview.DrawGate,
        UmlToolMode.CreateExpansionRegion => UmlNotationPreview.DrawExpansionRegion,
        UmlToolMode.CreateInterruptibleRegion => UmlNotationPreview.DrawInterruptibleRegion,
        UmlToolMode.CreateNaryAssociationHub => UmlNotationPreview.DrawNaryAssociationHub,
        UmlToolMode.CreateClassNesting => UmlNotationPreview.DrawClassNesting,

        UmlToolMode.CreateTrace => UmlNotationPreview.DrawTrace,
        UmlToolMode.CreateSeqFragment => UmlNotationPreview.DrawSeqFragment,
        UmlToolMode.CreateStrictFragment => UmlNotationPreview.DrawStrictFragment,
        UmlToolMode.CreateNegFragment => UmlNotationPreview.DrawNegFragment,
        UmlToolMode.CreateCriticalFragment => UmlNotationPreview.DrawCriticalFragment,
        UmlToolMode.CreateIgnoreFragment => UmlNotationPreview.DrawIgnoreFragment,
        UmlToolMode.CreateConsiderFragment => UmlNotationPreview.DrawConsiderFragment,
        UmlToolMode.CreateAssertFragment => UmlNotationPreview.DrawAssertFragment,
        UmlToolMode.CreateStateInvariant => UmlNotationPreview.DrawStateInvariant,
        UmlToolMode.CreateContinuation => UmlNotationPreview.DrawContinuation,
        UmlToolMode.CreateCompositeState => UmlNotationPreview.DrawCompositeState,
        UmlToolMode.CreateOrthogonalRegion => UmlNotationPreview.DrawOrthogonalRegion,
        UmlToolMode.CreateEntryPoint => UmlNotationPreview.DrawEntryPoint,
        UmlToolMode.CreateExitPoint => UmlNotationPreview.DrawExitPoint,
        UmlToolMode.CreateTerminateState => UmlNotationPreview.DrawTerminateState,
        UmlToolMode.CreateSubmachineState => UmlNotationPreview.DrawSubmachineState,
        UmlToolMode.CreateActivityContainer => UmlNotationPreview.DrawActivityContainer,
        UmlToolMode.CreateDataStore => UmlNotationPreview.DrawDataStore,
        UmlToolMode.CreateInputPin => UmlNotationPreview.DrawInputPin,
        UmlToolMode.CreateOutputPin => UmlNotationPreview.DrawOutputPin,
        UmlToolMode.CreateExceptionHandler => UmlNotationPreview.DrawExceptionHandler,
        UmlToolMode.CreateProfilePackage => UmlNotationPreview.DrawProfilePackage,
        UmlToolMode.CreateMetaclass => UmlNotationPreview.DrawMetaclass,
        UmlToolMode.CreateApplyDependency => UmlNotationPreview.DrawApplyDependency,
        UmlToolMode.CreateTimingLifeline => UmlNotationPreview.DrawTimingLifeline,
        UmlToolMode.CreateTimingState => UmlNotationPreview.DrawTimingState,
        UmlToolMode.CreateInteractionUse => UmlNotationPreview.DrawInteractionUse,
        UmlToolMode.CreateInteractionOccurrence => UmlNotationPreview.DrawInteractionOccurrence,
        UmlToolMode.CreateDecomposedLifeline => UmlNotationPreview.DrawDecomposedLifeline,
        _ => null,
    };

    public static bool TryCreateCombinedFragment(UmlToolMode mode, out UmlBehaviorNode node)
    {
        var kind = mode switch
        {
            UmlToolMode.CreateSeqFragment => UmlCombinedFragmentKind.Seq,
            UmlToolMode.CreateStrictFragment => UmlCombinedFragmentKind.Strict,
            UmlToolMode.CreateNegFragment => UmlCombinedFragmentKind.Neg,
            UmlToolMode.CreateCriticalFragment => UmlCombinedFragmentKind.Critical,
            UmlToolMode.CreateIgnoreFragment => UmlCombinedFragmentKind.Ignore,
            UmlToolMode.CreateConsiderFragment => UmlCombinedFragmentKind.Consider,
            UmlToolMode.CreateAssertFragment => UmlCombinedFragmentKind.Assert,
            _ => (UmlCombinedFragmentKind?)null,
        };

        if (kind is null)
        {
            node = null!;
            return false;
        }

        var label = kind.Value.ToString().ToLowerInvariant();
        node = new UmlBehaviorNode
        {
            Name = label,
            Kind = UmlBehaviorNodeKind.CombinedFragment,
            CombinedFragmentKind = kind,
            Guard = string.Empty,
        };
        return true;
    }

    private static UmlToolMode? FromPresentation(UmlNodePresentation presentation) => presentation switch
    {
        UmlNodePresentation.Classifier => UmlToolMode.CreateClass,
        UmlNodePresentation.Package => UmlToolMode.CreatePackage,
        UmlNodePresentation.Actor => UmlToolMode.CreateActor,
        UmlNodePresentation.UseCase => UmlToolMode.CreateUseCase,
        UmlNodePresentation.SystemBoundary => UmlToolMode.CreateSystemBoundary,
        UmlNodePresentation.Note => UmlToolMode.CreateNote,
        UmlNodePresentation.Component => UmlToolMode.CreateComponent,
        UmlNodePresentation.ProvidedInterface => UmlToolMode.CreateProvidedInterface,
        UmlNodePresentation.RequiredInterface => UmlToolMode.CreateRequiredInterface,
        UmlNodePresentation.Port => UmlToolMode.CreatePort,
        UmlNodePresentation.ObjectInstance => UmlToolMode.CreateObjectInstance,
        UmlNodePresentation.DeploymentHost => UmlToolMode.CreateDeploymentHost,
        UmlNodePresentation.Artifact => UmlToolMode.CreateArtifact,
        UmlNodePresentation.Behavior => null,
        _ => null,
    };
}
