# EasyMD 마크다운 편집기

이 문서는 **EasyMD**의 미리보기·문서 구조·서식 기능을 한 번에 확인할 수 있는 *복합 예제*입니다.
왼쪽에서 편집하면 오른쪽에 즉시 반영되며, ~~삭제된 문구~~와 `인라인 코드`도 지원합니다.

> **참고:** 문서 구조 사이드바에는 **H1~H3**만 표시됩니다.
> 아래 `####` 이하 제목은 미리보기에만 나타납니다.

## 시작하기

### 설치 요구 사항

1. Windows 10 이상
2. [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0)
3. [WebView2 런타임](https://developer.microsoft.com/microsoft-edge/webview2/)

#### 선택 구성 요소 (사이드바에 표시 안 됨)

- 한글 폰트 권장: `Segoe UI`, `Malgun Gothic`
- 고해상도 디스플레이에서 UI 배율 100~150% 권장

### 빠른 실행

```powershell
cd EasyMDV10
dotnet run
```

---

## 편집 기능

### 텍스트 서식

| 기능 | 단축/버튼 | 예시 |
| --- | --- | --- |
| 굵게 | 툴바 **B** | **중요** |
| 기울임 | 툴바 *I* | *강조* |
| 취소선 | 툴바 S̶ | ~~초안~~ |
| 코드 | 툴바 `` ` `` | `var x = 1;` |

### 목록과 인용

- 프로젝트 관리
  - 새 파일 (`Ctrl+N`)
  - 열기 / 저장
- 미리보기
  - 실시간 HTML 렌더링
  - 제목 클릭 시 해당 위치로 이동

> 인용문 1단계
>
> > 인용문 2단계 — 릴리스 노트나 주의 사항에 적합합니다.

### 링크와 이미지

공식 문서는 [Markdig](https://github.com/xoofx/markdig)를 참고하세요.

![대체 텍스트](https://via.placeholder.com/320x120.png?text=EasyMD+Preview)

## 코드 예제

### C# — 파일 저장

```csharp
using System.Text;

public static void SaveMarkdown(string path, string content)
{
    ArgumentException.ThrowIfNullOrEmpty(path);
    File.WriteAllText(path, content, Encoding.UTF8);
}
```

### JSON — 설정 스니펫

```json
{
  "editor": {
    "fontFamily": "Consolas",
    "fontSize": 11,
    "wordWrap": true
  },
  "preview": {
    "debounceMs": 300
  }
}
```

## 문서 구조 데모

### 1장. 개요

이 절은 사이드바 **1단계(H1)** 아래 **3단계(H3)** 까지 중첩됩니다.

### 2장. 본문

#### 2.1 세부 절 (H4 — 사이드바 미표시)

H4 이하 제목은 트리에 나오지 않지만, 미리보기와 스크롤 동기화에는 포함됩니다.

##### 2.1.1 더 깊은 제목 (H5)

###### 2.1.1.1 가장 깊은 제목 (H6)

---

## 체크리스트

| 항목 | 상태 | 비고 |
| --- | :---: | --- |
| 실시간 미리보기 | ✅ | WebView2 |
| 문서 구조 (H1~H3) | ✅ | TreeView |
| MSI 설치 패키지 | ✅ | WiX |
| PDF보내기 | ⬜ | 계획 중 |

***

*마지막 업데이트: 2026-05-23 · EasyMD 샘플 문서*
