# MyCodeChecker

Windows, macOS, Linux와 웹에서 같은 화면으로 쓰는 로컬 코드 품질 작업대입니다. 화면 구성(메뉴 막대, 테마 40종, 한국어/영어)은 MyBrainMap과 같은 방식입니다.

분석은 이 프로그램 안의 규칙 엔진이 합니다. 버그, 취약점, 코드 스멜, 보안 핫스팟, 중복, 커버리지, A–E 등급, 품질 게이트, 품질 프로파일, 포트폴리오, 새 코드, 백그라운드 작업, SARIF/HTML/CSV/JSON 내보내기를 다룹니다.

## 실행

같은 JavaScript 코어를 네 가지로 띄웁니다.

| 대상 | 명령 | 결과 |
| --- | --- | --- |
| Web | `npm run dev` 또는 `npm run web` | 브라우저. 개발은 5210, 배포본은 5211 |
| Windows | `npm start` / `npm run build:win` | Tauri 창 / NSIS 설치 파일 |
| Linux | `npm start` / `npm run build:linux` | Tauri 창 / deb와 AppImage |
| macOS | `npm start` / `npm run build:mac` | Tauri 창 / .app와 .dmg |

설치 파일은 그 운영체제 위에서만 만듭니다. Windows에서 `npm run build:linux`를 실행하면 Linux에서 하라고 멈추고, 반대도 같습니다. 설치본에는 그 기기의 Node.js와 분석 엔진이 함께 들어갑니다.

```bash
npm install
npm run dev
```

브라우저에서 **샘플 프로젝트**를 누르면 `samples/demo`를 분석합니다.

CI:

```bash
node scripts/scan.mjs --path samples/demo --format sarif --out report.sarif
```

품질 게이트가 실패하면 종료 코드는 1입니다.

Coverity식 흐름도 같은 코어입니다. `npm run cov -- build --path <폴더>`는 캡처를 남기고, `analyze`는 결함을 출력하고, `commit`은 스트림 스냅샷을 저장합니다. 정책이 실패하면 `commit`의 종료 코드는 1입니다. 화면에서는 **결함**, **스트림**, **컴포넌트**, **정책**, **함수 모델**을 씁니다. 첫 커밋은 기준 스냅샷이고, 그 다음부터 새 CID에 정책이 적용됩니다.

## 언어

JavaScript, TypeScript, Python, Java, Kotlin, Groovy, C#, C, C++, Go, Rust, PHP, Ruby, Shell, PowerShell, SQL, HTML, CSS, XML, YAML, Docker, Terraform, JSON.
