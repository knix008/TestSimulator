# ImageViewerV30

Windows용 **WinForms** 이미지·동영상 **뷰어**와 **이미지 편집기**입니다.  
C# / .NET 8 (`net8.0-windows`)로 작성되었으며, Visual Studio 디자이너에서 UI를 편집할 수 있습니다.

---

## 주요 기능

### 뷰어 (메인 창)
- 폴더 선택 및 마지막 사용 폴더 자동 복원 (`appstate.json`)
- 폴더 트리(`TreeView`) 탐색
- 미리보기 가능한 파일만 목록 표시 (`ListView`)
- 폴더 선택 시 썸네일 갤러리 표시 (비동기 로딩)
- 파일 선택 시 상세 미리보기
  - **이미지**: 마우스 휠 확대/축소, 드래그 패닝, 해상도·줌 비율 상태 표시
  - **동영상**: 재생 / 일시정지 / 정지, 커스텀 시크바 (`MediaSeekBar`)
  - **HEIF/HEIC/HIF**: WIC(WPF) 코덱을 통한 인메모리 디코딩
- 파일·폴더 복사·잘라내기·붙여넣기·삭제 (탐색기 클립보드 연동)
- 이미지 형식 변환 (JPEG · PNG · BMP · TIFF · WebP · GIF)
- 이미지 회전(90° CW/CCW) · 좌우 뒤집기
- 밝은(light) UI 테마

### 이미지 편집기 (✏ 편집)
이미지 미리보기 상태에서 **✏ 편집**을 누르면 전용 편집 창이 열립니다. 창 아이콘은 `daemon_hammer.ico`를 사용합니다.

| 탭 | 기능 |
|---|---|
| **색상 조정** | 밝기 · 대비 · 채도 · 색조 · 감마 · 색온도 (슬라이더 실시간 미리보기, 적용/초기화) |
| **효과** | 흑백 · 세피아 · 반전 · 비네트 · 엣지 등 즉시 적용 / 가우시안 · 선명 · 픽셀화 · 유화 등 강도 조절 |
| **변환** | 크기 조정(비율 잠금) · 회전 · 뒤집기 · 자르기 |
| **배경 제거** | AI(rembg ONNX) · 스포이드 색상 선택 · 색상 대치 / 플러드 필 |

**편집기 기타**
- 실행 취소 / 다시 실행 (최대 20단계)
- **저장**: 원본 파일 덮어쓰기 전 확인 대화상자
- **다른 이름으로 저장**: PNG · JPEG · WebP · BMP · GIF
- 저장 후 메인 창 **파일 목록 자동 갱신**
- 확대/축소: 메인 창과 동일하게 `PictureBox` 크기 조절 + `StretchImage` (빠른 줌)
- 하단 **상태바**: 경로 · 파일 정보 · 해상도/미저장 · 줌/표시 크기 · 작업 메시지

---

## AI 배경 제거 (rembg ONNX)

편집기 **배경** 탭에서 모델을 선택할 수 있습니다. 로컬에 ONNX가 없으면 GitHub에서 **자동 다운로드**합니다.

| 모델 | 파일 | 비고 |
|------|------|------|
| **u2net** (기본) | `u2net.onnx` | 권장 (~176MB, 320×320) |
| RMBG 2.0 | `bria-rmbg-2.0.onnx` | 고품질 (~1GB, 1024×1024) |

