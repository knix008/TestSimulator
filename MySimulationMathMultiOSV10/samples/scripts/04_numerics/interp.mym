% 보간 / Interpolation
% 선형, 스플라인, pchip 보간 비교
% Linear, spline and pchip interpolation
% (script sample — MySimulationMath start page)
% Interpolation methods compared.
x = 0:6; y = [0 1 0.5 2 1.5 3 2.5];
xq = linspace(0, 6, 300);
plot(x, y, 'ko', 'MarkerFaceColor', 'k'); hold on
plot(xq, interp1(x, y, xq, 'linear'));
plot(xq, interp1(x, y, xq, 'spline'));
plot(xq, interp1(x, y, xq, 'pchip')); hold off
legend('data', 'linear', 'spline', 'pchip', 'Location', 'northwest'); grid on
title('interp1');
