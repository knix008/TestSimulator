# M 언어

M 언어는 행렬을 기본 자료로 쓰는 수치 계산 언어입니다. 모든 숫자는 기본적으로 배정밀도(`double`) 행렬이고, 스칼라는 1×1 행렬입니다.

## 변수와 식

```m
a = 3;              % 스칼라
v = [1 2 3];        % 행 벡터 (쉼표나 공백)
w = [1; 2; 3];      % 열 벡터 (세미콜론)
M = [1 2; 3 4];     % 2×2 행렬
r = 0:0.25:1        % 시작:간격:끝
z = 3 + 4i;         % 복소수
abs(z)
```

- 변수 이름은 글자로 시작하고 글자·숫자·밑줄을 씁니다. 대소문자를 가립니다.
- `%` 뒤는 주석이고, `%{ … %}` 는 여러 줄 주석입니다.
- `pi`, `Inf`, `NaN`, `eps`, `i`, `j`, `true`, `false` 는 미리 정해진 값입니다.

## 연산자

| 연산 | 행렬 | 원소별 |
| --- | --- | --- |
| 곱하기 | `A*B` | `A.*B` |
| 나누기 | `A/B`, `A\B` (연립방정식) | `A./B` |
| 거듭제곱 | `A^2` | `A.^2` |
| 전치 | `A.'` (켤레 전치 `A'`) | |
| 비교 | | `==` `~=` `<` `<=` `>` `>=` |
| 논리 | `&&` `\|\|` (스칼라, 단락) | `&` `\|` `~` `xor` |

크기가 다른 배열끼리의 원소별 연산은 크기가 1인 차원을 늘려 맞춥니다(암묵적 확장). 예: `[1;2;3] + [10 20]` 은 3×2 행렬입니다.

## 인덱싱

```m
A = magic(4);
A(2,3)          % 2행 3열
A(2,:)          % 2행 전체
A(:,end)        % 마지막 열
A(end,end)
A(A > 10)       % 논리 인덱싱: 10보다 큰 원소
A(1,:) = [];    % 1행 지우기
B = zeros(2);
B(3,3) = 7      % 넘치게 쓰면 행렬이 커짐
```

인덱스는 1부터 시작합니다. `end` 는 그 차원의 마지막 위치이고 `:` 는 전체입니다. 한 개의 인덱스로 쓰면 열 방향으로 차례로 센 위치(선형 인덱스)입니다.

## 자료형

| 종류 | 만들기 | 예 |
| --- | --- | --- |
| 실수·복소수 | `double`, `single` | `x = 1.5` |
| 정수 | `int8` … `int64`, `uint8` … `uint64` | `n = int32(7)` |
| 논리 | `true`, `false`, 비교 결과 | `m = x > 0` |
| 문자 배열 | 작은따옴표 | `c = 'hello'` |
| 문자열 | 큰따옴표, `string` | `s = "hello"` |
| 셀 배열 | 중괄호 | `C = {1, 'a', [1 2 3]}` |
| 구조체 | 점 표기, `struct` | `p.name = "Kim"; p.age = 30;` |
| 테이블 | `table`, `readtable` | `T = table(x', y')` |
| 함수 핸들 | `@` | `f = @(x) x.^2 + 1` |
| 날짜·시간 | `datetime`, `duration` | `d = datetime('now')` |
| 범주 | `categorical` | `g = categorical({'a','b','a'})` |
| 맵 | `containers.Map` | `m = containers.Map()` |

```m
C = {1, 'text', magic(3)};
C{3}(2,2)            % 셀 안의 값
s = struct('a', 1, 'b', "two");
s.c = [1 2 3];
fieldnames(s)
str = "값은 " + string(42)
T = table([1;2;3], ["a";"b";"c"], 'VariableNames', {'n', 'name'});
T.n'
```

## 제어 흐름

```m
for k = 1:3
    fprintf('k = %d\n', k);
end

n = 10;
while n > 1
    if mod(n, 2) == 0
        n = n / 2;
    else
        n = 3*n + 1;
    end
end

switch 'b'
    case {'a', 'b'}
        disp('a 또는 b')
    otherwise
        disp('그 밖')
end
```

`break` 는 반복을 빠져나오고, `continue` 는 다음 반복으로 넘어갑니다.

## 함수

```m
f = @(x, y) x.^2 + y.^2;     % 익명 함수
f(3, 4)
g = @sin;                     % 함수 핸들
integral(g, 0, pi)
arrayfun(@(k) k^2, 1:4)
cellfun(@numel, {'ab', 'cde', ''})
```

함수 파일(`이름.mym`)은 `function [출력…] = 이름(입력…)` 으로 시작합니다. `nargin`, `nargout` 으로 인자 개수를, `varargin`, `varargout` 으로 가변 인자를 다룹니다. 입력 검사는 `arguments` 블록, `validateattributes`, `inputParser` 로 합니다.

## 스크립트

> 파일 확장자: 이 프로그램은 M 파일을 `.mym` 으로 저장합니다. 기존 `.m` 파일도 그대로 열고 실행하며 경로에서 찾습니다. 같은 이름의 `.mym` 과 `.m` 이 함께 있으면 `.mym` 을 씁니다.

스크립트는 `function` 없이 문장을 늘어놓은 `.mym` 파일입니다. 작업 공간의 변수를 그대로 읽고 씁니다. 이름만 치면(현재 폴더나 경로에 있을 때) 실행되며, `run 경로` 도 됩니다. 파일 끝에 지역 함수를 둘 수 있습니다.

## 문자열과 출력

```m
name = "world";
msg = sprintf('Hello, %s! pi = %.4f', name, pi)
parts = strsplit('a,b,c', ',')
upper("abc")
regexprep('2026-10-28', '(\d+)-(\d+)-(\d+)', '$3.$2.$1')
num2str(pi, 8)
fprintf('%5.2f\n', [1.234 5.678])
```

## 클래스

```m
classdef Account < handle
    properties
        Owner string
        Balance double = 0
    end
    methods
        function obj = Account(owner)
            obj.Owner = owner;
        end
        function deposit(obj, amount)
            if amount <= 0
                error('Account:amount', '금액은 0보다 커야 합니다.');
            end
            obj.Balance = obj.Balance + amount;
        end
    end
end
```

위 코드를 `Account.mym` 으로 저장한 뒤:

```m
a = Account("Kim");
a.deposit(100);
a.Balance
```

`handle` 을 물려받으면 참조로, 그렇지 않으면 값으로 다뤄집니다. `properties`(접근 제한, 기본값, 형식), `methods`(정적 메서드 `Static`), `events`, `enumeration`, 상속(`<`)을 지원합니다.

## 오류 처리

```m
try
    x = [1 2 3];
    y = x(5);
catch err
    disp(err.identifier)
    disp(err.message)
end

warning('off', 'all');   % 경고 끄기
warning('on', 'all');
assert(1 + 1 == 2, '수학이 틀렸습니다')
```

`error('식별자:이름', '메시지 %d', 값)` 으로 오류를 내고, `MException` 객체로 만들어 `throw`, `rethrow` 할 수 있습니다. 오류 메시지의 파일:줄 링크를 누르면 그 자리로 갑니다.

## 도움말 찾기

- `help 함수` — 함수 설명과 사용법
- `lookfor 낱말` — 설명에 낱말이 들어간 함수 목록
- `doc 함수` — 자세한 도움말
- `which 함수`, `exist 이름` — 어디서 오는지, 무엇인지
