// Example scripts shown on the start page (샘플·예제), grouped by category.
// They are kept here, not as files, so they work the same on the desktop and
// on the web: opening one creates an unsaved script with the code, ▶ runs it
// in the Command Window. name / desc are [한국어, English].

export const SAMPLE_CATEGORIES = [
  { id: 'basics', icon: 'code', name: ['기초', 'Basics'] },
  { id: 'plot2d', icon: 'plotLine', name: ['2D 그래프', '2D plots'] },
  { id: 'plot3d', icon: 'plotSurf', name: ['3D 그래프', '3D plots'] },
  { id: 'numerics', icon: 'flow', name: ['수치 해석', 'Numerics'] },
  { id: 'linalg', icon: 'table', name: ['선형 대수', 'Linear algebra'] },
  { id: 'signal', icon: 'waves', name: ['신호 · 영상', 'Signal · image'] },
  { id: 'stats', icon: 'plotHist', name: ['통계 · 데이터', 'Statistics · data'] },
  { id: 'optim', icon: 'target', name: ['최적화 · 피팅', 'Optimization · fitting'] },
  { id: 'control', icon: 'gauge', name: ['제어', 'Control'] },
  { id: 'text', icon: 'hash', name: ['문자열 · 자료형', 'Text · data types'] },
  { id: 'program', icon: 'script', name: ['프로그래밍', 'Programming'] },
];

const S = (id, cat, icon, color, tags, name, desc, code) => ({ id, cat, icon, color, tags, name, desc, code });

