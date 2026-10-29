# Numerical Computing

This chapter collects frequently used functions and short examples by area. Use `help functionName` to see the detailed arguments of each function.

## Creating Matrices

| Function | Contents |
| --- | --- |
| `zeros`, `ones`, `eye`, `rand`, `randn`, `randi` | Zero, one, identity and random matrices |
| `linspace`, `logspace`, `colon (:)` | Evenly spaced vectors |
| `magic`, `hilb`, `pascal`, `vander`, `toeplitz` | Special matrices |
| `meshgrid`, `ndgrid` | Grids |
| `repmat`, `reshape`, `cat`, `permute`, `squeeze` | Reshaping |
| `diag`, `tril`, `triu`, `kron` | Diagonal, triangular, Kronecker |
| `sparse`, `full`, `speye`, `spdiags` | Sparse matrices |

## Linear Algebra

```m
A = [4 -2 1; -2 4 -2; 1 -2 4];
b = [11; -16; 17];
x = A \ b                 % linear system Ax = b
[V, D] = eig(A);          % eigendecomposition
diag(D)'
[U, S, W] = svd(A);       % singular value decomposition
[L, U2, P] = lu(A);       % LU decomposition
R = chol(A);              % Cholesky decomposition
[Q, R2] = qr(A);          % QR decomposition
det(A), rank(A), cond(A), norm(A)
inv(A) * b
expm([0 1; -1 0])         % matrix exponential
```

