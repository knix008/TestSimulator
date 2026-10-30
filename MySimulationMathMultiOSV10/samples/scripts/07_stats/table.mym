% 테이블 / Tables
% 테이블 만들기, 정렬, 그룹 요약
% Building, sorting and summarizing a table
% (script sample — MySimulationMath start page)
% Tables: build, sort and summarize.
Name = ["Kim"; "Lee"; "Park"; "Choi"; "Jung"; "Kang"];
Dept = categorical(["A"; "B"; "A"; "C"; "B"; "A"]);
Score = [88; 92; 75; 64; 81; 95];
T = table(Name, Dept, Score)
sorted = sortrows(T, 'Score', 'descend')
summary = groupsummary(T, 'Dept', 'mean', 'Score')
best = T(T.Score > 85, :)
