% 산점도 / Scatter plot
% 크기와 색으로 값을 표현한 산점도
% Marker size and colour mapped to values
% (script sample — MySimulationMath start page)
% Scatter plot with size and colour mapped to data.
rng(3);
x = randn(300, 1); y = 0.6*x + 0.5*randn(300, 1);
r = sqrt(x.^2 + y.^2);
scatter(x, y, 10 + 30*r, r, 'filled');
colorbar; grid on; axis equal
title('Correlated samples'); xlabel('x'); ylabel('y');
