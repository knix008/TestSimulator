% 3D 곡선 / 3D curve
% 나선과 3D 산점도
% A helix and a 3D scatter
% (script sample — MySimulationMath start page)
% A 3D helix and points on a sphere.
t = linspace(0, 10*pi, 800);
plot3(cos(t), sin(t), t / (10*pi), 'LineWidth', 1.5); hold on
rng(2); p = randn(200, 3); p = p ./ sqrt(sum(p.^2, 2));
scatter3(p(:,1), p(:,2), p(:,3) * 0.4 + 0.5, 12, p(:,3), 'filled'); hold off
grid on; axis equal; view(3); title('Helix and points on a sphere');
