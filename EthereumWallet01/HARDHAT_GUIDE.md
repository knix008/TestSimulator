# Hardhat 사용 가이드

이 가이드는 Hardhat으로 컴파일된 스마트 컨트랙트를 Ethereum Wallet 애플리케이션에서 배포하는 방법을 설명합니다.

## 1. Hardhat 프로젝트 설정

### 1.1 프로젝트 초기화
```bash
mkdir my-hardhat-project
cd my-hardhat-project
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init
```

### 1.2 package.json 설정
```json
{
  "name": "my-hardhat-project",
  "version": "1.0.0",
  "scripts": {
    "compile": "hardhat compile",
    "test": "hardhat test",
    "deploy": "hardhat run scripts/deploy.js --network sepolia"
  },
  "devDependencies": {
    "@nomicfoundation/hardhat-toolbox": "^3.0.0",
    "hardhat": "^2.17.0"
  }
}
```

### 1.3 hardhat.config.js 설정
```javascript
require("@nomicfoundation/hardhat-toolbox");

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
    sepolia: {
      url: "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
      accounts: ["YOUR_PRIVATE_KEY"]
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
```

## 2. 스마트 컨트랙트 작성

### 2.1 contracts/SimpleStorage.sol
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract SimpleStorage {
    uint256 private storedData;
    
    event DataStored(uint256 indexed value, address indexed sender);
    
    function set(uint256 x) public {
        storedData = x;
        emit DataStored(x, msg.sender);
    }
    
    function get() public view returns (uint256) {
        return storedData;
    }
    
    function add(uint256 x) public {
        storedData += x;
        emit DataStored(storedData, msg.sender);
    }
    
    function reset() public {
        storedData = 0;
        emit DataStored(0, msg.sender);
    }
}
```

## 3. 컴파일 및 아티팩트 생성

### 3.1 컴파일 실행
```bash
npx hardhat compile
```

### 3.2 생성되는 파일 구조
```
artifacts/
└── contracts/
    └── SimpleStorage.sol/
        └── SimpleStorage.json  ← 이 파일을 사용합니다
```

## 4. Ethereum Wallet에서 배포

### 4.1 아티팩트 파일 선택
1. Ethereum Wallet 애플리케이션 실행
2. "Hardhat 아티팩트" 버튼 클릭
3. `artifacts/contracts/SimpleStorage.sol/SimpleStorage.json` 파일 선택

### 4.2 자동 처리
- 애플리케이션이 자동으로 JSON 파일을 파싱
- 바이트코드 추출 및 설정
- ABI 정보 표시
- 컨트랙트 정보 로그 출력

### 4.3 배포 실행
1. "스마트 컨트랙트 배포" 버튼 클릭
2. Sepolia 테스트넷에 배포
3. 트랜잭션 해시 및 컨트랙트 주소 확인

## 5. Hardhat 아티팩트 구조

### 5.1 JSON 파일 내용
```json
{
  "contractName": "SimpleStorage",
  "abi": [
    {
      "inputs": [{"internalType": "uint256", "name": "x", "type": "uint256"}],
      "name": "set",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "get",
      "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
      "stateMutability": "view",
      "type": "function"
    }
  ],
  "bytecode": "0x608060405234801561001057600080fd5b5060f08061001f6000396000f3fe6080604052348015600f57600080fd5b5060043610603c5760003560e01c80633fa4f2451460415780635524107714605b575b600080fd5b60476071565b60405190815260200160405180910390f35b6061607a565b604051901515815260200160405180910390f35b60006001905090565b6000600190509056fea2646970667358221220...",
  "deployedBytecode": "0x6080604052348015600f57600080fd5b5060043610603c5760003560e01c80633fa4f2451460415780635524107714605b575b600080fd5b60476071565b60405190815260200160405180910390f35b6061607a565b604051901515815260200160405180910390f35b60006001905090565b6000600190509056fea2646970667358221220...",
  "linkReferences": {},
  "deployedLinkReferences": {}
}
```

### 5.2 주요 필드 설명
- **contractName**: 컨트랙트 이름
- **abi**: Application Binary Interface (함수, 이벤트 정의)
- **bytecode**: 배포용 바이트코드
- **deployedBytecode**: 배포 후 런타임 바이트코드

## 6. 고급 사용법

### 6.1 의존성이 있는 컨트랙트
```solidity
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MyToken is ERC20 {
    constructor() ERC20("MyToken", "MTK") {
        _mint(msg.sender, 1000000 * 10**decimals());
    }
}
```

### 6.2 라이브러리 링킹
```solidity
import "./SafeMath.sol";

contract MyContract {
    using SafeMath for uint256;
    
    function add(uint256 a, uint256 b) public pure returns (uint256) {
        return a.add(b);
    }
}
```

## 7. 문제 해결

### 7.1 컴파일 오류
```bash
# 캐시 삭제 후 재컴파일
npx hardhat clean
npx hardhat compile
```

### 7.2 아티팩트 파일을 찾을 수 없는 경우
- `artifacts/` 폴더가 생성되었는지 확인
- 컴파일이 성공적으로 완료되었는지 확인
- 올바른 경로에서 JSON 파일을 선택했는지 확인

### 7.3 JSON 파싱 오류
- Hardhat으로 컴파일된 파일인지 확인
- 파일이 손상되지 않았는지 확인
- 올바른 JSON 형식인지 확인

## 8. 예제 프로젝트

프로젝트에 포함된 `hardhat-example/` 폴더를 참고하세요:

```
hardhat-example/
├── package.json
├── hardhat.config.js
├── contracts/
│   └── SimpleStorage.sol
└── scripts/
    └── deploy.js
```

### 8.1 예제 실행
```bash
cd hardhat-example
npm install
npx hardhat compile
```

### 8.2 아티팩트 파일 위치
```
hardhat-example/artifacts/contracts/SimpleStorage.sol/SimpleStorage.json
```

## 9. 주의사항

### 9.1 보안
- 개인키를 절대 공유하지 마세요
- 테스트넷에서만 사용하세요
- 실제 자금을 사용하기 전에 충분히 테스트하세요

### 9.2 가스비
- 복잡한 컨트랙트는 더 많은 가스가 필요합니다
- 네트워크 상태에 따라 가스 가격이 변동됩니다
- 충분한 ETH 잔액을 확보하세요

### 9.3 호환성
- Solidity 버전 호환성을 확인하세요
- Hardhat 버전과 애플리케이션 호환성을 확인하세요
- 네트워크 설정을 올바르게 구성하세요
