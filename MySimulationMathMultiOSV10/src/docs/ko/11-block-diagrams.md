# 블록 다이어그램 시뮬레이션

블록 다이어그램 편집기는 신호가 흐르는 블록과 선으로 동적 시스템을 그리고, 수치 솔버로 시간에 따라 시뮬레이션합니다. 모델은 `.smdl` 파일(JSON 텍스트)로 저장됩니다.

![모델 편집기: 왼쪽 라이브러리, 가운데 캔버스, 위쪽 도구 모음](images/ko/model-editor.png)

## 모델 열기와 만들기

- 리본 **홈 › 새 모델**, **시뮬레이션 › 새 모델**, 시작 화면의 **새 모델**.
- **시뮬레이션 › 모델 열기** 나 현재 폴더에서 `.smdl` 을 두 번 클릭. `.slx` · `.mdl` 파일은 흔한 블록을 읽어 들입니다.
- 명령으로: `new_system('mymodel')`, `open_system('mymodel')`.

모델 탭의 화면은 위쪽 **도구 모음**, 왼쪽 **블록 라이브러리**, 가운데 **캔버스**, 아래쪽 **진단** 목록으로 되어 있습니다. 서브시스템 안으로 들어가면 캔버스 위에 경로(브레드크럼)가 나와 누르면 위로 돌아갑니다.

## 블록 라이브러리

![블록 라이브러리와 검색](images/ko/model-library.png)

| 묶음 | 대표 블록 |
| --- | --- |
| 소스 | Constant, Step, Ramp, Sine Wave, Pulse Generator, Clock, Signal Generator, Chirp Signal, Random Number, Band-Limited White Noise, From Workspace, Repeating Sequence, Signal Builder, Counter, Ground |
| 싱크 | Scope, Floating Scope, XY Graph, Display, To Workspace, Terminator, Stop Simulation |
| 연속 | Integrator, Derivative, Transfer Fcn, State-Space, Zero-Pole, Transport Delay, Variable Transport Delay, PID Controller |
| 이산 | Unit Delay, Delay, Zero-Order Hold, Discrete-Time Integrator, Discrete Transfer Fcn, Discrete Filter, Discrete State-Space, Discrete PID Controller, Memory, Difference, Tapped Delay 등 |
| 수학 연산 | Sum, Product, Gain, Slider Gain, Abs, Sign, Math Function, Trigonometric Function, Sqrt, MinMax, Rounding Function, Bias, Dot Product, Polynomial, Reshape 등 |
| 불연속 | Saturation, Dead Zone, Rate Limiter, Relay, Quantizer, Backlash, Coulomb & Viscous Friction, Hit Crossing, Wrap To Zero 등 |
| 논리·비트 | Relational Operator, Logical Operator, Compare To Constant, Compare To Zero, Bitwise Operator, Interval Test, Combinatorial Logic 등 |
| 룩업 테이블 | 1-D / 2-D / n-D Lookup Table, Prelookup, Direct Lookup Table, Lookup Table Dynamic, Sine and Cosine |
| 신호 라우팅 | Mux, Demux, Bus Creator, Bus Selector, Switch, Multiport Switch, Manual Switch, Selector, Goto, From, Merge, Data Store Memory/Read/Write |
| 신호 속성 | Data Type Conversion, Signal Specification, Width, Probe, Rate Transition, IC |
| 포트·서브시스템 | Subsystem, In, Out, Enable, Trigger, Action Port, For Iterator, While Iterator, If, Switch Case |
| 사용자 함수 | Fcn, M Function, Interpreted M Function |

- 위쪽 검색 칸에 이름을 쓰면 모든 묶음에서 찾습니다.
- 블록을 캔버스로 **끌어 놓거나**, **두 번 클릭** 하면 캔버스 가운데에 추가됩니다.
- 블록에 마우스를 올리면 설명이 나옵니다.

## 블록과 선 다루기

