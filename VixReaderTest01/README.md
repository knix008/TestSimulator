# VixReaderTest01

## 요구사항

- .NET 8.0
- Windows Forms 지원
- C# 12.0 언어 버전

## 설치 및 의존성

### 필수 NuGet 패키지

프로젝트를 빌드하고 실행하기 전에 다음 NuGet 패키지들이 설치되어야 합니다:

- **Microsoft.EntityFrameworkCore** v8.0.0
- **Microsoft.EntityFrameworkCore.Sqlite** v8.0.0
- **Microsoft.EntityFrameworkCore.Tools** v8.0.0

### 패키지 설치 방법

#### 방법 1: NuGet 패키지 관리자 콘솔 사용

Visual Studio에서 __도구__ > __NuGet 패키지 관리자__ > __패키지 관리자 콘솔__을 열고 다음 명령어를 실행하세요:

````````

#### 방법 2: NuGet 패키지 관리자 UI 사용

1. 솔루션 탐색기에서 프로젝트를 마우스 오른쪽 버튼으로 클릭
2. __NuGet 패키지 관리__를 선택
3. __찾아보기__ 탭에서 다음 패키지들을 검색하여 설치:
   - `Microsoft.EntityFrameworkCore` (버전 8.0.0)
   - `Microsoft.EntityFrameworkCore.Sqlite` (버전 8.0.0)
   - `Microsoft.EntityFrameworkCore.Tools` (버전 8.0.0)

#### 방법 3: .NET CLI 사용

터미널이나 명령 프롬프트에서 프로젝트 폴더로 이동한 후 다음 명령어를 실행하세요:

````````

### 패키지 설명

- **Microsoft.EntityFrameworkCore**: Entity Framework Core의 핵심 라이브러리로, 데이터베이스 액세스와 ORM 기능을 제공합니다.
- **Microsoft.EntityFrameworkCore.Sqlite**: SQLite 데이터베이스 프로바이더로, SQLite 데이터베이스와의 연결 및 작업을 지원합니다.
- **Microsoft.EntityFrameworkCore.Tools**: Entity Framework Core용 개발 도구로, 마이그레이션 생성 및 관리 기능을 제공합니다. 빌드 시에만 포함되며 런타임에는 배포되지 않습니다.

### 프로젝트 구성

- **타겟 프레임워크**: net8.0 (Windows Forms 지원)
- **출력 형식**: WinExe (Windows 실행 파일)
- **Nullable 참조 형식**: 활성화
- **암시적 using**: 활성화
- **언어 버전**: C# 12.0

## 빌드 및 실행

의존성 설치 후 다음 명령어로 프로젝트를 빌드하고 실행할 수 있습니다:

````````

또는 Visual Studio에서 __F5__ 키를 눌러 디버그 모드로 실행하거나 __Ctrl+F5__로 디버그 없이 실행할 수 있습니다.

## 주요 기능

- **하드웨어 테스트**: CPU 정보, MAC 주소, NFC, BLE, LFID, 센서, 도어락 등 다양한 하드웨어 컴포넌트 테스트
- **네트워크 테스트**: 네트워크 연결 및 통신 테스트
- **펌웨어 관리**: 펌웨어 버전 조회 및 설정 기능
- **데이터베이스 저장**: SQLite를 사용한 테스트 결과 로컬 저장
- **CSV 리포트**: 테스트 결과를 CSV 파일로 내보내기 및 통계 생성
- **보안 통신**: HTTPS를 사용한 암호화된 통신 (localhost:8443)
- **전체 테스트**: 모든 하드웨어 테스트를 순차적으로 실행하는 기능
- **테스트 결과 조회**: 저장된 테스트 결과 조회 및 통계 표시

## 시스템 아키텍처

### API 구조
- 각 하드웨어 컴포넌트별로 분리된 API 클래스
- RESTful API 엔드포인트를 통한 디바이스 통신
- 비동기 패턴을 사용한 효율적인 네트워크 통신

### 데이터 관리
- Entity Framework Core를 통한 SQLite 데이터베이스 관리
- 테스트 결과의 영구 저장 및 조회 기능

### UI 구조
- Windows Forms 기반의 직관적인 사용자 인터페이스
- 실시간 로그 표시 및 테스트 진행 상황 모니터링

### 리포트 기능
- CSV 형식의 테스트 결과 내보내기
- 테스트 통계 및 분석 데이터 제공
- 시간 기반 테스트 결과 조회 및 필터링
