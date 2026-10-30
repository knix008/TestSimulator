% 그물 곡면 / Mesh
% sinc 함수의 와이어프레임
% A wireframe of the 2D sinc function
% (script sample — MySimulationMath start page)
% Mesh of the 2D sinc function.
[X, Y] = meshgrid(-8:0.4:8);
R = sqrt(X.^2 + Y.^2) + eps;
Z = sin(R) ./ R;
mesh(X, Y, Z); colormap(jet)
title('sin(r)/r'); view(-37.5, 30)
