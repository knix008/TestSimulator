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

## 다루는 알고리즘 (61개)

- **정렬 15**: 버블, 선택, 삽입, 셸, 병합, 퀵, 힙, 기수, 칵테일, 콤, 그놈, 홀짝, 계수, 팬케이크, 네덜란드 국기
- **탐색 6**: 선형, 이진, 점프, 보간, 지수, 퀵셀렉트
- **그래프 8**: BFS, DFS, 다익스트라, 벨만-포드, 플로이드-워셜, 프림, 크루스칼, 위상 정렬
- **경로 탐색 4**: A*, BFS 미로 최단 경로, 탐욕 최적 우선 탐색, DFS 미로 탐색
- **동적 계획법 7**: 피보나치, 0/1 배낭, LCS, 편집 거리, 카데인, 동전 교환, LIS
- **문자열 3**: KMP, 라빈-카프, 단순 문자열 검색
- **트리 5**: 이진 탐색 트리, 트리 순회, AVL 트리, 이진 힙, 트라이
- **백트래킹 4**: N-Queens, 부분집합의 합, 순열 생성, 스도쿠
- **그리디 4**: 활동 선택, 허프만 코딩, 분할 가능 배낭, 마감 기한 작업 스케줄링
- **수학·재귀 5**: 유클리드 호제법, 에라토스테네스의 체, 하노이 탑, 팩토리얼, 빠른 거듭제곱

## 아이콘과 프로젝트 파일

`assets/` 의 `app-icon.svg`(프로그램·설치 파일·작업 표시줄)와 `file-icon.svg`(저장한 `.myalgo` 프로젝트 파일)가 원본입니다. 고친 뒤 `npm run build:icons` 를 실행하면 `src-tauri/icons`, `assets/*.ico|png`, `public/icon.svg` 가 다시 만들어집니다. Windows 설치 프로그램은 `.myalgo` 를 프로그램에 연결하고 파일 아이콘을 등록하므로, 저장한 프로젝트를 두 번 클릭하면 그 상태로 열립니다.
