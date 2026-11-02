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
| 선 모양 | 선 오른쪽 클릭 › **직선** / **꺾은 선** / **곡선**, 또는 선을 고른 뒤 **블록 속성** 창의 **색 › 선 모양** |
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

블록이나 선을 오른쪽 클릭하면 같은 동작과 **이름 표시**, **신호 로깅**, **플로팅 스코프에 추가** 가 있는 메뉴가 나옵니다. 블록 메뉴에는 **입력·출력 그래프**(아래 스코프 참고)가, 캔버스 빈 곳의 메뉴에는 **모델을 스크립트로 변환** 이 있습니다.

캔버스의 블록에 마우스를 올리면 블록 이름, 종류, 설명이 나옵니다. 선에 올리면 신호 이름과 (시뮬레이션 뒤에는) 값과 폭이 나옵니다.

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

실행 단추는 상태에 따라 바뀌며, 모델 도구 모음과 리본 **시뮬레이션** 탭이 같은 규칙을 따릅니다.

| 상태 | 누를 수 있는 단추 |
| --- | --- |
| 멈춤 · 끝남 | 실행, 한 단계 |
| 실행 중 | 일시 정지, 정지 |
| 일시 정지 | 계속(실행 단추), 일시 정지(눌린 상태, 다시 누르면 계속), 한 단계, 정지 |
| 컴파일 중 | 정지 |

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

**실행** 을 누르면 모델에 있는 모든 Scope · Floating Scope · XY Graph 의 창이 열립니다. 서브시스템 안의 것과 전에 닫은 창도 포함하며, 한 번에 8개까지입니다. 삭제한 스코프의 창은 사라집니다.

### 입력·출력 그래프

블록을 오른쪽 클릭 › **입력·출력 그래프** 를 고르면 블록 옆에 블록 이름 뒤에 IO 를 붙인 Floating Scope(예: `Gain IO`) 가 생깁니다. 이 스코프는 블록으로 들어오는 신호(입력 포트 순서)와 블록의 출력을 보여 주며, 창이 열리고 시뮬레이션이 바로 실행됩니다.

- 같은 블록에서 다시 고르면 새로 만들지 않고 있던 스코프를 씁니다.
- 보통 블록과 같아서 모델과 함께 저장되고, {{Ctrl+Z}} 로 되돌리며, 다 보았으면 삭제합니다.
- 들어오는 선도 출력도 없는 블록에서는 메뉴가 흐리게 나옵니다.

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

## 코드 보기와 스크립트로 변환

모델 도구 모음의 **코드** 를 켜면 캔버스 오른쪽에 지금 다이어그램을 M 코드로 쓴 **코드 보기** 가 나옵니다. 캔버스와 코드 보기 사이의 경계를 끌어 너비를 바꾸며, 너비는 기억됩니다. 코드를 고친 뒤 **적용**({{Ctrl+Enter}} / {{F5}})을 누르면 그 코드로 열린 모델의 다이어그램이 다시 만들어집니다(다이어그램에서 {{Ctrl+Z}} 로 되돌림). **되돌리기** 는 고친 내용을 버리고, **스크립트로 열기** 는 코드를 스크립트 탭으로 엽니다. 시뮬레이션 중에는 적용할 수 없습니다.

도구 모음의 **스크립트로**(또는 캔버스 빈 곳 오른쪽 클릭 › **모델을 스크립트로 변환**)는 모델을 혼자서 실행되는 M 스크립트로 바꿔 새 탭에 엽니다. 이 스크립트를 실행하면:

- 모델이 없으면 만들고, 이미 열려 있으면 비운 뒤 다시 만듭니다.
- 모델 작업 공간의 값을 변수로 정해 블록이 읽을 수 있게 합니다.
- 마지막에 모델을 엽니다.

코드 보기는 열린 모델을 고치는 곳이고, 스크립트로 변환한 것은 모델을 다시 만드는 별도의 파일입니다.

## 수식으로 모델 만들기

모델 편집기 도구 모음의 **수식** 을 누르면 수식을 블록 다이어그램으로 바꾸는 창이 열립니다. 스크립트 편집기의 **모델로 변환** 도 같은 창을 스크립트 내용으로 채워 엽니다(이때는 **새 모델** 만 있습니다). 왼쪽에 수식을 쓰면 오른쪽에 만들어질 다이어그램과 상태·입력·매개변수가 바로 보이고, 틀린 곳이 있으면 몇 번째 줄인지 알려 줍니다. **새 모델** 은 새 탭으로 열고, **이 다이어그램에 넣기** 는 지금 다이어그램 아래에 블록을 넣습니다 (Ctrl+Z로 되돌림). 종류는 **자동** 이면 글에서 알아냅니다.

