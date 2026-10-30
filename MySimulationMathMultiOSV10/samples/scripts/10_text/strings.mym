% 문자열 다루기 / Working with text
% 문자열 배열, 분리, 결합, 바꾸기
% String arrays: split, join and replace
% (script sample — MySimulationMath start page)
% Strings: split, count, join and replace.
s = "the quick brown fox jumps over the lazy dog";
words = split(s)'
numWords = numel(words)
lens = strlength(words)
longest = words(lens == max(lens))
upperFirst = join(upper(extractBefore(words, 2)) + extractAfter(words, 1), " ")
replaced = replace(s, ["quick" "lazy"], ["slow" "happy"])
