# ImageScaler4x1.0

Windows용 WinForms 이미지 업스케일러입니다. OpenCvSharp와 ONNX Runtime(RealESRGAN 계열 `.onnx` 모델)을 사용합니다.

## 사전 요구 사항

- Windows 10/11 (x64)
- 개발·빌드 시: [.NET SDK 10.0](https://dotnet.microsoft.com/download/dotnet/10.0) 이상

```bash
dotnet --version
```

## 의존 패키지 (NuGet)

| 패키지 | 용도 |
|--------|------|
| `Microsoft.ML.OnnxRuntime` | ONNX 추론 |
| `OpenCvSharp4` / `OpenCvSharp4.Extensions` | 이미지 입출력·변환 |
| `OpenCvSharp4.runtime.win` | Windows 네이티브 OpenCV DLL |

> `OpenCvSharp4.runtime.win`이 없으면 실행 시 `NativeMethods` 관련 예외가 날 수 있습니다.

## 개발 빌드·실행

프로젝트 디렉터리(`ImageScaler4x1.0`)에서:

```bash
dotnet restore
dotnet build
dotnet run
```

- 프로젝트는 **x64**로 설정되어 있습니다.
- 실행 중인 앱이 있으면 DLL 잠금으로 빌드가 실패할 수 있으니, 빌드 전에 종료하세요.

## 배포 (요약)

| 방식 | 설명 |
|------|------|
| **포터블(자체 포함)** | .NET 런타임 없이 폴더 복사만으로 실행. `publish/win-x64-standalone` 등에 출력. |
| **MSI 설치 패키지** | WiX로 빌드한 `ImageScaler4x1.0.Setup.msi`. 프로그램 파일에 설치. |

자세한 명령·경로·모델 파일 준비는 **[Install.md](Install.md)** 를 참고하세요.

## ONNX 모델

기본 UI 텍스트는 `realesrgan.onnx`입니다. 앱 폴더에 두거나 **모델 다운로드…** 로 받은 뒤 경로를 지정하면 됩니다.

## 문서

- [Install.md](Install.md) — NuGet 복원, 포터블 publish, MSI 빌드, 모델 배치
