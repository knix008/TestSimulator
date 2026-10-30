% 수치 적분 / Numerical integration
% integral, trapz, 이중 적분 비교
% integral, trapz and a double integral
% (script sample — MySimulationMath start page)
% Numerical integration three ways.
f = @(x) exp(-x.^2);
exact = sqrt(pi) / 2 * erf(2)
q1 = integral(f, 0, 2)
x = linspace(0, 2, 41);
q2 = trapz(x, f(x))
q3 = integral2(@(x, y) x.^2 + y.^2, 0, 1, 0, 1)   % = 2/3
fprintf('errors: integral %.1e, trapz %.1e\n', abs(q1 - exact), abs(q2 - exact));
