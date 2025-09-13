# Ethereum Wallet with Smart Contract Deployment

이더리움 지갑 애플리케이션으로, 지갑 생성, 잔액 확인, 스마트 컨트랙트 배포 기능을 제공합니다.

## 주요 기능

### 1. 지갑 관리
- 새 이더리움 지갑 생성
- 시드 구문 기반 지갑 복구
- 개인키 및 공개 주소 관리

### 2. 잔액 확인
- Sepolia 테스트넷 잔액 조회
- Wei를 ETH로 자동 변환

### 3. 스마트 컨트랙트 배포
- Solidity 파일 선택 및 컴파일
- Sepolia 테스트넷에 컨트랙트 배포
- 트랜잭션 해시 및 컨트랙트 주소 확인

## 사용 방법

### 1. 지갑 생성
1. "새 이더리움 지갑 생성" 버튼 클릭
2. 생성된 시드 구문을 안전한 곳에 보관
3. 지갑 주소와 개인키가 자동으로 설정됨

### 2. 잔액 확인
1. "잔액 확인" 버튼 클릭
2. Sepolia 테스트넷에서 현재 ETH 잔액 확인

### 3. 스마트 컨트랙트 배포

#### 방법 1: Solidity 파일 선택
1. "Solidity 파일 선택" 버튼 클릭
2. `.sol` 파일 선택
3. 자동으로 컴파일되어 바이트코드 생성
4. "스마트 컨트랙트 배포" 버튼 클릭

#### 방법 2: 샘플 컨트랙트 사용
1. "샘플 로드" 버튼 클릭
2. 미리 준비된 SimpleStorage 컨트랙트 로드
3. "스마트 컨트랙트 배포" 버튼 클릭

#### 방법 3: 수동 바이트코드 입력
1. 바이트코드 텍스트박스에 직접 입력 (0x 접두사 제외)
2. "스마트 컨트랙트 배포" 버튼 클릭

## Solidity 컴파일러 설정

### 자동 컴파일 (권장)
- 애플리케이션이 자동으로 `solc` 컴파일러를 찾아 사용
- 시스템 PATH에 `solc`가 설치되어 있어야 함

### 수동 컴파일
1. **Remix IDE 사용**:
   - https://remix.ethereum.org 접속
   - Solidity 코드 작성 및 컴파일
   - Bytecode 탭에서 "object" 필드 값 복사

2. **명령줄 사용**:
   ```bash
   solc --bin YourContract.sol
   ```

## 네트워크 설정

- **테스트넷**: Sepolia (https://sepolia.infura.io)
- **가스 한도**: 500,000
- **가스 가격**: 20 Gwei

## 주의사항

### 보안
- 시드 구문을 안전한 곳에 보관하세요
- 개인키를 절대 공유하지 마세요
- 테스트넷에서만 사용하세요

### 가스비
- 컨트랙트 배포를 위해 충분한 ETH가 필요합니다
- Sepolia 테스트넷에서 ETH를 받으려면 faucet을 사용하세요

### 컴파일
- 복잡한 컨트랙트의 경우 Remix IDE에서 수동 컴파일을 권장합니다
- 의존성이 있는 컨트랙트는 모든 파일을 포함해야 합니다

## 예제 컨트랙트

프로젝트에 포함된 `SampleContract.sol`은 간단한 스토리지 컨트랙트 예제입니다:

```solidity
contract SimpleStorage {
    uint256 private storedData;
    
    function set(uint256 x) public {
        storedData = x;
    }
    
    function get() public view returns (uint256) {
        return storedData;
    }
}
```

## 문제 해결

### 컴파일 오류
- `solc` 컴파일러가 설치되어 있는지 확인
- Solidity 버전 호환성 확인
- Remix IDE에서 수동 컴파일 시도

### 배포 실패
- 충분한 ETH 잔액 확인
- 가스 한도 및 가스 가격 조정
- 네트워크 연결 상태 확인

### 트랜잭션 대기
- 네트워크 상태에 따라 몇 분 소요될 수 있음
- 트랜잭션 해시로 Etherscan에서 상태 확인 가능

## 기술 스택

- **.NET 8.0**: 애플리케이션 프레임워크
- **Windows Forms**: UI 프레임워크
- **Nethereum**: 이더리움 상호작용 라이브러리
- **Solidity**: 스마트 컨트랙트 언어
