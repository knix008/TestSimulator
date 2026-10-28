# 수치 계산

이 장은 분야별로 자주 쓰는 함수와 짧은 예를 모았습니다. 각 함수의 자세한 인자는 `help 함수이름` 으로 봅니다.

## 행렬 만들기

| 함수 | 내용 |
| --- | --- |
| `zeros`, `ones`, `eye`, `rand`, `randn`, `randi` | 0·1·단위·난수 행렬 |
| `linspace`, `logspace`, `colon (:)` | 등간격 벡터 |
| `magic`, `hilb`, `pascal`, `vander`, `toeplitz` | 특수 행렬 |
| `meshgrid`, `ndgrid` | 격자 |
| `repmat`, `reshape`, `cat`, `permute`, `squeeze` | 모양 바꾸기 |
| `diag`, `tril`, `triu`, `kron` | 대각·삼각·크로네커 |
| `sparse`, `full`, `speye`, `spdiags` | 희소 행렬 |

## 선형대수

```m
A = [4 -2 1; -2 4 -2; 1 -2 4];
b = [11; -16; 17];
x = A \ b                 % 연립방정식 Ax = b
[V, D] = eig(A);          % 고윳값 분해
diag(D)'
[U, S, W] = svd(A);       % 특이값 분해
[L, U2, P] = lu(A);       % LU 분해
R = chol(A);              % 숄레스키 분해
[Q, R2] = qr(A);          % QR 분해
det(A), rank(A), cond(A), norm(A)
inv(A) * b
expm([0 1; -1 0])         % 행렬 지수
```

