% 극좌표 그래프 / Polar plot
% 장미 곡선과 나선
% A rose curve and a spiral
% (script sample — MySimulationMath start page)
% Polar plots: a rose curve and an Archimedean spiral.
theta = linspace(0, 2*pi, 600);
polarplot(theta, cos(4*theta), 'LineWidth', 1.5); hold on
polarplot(theta, theta / (2*pi), '--'); hold off
title('r = cos(4\theta) and r = \theta / 2\pi');
