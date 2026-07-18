# JavaScript 기반 Papyrus 호환 UML 앱 구조

## 목표

- Windows, macOS, Linux에서 단독 실행되는 UML 작성 도구를 만든다.
- Java 런타임과 Eclipse RCP를 제품에 포함하지 않는다.
- Papyrus가 만든 모델 파일을 읽고, 저장 후 Papyrus에서 다시 열 수 있게 한다.
- Papyrus 코드는 제품 런타임이 아니라 호환성 분석 자료로만 활용한다.

## 핵심 판단

Papyrus Desktop은 Java/Eclipse RCP 애플리케이션입니다. 따라서 Java와 Eclipse RCP를 포함하지 않는 제품에서는 Papyrus 플러그인, EMF 런타임, UML2 런타임, 다이어그램 편집기를 직접 실행할 수 없습니다.

이 프로젝트의 구현 방향은 Papyrus 런타임 재사용이 아니라 Papyrus 코드를 참고한 TypeScript 재구현입니다. Papyrus는 기준 구현이며, 제품 런타임은 JavaScript/TypeScript입니다.

```text
Papyrus Desktop
  -> 기준 구현, 기능 동작 분석, 샘플 파일 생성, 저장 구조 분석

My UML Multi OS
  -> Electron + TypeScript 앱
  -> Papyrus 파일 parser/serializer
  -> 자체 UML 모델 계층
  -> 자체 다이어그램 편집기
```

## 런타임 아키텍처

```text
Electron main process
  -> 파일 시스템 접근
  -> 프로젝트 열기/저장
  -> OS별 앱 패키징

Electron renderer process
  -> React 또는 Svelte UI
  -> 다이어그램 캔버스
  -> 속성 편집기
  -> 모델 탐색기

TypeScript core packages
  -> UML domain model
  -> UML 2.5.1 diagram registry
  -> Papyrus XMI parser
  -> Papyrus notation parser
  -> Serializer and round-trip preservation
  -> Validation rules
```

## Papyrus 호환 계층

호환 계층은 세 종류의 파일을 하나의 프로젝트 단위로 다룹니다.

- `.uml`: UML model XMI
- `.notation`: 다이어그램 notation과 view 정보
- `.di`: Papyrus project/editor metadata

초기 구현은 Class Diagram을 대상으로 합니다. 이 범위를 통과한 뒤 Sequence Diagram, Activity Diagram, State Machine Diagram 순서로 확장합니다.

## GUI 다이어그램 범위

GUI는 Papyrus에서 제공하는 UML 다이어그램 계열을 TypeScript registry로 등록합니다.

- Class Diagram
- Profile Diagram
- Package Diagram
- Object Diagram
- Composite Structure Diagram
- Component Diagram
- Deployment Diagram
- Use Case Diagram
- Sequence Diagram
- Communication Diagram
- Activity Diagram
- State Machine Diagram
- Timing Diagram

각 다이어그램은 Papyrus diagram id, UML 2.5.1 scope, palette tool, notation 저장 힌트를 함께 가집니다. Papyrus 소스에서 다이어그램 생성 command와 notation update 흐름을 확인한 뒤 이 registry와 editor command를 확장합니다.

GUI 공통 요구사항은 아래와 같습니다.

- 모든 주요 버튼은 의미 있는 아이콘과 레이블을 함께 표시합니다.
- 한국어와 영어 UI를 지원합니다.
- Light와 Dark 테마를 지원합니다.
- 다이어그램 타입, palette, 속성 패널의 표시 텍스트는 locale 상태에 따라 바뀝니다.

## Papyrus 코드 활용 원칙

- Papyrus 소스는 저장 포맷, ID 생성 규칙, diagram type, profile 적용 방식을 이해하는 참고 자료로 사용합니다.
- 제품에는 Papyrus Java 코드, Eclipse RCP 번들, EMF Java 런타임을 포함하지 않습니다.
- 필요한 기능 동작은 TypeScript로 재구현합니다.
- Papyrus 소스의 코드를 그대로 옮기는 경우 EPL 2.0 의무가 발생할 수 있으므로 라이선스 검토 후 진행합니다.

## 기능 구현 순서

1. Papyrus 샘플 프로젝트 수집
2. `.uml` XMI parser와 serializer 구현
3. `.notation`, `.di` 파일 보존 전략 구현
4. UML 2.5.1 diagram registry와 palette command 구현
5. Class Diagram 모델 탐색기와 속성 편집기 구현
6. Class Diagram 캔버스 구현
7. Papyrus round-trip 호환성 테스트 추가
8. Profile, stereotype, validation 확장
9. 다른 UML diagram으로 확장

## 성공 기준

- Papyrus에서 만든 Class Diagram 프로젝트를 열 수 있다.
- 앱에서 class, package, association 같은 기본 요소를 수정할 수 있다.
- 저장 후 Papyrus에서 프로젝트를 다시 열 수 있다.
- 알 수 없는 Papyrus metadata를 삭제하지 않고 보존한다.
- Java 또는 Eclipse RCP 런타임 없이 앱을 실행하고 패키징할 수 있다.