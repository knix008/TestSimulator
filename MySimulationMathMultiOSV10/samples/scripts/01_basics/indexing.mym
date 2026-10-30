% 인덱싱 / Indexing
% 행·열 선택, end, 논리 인덱싱, 삭제
% Rows, columns, end, logical indexing and deletion
% (script sample — MySimulationMath start page)
% Indexing: subscripts, ranges, end and logical masks.
A = magic(5)
row2 = A(2, :)
lastCol = A(:, end)
corner = A(1:2, end-1:end)
big = A(A > 20)'          % logical indexing
A(A < 5) = 0              % assign through a mask
A(:, 3) = []              % delete a column
[r, c] = find(A == max(A(:)))