| 동작 | 방법 |
| --- | --- |
| 선택 | 클릭, {{Shift}}/{{Ctrl}}+클릭으로 더하기, 빈 곳에서 끌어 상자 선택 |
| 옮기기 | 끌기 (격자 스냅이 켜져 있으면 격자에 맞춤), 화살표 키 |
| 크기 | 선택한 블록의 모서리 손잡이 끌기 |
| 선 잇기 | 출력 포트(오른쪽 ▸)에서 입력 포트(왼쪽)로 끌기 |
| 분기 | 이미 있는 선 위에서 끌어 다른 입력 포트로 |
| 선 꺾기 | 선을 끌어 꺾는 점 옮기기 |
| 신호 이름 | 선을 두 번 클릭 ({{Enter}} 확인, {{Esc}} 취소) |
| 파라미터 | 블록 두 번 클릭 |
| 복사 / 붙여넣기 / 복제 | {{Ctrl+C}} / {{Ctrl+V}} / {{Ctrl+D}} |
| 회전 / 뒤집기 | {{Ctrl+R}} / {{Ctrl+I}} |
| 서브시스템 만들기 | 블록 여러 개 선택 후 {{Ctrl+G}} |
| 마스크 | {{Ctrl+M}} (마스크 편집기) |
| 삭제 | {{Del}} |
| 실행 취소 / 다시 실행 | {{Ctrl+Z}} / {{Ctrl+Y}} |
| 확대·축소 / 이동 | 휠 / {{Space}}+끌기 또는 가운데 버튼 끌기 |
| 화면에 맞춤 | {{Ctrl+0}} |

블록이나 선을 오른쪽 클릭하면 같은 동작과 **이름 표시**, **신호 로깅**, **플로팅 스코프에 추가** 가 있는 메뉴가 나옵니다.

## 블록 파라미터

![블록 파라미터 대화 상자](images/ko/model-params.png)

블록을 두 번 클릭하면 파라미터 대화 상자가 열립니다. 값은 **M 식** 으로 씁니다: `2*pi`, `[1 2 1]`, 작업 공간 변수 `K` 처럼. 식은 시뮬레이션을 시작할 때 모델 작업 공간과 기본 작업 공간에서 계산됩니다. **적용** 은 대화 상자를 연 채로 반영하고, Constant · Slider Gain · Manual Switch 같은 블록은 시뮬레이션 중에도 값을 바꿀 수 있습니다.

## 모델 설정과 솔버

도구 모음의 **설정**({{Ctrl+E}})은 모델 설정 창을 엽니다.

![모델 설정: 솔버 탭](images/ko/model-settings.png)

| 탭 | 항목 |
| --- | --- |
| 솔버 | 시작·정지 시간, 종류(가변 스텝 / 고정 스텝), 솔버, 최대·최소·초기 스텝, 상대·절대 허용 오차, 영교차 검출 |
| 데이터 가져오기/내보내기 | 시간(`tout`)·출력(`yout`)·상태(`xout`) 저장, 신호 로깅(`logsout`), 단일 시뮬레이션 출력(`out`), 데이터 점 수 제한, 데시메이션 |
| 진단 | 대수 루프 처리(없음 · 경고 · 오류) |
| 모델 작업 공간 | 이 모델에서만 쓰는 변수(이름과 값) |

| 솔버 | 종류 | 쓰임 |
| --- | --- | --- |
| `auto` | 자동 | 연속 상태가 있으면 `ode45`(고정 스텝이면 `ode3`), 없으면 `discrete` |
| `ode45`, `ode23`, `ode113`, `ode8` | 가변 스텝 | 비강성 문제 |
| `ode15s`, `ode23s`, `ode23t`, `ode23tb` | 가변 스텝 | 강성 문제 |
| `ode1` … `ode5`, `ode14x` | 고정 스텝 | 실시간처럼 일정한 간격이 필요할 때 |
| `discrete` | 고정·가변 | 연속 상태가 없는 모델 |

**시뮬레이션 속도 조절**(pacing)을 켜면 실제 1초에 정한 만큼의 시뮬레이션 시간만 흘러, 결과를 천천히 지켜볼 수 있습니다. 리본의 시뮬레이션 기본 솔버와 정지 시간은 설정 › 시뮬레이션에서 정합니다.

