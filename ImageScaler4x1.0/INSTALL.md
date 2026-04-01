# ImageScaler4x — 설치·배포 가이드

개발 환경 준비, NuGet 패키지 복원, **포터블(자체 포함) 빌드**, **MSI 설치 패키지** 빌드, ONNX 모델 배치를 정리합니다.

---

## 사전 요구 사항

| 항목 | 버전·비고 |
|------|-----------|
| Windows | 10/11 (x64) |
| .NET SDK | 10.0 이상 (개발·`dotnet` CLI 빌드 시) |
| Visual Studio | 2022+ (선택) |

```bash
dotnet --version
```

MSI를 빌드할 때는 **WiX를 별도 설치할 필요 없습니다.** 설치 프로젝트가 NuGet의 `WixToolset.Sdk`를 사용합니다.

---

## NuGet 패키지 (의존성)

| 패키지 | 버전(참고) | 용도 |
|--------|------------|------|
| `OpenCvSharp4` | csproj 기준 | OpenCV .NET 바인딩 |
| `OpenCvSharp4.Extensions` | csproj 기준 | `Mat` ↔ `Bitmap` |
| `Microsoft.ML.OnnxRuntime` | csproj 기준 | ONNX 추론 |
| `OpenCvSharp4.runtime.win` | csproj 기준 | Windows 네이티브 DLL |

### 방법 1 — `dotnet restore` (권장)

```bash
cd ImageScaler4x1.0
dotnet restore
```

### 방법 2 — 패키지 개별 추가

```bash
dotnet add package Microsoft.ML.OnnxRuntime --version 1.24.4
dotnet add package OpenCvSharp4 --version 4.13.0.20260330
dotnet add package OpenCvSharp4.Extensions --version 4.13.0.20260330
dotnet add package OpenCvSharp4.runtime.win --version 4.13.0.20260302
```

### 방법 3 — Visual Studio NuGet 패키지 관리자

프로젝트 우클릭 → **NuGet 패키지 관리** → 찾아보기에서 설치

---

## 개발 빌드 및 실행

```bash
cd ImageScaler4x1.0
dotnet build
dotnet run
```

---

## 포터블(자체 포함) 실행 폴더 만들기

대상 PC에 .NET 런타임을 설치하지 않아도 되도록 **win-x64 자체 포함** 출력을 만듭니다.

```bash
cd ImageScaler4x1.0
dotnet publish -c Release -r win-x64 --self-contained true -o publish/win-x64-standalone
```

- **실행 파일:** `publish/win-x64-standalone/ImageScaler4x1.0.exe`
- **배포:** 해당 **폴더 전체**를 복사합니다. (exe만 복사하면 DLL·런타임이 빠져 실행되지 않습니다.)
- 용량은 런타임·OpenCV·ONNX 런타임 포함으로 크게 나올 수 있습니다.

`publish/` 는 저장소 `.gitignore`에 포함하는 것을 권장합니다.

---

## MSI 설치 패키지 빌드

WiX 기반 설치 프로젝트가 `installer/` 에 있습니다. Release로 빌드하면 자체 포함 publish 결과를 묶은 **`.msi`** 가 생성됩니다.

```bash
cd ImageScaler4x1.0
dotnet build installer/ImageScaler4x1.0.Installer.wixproj -c Release
```

- **산출물:** `installer/bin/Release/ImageScaler4x1.0.Setup.msi`
- 첫 빌드는 publish까지 포함해 시간이 다소 걸릴 수 있습니다.
- 설치 위치(기본): `Program Files\ImageScaler4x1.0`
- **per-machine** 패키지이므로 설치 시 관리자 권한이 필요합니다.
- 버전 업 시 `installer/Package.wxs`의 `Package` **`Version`**(예: `1.0.1.0`)을 올려야 Major Upgrade가 올바르게 동작합니다.

---

## ONNX 모델 파일

앱은 RealESRGAN 계열 **`.onnx`** 모델이 필요합니다.

1. UI 기본값은 `realesrgan.onnx` 입니다. 실행 파일과 같은 폴더에 두거나, **모델 경로**에서 파일을 선택합니다.
2. **모델 다운로드…** 메뉴에서 미리 정의된 모델을 받거나 URL을 지정할 수 있습니다.

선택: 빌드 출력에 모델을 항상 포함하려면 `.csproj`에 다음과 같이 추가할 수 있습니다.

```xml
<ItemGroup>
  <Content Include="realesrgan.onnx">
    <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
  </Content>
</ItemGroup>
```

(파일명·경로는 실제 보유한 모델에 맞게 조정하세요.)

---

## 문제 해결

| 증상 | 가능한 원인 |
|------|-------------|
| OpenCvSharp `NativeMethods` / `DllNotFoundException` | `OpenCvSharp4.runtime.win` 미복원·누락 |
| ONNX 로드 실패 | 모델 경로 오류, 손상된 파일, 입력 크기 불일치 |
| MSI 빌드 오류 | SDK·RID 복원 문제 → `dotnet restore` 후 재시도 |

---

## 이전 문서 이름

이 파일은 예전 **`INSTALL.md`** 를 대체합니다. 링크는 **`Install.md`** 를 사용하세요.
