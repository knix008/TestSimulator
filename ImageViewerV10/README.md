# ImageViewerV10

WinForms 기반 이미지/동영상 뷰어 예제 프로젝트입니다.  
C#(.NET 8, Windows)로 작성되었고, Visual Studio 디자이너에서 GUI를 편집할 수 있도록 구성되어 있습니다.

## 주요 기능

- 폴더 선택 및 마지막 사용 폴더 자동 복원
- 폴더 트리(`TreeView`) 탐색
- 미리보기 가능한 파일만 목록 표시 (`ListView`)
- 폴더 선택 시 썸네일 갤러리 표시
- 파일 선택 시 상세 미리보기
  - 이미지: 마우스 휠 확대/축소, 좌측 상단 배율/비율 표시, 확대 시 자동 스크롤
  - 동영상: 재생/일시정지/정지 아이콘 버튼

## 기술 스택

- .NET 8 (`net8.0-windows`)
- Windows Forms
- [LibVLCSharp.WinForms](https://www.nuget.org/packages/LibVLCSharp.WinForms)
- [VideoLAN.LibVLC.Windows](https://www.nuget.org/packages/VideoLAN.LibVLC.Windows)

## 실행 방법

### Visual Studio

1. `ImageViewerV10.sln` 열기
2. NuGet 복원 완료 확인
3. `F5` 또는 `Ctrl+F5`로 실행

### CLI

```powershell
dotnet restore
dotnet run --project .\ImageViewerV10.csproj
```

## 프로젝트 구조

- `Program.cs` : 앱 진입점
- `MainForm.Designer.cs` : 디자이너 UI 구성
- `MainForm.cs` : 동작 로직 (폴더/트리/썸네일/미리보기/저장 상태)
- `MainForm.resx` : 폼 리소스