## 실행

| 단추 | 키 | 동작 |
| --- | --- | --- |
| 실행 | {{Ctrl+T}} | 컴파일한 뒤 정지 시간까지 시뮬레이션 |
| 일시 정지 / 계속 | | 멈춤과 이어 하기 |
| 한 단계 | | 시간 스텝 하나 진행 |
| 정지 | | 끝내고 결과를 작업 공간에 씀 |
| 갱신 | {{Ctrl+Shift+D}} | 실행하지 않고 컴파일: 포트 폭과 샘플 시간 확인 |

도구 모음에 현재 시뮬레이션 시간과 진행 막대가 나옵니다. 오류와 경고는 아래쪽 **진단** 목록에 나오며, 항목을 누르면 해당 블록이 선택됩니다. **속도 색** 을 켜면 블록과 선이 샘플 시간별 색으로 표시됩니다.

## 스코프

![스코프 창](images/ko/model-scope.png)

Scope 블록을 두 번 클릭하면 스코프 창이 열립니다. 시뮬레이션 중에 신호가 실시간으로 그려집니다.

- **자동 범위**, **데이터 맞춤**: 축 범위를 데이터에 맞춤
- **따라가기**: 시간축이 최신 값을 따라감
- **커서**: 두 개의 세로 커서로 시각과 값, 차이(Δ)를 읽음
- **범례**, **겹치기**: 여러 입력을 한 축에 겹쳐 그림
- 휠로 확대/축소, 끌어서 이동

XY Graph 는 두 신호를 x–y 평면에, Display 는 현재 값을 블록 안에 숫자로 보여 줍니다.

## 결과를 작업 공간으로

시뮬레이션이 끝나면(또는 정지하면) 결과가 기본 작업 공간에 써집니다. **단일 시뮬레이션 출력** 이 켜져 있으면 `out` 하나에 모이고, 꺼져 있으면 `tout`, `yout`, `logsout` 과 To Workspace 블록의 변수가 따로 생깁니다.

`yout` 은 최상위 Out 블록들의 신호(시간 × 포트), `tout` 은 시간 벡터입니다. 아래 예는 모델을 코드로 만든 뒤 실행해 결과를 그립니다.

## 코드로 모델 만들기

```m
new_system('demo');
add_block('Sources/Sine Wave', 'demo/Sine');
add_block('Math Operations/Gain', 'demo/Gain', 'Gain', '2.5');
add_block('Sinks/Scope', 'demo/Scope');
add_block('Sinks/Out', 'demo/Out1');
add_line('demo', 'Sine/1', 'Gain/1');
add_line('demo', 'Gain/1', 'Scope/1');
add_line('demo', 'Gain/1', 'Out1/1');
set_param('demo', 'StopTime', '10', 'Solver', 'ode45');
save_system('demo');
open_system('demo');          % 편집기 탭에서 보기
out = sim('demo', 'StopTime', '20');
plot(out.tout, out.yout)      % Out 블록의 신호
```

`get_param`, `set_param`, `find_system`, `delete_block`, `delete_line`, `replace_block`, `gcs`, `gcb`, `bdroot`, `close_system` 과 여러 조건을 한꺼번에 돌리는 `SimulationInput` · `parsim` 도 씁니다. 자세한 것은 `help add_block` 처럼 확인하세요.

## 서브시스템과 마스크

- 블록 여러 개를 고르고 **서브시스템 만들기**({{Ctrl+G}})를 하면 In/Out 포트가 있는 Subsystem 블록 하나로 묶입니다. 두 번 클릭하면 안으로 들어갑니다.
- Enable, Trigger, Action Port 를 서브시스템 안에 두면 조건부로 실행되는 서브시스템이 됩니다(If, Switch Case 와 함께).
- **마스크 편집기**({{Ctrl+M}})로 서브시스템에 자신의 파라미터 대화 상자, 설명, 아이콘 글자, 초기화 코드를 붙입니다.
