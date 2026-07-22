# Architecture — UML Editor

## 목표

- Windows / macOS / Linux에서 단독 실행되는 UML 편집기
- Java / Eclipse RCP / Papyrus 런타임을 제품에 포함하지 않음
- 현재 제품 저장 형식: **`.umlprj` JSON**
- Papyrus `.uml` / `.notation` / `.di` 호환은 장기 목표 (분석·점진 구현)
- Papyrus 코드는 기준 구현·포맷 분석용이며 런타임으로 링크하지 않음

## 런타임 구조

```text
Electron main (electron/main.cjs)
  ├─ 창 생성, 앱/파일 아이콘
  ├─ 파일 대화상자, .umlprj 열기 (argv / open-file / second-instance)
  ├─ IPC: 설정·프로젝트 경로 브리지
  └─ userData (소스 실행 시 "MyUML Source" 분리)

Electron preload (electron/preload.cjs)
  └─ contextBridge → window.myUmlDesktop

Renderer (Vite + React 19 + TypeScript)
  ├─ src/app/App.tsx          UI 셸, 도구, 저장/불러오기, 캔버스 상호작용
  ├─ src/app/i18n.ts          ko / en
  ├─ src/app/styles.css       light / dark (`data-theme`)
  ├─ src/app/diagrams/*       다이어그램별 SVG 렌더
  └─ src/uml/*                도메인 모델·라우팅·인터페이스 로직

TypeScript core (src/uml)
  ├─ diagramRegistry.ts       13종 다이어그램 정의·팔레트
  ├─ editorModel.ts           문서/노드/엣지 모델, 직렬화 보조
  ├─ componentInterface.ts    연결(Interface Pair), 포트, 스템/조인트
  ├─ orthogonalRouting.ts     직교 경로·장애물 회피
  ├─ edgeBridges.ts           교차 브리지 지오메트리
  └─ diagrams/*               Use Case / Activity / Communication 특화

Papyrus helpers (src/papyrus) — 초기 단계
  └─ XMI/경로 유틸 (주 저장 경로 아님)

Build / package
  ├─ Vite → dist/app
  ├─ electron-builder → release/
  ├─ assets/*-icon.*          앱·프로젝트 아이콘
  └─ build/installer.nsh      Windows 재설치 시 완전 정리
```

## 데이터 모델 (`.umlprj`)

```json
{
  "format": "my-uml-multi-os-project",
  "version": 1,
  "projectName": "…",
  "activeDocumentId": "…",
  "documents": [
    {
      "id": "…",
      "kind": "class",
      "name": "…",
      "nodes": [],
      "edges": []
    }
  ]
}
```

- 문서(`documents`)마다 `kind`가 다이어그램 종류
- 노드는 위치·크기·UML 요소 종류·인터페이스 파트너 등
- 엣지는 `route`: `straight` | `orthogonal` | `curve`, 앵커, 다중성 등
- **연결(Interface Pair)** 제스처는 엣지로 저장되지 않고, 짝지어진 provided/required 인터페이스 노드로 남음

## 다이어그램 종류

| kind | 이름 |
|------|------|
| `class` | Class |
| `profile` | Profile |
| `package` | Package |
| `object` | Object |
| `compositeStructure` | Composite Structure |
| `component` | Component |
| `deployment` | Deployment |
| `useCase` | Use Case |
| `sequence` | Sequence |
| `communication` | Communication |
| `activity` | Activity |
| `stateMachine` | State Machine |
| `timing` | Timing |

레지스트리: `src/uml/diagramRegistry.ts`

## 편집기 핵심 모듈

### 연결 (Interface Pair)

- 커넥터 종류: `interfacePair` (UI 한국어: **연결**)
- 컴포넌트↔컴포넌트, 컴포넌트↔포트, 포트↔포트
- 생성 시 provided(원) + required(반원) 쌍, 공유 joint, 스템
- 선택 시 쌍 강조, “원/반원 방향 바꾸기”로 역할 스왑
- 구현: `src/uml/componentInterface.ts`, `src/app/diagrams/componentInterfaces.tsx`

### 라우팅·교차

- `orthogonalRouting.ts`: 장애물을 피한 직교 polyline
- `edgeBridges.ts`: 나중에 그려진 선이 교차점에서 점프(브리지)
- 히트 영역과 보이는 선을 분리해 선택 하이라이트가 선을 덮지 않음

### UI / i18n / 테마

- 로케일: `en` | `ko` (`src/app/i18n.ts`)
- 테마: `light` | `dark` (`data-theme` + CSS 변수)
- 주요 툴바·팔레트 버튼은 아이콘 + 레이블

## 패키징

| 항목 | 값 |
|------|-----|
| appId | `com.shkwon.myumlmultios` |
| productName | UML Editor |
| Windows | NSIS (`UML-Editor-Setup-<ver>.exe`) |
| Linux | AppImage, deb |
| macOS | dmg |
| 파일 연결 | `.umlprj` → MyUML Project / `project-icon.ico` |

재설치 정책 (`build/installer.nsh`):

- 이전 버전 uninstall 시 `--delete-app-data`
- 레거시 제품명(`My UML Multi OS` 등) 잔여 폴더 정리
- AppData / LocalAppData 사용자 데이터 삭제

## 디렉터리 맵

```text
assets/          앱·프로젝트 아이콘 (Vite publicDir)
build/           NSIS include (installer.nsh)
electron/        main / preload
samples/         다이어그램별 .umlprj 샘플
scripts/         run-win, copy-installers, render-app-icon, generate-samples
src/app/         UI
src/uml/         도메인·편집 로직
src/papyrus/     Papyrus 호환 실험 코드
release/         빌드 산출물 (gitignore)
```

## Papyrus 호환 (로드맵)

장기적으로 다룰 파일 단위:

- `.uml` — UML model XMI
- `.notation` — 다이어그램 view
- `.di` — Papyrus 메타데이터

현재 GUI·저장의 주 경로는 `.umlprj`입니다. Papyrus round-trip는 Class부터 단계적으로 검증하는 것이 목표입니다.

## 성공 기준 (현재 제품)

- 13종 다이어그램을 `.umlprj`로 저장·다시 열 수 있다
- 컴포넌트 연결·포트·직교/브리지 편집이 동작한다
- ko/en, light/dark가 동작한다
- Java/Eclipse 없이 Electron으로 패키징·설치할 수 있다
- `.umlprj` 더블클릭으로 앱이 해당 프로젝트를 연다
