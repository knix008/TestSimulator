% 구조체와 셀 / Structs and cells
% 구조체 배열, 셀 배열, cellfun/arrayfun
% Struct arrays, cell arrays, cellfun and arrayfun
% (script sample — MySimulationMath start page)
% Structs and cell arrays.
people = struct('name', {'Ann', 'Bob', 'Cho'}, 'age', {31, 27, 45});
names = {people.name}
ages = [people.age]
older = people(ages > 30);
disp({older.name})
c = {42, 'text', [1 2 3], @sin};
kinds = cellfun(@class, c, 'UniformOutput', false)
squares = arrayfun(@(k) k^2, 1:5)
