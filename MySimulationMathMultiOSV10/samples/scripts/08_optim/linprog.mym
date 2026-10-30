% 선형 계획법 / Linear programming
% 생산 계획 문제를 linprog로 풀기
% A production planning problem with linprog
% (script sample — MySimulationMath start page)
% Linear programming: maximize profit 40x + 30y.
% subject to  x + y <= 40,  2x + y <= 60,  x, y >= 0
f = -[40; 30];                    % linprog minimizes
A = [1 1; 2 1]; b = [40; 60];
lb = [0; 0];
[xy, fval] = linprog(f, A, b, [], [], lb)
fprintf('make %.0f of x and %.0f of y for a profit of %.0f\n', xy(1), xy(2), -fval);
