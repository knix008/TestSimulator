# MyAlgorithmSimulator

알고리즘을 한 단계씩 눈으로 보고, 같은 알고리즘을 C, C++, Java, Python, Go, Rust, JavaScript로 실행해 보는 학습 프로그램입니다. 웹, Windows, macOS, Linux를 지원합니다.

## 실행

```bash
npm install
npm start          # 데스크톱 앱 (Tauri)
npm run dev        # 브라우저만 (http://127.0.0.1:5490)
```

C++, Java, Python, Go, Rust, JavaScript 샘플이 알고리즘마다 들어 있습니다. C도 데스크톱 앱에서 컴파일해 실행할 수 있습니다. 브라우저에서는 JavaScript 샘플을 실행하고, 컴파일러가 없으면 실행 메뉴의 **개발 도구 설치**로 설치합니다.

## 설치 파일

```bash
npm run build:win     # Windows (NSIS)
npm run build:mac     # macOS (dmg)
npm run build:linux   # Linux (deb, rpm, AppImage)
```

설치 파일은 그 운영체제에서만 만들 수 있습니다.

## 테스트

```bash
npm test                 # 알고리즘 엔진
npm run test:samples     # 샘플 프로그램을 컴파일해 엔진 결과와 비교
```

## 다루는 알고리즘

정렬 8종, 선형·이진 탐색, 그래프 8종(BFS, DFS, 다익스트라, 벨만-포드, 플로이드-워셜, 프림, 크루스칼, 위상 정렬), A* 경로 탐색, 동적 계획법 4종, KMP·라빈-카프, 이진 탐색 트리와 순회, N-Queens, 유클리드 호제법, 에라토스테네스의 체, 하노이 탑.