| Function | Contents |
| --- | --- |
| `\`, `/`, `linsolve`, `lsqr`, `pcg`, `gmres`, `bicgstab` | Linear systems (direct and iterative methods) |
| `inv`, `pinv`, `det`, `rank`, `trace`, `null`, `orth` | Inverse and matrix properties |
| `eig`, `eigs`, `svd`, `svds`, `schur`, `hess`, `qz` | Eigenvalues and singular values |
| `lu`, `qr`, `chol`, `ldl` | Decompositions |
| `norm`, `cond`, `rcond` | Norms and condition numbers |
| `expm`, `logm`, `sqrtm` | Matrix functions |
| `cross`, `dot`, `kron` | Vector and tensor products |

## Polynomials and Interpolation

```m
p = [1 -6 11 -6];         % x^3 - 6x^2 + 11x - 6
r = roots(p)'             % roots: 1 2 3
polyval(p, 4)
q = conv([1 1], [1 -1])   % multiply
dp = polyder(p)           % derivative
x = 0:5; y = [0 1 4 9 16 25];
c = polyfit(x, y, 2)      % least-squares fit
xi = 0:0.5:5;
yi = interp1(x, y, xi, 'spline');
pp = spline(x, y);
ppval(pp, 2.5)
```

Use `interp1` (1-D; 'linear' · 'nearest' · 'pchip' · 'spline'), `interp2`, `interp3`, `interpn`, `griddata`, `pchip`, `spline` and `makima`.

## Numerical Integration and Differentiation

```m
f = @(x) exp(-x.^2);
integral(f, -Inf, Inf)            % sqrt(pi)
integral2(@(x, y) x.*y, 0, 1, 0, 2)
x = linspace(0, pi, 101);
trapz(x, sin(x))                  % trapezoidal rule
cumtrapz(x, sin(x));
gradient(sin(x), x(2) - x(1));    % numerical derivative
diff([1 4 9 16])                  % differences
```

## Ordinary Differential Equations (ODE)

```m
% Damped oscillator: y'' + 0.4 y' + 4 y = 0
f = @(t, y) [y(2); -0.4*y(2) - 4*y(1)];
[t, y] = ode45(f, [0 15], [1; 0]);
plot(t, y(:,1))
xlabel('t'); ylabel('y')
opts = odeset('RelTol', 1e-8, 'AbsTol', 1e-10);
[t2, y2] = ode45(f, [0 15], [1; 0], opts);
```

| Solver | Use |
| --- | --- |
| `ode45` | Most nonstiff problems (try this first) |
| `ode23`, `ode113`, `ode78`, `ode89` | Nonstiff problems at lower or higher accuracy |
| `ode15s`, `ode23s`, `ode23t`, `ode23tb` | Stiff problems |
| `ode15i` | Implicit equations |
| `dde23`, `ddesd` | Delay differential equations |
| `bvp4c`, `bvp5c` | Boundary value problems |
| `pdepe` | 1-D partial differential equations |

Set tolerances, events (`Events`), maximum step and so on with `odeset`, and evaluate a solution struct at the times you want with `deval`.

## Optimization and Solving Equations

```m
fzero(@(x) cos(x) - x, 0.5)                 % equation in one variable
fminbnd(@(x) (x - 2).^2 + 1, 0, 5)          % minimum on an interval
banana = @(p) 100*(p(2) - p(1)^2)^2 + (1 - p(1))^2;
fminsearch(banana, [-1.2 1])                % multivariable minimum (simplex method)
fsolve(@(x) [x(1)^2 + x(2)^2 - 4; x(1) - x(2)], [1; 1])
c = [-1; -2]; A = [1 1; 1 -1]; b = [4; 2];
linprog(c, A, b, [], [], [0; 0])            % linear programming
```

| Function | Contents |
| --- | --- |
| `fzero`, `fsolve`, `roots` | Equations |
| `fminbnd`, `fminsearch`, `fminunc`, `fmincon` | Minimization (unconstrained / constrained) |
| `linprog`, `intlinprog`, `quadprog`, `lsqlin` | Linear, integer and quadratic programming |
| `lsqcurvefit`, `lsqnonlin`, `lsqnonneg` | Nonlinear least squares, curve fitting |
| `ga`, `fminimax`, `fgoalattain` | Genetic algorithm, minimax |
| `optimset`, `optimoptions` | Options (tolerance, display, iteration count) |

## Statistics and Data Analysis

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

| Area | Functions |
| --- | --- |
| Descriptive statistics | `mean`, `median`, `mode`, `std`, `var`, `min`, `max`, `range`, `prctile`, `quantile`, `skewness`, `kurtosis` |
| Correlation · covariance | `corrcoef`, `corr`, `cov` |
| Distributions | `normpdf`, `normcdf`, `norminv`, `normrnd`, `pdf`, `cdf`, `icdf`, `random` |
| Tests | `ttest`, `ttest2`, `anova1`, `chi2gof`, `kstest` |
| Regression | `fitlm`, `regress`, `polyfit`, `lsqcurvefit` |
| Clustering · dimensionality reduction | `kmeans`, `pca` |
| Summarizing | `histcounts`, `accumarray`, `groupsummary`, `movmean`, `smoothdata`, `fillmissing`, `rmmissing` |

## Signal Processing

```m
fs = 1000; t = 0:1/fs:1-1/fs;
x = sin(2*pi*50*t) + 0.5*sin(2*pi*120*t) + 0.3*randn(size(t));
X = fft(x);
f = (0:numel(x)-1) * fs / numel(x);
plot(f(1:500), abs(X(1:500)))
[b, a] = butter(4, 80/(fs/2));       % 4th-order lowpass Butterworth
y = filtfilt(b, a, x);               % zero-phase filtering
[H, w] = freqz(b, a, 512);
```

| Area | Functions |
| --- | --- |
| Transforms | `fft`, `ifft`, `fft2`, `fftshift`, `dct`, `hilbert` |
| Filters | `filter`, `filtfilt`, `conv`, `conv2`, `butter`, `cheby1`, `cheby2`, `ellip`, `fir1`, `firpm`, `freqz` |
| Spectra | `pwelch`, `periodogram`, `spectrogram`, `xcorr` |
| Sampling | `resample`, `upsample`, `downsample`, `decimate`, `interp` |
| Signal generation | `chirp`, `square`, `sawtooth`, `pulstran`, window functions `hamming`, `hann`, `blackman`, `kaiser` |

## Control Systems

```m
G = tf(1, [1 2 5]);          % transfer function 1/(s^2 + 2s + 5)
step(G)                       % step response plot
S = stepinfo(G)
C = pid(2, 1, 0.1);
T = feedback(C*G, 1);         % closed loop
pole(T)
bode(G)
[Gm, Pm] = margin(G)
sys = ss([0 1; -5 -2], [0; 1], [1 0], 0);
K = lqr(sys.A, sys.B, eye(2), 1)
Gd = c2d(G, 0.1);             % discretization
```

| Area | Functions |
| --- | --- |
| Models | `tf`, `ss`, `zpk`, `pid`, `c2d`, `d2c`, `ss2tf`, `tf2ss`, `minreal` |
| Interconnection | `series`, `parallel`, `feedback`, `*`, `+` |
| Time response | `step`, `impulse`, `initial`, `lsim`, `stepinfo` |
| Frequency response | `bode`, `nyquist`, `nichols`, `margin`, `freqresp`, `sigma` |
| Analysis | `pole`, `zero`, `pzmap`, `damp`, `dcgain`, `rlocus`, `ctrb`, `obsv` |
| Design | `lqr`, `dlqr`, `place`, `kalman`, `care`, `dare`, `lyap` |

## Other

- Special functions: `gamma`, `beta`, `erf`, `besselj`, `legendre`, `airy`, `ellipke`, `expint`
- Number theory: `gcd`, `lcm`, `factor`, `primes`, `isprime`, `nchoosek`, `factorial`
- Sets: `unique`, `union`, `intersect`, `setdiff`, `ismember`
- Sorting · searching: `sort`, `sortrows`, `find`, `max`, `min`, `cumsum`, `cumprod`
- Image processing: `imfilter`, `fspecial`, `rgb2gray`, `imresize`, `imrotate`, `edge`, `imbinarize`, `bwlabel`, `regionprops`, `imdilate`, `imerode`, `medfilt2`, `histeq`
- Timing: `tic`, `toc`, `cputime`