| 종류 | 쓰는 법 | 만들어지는 블록 |
| --- | --- | --- |
| 미분방정식 | `x'' = -c*x' - k*x + u`, `x(0) = 1` | 상태마다 적분기, 항마다 이득·상수·Fcn, 합 |
| 전달 함수 | `G = (s + 1)/(s^2 + 2*s + 1)` | 전달 함수 (z와 `Ts = 0.1` 이면 이산 전달 함수) |
| 상태 공간 | `A = [0 1; -2 -3]`, `B = [0; 1]`, `C = [1 0]`, `D = 0` | 상태 공간 (`Ts` 가 있으면 이산) |

- 미분은 `x'`, `x''` 외에 `dx/dt`, `d2x/dt2`, `der(x)` 로도 씁니다. 초기값은 `x(0) = …`, `x'(0) = …`.
- `k = 4` 처럼 상수인 정의는 **매개변수** 로 모델 작업 공간에 들어가고, `y = 2*x` 처럼 신호를 읽는 정의는 **신호** 가 됩니다. 아무 식도 읽지 않는 정의가 있으면 그것을, 없으면 상태를 스코프와 Out 블록에 연결합니다.
- 정의하지 않은 이름은 **입력** 이 되어 계단·사인파·상수·입력 포트 중 고른 블록으로 들어오고, `t` 는 시계 블록입니다.
- `C = 2 + 1/s`, `P = 1/(s + 1)`, `L = C*P` 처럼 전달 함수를 서로 조합하면 마지막 것만 블록이 됩니다.

### 오류 힌트

식이 틀리면 오류 아래에 **고치는 방법** 이 나옵니다. 고칠 곳이 분명하면 바뀔 줄과 **고치기** 버튼이 함께 나오고, 누르면 수식이 그대로 바뀝니다 (**고치기 취소** 로 되돌림). 고친 결과는 미리 만들어 보고, 나아지는 것만 보여 줍니다.

| 틀린 수식 | 힌트 · 고친 수식 |
| --- | --- |
| `x'' + c*x' + k*x = u` | 가장 높은 미분을 왼쪽에: `x'' = u - c*x' - k*x` |
| `x'(t) = -x(t)` | 시간 인수를 빼기: `x' = -x` |
| `x' = sn(x)`, `x' = ln(x)` | 비슷한 함수: `sin(x)`, `log(x)` |
| `x' = k(x + 1)` | 곱셈이면 `k*(x + 1)` |
| `x' = -(x + 1`, `x' = 1,5*x`, `x' == -x`, `×`, `θ` | 괄호 닫기, `1.5`, `=`, `*`, `theta` |
| `x = 3` (x가 상태일 때) | 초기값: `x(0) = 3` |
| `xdot = -x`, `G = 1/(S + 1)` | `x' = -x`, 소문자 `s` |
| z 전달 함수에 `Ts` 없음, `G = K/(s + 1)` 에서 `K` 없음 | `Ts = 0.1`, `K = 1` 을 맨 위에 추가 (1은 임시 값) |
| `B = [0 1]`, `C = [1; 0]`, 크기가 틀린 `D` · `x0` | 열·행으로 바꾸기, 맞는 크기로 채우기 |

식이 만들어져도 `kk` 처럼 정의한 이름(`k`)과 비슷한 입력이 있으면 **확인** 에 오타일지 모른다고 알려 줍니다. M 함수(`eq2model` 등)의 오류 메시지 끝에도 같은 힌트가 `Hint:` 로 붙습니다.

같은 일을 M 코드로도 합니다. 모델을 만들고 편집기 탭으로 엽니다 (`'Open', 'off'` 이면 열지 않음).

```m
eq2model('spring', {"k = 4; c = 0.5", "x'' = -c*x' - k*x + u", "x(0) = 1"}, 'StopTime', 20);
ode2model('pend', "th'' = -9.81*sin(th)", 'th(0) = 0.5');
tf2model('plant', [1], [1 2 1]);          % 또는 tf2model('plant', tf(1, [1 2 1]))
ss2model('ss1', [0 1; -2 -3], [0; 1], [1 0], 0);
out = sim('spring');
```

## 서브시스템과 마스크

- 블록 여러 개를 고르고 **서브시스템 만들기**({{Ctrl+G}})를 하면 In/Out 포트가 있는 Subsystem 블록 하나로 묶입니다. 두 번 클릭하면 안으로 들어갑니다.
- Enable, Trigger, Action Port 를 서브시스템 안에 두면 조건부로 실행되는 서브시스템이 됩니다(If, Switch Case 와 함께).
- **마스크 편집기**({{Ctrl+M}})로 서브시스템에 자신의 파라미터 대화 상자, 설명, 아이콘 글자, 초기화 코드를 붙입니다.
