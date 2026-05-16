# ImageViewerV10

WinForms 기반 이미지/동영상 뷰어 예제 프로젝트입니다.  
C#(.NET 8, Windows)로 작성되었고, Visual Studio 디자이너에서 GUI를 편집할 수 있도록 구성되어 있습니다.

## 주요 기능

- 폴더 선택 및 마지막 사용 폴더 자동 복원
- 폴더 트리(`TreeView`) 탐색
- 미리보기 가능한 파일만 목록 표시 (`ListView`)
- 폴더 선택 시 썸네일 갤러리 표시
- 파일 선택 시 상세 미리보기
  - 이미지: 마우스 휠 확대/축소, 좌측 상단 배율/비율 표시, 확대 시 자동 스크롤, 드래그 패닝
  - 동영상: 재생/일시정지/정지 아이콘 버튼, 시크바를 통한 탐색
- **HEIF/HIF 파일 지원**
  - `.heif`, `.heic`, `.hif` 확장자 자동 인식
  - 자동 JPG 변환 및 저장 (최초 열람 시)
  - 이미 변환된 파일 재사용 (중복 변환 방지)

## 지원 파일 형식

### 이미지
- PNG, JPG/JPEG, GIF, BMP
- TIFF/TIF, ICO, WebP
- **HEIF/HEIC, HIF** (자동 JPG 변환)

### 동영상
- MP4, MKV, AVI, MOV, WMV
- WebM, M4V, MPEG/MPG
- TS, M2TS, FLV

## 기술 스택

- .NET 8 (`net8.0-windows`)
- Windows Forms
- [LibVLCSharp.WinForms](https://www.nuget.org/packages/LibVLCSharp.WinForms) - 동영상 재생
- [VideoLAN.LibVLC.Windows](https://www.nuget.org/packages/VideoLAN.LibVLC.Windows) - VLC 네이티브 라이브러리
- [SixLabors.ImageSharp](https://www.nuget.org/packages/SixLabors.ImageSharp) - HEIF/HIF 이미지 디코딩

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

또는 Release 빌드 후 실행:

```powershell
dotnet build -c Release
.\bin\Release\net8.0-windows\ImageViewerV10.exe
```

## 프로젝트 구조

- `Program.cs` : 앱 진입점
- `MainForm.Designer.cs` : 디자이너 UI 구성
- `MainForm.cs` : 동작 로직 (폴더/트리/썸네일/미리보기/저장 상태/HEIF 변환)
- `MainForm.resx` : 폼 리소스
- `MediaSeekBar.cs` : 커스텀 동영상 시크바 컨트롤

## HEIF/HIF 변환 동작

HEIF, HEIC, HIF 파일을 열면:
1. 같은 위치에 `.jpg` 확장자로 변환된 파일이 있는지 확인
2. 없으면 ImageSharp으로 디코딩하여 JPG로 변환 및 저장
3. 있으면 기존 JPG 파일을 그대로 사용

예: `photo.heif` → `photo.jpg` 자동 생성

## 요구 사항

- Windows 10/11
- .NET 8 Runtime (또는 SDK)

