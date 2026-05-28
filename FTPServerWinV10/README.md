# FTPServerWinV10

C# WinForms 기반의 Windows용 FTP/FTPS 서버

## 주요 기능
- 공개 디렉토리 선택
- 익명 접속 및 사용자 인증 지원
- FTP (포트 21) / FTPS/SSL (포트 990) 지원
- PASV(Passive) 모드 데이터 전송
- 접속 중인 클라이언트 수 표시
- 업로드/다운로드 파일 수 및 용량 통계
- 실시간 로그 (화면 + 파일 저장)
- F5: 설정 저장, F6: 설정 불러오기
- 버퍼 크기 및 최대 스레드 수 조절
- WinForms GUI (.NET 8, Windows)

## 요구 사항
- .NET 8 SDK
- Windows OS

## 빌드 및 실행
1. Visual Studio 2022 이상 또는 `dotnet` CLI를 사용합니다.
2. NuGet 패키지 복원 (SSH.NET)
3. 빌드 후 실행

```bash
dotnet build
dotnet run
```

## 설정 파일
- `server_settings.json`: 서버 설정 자동 저장 (F5) / 불러오기 (F6)
- `ftpserver.log`: 서버 로그 파일 (실행 파일과 같은 폴더)

## 라이선스
MIT License
