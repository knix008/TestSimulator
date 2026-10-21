# 구조

브라우저 UI(`src/`)와 분석 엔진(`core/`)이 나뉩니다. Vite 개발 서버, `server/server.js`, Tauri가 띄우는 `host/desktop.js`가 같은 `server/handle.js`로 `POST /api/<이름>`을 받습니다.

- `core/rules.js` — 줄 단위 규칙. 시크릿, JavaScript/TypeScript, Python, Java, C#, C/C++, Go, Rust, PHP, Ruby, Shell, PowerShell, SQL, HTML, CSS, XML, YAML, Docker, Terraform, JSON.
- `core/metrics.js` — 코드 줄 수, 인지 복잡도, 순환 복잡도, 함수 길이, 매개변수, 중첩, 빈 catch.
- `core/duplication.js` — 정규화한 8줄 창이 두 곳 이상이면 중복.
- `core/coverage.js` — lcov, Cobertura, JaCoCo.
- `core/ratings.js`, `core/qualitygate.js` — 등급과 게이트.
- `core/analyze.js` — 파일 순회와 이슈 키. 같은 키는 다음 분석에서 새 코드가 아닙니다.
- `core/store.js` — `%APPDATA%/MyCodeChecker/workspace.json` (또는 `MCC_USER_DATA`).

UI 테마 토큰은 MyBrainMap과 같은 `src/themes.js`입니다.
