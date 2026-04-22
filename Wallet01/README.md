# Wallet01 — Ethereum 지갑 (Windows Forms)

Nethereum 기반의 **데스크톱용 이더리움 지갑 도우미**입니다. 니모닉으로 지갑을 만들거나, 니모닉·개인키로 불러온 뒤 주소 목록을 관리하고 RPC로 **ETH 잔액**을 조회할 수 있습니다.

## 요구 사항

- **Windows** (WinForms, `net10.0-windows`)
- [.NET 10 SDK](https://dotnet.microsoft.com/download) 이상

## 빌드 및 실행

저장소 루트에서 `WalletGeneratorGui` 프로젝트를 실행합니다.

```powershell
cd WalletGeneratorGui
dotnet run
```

또는 Visual Studio에서 `WalletGeneratorGui.csproj`를 열고 디버그 실행합니다.

## 주요 기능

- **새 지갑**: 영어 12단어 니모닉 생성, 백업 안내 대화상자
- **지갑 불러오기**: 니모닉(12/15/18/21/24단어) 또는 64자리 hex 개인키
- **주소 목록**: 사용한 주소를 `walletbook.json`에 저장(주소·출처·추가 시각만 저장)
- **잔액 조회**: 입력한 **RPC URL**로 `eth_getBalance` 호출 후 ETH 단위로 표시
- **주소 복사**: 클립보드로 복사

## RPC URL 안내

일부 공개 엔드포인트(예: `cloudflare-eth.com`)는 요청이 거절되는 경우가 있습니다. 앱 첫 로드 시 해당 URL이면 기본 예시로 `https://eth.drpc.org`로 바꾸는 동작이 있습니다. **본인이 신뢰하는 RPC**를 사용하는 것을 권장합니다.

## 데이터 파일

실행 파일과 같은 폴더(보통 `bin/Debug|Release/net10.0-windows/`)에 **`walletbook.json`**이 생성됩니다. 여기에는 **주소와 메타데이터만** 들어가며, 니모닉·개인키는 저장하지 않습니다.

저장소의 `.gitignore`에는 `walletbook.json` 등이 포함되어 있어 실수로 커밋되지 않도록 되어 있습니다.

## 보안 주의

- 이 도구는 **학습·테스트용**에 가깝습니다. 실제 자산에는 검증된 지갑과 안전한 환경을 사용하세요.
- **니모닉·개인키**는 화면에 상시 노출되지 않도록 설계되어 있으나, PC에 멀웨어가 있거나 화면을 공유하면 유출될 수 있습니다.
- RPC 제공자는 요청 내용·IP 등을 볼 수 있습니다.

## 의존성

- [Nethereum](https://github.com/Nethereum/Nethereum) (`HdWallet`, `Signer`, `Web3`)

## 프로젝트 구조

```
Wallet01/
├── .gitignore
├── README.md
└── WalletGeneratorGui/     # WinForms 앱
    ├── WalletGeneratorGui.csproj
    ├── Program.cs
    └── ...
```
