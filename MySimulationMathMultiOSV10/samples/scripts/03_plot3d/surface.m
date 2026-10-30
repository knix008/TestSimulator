% 3D 곡면과 조명 / 3D surface and light
% peaks 곡면, 색 지도, 조명
% The peaks surface, a colormap and lighting
% (script sample — MySimulationMath start page)
% A 3D surface with lighting.
[X, Y] = meshgrid(linspace(-3, 3, 60));
Z = peaks(X, Y);
surf(X, Y, Z, 'EdgeColor', 'none');
colormap(parula); colorbar
light('Position', [1 1 2]); lighting gouraud
xlabel('x'); ylabel('y'); zlabel('z');
title('peaks(x, y)');
