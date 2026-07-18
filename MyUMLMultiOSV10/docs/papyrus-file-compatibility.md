# Papyrus 파일 호환성 계획

## 호환 대상

Papyrus 프로젝트는 보통 아래 파일들을 함께 사용합니다.

- `.uml`: UML model XMI입니다. class, package, property, operation, relationship, profile 적용 정보가 들어갑니다.
- `.notation`: 다이어그램의 view, node, edge, bounds, style 정보가 들어갑니다.
- `.di`: Papyrus editor와 project metadata가 들어갑니다.

이 앱은 세 파일을 하나의 logical document로 열고 저장해야 합니다.

## Round-trip 원칙

Papyrus 호환성의 첫 목표는 손상 없는 round-trip입니다.

```text
Papyrus에서 샘플 생성
  -> My UML Multi OS에서 열기
  -> 일부 모델 수정
  -> 저장
  -> Papyrus에서 다시 열기
```

저장 과정에서 앱이 이해하지 못한 XML element와 attribute는 삭제하지 않습니다. 알 수 없는 데이터는 원본 XML fragment로 보존하고, 앱이 수정한 부분만 최소 변경합니다.

## 구현 계층

```text
project-loader
  -> .uml, .notation, .di 파일 묶음 감지

xml-adapter
  -> XML parse/serialize
  -> namespace와 xmi:id 보존

uml-model
  -> TypeScript domain object
  -> class/package/property/operation/relationship

papyrus-serializer
  -> domain object를 Papyrus 호환 XMI로 저장
  -> 알 수 없는 XML fragment 보존
```

## MVP 범위

- Papyrus Class Diagram 프로젝트 열기
- package, class, property, operation 읽기
- association, generalization 읽기
- class 이름과 속성 수정
- `.uml` 저장
- `.notation`, `.di` 보존 저장
- Papyrus 재오픈 수동 검증

## 확장 범위

- Class Diagram node/edge 위치 저장
- UML Profile과 stereotype 적용
- Sequence Diagram
- Activity Diagram
- State Machine Diagram
- validation rule과 quick fix
- image, SVG, XMI export

## 테스트 데이터

테스트 데이터는 Papyrus Desktop으로 생성한 작은 프로젝트를 사용합니다. 각 샘플은 원본과 저장 후 결과를 비교할 수 있어야 합니다.

```text
samples/papyrus/class-basic/
  class-basic.uml
  class-basic.notation
  class-basic.di
```

샘플 파일은 라이선스와 저작권을 확인한 뒤 저장소에 포함합니다.