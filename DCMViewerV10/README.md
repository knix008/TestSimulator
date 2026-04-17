# DCMViewerV10

C# Windows Forms 기반 이미지 뷰어입니다.

- DICOM (`.dcm`, `.dicm`)
- 일반 이미지 (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.tif`, `.tiff`, `.ico`)

## 개발 환경

- Visual Studio 2026 (Windows Forms Designer 사용 가능)
- .NET 8 (`net8.0-windows`)

## 빌드 및 실행

```powershell
cd DCMViewer
dotnet build
dotnet run
```

## Release + MSI 설치 파일 생성

Release 빌드를 실행하면 자동으로 publish 후 WiX 기반 MSI를 생성합니다.

```powershell
cd DCMViewer
dotnet build -c Release
```

생성 위치:

- 앱 publish 결과물: `DCMViewer/bin/Release/net8.0-windows/win-x64/publish`
- 설치 파일(MSI): `DCMViewer.Installer/bin/x64/Release/DCMViewer.Installer.msi`

## Sample DCM 파일 다운로드 방법

프로젝트 루트에 `samples` 폴더를 만들고, 공개 샘플 DICOM 파일을 다운로드합니다.

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

- 일부 샘플 URL은 시점에 따라 404가 발생할 수 있습니다.
- JPEG/JPEG2000 등 압축 DICOM을 보기 위해 `fo-dicom.Codecs`를 사용합니다.
- 실행 PC에 Visual C++ 재배포 패키지가 필요할 수 있습니다.
