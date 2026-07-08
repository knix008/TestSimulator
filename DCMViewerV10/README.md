# DCMViewerV10

Windows용 DICOM 및 일반 이미지 뷰어입니다. C# Windows Forms와 [fo-dicom](https://github.com/fo-dicom/fo-dicom)으로 작성되었습니다.

## 지원 형식

| 구분 | 확장자 |
|------|--------|
| DICOM | `.dcm`, `.dicm` |
| 이미지 | `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.tif`, `.tiff`, `.ico` |

> `.ico` 파일은 **보기 전용**입니다. 내보내기 대상 형식에는 포함되지 않습니다.

## 주요 기능

- DICOM / 이미지 단일 파일 열기, 확대·축소·패닝
- 좌측 **폴더 트리** 탐색 (한 번 클릭 미리보기, 하위/상위 폴더 이동)
- DICOM 메타데이터 및 일반 이미지 정보 표시
- PNG / JPEG / BMP / TIFF / GIF 내보내기
- 폴더 단위 DCM **일괄 변환** (출력: `converted_{형식}` 하위 폴더)
- `.dcm` Windows 파일 연결 및 기본 프로그램 등록
- 마지막 작업 폴더 기억 (`%LocalAppData%\DCMViewer\last_directory.txt`)

## 개발 환경

- Visual Studio 2022 이상 (Windows Forms Designer 지원)
- .NET 8 SDK (`net8.0-windows`, `win-x64`)

## 빌드 및 실행

```powershell
cd DCMViewer
dotnet build
dotnet run
```

실행 중인 `DCMViewer.exe`가 있으면 빌드 복사 단계가 실패할 수 있습니다. 앱을 종료한 뒤 다시 빌드하세요.

## Release 빌드 및 MSI 생성

Release 구성으로 빌드하면 publish 후 WiX로 MSI가 자동 생성됩니다.

```powershell
cd DCMViewer
dotnet build -c Release
```

결과 경로:

| 산출물 | 경로 |
|--------|------|
| publish 출력 | `DCMViewer/bin/Release/net8.0-windows/win-x64/publish` |
| MSI 설치 파일 | `DCMViewer.Installer/bin/x64/Release/DCMViewer.Installer.msi` |

MSI 설치 시 **사용자 정의** 단계에서 다음 항목을 선택할 수 있습니다 (기본값: 모두 선택).

- **시작 메뉴 바로 가기** ? 시작 메뉴에 DCMViewer 링크 생성
- **바탕 화면 바로 가기** ? 바탕 화면에 DCMViewer 링크 생성
- **.dcm 기본 프로그램 등록** ? `.dcm` 파일 연결 및 Windows 기본 프로그램 설정

## 아이콘 (Assets)

| 파일 | 용도 |
|------|------|
| `DCMViewer/Assets/AppIcon.ico` | 실행 파일 및 창 아이콘 |
| `DCMViewer/Assets/DcmFile.ico` | `.dcm` 파일 형식 아이콘 (탐색기·파일 연결) |

아이콘 재생성:

```powershell
cd DCMViewer
./Assets/GenerateIcons.ps1
```

## .dcm 파일 연결

앱 또는 MSI 설치 시 **.dcm 기본 프로그램 등록**을 선택하면 탐색기에서 `.dcm` 파일을 DCMViewer로 열 수 있습니다.

- 명령줄: `DCMViewer.exe "경로\파일.dcm"`
- 메뉴: **파일 → DCM 기본 프로그램으로 등록**

## 샘플 DICOM 다운로드

테스트용 DICOM 파일을 `samples` 폴더에 받을 수 있습니다.

```powershell
$dest = "samples"
New-Item -ItemType Directory -Path $dest -Force | Out-Null

$files = @(
    @{ Name = "CT_small.dcm";         Url = "https://github.com/pydicom/pydicom/raw/main/src/pydicom/data/test_files/CT_small.dcm" },
    @{ Name = "MR_small.dcm";         Url = "https://github.com/pydicom/pydicom/raw/main/src/pydicom/data/test_files/MR_small.dcm" },
    @{ Name = "SC_rgb_small_odd.dcm"; Url = "https://github.com/pydicom/pydicom/raw/main/src/pydicom/data/test_files/SC_rgb_small_odd.dcm" },
    @{ Name = "JPEG2000.dcm";         Url = "https://github.com/pydicom/pydicom/raw/main/src/pydicom/data/test_files/JPEG2000.dcm" },
    @{ Name = "MR000000.dcm";         Url = "https://github.com/dangom/sample-dicom/raw/master/MR000000.dcm" }
)

foreach ($f in $files) {
    Invoke-WebRequest -Uri $f.Url -OutFile (Join-Path $dest $f.Name)
}

Get-ChildItem $dest -Filter "*.dcm"
```

### 참고

- 위 URL은 변경될 수 있으며, 404가 나면 다른 샘플 DICOM을 사용하세요.
- JPEG / JPEG2000 등 압축 DICOM은 `fo-dicom.Codecs`와 Visual C++ 재배포 패키지가 필요할 수 있습니다.

## 프로젝트 구조

```
DCMViewerV10/
├── DCMViewer/              # 메인 WinForms 앱
├── DCMViewer.Installer/    # WiX MSI 설치 프로젝트
├── samples/                # 테스트용 DICOM (선택)
├── README.md
└── UsersGuide.md           # 사용자 가이드
```

## 문서

- [UsersGuide.md](UsersGuide.md) ? 기능별 사용 방법
- [DCMViewer/Assets/README.md](DCMViewer/Assets/README.md) ? 아이콘 리소스

## 저작권

Copyright ? 2026 SHKWON (knix008@naver.com)
