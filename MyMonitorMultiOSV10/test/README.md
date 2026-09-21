# Tests

Node.js 18+ 내장 러너(`node:test`)를 사용합니다.

저장소 루트에서:

```bash
npm test
npm run test:protocol
npm run test:watch
```

또는 `app` 폴더에서:

```bash
cd app
npm test
```

결과는 `test/reporter.js`가 파일별로 모은 뒤 **Summary** 표(File · Feature · Pass · Fail · Skip · Time)로 마칩니다.

Windows 에이전트 실행 파일(`agent/dist/windows/mmon-agent.exe`)이 있으면 CLI/라이브 세션 테스트도 돌아갑니다. 없으면 해당 파일만 skip 됩니다.
