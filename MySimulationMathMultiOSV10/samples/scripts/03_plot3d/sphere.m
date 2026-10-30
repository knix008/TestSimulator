% 기본 입체 / Solids
% 구, 원기둥, 조명과 재질
% A sphere and a cylinder with light and material
% (script sample — MySimulationMath start page)
% Simple solids with lighting.
[x, y, z] = sphere(40);
surf(x, y, z, 'EdgeColor', 'none'); hold on
[cx, cy, cz] = cylinder(0.5, 40);
surf(cx + 2.5, cy, 2*cz - 1, 'EdgeColor', 'none'); hold off
axis equal; shading interp; colormap(cool)
camlight headlight; lighting gouraud; material shiny
title('sphere and cylinder');
