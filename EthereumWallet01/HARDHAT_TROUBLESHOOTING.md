# Hardhat 컴파일 오류 해결 가이드

이 가이드는 Hardhat 컴파일 시 발생하는 일반적인 오류들과 해결 방법을 설명합니다.

## 1. "Invalid package config" 오류

### 문제
```
Error: Invalid package config \\?\D:\Home\Projects\TestSimulator\EthereumWallet01\hardhat-example\package.json.
```

### 원인
- Windows의 긴 경로 문제
- package.json 파일 손상
- Node.js 버전 호환성 문제

### 해결 방법

#### 방법 1: 짧은 경로 사용
```bash
# C 드라이브 루트에 프로젝트 생성
cd C:\
mkdir hardhat-test
cd hardhat-test
```

#### 방법 2: package.json 재생성
```bash
# 기존 파일 삭제
Remove-Item package.json
Remove-Item package-lock.json
Remove-Item -Recurse -Force node_modules

# 새로 생성
npm init -y
```

#### 방법 3: Node.js 버전 확인
```bash
node --version  # v18.x 또는 v20.x 권장
npm --version
```

## 2. "Hardhat only supports ESM projects" 오류

### 문제
```
Hardhat only supports ESM projects.
Please make sure you have `"type": "module"` in your package.json.
```

### 원인
- Hardhat 최신 버전이 ESM 모드를 강제
- CommonJS와 ESM 모드 충돌

### 해결 방법

#### 방법 1: 낮은 버전의 Hardhat 사용 (권장)
```bash
npm install --save-dev hardhat@2.16.0
```

#### 방법 2: ESM 모드 사용
```bash
npm pkg set type="module"
```

그리고 hardhat.config.js를 ESM 형식으로 변경:
```javascript
import "@nomicfoundation/hardhat-toolbox";

export default {
  solidity: "0.8.19",
  // ... 설정
};
```

## 3. 의존성 충돌 오류

### 문제
```
npm error ERESOLVE unable to resolve dependency tree
```

### 해결 방법

#### 방법 1: 강제 설치
```bash
npm install --force
```

#### 방법 2: 레거시 의존성 해결
```bash
npm install --legacy-peer-deps
```

#### 방법 3: 개별 패키지 설치
```bash
npm install --save-dev hardhat@2.16.0
# toolbox 없이 기본 Hardhat만 사용
```

## 4. "Invalid account" 오류

### 문제
```
Error HH8: Invalid account: #0 for network: sepolia - private key too short
```

### 해결 방법
hardhat.config.js에서 네트워크 설정을 주석 처리:
```javascript
networks: {
  // sepolia: {
  //   url: "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
  //   accounts: ["YOUR_PRIVATE_KEY"]
  // }
},
```

## 5. 성공적인 설정 예제

### package.json
```json
{
  "name": "hardhat-example",
  "version": "1.0.0",
  "description": "Hardhat 프로젝트 예제",
  "main": "hardhat.config.js",
  "scripts": {
    "compile": "hardhat compile",
    "test": "hardhat test"
  },
  "devDependencies": {
    "hardhat": "^2.16.0"
  }
}
```

### hardhat.config.js
```javascript
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // 네트워크 설정은 필요시에만 추가
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
```

## 6. 단계별 해결 과정

### 1단계: 환경 준비
```bash
# 짧은 경로로 이동
cd C:\
mkdir hardhat-test
cd hardhat-test
```

### 2단계: 프로젝트 초기화
```bash
npm init -y
```

### 3단계: Hardhat 설치
```bash
npm install --save-dev hardhat@2.16.0
```

### 4단계: 설정 파일 생성
```bash
# hardhat.config.js 파일 생성 (위 예제 참조)
```

### 5단계: 컨트랙트 작성
```bash
mkdir contracts
# contracts/SimpleStorage.sol 파일 생성
```

### 6단계: 컴파일
```bash
npx hardhat compile
```

## 7. 주의사항

### Node.js 버전
- **권장**: Node.js v18.x 또는 v20.x
- **피해야 할 버전**: v22.x (일부 호환성 문제)

### 경로 길이
- Windows에서 긴 경로는 문제를 일으킬 수 있음
- 가능한 짧은 경로 사용 권장

### 패키지 버전
- 최신 버전보다는 안정적인 버전 사용
- hardhat@2.16.0이 가장 안정적

## 8. 성공 확인

컴파일이 성공하면 다음과 같은 메시지가 나타납니다:
```
Compiled 1 Solidity file successfully
```

그리고 `artifacts/contracts/` 폴더에 JSON 파일이 생성됩니다:
```
artifacts/contracts/SimpleStorage.sol/SimpleStorage.json
```

## 9. 추가 도움

문제가 지속되면:
1. Node.js 버전을 v18.x로 다운그레이드
2. 완전히 새로운 폴더에서 시작
3. 관리자 권한으로 실행
4. 바이러스 백신 소프트웨어 일시 비활성화

이 가이드를 따라하면 대부분의 Hardhat 컴파일 문제를 해결할 수 있습니다.
