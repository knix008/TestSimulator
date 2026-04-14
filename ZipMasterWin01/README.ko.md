# ZipMasterWin01

Windows용 압축/해제 도구입니다.  
ZIP, TAR.GZ 압축과 분할 압축(.part001...) 및 진행률 표시를 지원합니다.

## 주요 기능

- 파일 또는 폴더 압축
- 압축 형식 선택: `zip`, `tar.gz`
- 분할 압축 사용 여부 선택 및 크기(MB) 지정
- 분할 파일 병합 후 자동 해제
- 압축/해제 진행률(%) 표시
- 완료/실패 알림 표시
- Release 빌드 시 MSI 자동 생성

## 개발 환경

- .NET 8 (`net8.0-windows`)
- Windows Forms
- WiX Toolset v6 (MSI 생성)

## 실행 방법

```bash
dotnet build
dotnet run --project ZipMasterWin01.csproj
```

## Release + MSI 빌드

```bash
dotnet build ZipMasterWin01.csproj -c Release
```

MSI 출력 경로:

- `bin/Release/installer/ZipMasterWin01_Setup.msi`

## 설치 아이콘

MSI 설치 아이콘 및 바로가기 아이콘으로 아래 파일을 사용합니다.

- `daemon_hammer.ico` (프로젝트 루트)
