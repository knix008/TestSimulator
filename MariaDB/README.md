# ? 사람 정보 관리 시스템 (PersonInfoApp)

> **MariaDB 기반의 완전한 CRUD 애플리케이션**  
> C# WinForms로 개발된 직관적이고 사용하기 쉬운 사람 정보 관리 시스템입니다.

## ? 주요 기능

- ? **사람 정보 입력**: 이름, 나이, 이메일, 전화번호, 주소
- ? **완전한 CRUD 기능**: 생성(Create), 조회(Read), 수정(Update), 삭제(Delete)
- ? **실시간 데이터 관리**: 새로고침 및 즉시 반영
- ? **직관적인 WinForms GUI**: 사용자 친화적 인터페이스
- ?? **MariaDB 데이터베이스 연동**: 안정적인 데이터 저장
- ? **입력 유효성 검사**: 필수 필드 검증 및 오류 처리
- ? **실시간 상태 표시**: 작업 상태 및 결과 피드백

## ?? 필요 조건

### 1. 개발 환경
- **.NET 8.0 SDK** 이상
- **Visual Studio 2022** 또는 **Visual Studio Code** (선택사항)
- **MariaDB** 또는 **MySQL** 서버

### 2. 데이터베이스 설정
MariaDB 서버가 설치되어 있어야 합니다.

#### ? MariaDB 설치 (Windows)
```bash
# Chocolatey를 사용한 설치
choco install mariadb

# 또는 공식 웹사이트에서 다운로드
# https://mariadb.org/download/
```

#### ?? 데이터베이스 생성
MariaDB에 접속하여 다음 명령을 실행하세요:

