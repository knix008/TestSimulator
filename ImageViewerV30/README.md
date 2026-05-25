# ImageViewerV30

WinForms 기반 이미지/동영상 **뷰어 + 편집기** 프로젝트입니다.  
C# (.NET 8, Windows)로 작성되었으며, Visual Studio 디자이너에서 GUI를 편집할 수 있도록 구성되어 있습니다.

---

## 주요 기능

### 뷰어
- 폴더 선택 및 마지막 사용 폴더 자동 복원
- 폴더 트리(`TreeView`) 탐색
- 미리보기 가능한 파일만 목록 표시 (`ListView`)
- 폴더 선택 시 썸네일 갤러리 표시 (비동기 로딩)
- 파일 선택 시 상세 미리보기
  - **이미지**: 마우스 휠 확대/축소, 비율·해상도 표시, 드래그 패닝
  - **동영상**: 재생/일시정지/정지, 커스텀 시크바
  - **HEIF/HIF**: WIC 코덱을 통한 인메모리 디코딩
- 파일/폴더 복사·잘라내기·붙여넣기·삭제 (탐색기와 클립보드 공유)
- 이미지 형식 변환 (JPEG · PNG · BMP · TIFF · WebP · GIF)
- 이미지 회전(90° CW/CCW) · 좌우 뒤집기

### 이미지 편집기 (✏ 편집 버튼)
이미지 미리보기 상태에서 **✏ 편집** 버튼을 클릭하면 전용 편집 창이 열립니다.

| 탭 | 기능 |
|---|---|
| **색상 조정** | 밝기 · 대비 · 채도 · 색조 · 감마 · 색온도 슬라이더 (실시간 미리보기, 적용/초기화) |
| **효과** | 흑백 · 세피아 · 색 반전 · 비네트 · 엣지 검출 (즉시 적용) / 가우시안 흐림 · 선명하게 · 픽셀화 · 유화 효과 (강도 조절 후 적용) |
| **변환** | 크기 조정 (비율 잠금) · 회전 (90° 프리셋 및 임의 각도) · 좌우/상하 뒤집기 · 자르기 |
| **배경 제거** | 스포이드로 색상 선택, 허용 범위 조절, 전역 색상 대치 / 플러드 필 방식 |

- 실행 취소 (최대 20단계) / 다시 실행
- 원본으로 전체 초기화
- 저장 / 다른 이름으로 저장 (PNG · JPEG · WebP · BMP · GIF)
- 줌 인/아웃/맞춤/1:1

---

## 지원 파일 형식

### 이미지
`PNG` `JPG/JPEG` `GIF` `BMP` `TIFF/TIF` `ICO` `WebP` `HEIF/HEIC` `HIF`

### 동영상
`MP4` `MKV` `AVI` `MOV` `WMV` `WebM` `M4V` `MPEG/MPG` `TS` `M2TS` `FLV`

---

## 기술 스택

| 라이브러리 | 용도 |
|---|---|
| .NET 8 (`net8.0-windows`) + Windows Forms | 앱 프레임워크 |
| [LibVLCSharp.WinForms](https://www.nuget.org/packages/LibVLCSharp.WinForms) | 동영상 재생 |
| [VideoLAN.LibVLC.Windows](https://www.nuget.org/packages/VideoLAN.LibVLC.Windows) | VLC 네이티브 라이브러리 |
| [SixLabors.ImageSharp](https://www.nuget.org/packages/SixLabors.ImageSharp) | 이미지 처리 (편집 효과, WebP 변환, HEIF 디코딩) |

---

## 실행 방법

### Visual Studio
1. `ImageViewerV30.sln` 열기
2. NuGet 복원 완료 확인
3. `F5` 또는 `Ctrl+F5`로 실행

### CLI

```powershell
dotnet restore
dotnet run --project .\ImageViewerV30.csproj
```

Release 빌드:

```powershell
dotnet build -c Release
.\bin\Release\net8.0-windows\ImageViewerV30.exe
```

---

## 프로젝트 구조

```
ImageViewerV30/
├── Program.cs                      # 앱 진입점
├── MainForm.cs                     # 뷰어 동작 로직
├── MainForm.Designer.cs            # 뷰어 UI 레이아웃
├── MainForm.resx                   # 폼 리소스
├── MediaSeekBar.cs                 # 커스텀 동영상 시크바 컨트롤
├── ImageEditorForm.cs              # 이미지 편집기 로직
├── ImageEditorForm.Designer.cs     # 이미지 편집기 UI 레이아웃
├── assets/icons/                   # 파일 형식별 아이콘 PNG
├── ImageViewerV30.csproj
├── ImageViewerV30.sln
└── ImageViewerV30.Installer/       # WiX MSI 인스톨러 프로젝트
```

---

## 요구 사항

- Windows 10 / 11
- .NET 8 Runtime (또는 SDK)
- HEIF 파일 열람 시: [HEIF Image Extensions](https://apps.microsoft.com/detail/9pmmsr1cgpwg) (Microsoft Store, 무료)
