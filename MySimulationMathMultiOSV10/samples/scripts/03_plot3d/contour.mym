% 등고선과 기울기 / Contours and gradient
% 등고선 위에 기울기 벡터장
% Filled contours with the gradient field
% (script sample — MySimulationMath start page)
% Filled contours of a function and its gradient field.
[X, Y] = meshgrid(-2:0.1:2);
Z = X .* exp(-X.^2 - Y.^2);
contourf(X, Y, Z, 20); colorbar; hold on
[Xq, Yq] = meshgrid(-2:0.25:2);
Zq = Xq .* exp(-Xq.^2 - Yq.^2);
[Gx, Gy] = gradient(Zq, 0.25);
quiver(Xq, Yq, Gx, Gy, 'k'); hold off
axis equal; title('z = x e^{-x^2-y^2} and \nabla z');
