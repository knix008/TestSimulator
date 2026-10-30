% 미분 방정식 / Differential equations
% ode45로 푼 van der Pol 진동자와 위상도
% The van der Pol oscillator with ode45 and its phase portrait
% (script sample — MySimulationMath start page)
% The van der Pol oscillator solved with ode45.
mu = 2;
f = @(t, y) [y(2); mu*(1 - y(1)^2)*y(2) - y(1)];
[t, y] = ode45(f, [0 30], [2; 0]);
subplot(2, 1, 1);
plot(t, y(:, 1)); grid on
title('Solution y_1(t)'); xlabel('t');
subplot(2, 1, 2);
plot(y(:, 1), y(:, 2)); grid on
title('Phase portrait'); xlabel('y_1'); ylabel('y_2');
