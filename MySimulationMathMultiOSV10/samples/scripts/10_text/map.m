% 키-값 사전 / Key-value maps
% containers.Map으로 단어 수 세기
% Counting words with containers.Map
% (script sample — MySimulationMath start page)
% Counting words with a key-value map.
txt = lower('the cat and the hat and the bat');
words = strsplit(txt, ' ');
counts = containers.Map();
for k = 1:numel(words)
    w = words{k};
    if isKey(counts, w), counts(w) = counts(w) + 1; else, counts(w) = 1; end
end
keys(counts)
values(counts)