```sql
CREATE DATABASE PersonInfoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### ? 사용자 권한 설정 (선택사항)
보안을 위해 전용 사용자를 생성하는 것을 권장합니다:

```sql
CREATE USER 'personuser'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON PersonInfoDB.* TO 'personuser'@'localhost';
FLUSH PRIVILEGES;
```

### 3. ? 연결 문자열 수정
`DatabaseService.cs` 파일에서 연결 문자열을 실제 환경에 맞게 수정하세요:

```csharp
private readonly string _connectionString = "Server=localhost;Port=3306;Database=PersonInfoDB;Uid=root;Pwd=your_password;";
```

#### 연결 문자열 파라미터 설명:
| 파라미터 | 설명 | 기본값 |
|---------|------|--------|
| `Server` | MariaDB 서버 주소 | localhost |
| `Port` | 포트 번호 | 3306 |
| `Database` | 데이터베이스 이름 | PersonInfoDB |
| `Uid` | 사용자 ID | root |
| `Pwd` | 비밀번호 | your_password |

## ? 설치 및 실행

### 1. ? 프로젝트 빌드
```bash
dotnet build
```

### 2. ▶? 애플리케이션 실행
```bash
dotnet run
```

또는 **Visual Studio**에서 `F5` 키를 눌러 실행하세요.

### 3. ? 실행 확인
애플리케이션이 성공적으로 실행되면 다음과 같은 화면이 나타납니다:
- 왼쪽: 사람 정보 입력 폼
- 오른쪽: 저장된 데이터 목록
- 하단: 상태 표시 라벨

## ? 사용 방법

### ? 기본 사용법

1. **? 정보 입력**: 왼쪽 입력 폼에 사람의 정보를 입력합니다.
   - **이름**과 **나이**는 필수 입력 항목입니다.
   - **이메일**, **전화번호**, **주소**는 선택 입력 항목입니다.

2. **? 저장**: "저장" 버튼을 클릭하여 새로운 정보를 데이터베이스에 저장합니다.

3. **?? 수정**: 오른쪽 목록에서 수정하고 싶은 항목을 선택하면 입력 폼에 정보가 표시됩니다. 정보를 수정한 후 "수정" 버튼을 클릭합니다.

4. **?? 삭제**: 목록에서 삭제하고 싶은 항목을 선택한 후 "삭제" 버튼을 클릭하고 확인합니다.

5. **? 새로고침**: "새로고침" 버튼을 클릭하여 최신 데이터를 불러옵니다.

### ? UI 구성 요소

| 구성 요소 | 설명 | 색상 |
|----------|------|------|
| 저장 버튼 | 새로운 정보 저장 | ? 녹색 |
| 수정 버튼 | 선택된 정보 수정 | ? 파란색 |
| 삭제 버튼 | 선택된 정보 삭제 | ? 빨간색 |
| 새로고침 버튼 | 데이터 목록 갱신 | ? 노란색 |

## ? 프로젝트 구조

```
PersonInfoApp/
├── ? Person.cs              # 사람 정보 데이터 모델
├── ?? DatabaseService.cs     # MariaDB 연결 및 CRUD 작업
├── ?? MainForm.cs            # 메인 WinForms UI
├── ▶? Program.cs             # 애플리케이션 진입점
├── ?? PersonInfoApp.csproj   # 프로젝트 파일
└── ? README.md              # 이 파일
```

### ? 파일별 역할

| 파일 | 역할 | 주요 기능 |
|------|------|----------|
| `Person.cs` | 데이터 모델 | 사람 정보 구조 정의 |
| `DatabaseService.cs` | 데이터 접근 계층 | MariaDB 연결 및 CRUD 작업 |
| `MainForm.cs` | UI 및 비즈니스 로직 | 사용자 인터페이스 및 이벤트 처리 |
| `Program.cs` | 애플리케이션 진입점 | 메인 폼 실행 |

## ?? 데이터베이스 스키마

애플리케이션은 자동으로 다음 테이블을 생성합니다:

```sql
CREATE TABLE Persons (
    Id INT AUTO_INCREMENT PRIMARY KEY,
    Name VARCHAR(100) NOT NULL,
    Age INT NOT NULL,
    Email VARCHAR(255),
    Phone VARCHAR(20),
    Address TEXT,
    CreatedDate DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### ? 테이블 구조

| 컬럼명 | 타입 | 제약조건 | 설명 |
|--------|------|----------|------|
| `Id` | INT | PRIMARY KEY, AUTO_INCREMENT | 고유 식별자 |
| `Name` | VARCHAR(100) | NOT NULL | 이름 |
| `Age` | INT | NOT NULL | 나이 |
| `Email` | VARCHAR(255) | NULL 허용 | 이메일 주소 |
| `Phone` | VARCHAR(20) | NULL 허용 | 전화번호 |
| `Address` | TEXT | NULL 허용 | 주소 |
| `CreatedDate` | DATETIME | DEFAULT CURRENT_TIMESTAMP | 등록일시 |

## ?? 문제 해결

### ? 연결 오류
- **MariaDB 서버 상태 확인**: 서비스가 실행 중인지 확인하세요
- **연결 문자열 검증**: 서버 주소, 포트, 데이터베이스 이름, 사용자 ID, 비밀번호 확인
- **방화벽 설정**: 3306 포트가 차단되지 않았는지 확인
- **사용자 권한**: 데이터베이스 접근 권한이 있는지 확인

### ? 빌드 오류
- **.NET SDK 확인**: .NET 8.0 SDK가 설치되어 있는지 확인
- **NuGet 패키지 복원**: `dotnet restore` 명령 실행
- **필수 패키지 확인**:
  - `MySqlConnector` (2.3.7)
  - `System.Data.Common` (4.3.0)

### ? 런타임 오류
- **데이터베이스 연결**: 연결 문자열이 올바른지 확인
- **테이블 생성**: 애플리케이션 시작 시 자동으로 테이블이 생성됩니다
- **입력 유효성**: 필수 필드(이름, 나이)가 올바르게 입력되었는지 확인

## ? 성능 최적화 팁

- **연결 풀링**: 대량 데이터 처리 시 연결 풀 설정 고려
- **인덱스 추가**: 이름이나 이메일로 자주 검색하는 경우 인덱스 추가
- **페이징**: 데이터가 많아질 경우 페이징 기능 구현 고려

## ? 추가 기능 제안

- **검색 기능**: 이름이나 이메일로 검색
- **데이터 내보내기**: CSV 또는 Excel 형식으로 내보내기
- **사진 업로드**: 프로필 사진 추가
- **통계 기능**: 나이별, 지역별 통계

## ? 라이선스

이 프로젝트는 **교육 목적**으로 제작되었습니다. 자유롭게 학습 및 개선에 활용하세요.

---

**? 도움이 필요하시면 이슈를 등록해주세요!** ?
