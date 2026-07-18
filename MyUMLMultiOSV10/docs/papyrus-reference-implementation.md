# Papyrus 코드 참고 구현 방식

## 원칙

Papyrus 코드는 이 프로젝트의 기준 구현입니다. 제품에 Java 코드, Eclipse RCP 번들, EMF Java 런타임을 포함하지 않고, Papyrus의 동작을 분석해 TypeScript로 다시 구현합니다.

핵심 원칙은 아래와 같습니다.

- Papyrus 코드는 기능 동작, 저장 포맷, validation rule, command 흐름을 이해하기 위해 읽습니다.
- 제품 런타임에는 Papyrus Java 코드를 링크하거나 번들링하지 않습니다.
- TypeScript 구현은 Papyrus가 만든 파일을 열고 저장하는 호환성 테스트로 검증합니다.
- Papyrus 코드를 그대로 복사해야 하는 경우에는 EPL 2.0 의무를 먼저 검토합니다.

## 분석 워크플로

기능 하나를 구현할 때마다 아래 순서로 진행합니다.

1. Papyrus에서 작은 샘플 프로젝트를 만든다.
2. 변경 전후의 `.uml`, `.notation`, `.di` 파일 차이를 기록한다.
3. Papyrus 소스에서 해당 기능의 command, model mutation, notation update 흐름을 찾는다.
4. TypeScript domain model에 필요한 개념만 반영한다.
5. GUI palette command와 property editor 동작을 구현한다.
6. serializer가 Papyrus 호환 XML을 생성하도록 구현한다.
7. Papyrus에서 다시 열리는지 round-trip 테스트한다.

## 첫 구현 대상

초기 기능은 Class Diagram부터 구현합니다.

- package 생성
- class 생성
- class 이름 변경
- property 생성과 이름/type 변경
- operation 생성과 이름 변경
- association 생성
- generalization 생성
- node 위치와 크기 보존
- edge source/target과 bendpoint 보존

## Papyrus 코드에서 확인할 항목

Papyrus 소스를 참고할 때는 구현 언어보다 아래 정보를 우선 확인합니다.

- UML element의 XMI 형태
- `xmi:id` 생성과 참조 방식
- `.notation`의 node, edge, style 구조
- `.di`의 editor metadata 구조
- command 실행 시 `.uml`과 `.notation`이 함께 바뀌는 지점
- stereotype과 profile application이 저장되는 방식
- validation rule과 오류 메시지 조건

## TypeScript 구현 산출물

각 기능은 아래 산출물을 남깁니다.

- domain model 타입
- Papyrus XML parser test
- Papyrus XML serializer test
- 샘플 round-trip fixture
- UI 또는 editor command
- Papyrus 재오픈 검증 결과

## 호환성의 기준

기능이 구현됐다고 판단하려면 아래 조건을 만족해야 합니다.

- Papyrus에서 만든 샘플을 열 수 있다.
- My UML Multi OS에서 수정할 수 있다.
- 저장 후 Papyrus에서 다시 열 수 있다.
- 앱이 이해하지 못하는 Papyrus metadata를 삭제하지 않는다.
- Java 또는 Eclipse RCP 없이 테스트와 앱 실행이 가능하다.