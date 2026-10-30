% 함수 핸들과 재귀 / Function handles and recursion
% 익명 함수, 클로저, 재귀 피보나치
% Anonymous functions, closures and recursive Fibonacci
% (script sample — MySimulationMath start page)
% Function handles, closures and recursion (local functions at the end).
square = @(x) x.^2;
compose = @(f, g) @(x) f(g(x));
sqThenSin = compose(@sin, square);
sqThenSin(1.2)
a = 3; addA = @(x) x + a;   % captures a = 3
a = 100; addA(1)             % still 4
fib = arrayfun(@fibr, 1:12)

function f = fibr(n)
    if n <= 2
        f = 1;
    else
        f = fibr(n - 1) + fibr(n - 2);
    end
end
