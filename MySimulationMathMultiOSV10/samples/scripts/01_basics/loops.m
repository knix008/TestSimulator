% 반복문과 조건문 / Loops and conditions
% for, while, if/elseif, switch로 콜라츠 수열 만들기
% for, while, if/elseif and switch on the Collatz sequence
% (script sample — MySimulationMath start page)
% Control flow: the Collatz sequence and a small classifier.
n = 27; steps = 0; peak = n;
while n ~= 1
    if mod(n, 2) == 0
        n = n / 2;
    else
        n = 3*n + 1;
    end
    steps = steps + 1;
    peak = max(peak, n);
end
fprintf('27 reaches 1 in %d steps (peak %d)\n', steps, peak);
for k = [-2 0 5]
    switch sign(k)
        case -1, fprintf('%d is negative\n', k);
        case 0,  fprintf('%d is zero\n', k);
        otherwise, fprintf('%d is positive\n', k);
    end
end
