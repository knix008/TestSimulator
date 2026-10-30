% 벡터화 / Vectorization
% 반복문과 벡터 연산의 속도 비교
% Loop vs vectorized code timing
% (script sample — MySimulationMath start page)
% Vectorization: the same sum with a loop and with array operations.
n = 2e5;
tic; s1 = 0; for k = 1:n, s1 = s1 + 1/k^2; end; tLoop = toc;
tic; s2 = sum(1 ./ (1:n).^2); tVec = toc;
fprintf('loop %.4f s, vectorized %.4f s, difference %.2e\n', tLoop, tVec, abs(s1 - s2));
fprintf('pi^2/6 = %.10f, partial sum = %.10f\n', pi^2/6, s2);
