% 로렌츠 끌개 / Lorenz attractor
% 혼돈계를 적분해 3D로 그리기
% Integrating a chaotic system and plotting it in 3D
% (script sample — MySimulationMath start page)
% The Lorenz system: a chaotic attractor.
sigma = 10; rho = 28; beta = 8/3;
f = @(t, x) [sigma*(x(2) - x(1)); x(1)*(rho - x(3)) - x(2); x(1)*x(2) - beta*x(3)];
[t, x] = ode45(f, [0 40], [1; 1; 1]);
plot3(x(:,1), x(:,2), x(:,3)); grid on; view(30, 20)
title('Lorenz attractor'); xlabel('x'); ylabel('y'); zlabel('z');
