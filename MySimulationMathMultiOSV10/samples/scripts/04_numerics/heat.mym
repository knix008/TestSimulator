% 열 방정식 / Heat equation
% 유한 차분법으로 1차원 열전도 풀기
% Explicit finite differences for 1D heat flow
% (script sample — MySimulationMath start page)
% The 1D heat equation u_t = alpha u_xx with explicit finite differences.
alpha = 0.01; L = 1; nx = 51; dx = L/(nx-1);
dt = 0.4 * dx^2 / alpha; nt = 400;
x = linspace(0, L, nx)';
u = sin(pi*x) + 0.5*sin(3*pi*x);
U = zeros(nx, 5); k = 1;
for n = 1:nt
    u(2:end-1) = u(2:end-1) + alpha*dt/dx^2 * (u(3:end) - 2*u(2:end-1) + u(1:end-2));
    if mod(n, 100) == 0, U(:, k) = u; k = k + 1; end
end
plot(x, U(:, 1:4), 'LineWidth', 1.3); grid on
legend('t_1', 't_2', 't_3', 't_4'); title('Heat diffusion'); xlabel('x'); ylabel('u');
