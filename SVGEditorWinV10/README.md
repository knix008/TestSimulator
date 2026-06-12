# SVGEditorWinV10

C# WinForms 기반 SVG 편집기입니다. 도형·선·텍스트·외부 이미지를 배치하고, 속성을 편집한 뒤 SVG 파일로 저장하거나 래스터 이미지로 내보낼 수 있습니다.

## 실행 환경

- Windows 10/11
- [.NET 10 SDK](https://dotnet.microsoft.com/download)
- Visual Studio 2022 이상(권장) 또는 `dotnet` CLI

## 빌드 / 실행

### Visual Studio

1. `SVGEditorWinV10.sln` 열기
2. `SVGEditorWinV10` 프로젝트를 시작 프로젝트로 설정
3. 실행(F5)

### dotnet CLI

```bash
dotnet build .\SVGEditorWinV10.csproj -c Release
dotnet run --project .\SVGEditorWinV10.csproj -c Release
```

실행 파일 위치: `bin\Release\net10.0-windows\SVGEditorWinV10.exe`

## 화면 구성

| 영역 | 설명 |
|------|------|
| **좌측** | 도구 모음 + 속성 패널 |
| **가운데** | 캔버스 (편집 영역) |
| **우측** | SVG 소스 뷰 (실시간 동기화) |

## 도구

- **선택** — 이동, 크기 조절, 다중 선택
- **도형** — 사각형, 둥근 사각형, 타원, 삼각형, 마름모, 육각형, 평행사변형, 별
- **선** — 직선, 화살표·마커, 선 스타일
- **텍스트** — 글꼴·색·크기, 텍스트 영역 리사이즈
- **이미지** — PNG, GIF, JPEG, WebP, AVIF 불러오기 (SVG에 base64로 내장)

## 기본 사용법

- **도형/텍스트/이미지 추가**: 도구 선택 → 캔버스에서 드래그 (클릭만 하면 기본 크기로 배치되는 항목도 있음)
- **선택 / 이동**: 선택 도구 → 항목 클릭 후 드래그
- **크기 변경**: 항목 선택 → 테두리 **핸들** 드래그
- **다중 선택**: `Ctrl`+클릭(토글), `Shift`+클릭(추가), 드래그(영역 선택), `Ctrl+A`(전체 선택)
- **텍스트 편집**: 텍스트 더블 클릭 또는 속성 패널에서 내용 수정
- **속성 변경**: 좌측 속성 패널 (채우기, 선, 불투명도, 패턴 등)

## 파일

| 작업 | 형식 |
|------|------|
| 저장 / 열기 | `.svg` |
| 이미지 내보내기 | PNG, JPEG, GIF, WebP, AVIF |

- SVG 저장 시 배경, 도형, 텍스트, **내장 이미지**가 포함됩니다.
- **정렬 격자**와 **페이지 테두리**는 편집 화면에만 표시되며, SVG 저장·이미지 내보내기에는 포함되지 않습니다.

## 단축키 / 조작

- **Ctrl + 휠**: 확대 / 축소
- **Delete**: 선택 항목 삭제
- **Ctrl + A**: 전체 선택
- **우클릭**: 선택 컨텍스트 메뉴 (삭제, 전체 선택, 선택 해제)

## SVG 소스

- 우측 패널에서 SVG XML을 직접 편집할 수 있습니다.
- **적용** 버튼(또는 메뉴)으로 캔버스에 반영합니다.
- **복사**로 클립보드에 SVG 전체를 복사할 수 있습니다.

## 프로젝트 구조

```
SVGEditorWinV10/
├── Assets/           # 앱 아이콘
├── Controls/         # SvgCanvas 등 사용자 컨트롤
├── Export/           # 이미지 내보내기
├── Models/           # 문서·요소 모델
├── Rendering/        # SVG/캔버스 렌더링
├── Serialization/    # SVG 읽기·쓰기
└── Ui/               # 테마, 아이콘, 다이얼로그
```

## 의존성

- [SixLabors.ImageSharp](https://github.com/SixLabors/ImageSharp) — 이미지 처리
- [NeoSolve.ImageSharp.AVIF](https://github.com/Spacefish/NeoSolve.ImageSharp.AVIF) — AVIF 내보내기

## 라이선스

이 프로젝트는 TestSimulator 저장소의 일부입니다. 저장소 루트의 라이선스 정책을 따릅니다.
