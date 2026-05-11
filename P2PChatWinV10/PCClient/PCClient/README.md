# P2P Chat - C# Windows Client

WebSocket 기반 채팅 서버에 연결하는 C# WinForms 클라이언트입니다.

## 주요 기능

- ✅ **End-to-End 암호화**: AES-256-GCM 암호화 지원
- ✅ **WinForms GUI**: 사용하기 쉬운 Windows Forms 인터페이스
- ✅ **방 관리**: 방 생성, 참가, 목록 조회
- ✅ **비밀번호 보호**: 방 비밀번호 설정 및 변경 (방장)
- ✅ **파일 전송**: 이미지, 동영상, 압축 파일 전송 (최대 10MB)
- ✅ **닉네임 시스템**: 사용자 닉네임 설정
- ✅ **실시간 채팅**: WebSocket 기반 실시간 통신

## 요구사항

- .NET 6.0 이상 (Windows)
- Windows 10/11

## 빌드 및 실행

### 1. 프로젝트 빌드

```powershell
cd PCClient
dotnet restore
dotnet build
```

### 2. 실행

```powershell
dotnet run
```

또는 Visual Studio에서 프로젝트를 열어 F5를 눌러 실행합니다.

### 3. 릴리즈 빌드

```powershell
dotnet publish -c Release -r win-x64 --self-contained false
```

실행 파일은 `bin\Release\net6.0-windows\win-x64\publish\` 폴더에 생성됩니다.

## 사용 방법

### 1. 서버 연결

1. **닉네임** 입력 (최대 20자)
2. **서버 주소** 입력 (기본값: `ws://localhost:8787`)
3. **연결** 버튼 클릭

### 2. 방 만들기

1. 방 이름 입력
2. (선택) 비밀번호 입력
3. 최대 인원 설정 (2~20명)
4. **방 만들기** 버튼 클릭

### 3. 방 참가

1. **방 목록 새로고침** 버튼 클릭
2. 목록에서 방 선택
3. **선택한 방 참가** 버튼 클릭
4. 비밀번호가 있는 방이면 비밀번호 입력

### 4. 채팅

- 메시지 입력 후 **전송** 버튼 또는 **Enter** 키
- 📎 **파일** 버튼으로 파일 전송
- 방장인 경우 🔑 **비밀번호 변경** 버튼 사용 가능

### 5. 방 나가기

- **방 나가기** 버튼 클릭

## 암호화 정보

### AES-256-GCM 암호화

- **키 파생**: PBKDF2 (100,000회 반복, SHA-256)
- **암호화 모드**: AES-GCM (Galois/Counter Mode)
- **IV 크기**: 12 바이트
- **인증 태그**: 16 바이트

### 키 생성 방식

- **비밀번호가 있는 방**: 비밀번호 + 방 ID로 키 생성
- **비밀번호가 없는 방**: 방 ID로 키 생성

모든 채팅 메시지는 암호화되어 전송되며, 서버는 암호화된 데이터만 중계합니다.

## 프로젝트 구조

```
PCClient/
├── PCClient.csproj          # 프로젝트 파일
├── Program.cs               # 진입점
├── MainForm.cs              # 메인 폼 로직
├── MainForm.Designer.cs     # 메인 폼 UI 디자인
├── ChatClient.cs            # WebSocket 클라이언트
├── EncryptionHelper.cs      # AES-256-GCM 암호화 헬퍼
└── README.md                # 이 파일
```

## 의존성 패키지

- `System.Net.WebSockets.Client` - WebSocket 클라이언트
- `Newtonsoft.Json` - JSON 직렬화/역직렬화

## 알려진 제한사항

- 파일 전송 최대 크기: 10MB
- 파일은 암호화되지 않음 (Base64 인코딩만)
- WebRTC P2P 연결은 지원하지 않음 (서버 중계 모드만)

## 웹 클라이언트와의 호환성

이 C# 클라이언트는 웹 브라우저 클라이언트(`client/`)와 동일한 서버에 연결할 수 있으며, 서로 메시지를 주고받을 수 있습니다.

## 라이선스

메인 프로젝트 라이선스를 따릅니다.
