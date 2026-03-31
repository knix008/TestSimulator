# ImageScaler4x 패키지 설치 가이드

## 사전 요구 사항

| 항목 | 버전 |
|------|------|
| .NET SDK | 10.0 이상 |
| Windows | Windows 10/11 (WinForms 앱) |
| Visual Studio | 2022 이상 (선택 사항) |

.NET SDK 설치 여부 확인:
```bash
dotnet --version
```

---

## 의존 패키지 목록

| 패키지 | 버전 | 용도 |
|--------|------|------|
| `OpenCvSharp4` | 4.13.0.20260330 | OpenCV .NET 바인딩 (이미지 처리) |
| `OpenCvSharp4.Extensions` | 4.13.0.20260330 | `Mat` ↔ `Bitmap` 변환 유틸리티 |
| `Microsoft.ML.OnnxRuntime` | 1.24.4 | ONNX 모델 추론 런타임 |

---

## 설치 방법

### 방법 1 — `dotnet restore` (권장)

`.csproj` 파일에 패키지가 이미 정의되어 있으므로, 프로젝트 루트에서 아래 명령어 하나로 모든 패키지를 설치할 수 있습니다.

```bash
cd ImageScaler4x1.0
dotnet restore
```

빌드 시에는 restore가 자동으로 실행됩니다:

```bash
dotnet build
```

---

### 방법 2 — `dotnet add package` (개별 설치)

패키지를 개별적으로 추가하거나 버전을 변경할 때 사용합니다.

```bash
dotnet add package OpenCvSharp4 --version 4.13.0.20260330
dotnet add package OpenCvSharp4.Extensions --version 4.13.0.20260330
dotnet add package Microsoft.ML.OnnxRuntime --version 1.24.4
```

---

### 방법 3 — Visual Studio NuGet 패키지 관리자

1. 솔루션 탐색기에서 프로젝트 우클릭 → **NuGet 패키지 관리**
2. **찾아보기** 탭에서 각 패키지 이름 검색
3. 버전을 선택한 후 **설치** 클릭

---

## OpenCV 런타임 DLL 설치

`OpenCvSharp4`는 네이티브 OpenCV DLL이 별도로 필요합니다.
Windows에서는 아래 런타임 패키지를 추가로 설치해야 합니다.

```bash
dotnet add package OpenCvSharp4.runtime.win --version 4.13.0.20260330
```

> 이 패키지가 없으면 런타임에 `DllNotFoundException`이 발생합니다.

---

## ONNX 모델 파일 배치

앱 실행 시 슈퍼 해상도 모델 파일이 필요합니다.

1. `super_resolution.onnx` 파일을 준비합니다.
2. 빌드 출력 디렉터리에 복사합니다:
   ```
   bin\Debug\net10.0-windows\super_resolution.onnx
   ```

`.csproj`에 아래 설정을 추가하면 빌드 시 자동으로 복사됩니다:

```xml
<ItemGroup>
  <Content Include="super_resolution.onnx">
    <CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>
  </Content>
</ItemGroup>
```

---

## 전체 빌드 및 실행

```bash
dotnet restore
dotnet build
dotnet run
```
