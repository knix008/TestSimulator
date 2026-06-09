# MyUML20WinV10

C# WinForms 기반 UML 2.0 클래스 다이어그램 작성 도구입니다. Visual Studio 디자이너에서 `MainForm` GUI를 편집할 수 있습니다.

## 실행 환경

- Windows 10/11
- .NET 10 SDK
- Visual Studio 2022 이상 (2026 포함)

## 빌드/실행

```bash
dotnet build .\MyUML20WinV10.csproj -c Release
dotnet run --project .\MyUML20WinV10.csproj -c Release
```

Visual Studio에서는 `MyUML20WinV10.sln`을 열고 F5로 실행합니다.

Release 빌드 시 MSI 설치 파일이 자동 생성됩니다.

- `bin\Release\installer\MyUML20WinV10_Setup.msi`

설치 마법사(`WixUI_Mondo`)에서 다음 항목을 선택할 수 있습니다.

- 설치 경로
- **바탕 화면 바로 가기** (프로그램 아이콘)
- **시작 메뉴 바로 가기** (프로그램 아이콘)

Windows **설정 → 앱 → 설치된 앱** 목록에도 프로그램 아이콘이 표시됩니다.

## 화면 구성

- **좌측**: UML 표기법 도구 상자 (`UmlToolbox`) — 각 타일에 notation 미리보기, 드래그로 그리기
- **중앙**: 눈금/스크롤/확대·축소 지원 캔버스 (`UmlCanvas`)
- **우측 상단**: 속성 편집 (`PropertyGrid`)
- **우측 하단**: UML 구조 탐색기 (`ModelExplorer`)

### 캔버스 조작

- **마우스 휠**: 확대/축소
- **Shift + 휠**: 가로 스크롤
- **Space + 드래그** 또는 **가운데 버튼 드래그**: 화면 이동
- **이동 도구** 또는 스크롤바: 패닝/스크롤
- 다이어그램이 기본 영역을 넘으면 캔버스가 자동 확장됩니다

## 지원 기능 (1단계)

- Class / Interface / Enumeration 생성
- Association / Generalization / Dependency 생성
- 모델 트리와 다이어그램 동기화
- 속성(Property) / 연산(Operation) 추가
- `.umlprj` JSON 프로젝트 저장/불러오기 (템플릿은 `.uml`)
- 샘플 모델 (`파일 → 샘플 불러오기`)
- 다양한 문서/이미지 보내기 (`파일 → 보내기`)

## 보내기 (Export)

| 메뉴 | 형식 | 설명 |
|------|------|------|
| 다이어그램 이미지 | PNG / JPEG / BMP | 현재 뷰 또는 모든 다이어그램 |
| 다이어그램 SVG | SVG | 벡터 다이어그램 |
| 다이어그램 PDF | PDF | 인쇄용 문서 |
| HTML 문서 | HTML | 모델 구조 + 다이어그램 이미지 포함 |
| Markdown 문서 | MD | 모델 구조 + 다이어그램 이미지 폴더 |

이미지/SVG/PDF 보내기 시 **배경 없음(투명)** 옵션을 사용할 수 있습니다. 투명 배경은 PNG·SVG에서 완전히 지원됩니다.

## 프로젝트 구조

- `Models/` — UML 2.0 메타모델 (Package, Classifier, Relationship, Diagram)
- `Controls/` — 캔버스, 구조 탐색기
- `Rendering/` — UML 표기 렌더링
- `Serialization/` — 프로젝트 파일 입출력
- `Export/` — 이미지·SVG·PDF·HTML·Markdown 보내기

## 다음 단계

- Use Case / Sequence / State Machine 다이어그램
- XMI 2.x보내기
- 다이어그램 다중 탭
- 실행 취소/다시 실행
