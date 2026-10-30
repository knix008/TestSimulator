% SVD 저차원 근사 / SVD low-rank approximation
% 행렬을 k개 특이값으로 압축하기
% Compressing a matrix with k singular values
% (script sample — MySimulationMath start page)
% Low-rank approximation with the SVD.
[X, Y] = meshgrid(linspace(-1, 1, 120));
M = peaks(3*X, 3*Y) + 0.3*sin(8*X) .* cos(6*Y);
[U, S, V] = svd(M);
ks = [1 3 8];
for i = 1:3
    k = ks(i);
    Mk = U(:, 1:k) * S(1:k, 1:k) * V(:, 1:k)';
    subplot(1, 4, i); imagesc(Mk); axis image off
    title(sprintf('rank %d', k));
end
subplot(1, 4, 4); imagesc(M); axis image off; title('original');
