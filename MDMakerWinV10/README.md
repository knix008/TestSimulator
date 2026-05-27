# MD Maker v1.0

특정 디렉토리 이하의 모든 Markdown 파일을 하나의 파일로 병합하고, 렌더링 미리보기·편집·다양한 형식 내보내기를 제공하는 Windows 데스크톱 앱입니다.

## 요구 사항

- Windows 10/11
- [.NET 10 Runtime](https://dotnet.microsoft.com/download)
- WebView2 Runtime (Windows 11은 기본 내장, Windows 10은 [다운로드](https://developer.microsoft.com/microsoft-edge/webview2/))

## 주요 기능

### 파일 병합
| 기능 | 설명 |
|------|------|
| 소스 디렉토리 선택 | 폴더 탐색 다이얼로그 |
| 하위 폴더 포함 | 재귀 탐색 옵션 |
| 정렬 순서 | 이름 오름/내림차순, 날짜 최신/오래된순, 직접 지정(드래그) |
| 제외 패턴 | 와일드카드(`*`, `?`) 지원, 쉼표 구분 (예: `_draft, temp*`) |
| 파일명 헤더 삽입 | `## 상대경로/파일명.md` 형태로 각 섹션 구분 |
| 개별 파일 체크 | CheckedListBox로 특정 파일 선택/제외 |

### 문서 보기 (DocumentViewForm)
| 기능 | 설명 |
|------|------|
| 문서 구조 | 좌측 트리뷰에 헤딩(H1~H6) 계층 구조 표시 |
| 미리보기 탭 | WebView2로 Markdown → HTML 렌더링 (실시간 스크롤 연동) |
| 편집 탭 | 병합된 MD 파일 직접 편집 (Consolas 폰트) |
| 헤딩 클릭 | 미리보기: 해당 섹션으로 스크롤 / 편집: 해당 줄로 이동 |
| 자동 개요 갱신 | 편집 중 0.8초 후 트리뷰 자동 갱신 |
| 저장 | `저장` 버튼 또는 `Ctrl+S` |
| 닫기 | 미저장 변경 사항 있을 시 저장 여부 확인 |

### 내보내기
| 형식 | 방법 |
|------|------|
| HTML | Markdig으로 변환, UTF-8 저장 |
| Word (.docx) | HTML → AltChunk 방식으로 DOCX 생성 (Word에서 자동 변환) |
| PDF | WebView2 `PrintToPdfAsync` 활용, 배경색 포함 |

## 파일 구조

```
MDMakerWinV10/
├── Program.cs              진입점
├── MainForm.cs             메인 UI (파일 선택 및 병합)
├── MdMerger.cs             파일 탐색·병합 로직
├── MarkdownConverter.cs    HTML/DOCX 변환, 문서 구조 추출
└── DocumentViewForm.cs     문서 뷰어/편집기
```

## 빌드

```bash
dotnet build
dotnet run
```

## 사용 NuGet 패키지

- [Markdig](https://github.com/xoofx/markdig) — Markdown 파싱 및 HTML 변환
- [DocumentFormat.OpenXml](https://github.com/dotnet/Open-XML-SDK) — DOCX 생성
- [Microsoft.Web.WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) — HTML 렌더링 및 PDF 내보내기
