# CodeAnalyzer MSI Setup Project

이 프로젝트는 WiX Toolset v5 SDK를 사용해 `CodeAnalyzer` WinForms 앱의 MSI 설치 파일을 생성합니다.

## 빌드 방법

- Visual Studio에서 솔루션을 `Release`로 선택한 뒤 빌드
- 또는 명령줄:

```powershell
dotnet build .\CodeAnalyzer.sln -c Release
```

MSI 결과물은 보통 다음 경로에 생성됩니다.

- `CodeAnalyzer.Setup\bin\Release\CodeAnalyzer.Setup.msi`
