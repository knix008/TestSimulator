# VIXFaceTest

Windows Forms 기반 **VIXface 펌웨어 테스트** 클라이언트입니다.  
[VIXface2.0Simulator](../VIXface2.0Simulator)가 구현한 TLS API만 사용하며, 테스트 결과는 SQLite에 저장하고 CSV로보낼 수 있습니다.

## 요구 사항

- Windows 10 이상
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- Visual Studio 2022 (권장) 또는 `dotnet` CLI
- 테스트 대상: **VIXface2.0Simulator** (또는 동일 프로토콜 장치), 포트 **8443**

## 빠른 시작

1. 시뮬레이터 실행

   ```bash
   cd ../VIXface2.0Simulator
   dotnet run
   ```

2. 테스트 앱 빌드 및 실행

   ```bash
   cd VIXface2.0Test
   dotnet build VIXFaceTest.csproj
   dotnet run --project VIXFaceTest.csproj
   ```

   또는 `VIXFaceTest.sln`을 Visual Studio에서 엽니다.

3. UI에서 IP `127.0.0.1` → **연결** → 테스트 버튼 실행

## 통신 프로토콜

| 항목 | 값 |
|------|-----|
| 전송 | TLS 1.2 / 1.3 (TCP) |
| 포트 | 8443 |
| 연결 순서 | `AT` → `AT+TEST=BEGIN` → AT 명령 또는 JSON |

자세한 명세는 [VIXface2.0Simulator/Protocol.md](../VIXface2.0Simulator/Protocol.md)를 참고하세요.

### 지원 AT 명령

| 명령 | 설명 |
|------|------|
| `AT+VER?` / `AT+TEST=VERSION` | 펌웨어 버전 |
| `AT+SERIAL?` / `AT+SERIAL=<값>` | 시리얼 (1~20자, 영숫자·하이픈) |
| `AT+TEST=DEFAULT` | 기본 테스트 |
| `AT+TEST=BIST` | 자가 진단 |
| `AT+TEST=CAMERA` | 카메라 |
| `AT+TEST=WIFI` | WiFi |
| `AT+TEST=BLE` | Bluetooth |
| `AT+TEST=WIEGAND` | Wiegand |
| `AT+TEST=NFC` | NFC |
| `AT+TEST=LOCK` | Lock |
| `AT+TEST=TAMPER` | Tamper |
| `AT+TEST=NETWORK` | 네트워크 (`UP` 응답) |

### 지원 JSON `action`

| action | 설명 |
|--------|------|
| `getMacAddress` | MAC 및 네트워크 인터페이스 |
| `getSerialNumber` | 시리얼 조회 (AT와 동일 목적) |
| `setSerialNumber` | 시리얼 설정 (AT와 동일 목적) |

## 주요 UI 기능

| 영역 | 기능 |
|------|------|
| 장치 연결 | Ethernet(IP), TLS 연결/해제 |
| 장치 제어 | 시리얼 읽기/쓰기 |
| 장치 테스트 | 펌웨어, MAC(JSON), BIST, DEFAULT, CAMERA, WIFI, BLE, WIEGAND, NFC, LOCK, TAMPER, NETWORK |
| 보고서 | 기간 선택 후 CSV보내기 |
| DB 초기화 | `test_results.db` 전체 삭제 후 스키마 재생성 |

## 테스트 결과 DB

- 파일: 실행 폴더의 `test_results.db` (Git에 포함하지 않음)
- 연결 성공 시 새 세션(행) 생성, 각 테스트마다 해당 컬럼 업데이트
- CSV 컬럼: `ID`, `CREATE_DATE`, `IP_ADDRESS`, `SERIAL`, `VERSION`, `BIST`, `BLE`, `NFC`, `WIEGAND`, `WIFI`, `CAMERA`, `LOCK`, `TAMPER`, `DEFAULT_STATE`, `NETWORK`, `MAC`, `ERROR_MESSAGE`

구 스키마 데이터가 섞여 CSV가 어긋난 경우 **DB 초기화** 후 다시 테스트하세요.

## 프로젝트 구조

```
VIXface2.0Test/
├── APIs/              # AT / JSON 호출
├── Buttons/           # WinForms 이벤트 핸들러 (partial Main)
├── Data/              # TestResultService (SQLite, CSV)
├── Forms/             # 보조 대화상자
├── Utils/             # TlsClient, Logger
├── Main.cs            # 메인 폼 로직
├── VIXFaceTest.csproj
└── VIXFaceTest.sln
```

## 솔루션 참고

`VIXFaceTest.sln`에는 레거시 설치 프로젝트(`VixReaderFirmwareTest`) 참조가 있을 수 있습니다. 테스트 앱만 사용할 때는 **VIXFaceTest** 프로젝트만 빌드하면 됩니다.

## 관련 프로젝트

- [VIXface2.0Simulator](../VIXface2.0Simulator) — TLS 서버 시뮬레이터

## 라이선스

사내/프로젝트 정책에 따릅니다. (Intellivix)
