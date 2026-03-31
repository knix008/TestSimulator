# ImageScaler4x1.0

WinForms 기반 이미지 업스케일러입니다. OpenCvSharp와 ONNX Runtime을 사용합니다.

## 사전 요구 사항

- Windows 10/11
- .NET SDK 10.0 이상

버전 확인:

```bash
dotnet --version
```

## 의존 패키지

이 프로젝트는 아래 NuGet 패키지에 의존합니다.

- `Microsoft.ML.OnnxRuntime` `1.24.4`
- `OpenCvSharp4` `4.13.0.20260330`
- `OpenCvSharp4.Extensions` `4.13.0.20260330`
- `OpenCvSharp4.runtime.win` `4.13.0.20260302`

> `OpenCvSharp4.runtime.win`이 없으면 실행 중  
> `The type initializer for OpenCvSharp.NativeMethods threw an exception`  
> 오류가 발생할 수 있습니다.

## 설치 방법

프로젝트 루트(`ImageScaler4x1.0`)에서:

```bash
dotnet restore
```

또는 개별 설치:

```bash
dotnet add package Microsoft.ML.OnnxRuntime --version 1.24.4
dotnet add package OpenCvSharp4 --version 4.13.0.20260330
dotnet add package OpenCvSharp4.Extensions --version 4.13.0.20260330
dotnet add package OpenCvSharp4.runtime.win --version 4.13.0.20260302
```

## 빌드/실행

```bash
dotnet build
dotnet run
```

## 참고

- 프로젝트는 `x64` 타깃으로 설정되어 있습니다.
- 실행 중인 앱이 있으면 DLL 잠금으로 빌드가 실패할 수 있으니, 빌드 전 앱을 종료하세요.
