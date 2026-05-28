# VIXface 2.0 시뮬레이터

VIXface 장치 테스트를 위한 Windows Forms 기반 TLS 1.3 시뮬레이터입니다.

## 요구 사항

- Windows 10/11
- .NET 8 SDK

## 실행

```powershell
dotnet run --project VIXfaceSimulator.csproj
```

## 빌드

```powershell
dotnet build VIXfaceSimulator.csproj
```

## 참고

- 시뮬레이터는 `8443` 포트에서 대기합니다.
- 서버 핸드셰이크는 TLS 1.3만 허용합니다.
- 서버 인증서는 실행 시 자체 서명(Self-signed)으로 생성합니다.
