% 방정식의 근 / Root finding
% fzero, 다항식 roots, 뉴턴 방법 직접 구현
% fzero, polynomial roots and a hand-written Newton method
% (script sample — MySimulationMath start page)
% Root finding: fzero, polynomial roots and Newton's method.
f = @(x) cos(x) - x;
r1 = fzero(f, 1)
p = [1 -6 11 -6];          % (x-1)(x-2)(x-3)
r2 = roots(p)'
x = 1; df = @(x) -sin(x) - 1;
for k = 1:6
    x = x - f(x) / df(x);
    fprintf('iteration %d: x = %.12f\n', k, x);
end
