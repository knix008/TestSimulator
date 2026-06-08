# Code Analyzer 분석 보고서

**루트:** `C:\Home\Projects\TestSimulator\Blockscanner01`  
**생성:** 2026-06-04 12:09:20

## 1. 개요

생성 시각: 2026-06-04 12:09:20

루트 디렉터리: C:\Home\Projects\TestSimulator\Blockscanner01

함수(호출 그래프): 9개

호출 관계: 4개

분석 파일(메트릭): 6개

메트릭 함수: 9개

중복 코드 그룹: 0건

프로젝트 타입: 0개

## 2. 품질 요약

프로젝트 중복 라인 비율: 0.0% (0 / 507 코드줄)

순환 호출 체인: 0건

고복잡도(CC≥15): 3함수

고인지복잡도(≥15): 3함수

깊은 중첩(≥4): 1함수

높은 Fan-out(≥10): 0함수

낮은 MI(<65): 4함수

다매개변수(≥7): 0함수

TODO 마커 합계: 0개

높은 TODO 밀도 파일(≥2.0/100줄): 0개

## 3. 함수 메트릭 (CC 상위)

전체 9개 중 Cyclomatic 복잡도 상위 9개.

경고 기준: CC≥15, 인지≥15.

| 함수 | 파일 | 줄 | CC | 인지 | 중첩 | 매개 | FanOut | MI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| classifyQuery | src\lib\search.ts | 21 | 50 | 95 | 4 | 0 | 1 | 34.0 |
| runSearch | src\lib\search.ts | 146 | 27 | 41 | 3 | 0 | 2 | 55.2 |
| ResultView | src\App.tsx | 56 | 22 | 23 | 2 | 0 | 0 | 44.7 |
| resolveAmbiguousHash | src\lib\search.ts | 128 | 6 | 8 | 2 | 0 | 0 | 100.0 |
| App | src\App.tsx | 200 | 5 | 4 | 2 | 0 | 1 | 64.3 |
| Field | src\App.tsx | 17 | 1 | 1 | 0 | 0 | 0 | 107.1 |
| Mono | src\App.tsx | 32 | 1 | 1 | 0 | 0 | 0 | 117.5 |
| ExternalLink | src\App.tsx | 42 | 1 | 1 | 0 | 0 | 0 | 108.9 |
| normalizeInput | src\lib\search.ts | 17 | 1 | 1 | 0 | 0 | 0 | 144.7 |

## 4. 파일 메트릭

파일 6개 중 상위 6개 (Max CC 기준).

| 파일 | 언어 | 코드줄 | 함수 | MaxCC | Max인지 | MinMI | TODO | 경고함수 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| src\lib\search.ts | javascript | 195 | 4 | 50 | 95 | 34.0 | 0 | 2 |
| src\App.tsx | javascript | 267 | 5 | 22 | 23 | 44.7 | 0 | 2 |
| eslint.config.js | javascript | 22 | 0 | 0 | 0 | 100.0 | 0 | 0 |
| src\lib\client.ts | javascript | 9 | 0 | 0 | 0 | 100.0 | 0 | 0 |
| src\main.tsx | javascript | 9 | 0 | 0 | 0 | 100.0 | 0 | 0 |
| vite.config.ts | javascript | 5 | 0 | 0 | 0 | 100.0 | 0 | 0 |

## 5. 중복 코드

최소 연속 줄 수: 10

그룹 0건 중 상위 0건 표시.

## 6. 아키텍처

프로젝트 중복률: 0.00%

순환 호출: 0건

파일 연관: 2파일, 1엣지 · 디렉터리: 2개

---

*본 보고서는 정적 분석 메트릭 기반 추정입니다. 목록은 상위 항목만 포함될 수 있습니다.*
