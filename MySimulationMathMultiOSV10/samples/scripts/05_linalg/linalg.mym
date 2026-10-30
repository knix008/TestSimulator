% 선형 대수 / Linear algebra
% 연립 방정식, 고유값, 특이값 분해
% A linear system, eigenvalues and the SVD
% (script sample — MySimulationMath start page)
% Linear algebra: solve a system, eigenvalues and the SVD.
A = magic(4) + eye(4);
b = (1:4)';
x = A \ b
residual = norm(A*x - b)
[V, D] = eig(A);
lambda = diag(D)
s = svd(A)
conditionNumber = cond(A)