| 함수 | 내용 |
| --- | --- |
| `\`, `/`, `linsolve`, `lsqr`, `pcg`, `gmres`, `bicgstab` | 연립방정식 (직접법·반복법) |
| `inv`, `pinv`, `det`, `rank`, `trace`, `null`, `orth` | 역행렬과 행렬 성질 |
| `eig`, `eigs`, `svd`, `svds`, `schur`, `hess`, `qz` | 고윳값·특이값 |
| `lu`, `qr`, `chol`, `ldl` | 분해 |
| `norm`, `cond`, `rcond` | 크기와 조건수 |
| `expm`, `logm`, `sqrtm` | 행렬 함수 |
| `cross`, `dot`, `kron` | 벡터·텐서 곱 |

## 다항식과 보간

```m
p = [1 -6 11 -6];         % x^3 - 6x^2 + 11x - 6
r = roots(p)'             % 근: 1 2 3
polyval(p, 4)
q = conv([1 1], [1 -1])   % 곱하기
dp = polyder(p)           % 미분
x = 0:5; y = [0 1 4 9 16 25];
c = polyfit(x, y, 2)      % 최소제곱 맞춤
xi = 0:0.5:5;
yi = interp1(x, y, xi, 'spline');
pp = spline(x, y);
ppval(pp, 2.5)
```

`interp1`(1차원, 'linear' · 'nearest' · 'pchip' · 'spline'), `interp2`, `interp3`, `interpn`, `griddata`, `pchip`, `spline`, `makima` 를 씁니다.

## 수치 적분과 미분

```m
f = @(x) exp(-x.^2);
integral(f, -Inf, Inf)            % sqrt(pi)
integral2(@(x, y) x.*y, 0, 1, 0, 2)
x = linspace(0, pi, 101);
trapz(x, sin(x))                  % 사다리꼴 공식
cumtrapz(x, sin(x));
gradient(sin(x), x(2) - x(1));    % 수치 미분
diff([1 4 9 16])                  % 차분
```

## 상미분 방정식 (ODE)

```m
% 감쇠 진동자: y'' + 0.4 y' + 4 y = 0
f = @(t, y) [y(2); -0.4*y(2) - 4*y(1)];
[t, y] = ode45(f, [0 15], [1; 0]);
plot(t, y(:,1))
xlabel('t'); ylabel('y')
opts = odeset('RelTol', 1e-8, 'AbsTol', 1e-10);
[t2, y2] = ode45(f, [0 15], [1; 0], opts);
```

| 솔버 | 쓰임 |
| --- | --- |
| `ode45` | 대부분의 비강성 문제 (기본으로 먼저 써 볼 것) |
| `ode23`, `ode113`, `ode78`, `ode89` | 낮은·높은 정확도의 비강성 문제 |
| `ode15s`, `ode23s`, `ode23t`, `ode23tb` | 강성(stiff) 문제 |
| `ode15i` | 암시적 방정식 |
| `dde23`, `ddesd` | 지연 미분 방정식 |
| `bvp4c`, `bvp5c` | 경계값 문제 |
| `pdepe` | 1차원 편미분 방정식 |

`odeset` 으로 허용 오차, 이벤트(`Events`), 최대 스텝 등을 정하고, `deval` 로 해 구조체를 원하는 시각에서 계산합니다.

## 최적화와 방정식 풀기

```m
fzero(@(x) cos(x) - x, 0.5)                 % 한 변수 방정식
fminbnd(@(x) (x - 2).^2 + 1, 0, 5)          % 구간 최소
banana = @(p) 100*(p(2) - p(1)^2)^2 + (1 - p(1))^2;
fminsearch(banana, [-1.2 1])                % 다변수 최소 (단체법)
fsolve(@(x) [x(1)^2 + x(2)^2 - 4; x(1) - x(2)], [1; 1])
c = [-1; -2]; A = [1 1; 1 -1]; b = [4; 2];
linprog(c, A, b, [], [], [0; 0])            % 선형 계획
```

| 함수 | 내용 |
| --- | --- |
| `fzero`, `fsolve`, `roots` | 방정식 |
| `fminbnd`, `fminsearch`, `fminunc`, `fmincon` | 최소화 (제약 없음 / 있음) |
| `linprog`, `intlinprog`, `quadprog`, `lsqlin` | 선형·정수·2차 계획 |
| `lsqcurvefit`, `lsqnonlin`, `lsqnonneg` | 비선형 최소제곱, 곡선 맞춤 |
| `ga`, `fminimax`, `fgoalattain` | 유전 알고리즘, 최소최대 |
| `optimset`, `optimoptions` | 옵션 (허용 오차, 표시, 반복 수) |

## 통계와 데이터 분석

```m
data = randn(1000, 1) * 2 + 5;
[mean(data) median(data) std(data) var(data)]
prctile(data, [5 50 95])
histogram(data, 30)
x = (1:20)'; y = 3*x + 2 + randn(20, 1);
mdl = fitlm(x, y);
corrcoef(x, y)
movmean(y, 5);
```

| 분야 | 함수 |
| --- | --- |
| 기술 통계 | `mean`, `median`, `mode`, `std`, `var`, `min`, `max`, `range`, `prctile`, `quantile`, `skewness`, `kurtosis` |
| 상관·공분산 | `corrcoef`, `corr`, `cov` |
| 분포 | `normpdf`, `normcdf`, `norminv`, `normrnd`, `pdf`, `cdf`, `icdf`, `random` |
| 검정 | `ttest`, `ttest2`, `anova1`, `chi2gof`, `kstest` |
| 회귀 | `fitlm`, `regress`, `polyfit`, `lsqcurvefit` |
| 군집·차원 축소 | `kmeans`, `pca` |
| 정리 | `histcounts`, `accumarray`, `groupsummary`, `movmean`, `smoothdata`, `fillmissing`, `rmmissing` |

## 신호 처리

```m
fs = 1000; t = 0:1/fs:1-1/fs;
x = sin(2*pi*50*t) + 0.5*sin(2*pi*120*t) + 0.3*randn(size(t));
X = fft(x);
f = (0:numel(x)-1) * fs / numel(x);
plot(f(1:500), abs(X(1:500)))
[b, a] = butter(4, 80/(fs/2));       % 4차 저역 통과 버터워스
y = filtfilt(b, a, x);               % 위상 지연 없는 필터링
[H, w] = freqz(b, a, 512);
```

| 분야 | 함수 |
| --- | --- |
| 변환 | `fft`, `ifft`, `fft2`, `fftshift`, `dct`, `hilbert` |
| 필터 | `filter`, `filtfilt`, `conv`, `conv2`, `butter`, `cheby1`, `cheby2`, `ellip`, `fir1`, `firpm`, `freqz` |
| 스펙트럼 | `pwelch`, `periodogram`, `spectrogram`, `xcorr` |
| 표본화 | `resample`, `upsample`, `downsample`, `decimate`, `interp` |
| 신호 만들기 | `chirp`, `square`, `sawtooth`, `pulstran`, 창 함수 `hamming`, `hann`, `blackman`, `kaiser` |

## 제어 시스템

```m
G = tf(1, [1 2 5]);          % 전달 함수 1/(s^2 + 2s + 5)
step(G)                       % 계단 응답 그림
S = stepinfo(G)
C = pid(2, 1, 0.1);
T = feedback(C*G, 1);         % 닫힌 루프
pole(T)
bode(G)
[Gm, Pm] = margin(G)
sys = ss([0 1; -5 -2], [0; 1], [1 0], 0);
K = lqr(sys.A, sys.B, eye(2), 1)
Gd = c2d(G, 0.1);             % 이산화
```

| 분야 | 함수 |
| --- | --- |
| 모델 | `tf`, `ss`, `zpk`, `pid`, `c2d`, `d2c`, `ss2tf`, `tf2ss`, `minreal` |
| 연결 | `series`, `parallel`, `feedback`, `*`, `+` |
| 시간 응답 | `step`, `impulse`, `initial`, `lsim`, `stepinfo` |
| 주파수 응답 | `bode`, `nyquist`, `nichols`, `margin`, `freqresp`, `sigma` |
| 해석 | `pole`, `zero`, `pzmap`, `damp`, `dcgain`, `rlocus`, `ctrb`, `obsv` |
| 설계 | `lqr`, `dlqr`, `place`, `kalman`, `care`, `dare`, `lyap` |

## 그 밖

- 특수 함수: `gamma`, `beta`, `erf`, `besselj`, `legendre`, `airy`, `ellipke`, `expint`
- 정수론: `gcd`, `lcm`, `factor`, `primes`, `isprime`, `nchoosek`, `factorial`
- 집합: `unique`, `union`, `intersect`, `setdiff`, `ismember`
- 정렬·찾기: `sort`, `sortrows`, `find`, `max`, `min`, `cumsum`, `cumprod`
- 영상 처리: `imfilter`, `fspecial`, `rgb2gray`, `imresize`, `imrotate`, `edge`, `imbinarize`, `bwlabel`, `regionprops`, `imdilate`, `imerode`, `medfilt2`, `histeq`
- 시간 재기: `tic`, `toc`, `cputime`
