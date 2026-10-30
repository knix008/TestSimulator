% 최소 제곱 직선 / Least squares
% 정규 방정식과 polyfit로 직선 맞추기
% Fitting a line with the normal equations and polyfit
% (script sample — MySimulationMath start page)
% Least-squares line fit two ways.
rng(4);
x = (0:0.5:10)'; y = 2.5*x - 4 + randn(size(x));
A = [x ones(size(x))];
coef = A \ y                 % least squares via backslash
p = polyfit(x, y, 1)         % the same with polyfit
plot(x, y, 'o', x, polyval(p, x), 'LineWidth', 1.4); grid on
title(sprintf('y = %.2f x %+.2f', p(1), p(2)));
