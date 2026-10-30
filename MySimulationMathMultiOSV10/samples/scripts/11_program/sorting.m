% 정렬 알고리즘 / Sorting algorithm
% 삽입 정렬을 직접 구현하고 sort와 비교
% Insertion sort by hand compared with sort
% (script sample — MySimulationMath start page)
% Insertion sort written by hand, checked against sort.
rng(9);
v = randi(100, 1, 15)
w = v;
for i = 2:numel(w)
    key = w(i); j = i - 1;
    while j >= 1 && w(j) > key
        w(j + 1) = w(j); j = j - 1;
    end
    w(j + 1) = key;
end
w
isequal(w, sort(v))
