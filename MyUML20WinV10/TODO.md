# UML 구현 백로그



Sparx UML 2 튜토리얼 기준으로 **아직 구현하지 않았거나 의도적으로 미뤄 둔** 항목입니다.



참고: [Sparx UML 2 Tutorial](https://sparxsystems.com/resources/tutorials/uml2/)



---



## 미완 / 폴리시 (우선순위 낮음)



_현재 열린 백로그 항목 없음._



---



## 구현 완료 (2026-06)



### Sequence (폴리시)

- Interaction occurrence — `sd` 결합 프래그먼트 (`InteractionOccurrence`), 이중 점선 프레임, ref와 구분

- Part decomposition — `ParentLifelineId` / `DecompositionRole`, Part Line 도구, 분기 연결선 렌더링

- Duration constraint — `DurationMin` / `DurationMax`, 기울기·틱 마크·컨텍스트 메뉴 편집



### 품질

- `MyUML20WinV10.Tests` — 기본 다이어그램 수, 템플릿 매니페스트, 직렬화 라운드트립

- Sparx EA 스타일 선 굵기 상수 — `UmlDiagramStyle.BorderWidthNormal`, `EdgeWidthNormal`, `PreviewPenWidth`



### 다이어그램 종류

- Class, Use Case, Sequence, State Machine, Activity, Component, Package

- Object, Communication, Deployment

- **Profile Diagram** — 프로파일 패키지, 메타클래스, «apply» 의존

- **Timing Diagram** — 타이밍 라이프라인, 상태 구간

- **Composite Structure Diagram** — 분류자 프레임, Part, Port, Connector

- **Interaction Overview Diagram** — InteractionUse, 분기, Control Flow



### Class / Structural

- N원 연관 (NaryAssociationHub + 연관 링크)

- Class nesting (UmlClassNesting, 점선+원형 기호)

- Table (`«table»` 스테레오타입, 테이블 아이콘 구획선)

- Trace (`«trace»` 의존)



### Use Case

- Actor 사각형 표기 (`UseRectangleNotation`, `«actor»`)

- Extension Point (UseCase.ExtensionPoints, Extend.ExtensionPoint)

- Use Case 정의 (Requirements, Constraints, Scenario)



### Sequence

- Combined fragment: seq, strict, neg, critical, ignore, consider, assert

- State invariant / Continuation (반원형)

- Lifeline Actor 기호 (LifelineKind.Actor)



### State Machine

- Composite state, Orthogonal region, Entry/Exit point, Terminate, Submachine state



### Activity

- Activity container, Data store, Input/Output pin, Exception handler

- Action local pre/post (LocalPrecondition, LocalPostcondition)



### Component / Deployment

- Port InterfaceName + lollipop/socket 렌더링

- Deployment path Stereotype, Bandwidth 라벨

- Artifact 인스턴스 표기 (`IsInstance`, `«instance»`)



### Package

- 패키지 다이어그램 그리드 자동 정렬 (`UmlAutoLayout.ApplyPackageDiagram`)

- Nesting 시 모델 트리 동기화 (`UmlPackageNestingHelper`)



### 기타

- SVG보내기 신규 표기 기본 사각형 폴백

- 전체 샘플·템플릿 4종 추가 (profile, timing, composite-structure, interaction-overview)



### 이전 완료 항목

- Package merge / import / nesting, Component port, Association class, Interface 원형 표기

- Sequence: activation, break/ref fragment, alt 구분선, endpoint, gate, lost/found, duration

- Activity: swimlane, object node, expansion region, interruptible region

