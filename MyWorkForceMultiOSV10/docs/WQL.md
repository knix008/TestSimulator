# WQL

작업 질의는 한 과제 안의 이슈를 고릅니다. 비어 있으면 순위 순으로 모든 이슈입니다. 조건을 나란히 쓰면 AND 입니다.

```text
type = bug AND status != done
assignee = currentUser() sprint = openSprints()
```

## 필드

키, 요약, 설명, 텍스트, 의견, 유형, 상태, 우선순위, 해결, 담당, 보고자, 라벨, 구성 요소, 버전, 스프린트, 에픽, 상위, 포인트, 생성, 수정, 기한, 관찰, sla, 과제(프로젝트), 순위. 영어 이름도 같습니다. `text` 는 키, 요약, 설명, 환경, 의견을 함께 봅니다.

요구 사항과 테스트: `coverage` (failed, blocked, uncovered, notrun, partial, passed, other), `result` (pass, fail, blocked, notrun — 테스트 케이스의 최근 결과), `suspect` (true / false), `category`, `verification`, `level`. 한국어 이름(커버리지, 결과, 재검증, 분류, 검증, 수준)도 됩니다.

## 연산

`= != ~ !~ > >= < <=`, `IN`, `NOT IN`, `IS EMPTY`, `IS NOT EMPTY`, `NOT`, `AND`, `OR`, 괄호. `~` 는 일부를 포함합니다.

우선순위 비교는 최저부터 최고까지의 순서를 씁니다. `priority >= high` 는 높음과 최고입니다.

날짜는 `2026-11-15` 이거나 `-7d`, `-2w`, `-1m`, `-1y` 입니다. 날짜만 적으면 그 날 하루와 같습니다.

## 함수

| 함수 | 뜻 |
| --- | --- |
| `currentUser()` | 지금 사용자 |
| `openSprints()` | 진행 중인 스프린트 |
| `now()` | 지금 시각 |

`assignee = 없음` 과 `assignee is empty` 는 담당이 없는 이슈입니다.

## 기한

`sla = breached` 는 아직 열려 있고 기한을 넘긴 장애와 서비스 요청입니다. `sla = met` 는 기한 안에 닫힌 것, `sla = missed` 는 기한을 넘겨 닫힌 것입니다.

## 정렬

`ORDER BY priority DESC, rank ASC` 처럼 끝에서 정렬합니다. 이슈 화면의 열 머리도 같은 정렬을 더합니다. 질의에 이미 ORDER BY 가 있으면 열 머리는 그대로 둡니다.
