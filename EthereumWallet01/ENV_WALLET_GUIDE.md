# .env 파일을 사용한 지갑 로드 가이드

이 가이드는 .env 파일을 사용하여 기존 지갑 정보를 로드하는 방법을 설명합니다.

## 1. .env 파일 설정

### 1.1 파일 생성
프로젝트 루트 디렉토리에 `.env` 파일을 생성합니다.

### 1.2 예제 파일 복사
```bash
# env.example 파일을 .env로 복사
copy env.example .env
```

### 1.3 실제 값 입력
`.env` 파일을 열고 실제 지갑 정보를 입력합니다.

## 2. 지원하는 지갑 로드 방법

### 2.1 방법 1: 개인키와 주소 직접 설정
```env
PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
PUBLIC_ADDRESS=0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6
```

### 2.2 방법 2: 니모닉 구문 사용
```env
MNEMONIC=abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
```

## 3. 사용 방법

### 3.1 애플리케이션 실행
1. Ethereum Wallet 애플리케이션 실행
2. ".env에서 로드" 버튼 클릭
3. 지갑 정보가 자동으로 로드됨

### 3.2 로드 확인
- "현재 지갑" 라벨에 지갑 주소가 표시됨
- 로그에 로드 성공 메시지 출력
- 성공 팝업 창 표시

## 4. .env 파일 예제

### 4.1 완전한 예제
```env
# 개인키와 주소 설정
PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
PUBLIC_ADDRESS=0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6

# 또는 니모닉 구문 사용
# MNEMONIC=abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about

# 네트워크 설정 (선택사항)
INFURA_API_KEY=your_infura_api_key_here
ALCHEMY_API_KEY=your_alchemy_api_key_here
```

### 4.2 최소 설정
```env
# 개인키만 설정 (주소는 자동 계산)
PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

# 또는 니모닉만 설정
MNEMONIC=abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
```

## 5. 보안 주의사항

### 5.1 파일 보안
- `.env` 파일을 절대 Git에 커밋하지 마세요
- `.gitignore`에 `.env` 추가 확인
- 파일 권한을 적절히 설정

### 5.2 개인키 보안
- 실제 자금이 있는 지갑의 개인키는 사용하지 마세요
- 테스트넷에서만 사용하세요
- 개인키를 안전한 곳에 백업하세요

### 5.3 환경 분리
```env
# 개발용 (테스트넷)
PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

# 프로덕션용 (별도 파일)
# .env.production 파일 사용 권장
```

## 6. 문제 해결

### 6.1 ".env 파일을 찾을 수 없습니다"
- `.env` 파일이 프로젝트 루트에 있는지 확인
- 파일명이 정확한지 확인 (`.env`)

### 6.2 "유효한 지갑 정보가 없습니다"
- `PRIVATE_KEY`와 `PUBLIC_ADDRESS` 또는 `MNEMONIC`이 설정되어 있는지 확인
- 값이 올바른 형식인지 확인

### 6.3 "니모닉 복구 실패"
- 니모닉 구문이 정확한지 확인 (12개 또는 24개 단어)
- 단어 사이에 공백이 있는지 확인
- 올바른 단어인지 확인

### 6.4 "환경 변수 로드 중 오류"
- `.env` 파일 형식이 올바른지 확인
- 특수 문자가 있는지 확인
- 파일 인코딩이 UTF-8인지 확인

## 7. 고급 사용법

### 7.1 여러 지갑 관리
```env
# 지갑 1
PRIVATE_KEY_1=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
PUBLIC_ADDRESS_1=0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6

# 지갑 2
PRIVATE_KEY_2=0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
PUBLIC_ADDRESS_2=0x8b6C4b4d8b6742d35Cc6634C0532925a3b8D4C9db9
```

### 7.2 네트워크별 설정
```env
# Sepolia 테스트넷
SEPOLIA_PRIVATE_KEY=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
SEPOLIA_PUBLIC_ADDRESS=0x742d35Cc6634C0532925a3b8D4C9db96C4b4d8b6

# Goerli 테스트넷
GOERLI_PRIVATE_KEY=0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890
GOERLI_PUBLIC_ADDRESS=0x8b6C4b4d8b6742d35Cc6634C0532925a3b8D4C9db9
```

## 8. 자동 로드 설정

### 8.1 애플리케이션 시작 시 자동 로드
애플리케이션을 수정하여 시작 시 자동으로 .env 파일을 로드할 수 있습니다:

```csharp
public Main()
{
    InitializeComponent();
    LoadWalletFromEnv(); // 자동 로드
}
```

### 8.2 설정 파일 기반 로드
```env
# 자동 로드 설정
AUTO_LOAD_WALLET=true
DEFAULT_WALLET_TYPE=private_key
```

## 9. 예제 시나리오

### 9.1 개발자 워크플로우
1. 테스트 지갑 생성
2. `.env` 파일에 정보 저장
3. 애플리케이션에서 ".env에서 로드" 클릭
4. 스마트 컨트랙트 배포 테스트

### 9.2 팀 협업
1. `env.example` 파일 공유
2. 각자 `.env` 파일 생성
3. 개인 지갑 정보 입력
4. 동일한 코드베이스 사용

### 9.3 CI/CD 파이프라인
1. 환경별 `.env` 파일 준비
2. 빌드 시 적절한 파일 선택
3. 자동화된 배포 실행

## 10. 추가 기능

### 10.1 지갑 정보 표시
- 현재 로드된 지갑 주소 표시
- 잔액 확인 기능
- 트랜잭션 히스토리 (향후 추가)

### 10.2 다중 지갑 지원
- 여러 지갑 간 전환
- 지갑별 별칭 설정
- 빠른 전환 버튼

이 가이드를 따라하면 .env 파일을 사용하여 기존 지갑을 안전하고 편리하게 로드할 수 있습니다.