export const SAMPLES = [
  // ── Basics ──
  S('hello', 'basics', 'terminal', '#4cc9f0', ['disp', 'fprintf'], ['처음 시작하기', 'Getting started'], ['변수, 행렬, 연산, 출력의 기본', 'Variables, matrices, operators and output'],
    `% Getting started: variables, matrices and output.
a = 3;
b = [1 2 3; 4 5 6]
c = b' * a          % transpose and scale
d = b .^ 2          % element-wise power
total = sum(b(:))
fprintf('The mean of b is %.3f\\n', mean(b(:)));
disp('Done.');
`),
  S('indexing', 'basics', 'grid', '#7b61ff', ['index', 'end', 'logical'], ['인덱싱', 'Indexing'], ['행·열 선택, end, 논리 인덱싱, 삭제', 'Rows, columns, end, logical indexing and deletion'],
    `% Indexing: subscripts, ranges, end and logical masks.
A = magic(5)
row2 = A(2, :)
lastCol = A(:, end)
corner = A(1:2, end-1:end)
big = A(A > 20)'          % logical indexing
A(A < 5) = 0              % assign through a mask
A(:, 3) = []              % delete a column
[r, c] = find(A == max(A(:)))
`),
  S('loops', 'basics', 'refresh', '#f5c451', ['for', 'while', 'if'], ['반복문과 조건문', 'Loops and conditions'], ['for, while, if/elseif, switch로 콜라츠 수열 만들기', 'for, while, if/elseif and switch on the Collatz sequence'],
    `% Control flow: the Collatz sequence and a small classifier.
n = 27; steps = 0; peak = n;
while n ~= 1
    if mod(n, 2) == 0
        n = n / 2;
    else
        n = 3*n + 1;
    end
    steps = steps + 1;
    peak = max(peak, n);
end
fprintf('27 reaches 1 in %d steps (peak %d)\\n', steps, peak);
for k = [-2 0 5]
    switch sign(k)
        case -1, fprintf('%d is negative\\n', k);
        case 0,  fprintf('%d is zero\\n', k);
        otherwise, fprintf('%d is positive\\n', k);
    end
end
`),
  S('vectorize', 'basics', 'chevronsUp', '#2ec4b6', ['tic', 'toc', 'vectorize'], ['벡터화', 'Vectorization'], ['반복문과 벡터 연산의 속도 비교', 'Loop vs vectorized code timing'],
    `% Vectorization: the same sum with a loop and with array operations.
n = 2e5;
tic; s1 = 0; for k = 1:n, s1 = s1 + 1/k^2; end; tLoop = toc;
tic; s2 = sum(1 ./ (1:n).^2); tVec = toc;
fprintf('loop %.4f s, vectorized %.4f s, difference %.2e\\n', tLoop, tVec, abs(s1 - s2));
fprintf('pi^2/6 = %.10f, partial sum = %.10f\\n', pi^2/6, s2);
`),

  // ── 2D plots ──
  S('plot2d', 'plot2d', 'plotLine', '#4cc9f0', ['plot', 'legend', 'grid'], ['2D 선 그래프', '2D line plot'], ['두 함수, 범례, 격자', 'Two functions, a legend and a grid'],
    `% Line plots: two functions, a legend and a grid.
x = linspace(0, 4*pi, 400);
plot(x, sin(x), 'LineWidth', 1.5); hold on
plot(x, exp(-0.2*x) .* cos(2*x), '--', 'LineWidth', 1.5); hold off
grid on
xlabel('x'); ylabel('y');
title('sin(x) and a damped cosine');
legend('sin(x)', 'e^{-0.2x} cos(2x)');
`),
  S('subplots', 'plot2d', 'layout', '#ff9f1c', ['subplot', 'bar', 'stem'], ['여러 그래프 배치', 'Subplots'], ['subplot으로 막대, 계단, 줄기, 영역 그래프', 'Bar, stairs, stem and area plots with subplot'],
    `% Subplots: four kinds of 2D charts.
x = 1:10; y = [3 5 2 8 6 9 4 7 5 6];
subplot(2, 2, 1); bar(x, y); title('bar');
subplot(2, 2, 2); stairs(x, y, 'LineWidth', 1.5); title('stairs');
subplot(2, 2, 3); stem(x, y, 'filled'); title('stem');
subplot(2, 2, 4); area(x, cumsum(y)); title('area (cumulative)');
`),
  S('scatter', 'plot2d', 'plotScatter', '#f72585', ['scatter', 'colorbar'], ['산점도', 'Scatter plot'], ['크기와 색으로 값을 표현한 산점도', 'Marker size and colour mapped to values'],
    `% Scatter plot with size and colour mapped to data.
rng(3);
x = randn(300, 1); y = 0.6*x + 0.5*randn(300, 1);
r = sqrt(x.^2 + y.^2);
scatter(x, y, 10 + 30*r, r, 'filled');
colorbar; grid on; axis equal
title('Correlated samples'); xlabel('x'); ylabel('y');
`),
  S('polar', 'plot2d', 'plotPolar', '#7b61ff', ['polarplot', 'rose'], ['극좌표 그래프', 'Polar plot'], ['장미 곡선과 나선', 'A rose curve and a spiral'],
    `% Polar plots: a rose curve and an Archimedean spiral.
theta = linspace(0, 2*pi, 600);
polarplot(theta, cos(4*theta), 'LineWidth', 1.5); hold on
polarplot(theta, theta / (2*pi), '--'); hold off
title('r = cos(4\\theta) and r = \\theta / 2\\pi');
`),
  S('logplot', 'plot2d', 'plotLog', '#4ade80', ['loglog', 'semilogy'], ['로그 눈금', 'Log scales'], ['loglog와 semilogy로 거듭제곱·지수 관계 보기', 'Power laws and exponentials on log axes'],
    `% Log axes: straight lines for power laws and exponentials.
x = logspace(-1, 3, 100);
subplot(1, 2, 1); loglog(x, x.^2, x, x.^0.5); grid on
legend('x^2', 'x^{1/2}'); title('loglog');
t = linspace(0, 5, 100);
subplot(1, 2, 2); semilogy(t, exp(2*t), t, exp(-t)); grid on
legend('e^{2t}', 'e^{-t}'); title('semilogy');
`),
  S('errorbar', 'plot2d', 'plotStem', '#ff6b6b', ['errorbar', 'fill'], ['오차 막대와 신뢰 구간', 'Error bars and bands'], ['측정값의 오차 막대와 음영 구간', 'Error bars and a shaded confidence band'],
    `% Error bars and a shaded band around a mean curve.
x = 0:0.5:6;
y = sin(x); e = 0.1 + 0.05*x;
fill([x fliplr(x)], [y-e fliplr(y+e)], [0.6 0.8 1], 'EdgeColor', 'none'); hold on
errorbar(x, y, e, 'o-', 'LineWidth', 1.2); hold off
grid on; title('Measurements with uncertainty');
`),
  S('pie', 'plot2d', 'plotPie', '#f5c451', ['pie', 'histogram'], ['원 그래프와 히스토그램', 'Pie and histogram'], ['비율과 분포 보기', 'Proportions and a distribution'],
    `% Pie chart of shares and a histogram of samples.
shares = [35 25 20 12 8];
subplot(1, 2, 1); pie(shares); title('Market share');
subplot(1, 2, 2); histogram(randn(2000, 1) .^ 2, 30); title('Chi-square (1) samples');
`),

  // ── 3D plots ──
  S('surface', 'plot3d', 'plotSurf', '#f72585', ['surf', 'light', 'colormap'], ['3D 곡면과 조명', '3D surface and light'], ['peaks 곡면, 색 지도, 조명', 'The peaks surface, a colormap and lighting'],
    `% A 3D surface with lighting.
[X, Y] = meshgrid(linspace(-3, 3, 60));
Z = peaks(X, Y);
surf(X, Y, Z, 'EdgeColor', 'none');
colormap(parula); colorbar
light('Position', [1 1 2]); lighting gouraud
xlabel('x'); ylabel('y'); zlabel('z');
title('peaks(x, y)');
`),
  S('mesh', 'plot3d', 'plotMesh', '#4cc9f0', ['mesh', 'sinc'], ['그물 곡면', 'Mesh'], ['sinc 함수의 와이어프레임', 'A wireframe of the 2D sinc function'],
    `% Mesh of the 2D sinc function.
[X, Y] = meshgrid(-8:0.4:8);
R = sqrt(X.^2 + Y.^2) + eps;
Z = sin(R) ./ R;
mesh(X, Y, Z); colormap(jet)
title('sin(r)/r'); view(-37.5, 30)
`),
  S('contour', 'plot3d', 'plotContour', '#4ade80', ['contourf', 'quiver'], ['등고선과 기울기', 'Contours and gradient'], ['등고선 위에 기울기 벡터장', 'Filled contours with the gradient field'],
    `% Filled contours of a function and its gradient field.
[X, Y] = meshgrid(-2:0.1:2);
Z = X .* exp(-X.^2 - Y.^2);
contourf(X, Y, Z, 20); colorbar; hold on
[Xq, Yq] = meshgrid(-2:0.25:2);
Zq = Xq .* exp(-Xq.^2 - Yq.^2);
[Gx, Gy] = gradient(Zq, 0.25);
quiver(Xq, Yq, Gx, Gy, 'k'); hold off
axis equal; title('z = x e^{-x^2-y^2} and \\nabla z');
`),
  S('helix', 'plot3d', 'plotLine', '#ff9f1c', ['plot3', 'scatter3'], ['3D 곡선', '3D curve'], ['나선과 3D 산점도', 'A helix and a 3D scatter'],
    `% A 3D helix and points on a sphere.
t = linspace(0, 10*pi, 800);
plot3(cos(t), sin(t), t / (10*pi), 'LineWidth', 1.5); hold on
rng(2); p = randn(200, 3); p = p ./ sqrt(sum(p.^2, 2));
scatter3(p(:,1), p(:,2), p(:,3) * 0.4 + 0.5, 12, p(:,3), 'filled'); hold off
grid on; axis equal; view(3); title('Helix and points on a sphere');
`),
  S('sphere', 'plot3d', 'circleDot', '#7b61ff', ['sphere', 'cylinder', 'shading'], ['기본 입체', 'Solids'], ['구, 원기둥, 조명과 재질', 'A sphere and a cylinder with light and material'],
    `% Simple solids with lighting.
[x, y, z] = sphere(40);
surf(x, y, z, 'EdgeColor', 'none'); hold on
[cx, cy, cz] = cylinder(0.5, 40);
surf(cx + 2.5, cy, 2*cz - 1, 'EdgeColor', 'none'); hold off
axis equal; shading interp; colormap(cool)
camlight headlight; lighting gouraud; material shiny
title('sphere and cylinder');
`),

  // ── Numerics ──
  S('ode', 'numerics', 'flow', '#4ade80', ['ode45', 'phase'], ['미분 방정식', 'Differential equations'], ['ode45로 푼 van der Pol 진동자와 위상도', 'The van der Pol oscillator with ode45 and its phase portrait'],
    `% The van der Pol oscillator solved with ode45.
mu = 2;
f = @(t, y) [y(2); mu*(1 - y(1)^2)*y(2) - y(1)];
[t, y] = ode45(f, [0 30], [2; 0]);
subplot(2, 1, 1);
plot(t, y(:, 1)); grid on
title('Solution y_1(t)'); xlabel('t');
subplot(2, 1, 2);
plot(y(:, 1), y(:, 2)); grid on
title('Phase portrait'); xlabel('y_1'); ylabel('y_2');
`),
  S('lorenz', 'numerics', 'sparkle', '#f72585', ['ode45', 'chaos'], ['로렌츠 끌개', 'Lorenz attractor'], ['혼돈계를 적분해 3D로 그리기', 'Integrating a chaotic system and plotting it in 3D'],
    `% The Lorenz system: a chaotic attractor.
sigma = 10; rho = 28; beta = 8/3;
f = @(t, x) [sigma*(x(2) - x(1)); x(1)*(rho - x(3)) - x(2); x(1)*x(2) - beta*x(3)];
[t, x] = ode45(f, [0 40], [1; 1; 1]);
plot3(x(:,1), x(:,2), x(:,3)); grid on; view(30, 20)
title('Lorenz attractor'); xlabel('x'); ylabel('y'); zlabel('z');
`),
  S('integral', 'numerics', 'plotArea', '#4cc9f0', ['integral', 'trapz', 'quadgk'], ['수치 적분', 'Numerical integration'], ['integral, trapz, 이중 적분 비교', 'integral, trapz and a double integral'],
    `% Numerical integration three ways.
f = @(x) exp(-x.^2);
exact = sqrt(pi) / 2 * erf(2)
q1 = integral(f, 0, 2)
x = linspace(0, 2, 41);
q2 = trapz(x, f(x))
q3 = integral2(@(x, y) x.^2 + y.^2, 0, 1, 0, 1)   % = 2/3
fprintf('errors: integral %.1e, trapz %.1e\\n', abs(q1 - exact), abs(q2 - exact));
`),
  S('roots', 'numerics', 'target', '#ff6b6b', ['fzero', 'roots', 'newton'], ['방정식의 근', 'Root finding'], ['fzero, 다항식 roots, 뉴턴 방법 직접 구현', 'fzero, polynomial roots and a hand-written Newton method'],
    `% Root finding: fzero, polynomial roots and Newton's method.
f = @(x) cos(x) - x;
r1 = fzero(f, 1)
p = [1 -6 11 -6];          % (x-1)(x-2)(x-3)
r2 = roots(p)'
x = 1; df = @(x) -sin(x) - 1;
for k = 1:6
    x = x - f(x) / df(x);
    fprintf('iteration %d: x = %.12f\\n', k, x);
end
`),
  S('interp', 'numerics', 'plotLine', '#f5c451', ['interp1', 'spline', 'pchip'], ['보간', 'Interpolation'], ['선형, 스플라인, pchip 보간 비교', 'Linear, spline and pchip interpolation'],
    `% Interpolation methods compared.
x = 0:6; y = [0 1 0.5 2 1.5 3 2.5];
xq = linspace(0, 6, 300);
plot(x, y, 'ko', 'MarkerFaceColor', 'k'); hold on
plot(xq, interp1(x, y, xq, 'linear'));
plot(xq, interp1(x, y, xq, 'spline'));
plot(xq, interp1(x, y, xq, 'pchip')); hold off
legend('data', 'linear', 'spline', 'pchip', 'Location', 'northwest'); grid on
title('interp1');
`),
  S('heat', 'numerics', 'thermo', '#ff9f1c', ['PDE', 'finite difference'], ['열 방정식', 'Heat equation'], ['유한 차분법으로 1차원 열전도 풀기', 'Explicit finite differences for 1D heat flow'],
    `% The 1D heat equation u_t = alpha u_xx with explicit finite differences.
alpha = 0.01; L = 1; nx = 51; dx = L/(nx-1);
dt = 0.4 * dx^2 / alpha; nt = 400;
x = linspace(0, L, nx)';
u = sin(pi*x) + 0.5*sin(3*pi*x);
U = zeros(nx, 5); k = 1;
for n = 1:nt
    u(2:end-1) = u(2:end-1) + alpha*dt/dx^2 * (u(3:end) - 2*u(2:end-1) + u(1:end-2));
    if mod(n, 100) == 0, U(:, k) = u; k = k + 1; end
end
plot(x, U(:, 1:4), 'LineWidth', 1.3); grid on
legend('t_1', 't_2', 't_3', 't_4'); title('Heat diffusion'); xlabel('x'); ylabel('u');
`),

  // ── Linear algebra ──
  S('linalg', 'linalg', 'table', '#7b61ff', ['eig', 'svd', 'A\\b'], ['선형 대수', 'Linear algebra'], ['연립 방정식, 고유값, 특이값 분해', 'A linear system, eigenvalues and the SVD'],
    `% Linear algebra: solve a system, eigenvalues and the SVD.
A = magic(4) + eye(4);
b = (1:4)';
x = A \\ b
residual = norm(A*x - b)
[V, D] = eig(A);
lambda = diag(D)
s = svd(A)
conditionNumber = cond(A)
`),
  S('lsq', 'linalg', 'plotScatter', '#4ade80', ['polyfit', 'least squares'], ['최소 제곱 직선', 'Least squares'], ['정규 방정식과 polyfit로 직선 맞추기', 'Fitting a line with the normal equations and polyfit'],
    `% Least-squares line fit two ways.
rng(4);
x = (0:0.5:10)'; y = 2.5*x - 4 + randn(size(x));
A = [x ones(size(x))];
coef = A \\ y                 % least squares via backslash
p = polyfit(x, y, 1)         % the same with polyfit
plot(x, y, 'o', x, polyval(p, x), 'LineWidth', 1.4); grid on
title(sprintf('y = %.2f x %+.2f', p(1), p(2)));
`),
  S('svdimage', 'linalg', 'image', '#f72585', ['svd', 'low rank'], ['SVD 저차원 근사', 'SVD low-rank approximation'], ['행렬을 k개 특이값으로 압축하기', 'Compressing a matrix with k singular values'],
    `% Low-rank approximation with the SVD.
[X, Y] = meshgrid(linspace(-1, 1, 120));
M = peaks(3*X, 3*Y) + 0.3*sin(8*X) .* cos(6*Y);
[U, S, V] = svd(M);
ks = [1 3 8];
for i = 1:3
    k = ks(i);
    Mk = U(:, 1:k) * S(1:k, 1:k) * V(:, 1:k)';
    subplot(1, 4, i); imagesc(Mk); axis image off
    title(sprintf('rank %d', k));
end
subplot(1, 4, 4); imagesc(M); axis image off; title('original');
`),
  S('markov', 'linalg', 'flow', '#4cc9f0', ['eig', 'Markov'], ['마르코프 연쇄', 'Markov chain'], ['전이 행렬의 정상 분포', 'The stationary distribution of a transition matrix'],
    `% A Markov chain: the stationary distribution is an eigenvector.
P = [0.9 0.075 0.025; 0.15 0.8 0.05; 0.25 0.25 0.5];   % rows sum to 1
[V, D] = eig(P');
[~, k] = min(abs(diag(D) - 1));
piStat = V(:, k)' / sum(V(:, k))
x = [1 0 0];
for n = 1:50, x = x * P; end
after50Steps = x
`),

  // ── Signal and image ──
  S('signal', 'signal', 'plotBar', '#f5c451', ['fft', 'butter', 'filter'], ['신호 처리', 'Signal processing'], ['FFT 스펙트럼과 버터워스 저역 통과 필터', 'An FFT spectrum and a Butterworth low-pass filter'],
    `% Signal processing: the spectrum of a noisy signal and a low-pass filter.
fs = 1000; t = (0:1/fs:1-1/fs)';
x = sin(2*pi*50*t) + 0.5*sin(2*pi*120*t) + 0.3*randn(size(t));
X = abs(fft(x)) / numel(x);
f = (0:numel(x)-1)' * fs / numel(x);
[b, a] = butter(4, 80/(fs/2));
y = filter(b, a, x);
subplot(2, 1, 1); plot(f(1:500), X(1:500)); grid on
title('Spectrum'); xlabel('Hz');
subplot(2, 1, 2); plot(t(1:200), x(1:200), t(1:200), y(1:200)); grid on
title('Low-pass filtered'); legend('input', 'output');
`),
  S('chirp', 'signal', 'waves', '#ff6b6b', ['spectrogram', 'chirp'], ['스펙트로그램', 'Spectrogram'], ['주파수가 변하는 처프 신호의 시간-주파수 분석', 'Time-frequency view of a chirp'],
    `% A spectrogram of a linear chirp.
fs = 2000; t = 0:1/fs:2;
x = chirp(t, 50, 2, 600);
spectrogram(x, 128, 100, 256, fs, 'yaxis');
title('Chirp 50 → 600 Hz');
`),
  S('conv', 'signal', 'plotStairs', '#4ade80', ['conv', 'impulse'], ['합성곱', 'Convolution'], ['임펄스 응답과의 합성곱으로 이동 평균', 'A moving average as convolution with an impulse response'],
    `% Convolution: smoothing with a moving-average kernel.
rng(5);
n = 0:199;
x = double(mod(floor(n / 40), 2)) + 0.25*randn(1, 200);   % noisy square wave
h = ones(1, 9) / 9;
y = conv(x, h, 'same');
plot(n, x, n, y, 'LineWidth', 1.3); grid on
legend('noisy', 'smoothed'); title('y = x * h');
`),
  S('image', 'signal', 'plotImage', '#7b61ff', ['imagesc', 'conv2', 'edge'], ['영상 필터', 'Image filtering'], ['합성 영상에 흐림과 가장자리 검출', 'Blurring and edge detection on a synthetic image'],
    `% Image filtering on a synthetic image.
[X, Y] = meshgrid(1:128);
I = double((X - 64).^2 + (Y - 64).^2 < 40^2) + 0.5*double(abs(X - Y) < 6);
Kb = ones(7) / 49;                           % box blur
Ks = [1 0 -1; 2 0 -2; 1 0 -1];               % Sobel
B = conv2(I, Kb, 'same');
E = sqrt(conv2(I, Ks, 'same').^2 + conv2(I, Ks', 'same').^2);
subplot(1, 3, 1); imagesc(I); axis image off; title('image');
subplot(1, 3, 2); imagesc(B); axis image off; title('blurred');
subplot(1, 3, 3); imagesc(E); axis image off; title('edges');
colormap(gray)
`),

  // ── Statistics and data ──
  S('stats', 'stats', 'plotHist', '#2ec4b6', ['histogram', 'mean', 'quantile'], ['통계', 'Statistics'], ['정규 분포 표본의 히스토그램과 요약 값', 'A histogram of normal samples and summary values'],
    `% Statistics: a histogram of normal samples and summary values.
rng(1);
data = 10 + 2*randn(5000, 1);
histogram(data, 40);
title('Normal samples'); xlabel('value'); ylabel('count');
m = mean(data)
s = std(data)
q = quantile(data, [0.25 0.5 0.75])
`),
  S('montecarlo', 'stats', 'dice', '#f72585', ['rand', 'Monte Carlo'], ['몬테카를로 π', 'Monte Carlo pi'], ['무작위 점으로 원주율 추정', 'Estimating pi with random points'],
    `% Monte Carlo estimate of pi.
rng(7);
n = 5000;
p = rand(n, 2) * 2 - 1;
inside = sum(p.^2, 2) <= 1;
piEstimate = 4 * mean(inside)
plot(p(inside, 1), p(inside, 2), '.', p(~inside, 1), p(~inside, 2), '.');
axis equal; title(sprintf('\\\\pi \\\\approx %.4f', piEstimate));
`),
  S('table', 'stats', 'table', '#ff9f1c', ['table', 'groupsummary', 'sortrows'], ['테이블', 'Tables'], ['테이블 만들기, 정렬, 그룹 요약', 'Building, sorting and summarizing a table'],
    `% Tables: build, sort and summarize.
Name = ["Kim"; "Lee"; "Park"; "Choi"; "Jung"; "Kang"];
Dept = categorical(["A"; "B"; "A"; "C"; "B"; "A"]);
Score = [88; 92; 75; 64; 81; 95];
T = table(Name, Dept, Score)
sorted = sortrows(T, 'Score', 'descend')
summary = groupsummary(T, 'Dept', 'mean', 'Score')
best = T(T.Score > 85, :)
`),
  S('random', 'stats', 'dice', '#4cc9f0', ['randi', 'histcounts', 'law of large numbers'], ['큰 수의 법칙', 'Law of large numbers'], ['주사위 평균이 3.5로 수렴', 'The running mean of dice rolls converging to 3.5'],
    `% The law of large numbers with dice rolls.
rng(11);
rolls = randi(6, 1, 3000);
runningMean = cumsum(rolls) ./ (1:numel(rolls));
subplot(1, 2, 1); plot(runningMean); yline(3.5, '--'); grid on
title('Running mean'); xlabel('rolls');
subplot(1, 2, 2); bar(histcounts(rolls, 0.5:1:6.5)); title('Counts per face');
`),

  // ── Optimization and fitting ──
  S('optim', 'optim', 'target', '#ff9f1c', ['fminsearch', 'contour'], ['최적화', 'Optimization'], ['fminsearch로 Rosenbrock 함수의 최솟값 찾기', 'The minimum of the Rosenbrock function with fminsearch'],
    `% Optimization: the minimum of the Rosenbrock function.
f = @(p) (1 - p(1))^2 + 100*(p(2) - p(1)^2)^2;
[pmin, fval] = fminsearch(f, [-1.2 1])
[X, Y] = meshgrid(linspace(-2, 2, 120), linspace(-1, 3, 120));
Z = (1 - X).^2 + 100*(Y - X.^2).^2;
contour(X, Y, log(1 + Z), 30); hold on
plot(pmin(1), pmin(2), 'r*', 'MarkerSize', 12); hold off
title('Rosenbrock: log(1 + f)'); colorbar
`),
  S('curvefit', 'optim', 'plotLine', '#4ade80', ['lsqcurvefit', 'model'], ['곡선 맞춤', 'Curve fitting'], ['감쇠 진동 모델의 매개변수 추정', 'Estimating the parameters of a damped oscillation'],
    `% Nonlinear curve fitting: a damped oscillation.
rng(8);
t = linspace(0, 10, 80)';
model = @(p, t) p(1) * exp(-p(2)*t) .* cos(p(3)*t);
y = model([2 0.3 2.2], t) + 0.08*randn(size(t));
p = lsqcurvefit(model, [1 0.1 2], t, y)
plot(t, y, 'o', t, model(p, t), 'LineWidth', 1.5); grid on
legend('data', 'fit'); title('A e^{-bt} cos(\\omega t)');
`),
  S('linprog', 'optim', 'scale', '#7b61ff', ['linprog', 'LP'], ['선형 계획법', 'Linear programming'], ['생산 계획 문제를 linprog로 풀기', 'A production planning problem with linprog'],
    `% Linear programming: maximize profit 40x + 30y.
% subject to  x + y <= 40,  2x + y <= 60,  x, y >= 0
f = -[40; 30];                    % linprog minimizes
A = [1 1; 2 1]; b = [40; 60];
lb = [0; 0];
[xy, fval] = linprog(f, A, b, [], [], lb)
fprintf('make %.0f of x and %.0f of y for a profit of %.0f\\n', xy(1), xy(2), -fval);
`),

  // ── Control ──
  S('control', 'control', 'gauge', '#ff6b6b', ['tf', 'step', 'bode'], ['제어 시스템', 'Control systems'], ['전달 함수, 폐루프 계단 응답, 보드 선도', 'Transfer functions, a closed-loop step response and a Bode plot'],
    `% Control systems: a second-order plant in closed loop.
s = tf('s');
G = 4 / (s^2 + 1.2*s + 4);
C = 1 + 0.5/s;
T = feedback(C*G, 1)
subplot(1, 2, 1); step(T); grid on
subplot(1, 2, 2); bode(G); grid on
[Gm, Pm] = margin(C*G)
`),
  S('statespace', 'control', 'model', '#4cc9f0', ['ss', 'lqr', 'initial'], ['상태 공간과 LQR', 'State space and LQR'], ['역진자 모델을 LQR로 안정화', 'Stabilizing an inverted pendulum with LQR'],
    `% State-space model of an inverted pendulum stabilized with LQR.
A = [0 1; 9.81 0]; B = [0; 1]; C = [1 0]; D = 0;
sys = ss(A, B, C, D);
openLoopPoles = eig(A)'
K = lqr(A, B, diag([10 1]), 1)
cl = ss(A - B*K, B, C, D);
closedLoopPoles = eig(A - B*K)'
initial(cl, [0.2; 0]); grid on; title('Closed-loop response from 0.2 rad');
`),
  S('rootlocus', 'control', 'plotScatter', '#f5c451', ['rlocus', 'pole', 'zero'], ['근궤적', 'Root locus'], ['이득에 따른 폐루프 극점의 이동', 'How the closed-loop poles move with gain'],
    `% Root locus of a third-order plant.
G = tf([1 3], [1 6 8 0]);
p = pole(G)'
z = zero(G)'
rlocus(G); grid on
title('Root locus of (s+3)/(s(s+2)(s+4))');
`),

  // ── Text and data types ──
  S('strings', 'text', 'hash', '#f72585', ['string', 'split', 'join'], ['문자열 다루기', 'Working with text'], ['문자열 배열, 분리, 결합, 바꾸기', 'String arrays: split, join and replace'],
    `% Strings: split, count, join and replace.
s = "the quick brown fox jumps over the lazy dog";
words = split(s)'
numWords = numel(words)
lens = strlength(words)
longest = words(lens == max(lens))
upperFirst = join(upper(extractBefore(words, 2)) + extractAfter(words, 1), " ")
replaced = replace(s, ["quick" "lazy"], ["slow" "happy"])
`),
  S('regexp', 'text', 'search', '#7b61ff', ['regexp', 'tokens'], ['정규 표현식', 'Regular expressions'], ['날짜와 전자 우편 주소 뽑아내기', 'Extracting dates and e-mail addresses'],
    `% Regular expressions: find dates and e-mail addresses in text.
txt = 'Meeting on 2026-10-28 with kim@example.com; follow-up 2026-11-03 (lee@test.org).';
dates = regexp(txt, '\\d{4}-\\d{2}-\\d{2}', 'match')
emails = regexp(txt, '[\\w.]+@[\\w.]+\\w', 'match')
parts = regexp(txt, '(\\d{4})-(\\d{2})-(\\d{2})', 'tokens');
months = cellfun(@(c) str2double(c{2}), parts)
masked = regexprep(txt, '(\\w)[\\w.]*@', '$1***@')
`),
  S('structs', 'text', 'list', '#4ade80', ['struct', 'cell', 'cellfun'], ['구조체와 셀', 'Structs and cells'], ['구조체 배열, 셀 배열, cellfun/arrayfun', 'Struct arrays, cell arrays, cellfun and arrayfun'],
    `% Structs and cell arrays.
people = struct('name', {'Ann', 'Bob', 'Cho'}, 'age', {31, 27, 45});
names = {people.name}
ages = [people.age]
older = people(ages > 30);
disp({older.name})
c = {42, 'text', [1 2 3], @sin};
kinds = cellfun(@class, c, 'UniformOutput', false)
squares = arrayfun(@(k) k^2, 1:5)
`),
  S('datetime', 'text', 'calendar', '#ff9f1c', ['datetime', 'duration'], ['날짜와 시간', 'Dates and times'], ['datetime, duration, 날짜 계산', 'datetime, duration and date arithmetic'],
    `% Dates and times.
t0 = datetime(2026, 1, 1)
t1 = t0 + days(100)
weekdayName = day(t1, 'name')
span = datetime(2026, 12, 25) - t0
hoursInSpan = hours(span)
stamps = t0 + calmonths(0:3)
`),
  S('map', 'text', 'key', '#4cc9f0', ['containers.Map', 'word count'], ['키-값 사전', 'Key-value maps'], ['containers.Map으로 단어 수 세기', 'Counting words with containers.Map'],
    `% Counting words with a key-value map.
txt = lower('the cat and the hat and the bat');
words = strsplit(txt, ' ');
counts = containers.Map();
for k = 1:numel(words)
    w = words{k};
    if isKey(counts, w), counts(w) = counts(w) + 1; else, counts(w) = 1; end
end
keys(counts)
values(counts)
`),

  // ── Programming ──
  S('functions', 'program', 'code', '#4cc9f0', ['@', 'closure', 'recursion'], ['함수 핸들과 재귀', 'Function handles and recursion'], ['익명 함수, 클로저, 재귀 피보나치', 'Anonymous functions, closures and recursive Fibonacci'],
    `% Function handles, closures and recursion (local functions at the end).
square = @(x) x.^2;
compose = @(f, g) @(x) f(g(x));
sqThenSin = compose(@sin, square);
sqThenSin(1.2)
a = 3; addA = @(x) x + a;   % captures a = 3
a = 100; addA(1)             % still 4
fib = arrayfun(@fibr, 1:12)

function f = fibr(n)
    if n <= 2
        f = 1;
    else
        f = fibr(n - 1) + fibr(n - 2);
    end
end
`),
  S('errors', 'program', 'alert', '#ff6b6b', ['try', 'catch', 'error'], ['오류 처리', 'Error handling'], ['try/catch, 사용자 오류, 오류 식별자', 'try/catch, custom errors and identifiers'],
    `% Error handling with try / catch.
try
    x = [1 2 3] * [4 5 6];        % inner dimensions do not agree
catch err
    fprintf('Caught: %s\\n', err.message);
end
try
    error('demo:negative', 'Value %d must be positive.', -5);
catch err
    fprintf('id = %s, message = %s\\n', err.identifier, err.message);
end
warning('This is a warning; execution continues.');
disp('Still running.');
`),
  S('sorting', 'program', 'list', '#f5c451', ['algorithm', 'sort'], ['정렬 알고리즘', 'Sorting algorithm'], ['삽입 정렬을 직접 구현하고 sort와 비교', 'Insertion sort by hand compared with sort'],
    `% Insertion sort written by hand, checked against sort.
rng(9);
v = randi(100, 1, 15)
w = v;
for i = 2:numel(w)
    key = w(i); j = i - 1;
    while j >= 1 && w(j) > key
        w(j + 1) = w(j); j = j - 1;
    end
    w(j + 1) = key;
end
w
isequal(w, sort(v))
`),
  S('primes', 'program', 'hash', '#7b61ff', ['primes', 'isprime', 'sieve'], ['소수와 체', 'Primes and the sieve'], ['에라토스테네스의 체 직접 구현', 'The sieve of Eratosthenes by hand'],
    `% The sieve of Eratosthenes compared with primes().
N = 100;
isP = true(1, N); isP(1) = false;
for k = 2:floor(sqrt(N))
    if isP(k), isP(k*k:k:N) = false; end
end
p = find(isP)
isequal(p, primes(N))
twinPrimes = p([diff(p) == 2, false])
`),
];

/** Code for 새 함수 / 새 클래스 / 섹션 스크립트. */
export const TEMPLATES = {
  function: `function y = myFunction(x)
%MYFUNCTION Short description.
%   y = myFunction(x) ...

y = x;
end
`,
  class: `classdef MyClass
    %MYCLASS Short description.

    properties
        Value = 0
    end

    methods
        function obj = MyClass(v)
            if nargin > 0
                obj.Value = v;
            end
        end

        function r = twice(obj)
            r = 2 * obj.Value;
        end
    end
end
`,
  live: `%% Section 1
% Run one section with Ctrl+Enter.
x = linspace(0, 1, 50);

%% Section 2
plot(x, x.^2); grid on
`,
};
