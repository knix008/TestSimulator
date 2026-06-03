# CodeAnalyzer MSI Setup Project

이 프로젝트는 WiX Toolset v5 SDK를 사용해 `CodeAnalyzer` WinForms 앱의 MSI 설치 파일을 생성합니다.

## 빌드 방법

- Visual Studio: `CodeAnalyzer.sln`을 연 뒤 `Release`로 **CodeAnalyzer** 프로젝트 빌드 (MSI 자동 생성)
- 명령줄:

```powershell
dotnet build ..\CodeAnalyzer.sln -c Release
```

MSI 경로: `CodeAnalyzer.Setup\bin\Release\CodeAnalyzer.Setup.msi`

설치 시 **기능 선택** 화면에서 다음을 체크/해제할 수 있습니다.

- 바탕 화면 바로 가기 만들기
- 시작 메뉴 바로 가기 만들기

`Assets\AppIcon.ico`가 프로그램 추가/제거, 바로 가기 아이콘에 사용됩니다.
