# My UML Multi OS

Windows, macOS, Linux에서 실행되는 JavaScript 기반 UML 작성 프로그램을 만들기 위한 워크스페이스입니다.

현재 제품 기준은 다음과 같습니다.

- Papyrus와 파일 호환성을 유지한다.
- Java 런타임과 Eclipse RCP를 제품에 포함하지 않는다.
- Papyrus 코드는 런타임으로 사용하지 않고, 기능 동작과 저장 포맷을 분석하는 기준 구현으로 활용한다.
- 구현 언어와 앱 런타임은 JavaScript/TypeScript 계열로 제한한다.

이 기준에서는 Papyrus 플러그인을 직접 실행할 수 없습니다. 대신 Papyrus가 저장하는 `.uml`, `.notation`, `.di` 파일을 읽고 쓰는 호환 계층을 TypeScript로 구현해야 합니다.

## 권장 제품 구조

```text
데스크톱 앱
	-> Electron 또는 Tauri JavaScript 런타임
		-> TypeScript UML domain model
		-> Papyrus file compatibility layer
		-> Diagram editor
		-> Import/export and validation tools
```

Electron은 Node.js와 Chromium을 포함하므로 Java 없이 3개 OS 배포가 쉽습니다. Tauri는 더 작은 패키지를 만들 수 있지만, Rust 빌드 체인이 필요합니다. 이 프로젝트의 초기 MVP는 Electron + TypeScript를 기준으로 잡습니다.

## 실행

현재 GUI는 Vite 기반 개발 서버로 실행합니다.

```powershell
npm install
npm run dev
```

브라우저에서 아래 주소를 엽니다.

```text
http://127.0.0.1:5173/
```

현재 GUI는 UML 2.5.1 다이어그램 타입을 선택하고, 다이어그램별 palette에서 요소를 만들어 이름과 UML type을 편집할 수 있습니다. 모든 주요 버튼은 아이콘과 레이블을 함께 표시하며, 한국어/영어 전환과 Light/Dark 테마 전환을 지원합니다. Papyrus 호환 저장은 `.uml`, `.notation`, `.di` serializer를 확장하면서 단계적으로 연결합니다.

## 빌드와 설치 파일

웹 배포 파일은 아래 명령으로 생성합니다.

```powershell
npm run build:web
```

데스크톱 설치 파일은 Electron Builder로 생성합니다. Windows에서는 아래 명령으로 NSIS 설치 파일을 만들고, 생성된 설치 파일을 프로젝트 루트 폴더로 복사합니다.

```powershell
npm run build:win
```

Linux와 macOS용 스크립트도 준비되어 있습니다.

```powershell
npm run build:linux
npm run build:mac
```

macOS 설치 파일은 macOS 빌드 호스트에서 만드는 것을 권장합니다. 설치 마법사는 설치 위치 선택을 지원하며, Windows에서는 바탕화면 바로가기와 시작 메뉴 바로가기가 생성되도록 설정되어 있습니다.

프로젝트 저장 파일 확장자는 `.umlprj`입니다. 설치 패키지는 이 확장자를 My UML Multi OS Project로 시스템에 등록하며, `.umlprj` 파일을 더블클릭하면 등록된 My UML Multi OS가 실행되고 해당 프로젝트가 열립니다.

## Papyrus 소스 활용 방식

Papyrus 저장소는 아래 목적으로 사용합니다.

- `.uml`, `.notation`, `.di` 저장 구조 확인
- XMI namespace, element id, diagram notation 구조 확인
- Papyrus가 생성한 샘플 모델과 round-trip 비교
- 기능 명세, UI 동작, command 처리, validation rule 분석
- 분석한 기능을 TypeScript domain model과 editor 기능으로 재구현

Papyrus 코드를 제품에 링크하거나 포함하지 않습니다. Java/Eclipse RCP 번들도 제품에 포함하지 않습니다.

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\clone-papyrus.ps1
```

## 개발 단계

1. Papyrus가 만든 샘플 프로젝트를 수집합니다.
2. Papyrus의 각 다이어그램 생성 흐름을 분석해 TypeScript 다이어그램 정의와 palette command로 옮깁니다.
3. `.uml`, `.notation`, `.di` 파일의 최소 parser/serializer를 TypeScript로 구현합니다.
4. Class Diagram부터 round-trip 저장을 통과시킵니다.
5. Papyrus에서 다시 열리는지 검증하는 호환성 테스트를 추가합니다.
6. Sequence, Activity, State Machine 등 다이어그램 범위를 단계적으로 확장합니다.
7. OS별 Electron 패키징과 코드 서명을 구성합니다.

## 중요한 제약

- Papyrus 기능 전체를 그대로 재사용하는 것은 Java/Eclipse RCP 없이는 불가능합니다.
- Papyrus와 같은 수준의 기능을 목표로 하려면 TypeScript로 기능을 재구현해야 합니다.
- “호환성”의 첫 기준은 Papyrus가 생성한 파일을 손상 없이 읽고, 저장 후 Papyrus에서 다시 열 수 있는 것입니다.
- Papyrus Desktop은 EPL 2.0입니다. 소스 분석과 코드 재사용 범위에 따라 라이선스 검토가 필요합니다.

자세한 구조는 [docs/architecture.md](docs/architecture.md)를, 파일 호환성 계획은 [docs/papyrus-file-compatibility.md](docs/papyrus-file-compatibility.md)를, Papyrus 코드 참고 방식은 [docs/papyrus-reference-implementation.md](docs/papyrus-reference-implementation.md)를 참고하세요.