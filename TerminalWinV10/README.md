# TerminalWinV10

C# WinForms 기반의 시리얼/TCP 터미널 프로그램입니다.

## 주요 기능

- **시리얼(Serial) 연결**: COM 포트 및 baudrate 선택
- **TCP/IP 연결**: IP 주소와 포트 입력, SSL/TLS 옵션 지원
- **연결 프로필 관리**: 자주 사용하는 연결 설정을 저장/불러오기/삭제
- **실시간 수신**: 수신 데이터를 터미널 화면에 실시간 출력

## 요구 사항

- Windows 10/11
- [.NET 8 Runtime](https://dotnet.microsoft.com/download/dotnet/8.0)
- Visual Studio 2022 이상 (개발 시)

## 빌드 및 실행

```bash
dotnet build
dotnet run --project TerminalWinV10
```

## 사용법

1. 연결 방식(Serial / TCP/IP)을 선택합니다.
2. **Serial**: COM 포트와 baudrate를 선택합니다.
3. **TCP/IP**: IP 주소, 포트를 입력합니다. SSL/TLS가 필요하면 체크합니다.
4. **Connect** 버튼으로 연결, **Disconnect** 버튼으로 해제합니다.
5. 수신 데이터는 터미널 화면에 자동 출력됩니다.
6. **Save** 버튼으로 현재 설정을 프로필로 저장하고, 드롭다운에서 불러올 수 있습니다.

## 프로젝트 구조

```
TerminalWinV10/
├── MainForm.cs           # 메인 폼 로직 (연결, 수신, UI 이벤트)
├── MainForm.Designer.cs  # 폼 레이아웃 (디자이너 생성)
├── ProfileManager.cs     # 연결 프로필 저장/로드 (profiles.json)
└── Program.cs            # 진입점
```

프로필은 실행 파일과 같은 경로의 `profiles.json`에 저장됩니다.
