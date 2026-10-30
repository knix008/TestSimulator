% 최적화 / Optimization
% fminsearch로 Rosenbrock 함수의 최솟값 찾기
% The minimum of the Rosenbrock function with fminsearch
% (script sample — MySimulationMath start page)
% Optimization: the minimum of the Rosenbrock function.
f = @(p) (1 - p(1))^2 + 100*(p(2) - p(1)^2)^2;
[pmin, fval] = fminsearch(f, [-1.2 1])
[X, Y] = meshgrid(linspace(-2, 2, 120), linspace(-1, 3, 120));
Z = (1 - X).^2 + 100*(Y - X.^2).^2;
contour(X, Y, log(1 + Z), 30); hold on
plot(pmin(1), pmin(2), 'r*', 'MarkerSize', 12); hold off
title('Rosenbrock: log(1 + f)'); colorbar