- 설치·캐시 경로: `%LocalAppData%\ImageViewerV30\models\` (MSI 설치 후에도 쓰기 가능)
- 수동 설치·checksum 검증: [`models/README.txt`](models/README.txt)
- 공식 프로젝트: [danielgatis/rembg](https://github.com/danielgatis/rembg)

> ONNX 모델은 용량이 크므로 Git에는 포함하지 않습니다. `.gitignore`에 등록되어 있습니다.

---

## 지원 파일 형식

### 이미지
`PNG` `JPG/JPEG` `GIF` `BMP` `TIFF/TIF` `ICO` `WebP` `HEIF/HEIC` `HIF`

### 동영상
`MP4` `MKV` `AVI` `MOV` `WMV` `WebM` `M4V` `MPEG/MPG` `TS` `M2TS` `FLV`

---

## 기술 스택

| 구성 요소 | 용도 |
|---|---|
| .NET 8 + Windows Forms (+ WPF, HEIF 디코딩) | 앱 프레임워크 |
| [LibVLCSharp.WinForms](https://www.nuget.org/packages/LibVLCSharp.WinForms) | 동영상 재생 |
| [VideoLAN.LibVLC.Windows](https://www.nuget.org/packages/VideoLAN.LibVLC.Windows) | VLC 네이티브 |
| [SixLabors.ImageSharp](https://www.nuget.org/packages/SixLabors.ImageSharp) | 이미지 처리·저장 |
| [Microsoft.ML.OnnxRuntime](https://www.nuget.org/packages/Microsoft.ML.OnnxRuntime) | rembg ONNX 추론 |

---

## 실행 방법

### Visual Studio
1. `ImageViewerV30.sln` 열기
2. NuGet 복원
3. `F5` 또는 `Ctrl+F5` 실행

### CLI

```powershell
cd ImageViewerV30
dotnet restore
dotnet run --project .\ImageViewerV30.csproj
```

Release 빌드:

```powershell
dotnet build -c Release
.\bin\Release\net8.0-windows\ImageViewerV30.exe
```

Release 빌드 시 WiX MSI가 함께 생성됩니다 (`GenerateMsiOnBuild`).

**MSI 크기**: x64 Windows 전용으로 빌드하도록 설정되어 있습니다 (`RuntimeIdentifier=win-x64`, LibVLC x64만 포함).  
이전 AnyCPU 설정에서는 x86/ARM64 LibVLC와 Android/iOS 등 ONNX 런타임까지 복사되어 설치 폴더가 **450MB+**, MSI가 **200MB+**가 될 수 있었습니다.  
현재는 앱 출력이 약 **116MB** 수준이며, MSI는 보통 **100MB 안쪽**(압축·구성에 따라 다름)입니다.  
`models\*.onnx`를 빌드 전에 `models` 폴더에 넣으면 MSI에 포함되므로, 배포 시에는 **모델은 첫 실행 시 자동 다운로드**를 권장합니다.

---

## 프로젝트 구조

```
ImageViewerV30/
├── Program.cs                      # 진입점
├── MainForm.cs / .Designer.cs      # 뷰어 UI·로직
├── MainForm.resx
├── ImageEditorForm.cs / .Designer.cs  # 편집기
├── MediaSeekBar.cs                 # 동영상 시크바
├── UiTheme.cs                      # 밝은 UI 테마
├── RembgModelInfo.cs               # rembg 모델 정의
├── DownloadRembgModel.cs           # 모델 다운로드·검증
├── RembgSegmentationService.cs     # ONNX 추론
├── RembgBackgroundRemover.cs       # 배경 제거 파이프라인
├── models/
│   └── README.txt                  # ONNX 수동 설치 안내 (*.onnx는 git 제외)
├── assets/icons/                   # 파일 형식별 아이콘 PNG
├── daemon_hammer.ico               # 앱·편집기 아이콘
├── ImageViewerV30.csproj
├── ImageViewerV30.sln
├── ImageViewerV30.Installer/       # WiX MSI
├── README.md
└── .gitignore
```

---

## 요구 사항

- **OS**: Windows 10 / 11
- **런타임**: [.NET 8 Desktop Runtime](https://dotnet.microsoft.com/download/dotnet/8.0)
- **HEIF 열람**: [HEIF Image Extensions](https://apps.microsoft.com/detail/9pmmsr1cgpwg) (Microsoft Store, 무료)
- **AI 배경 제거**: 인터넷 연결(최초 모델 다운로드 시), 디스크 여유 공간(u2net ~176MB, RMBG 2.0 ~1GB)

---

## 라이선스·서드파티

- rembg 모델·알고리즘: [rembg](https://github.com/danielgatis/rembg) (사용 시 해당 라이선스 준수)
- LibVLC: [VideoLAN](https://www.videolan.org/)
