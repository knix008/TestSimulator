# The M Language

The M language is a numerical computing language whose basic data type is the matrix. Every number is a double-precision (`double`) matrix by default, and a scalar is a 1×1 matrix.

## Variables and Expressions

```m
a = 3;              % scalar
v = [1 2 3];        % row vector (commas or spaces)
w = [1; 2; 3];      % column vector (semicolons)
M = [1 2; 3 4];     % 2×2 matrix
r = 0:0.25:1        % start:step:end
z = 3 + 4i;         % complex number
abs(z)
```

- Variable names start with a letter and contain letters, digits and underscores. They are case-sensitive.
- Everything after `%` is a comment, and `%{ … %}` is a multi-line comment.
- `pi`, `Inf`, `NaN`, `eps`, `i`, `j`, `true` and `false` are predefined values.

## Operators

| Operation | Matrix | Element-wise |
| --- | --- | --- |
| Multiply | `A*B` | `A.*B` |
| Divide | `A/B`, `A\B` (linear systems) | `A./B` |
| Power | `A^2` | `A.^2` |
| Transpose | `A.'` (conjugate transpose `A'`) | |
| Compare | | `==` `~=` `<` `<=` `>` `>=` |
| Logical | `&&` `\|\|` (scalar, short-circuit) | `&` `\|` `~` `xor` |

Element-wise operations between arrays of different sizes expand the dimensions of size 1 to match (implicit expansion). Example: `[1;2;3] + [10 20]` is a 3×2 matrix.

## Indexing

```m
A = magic(4);
A(2,3)          % row 2, column 3
A(2,:)          % all of row 2
A(:,end)        % last column
A(end,end)
A(A > 10)       % logical indexing: elements greater than 10
A(1,:) = [];    % delete row 1
B = zeros(2);
B(3,3) = 7      % writing past the end grows the matrix
```

Indices start at 1. `end` is the last position in that dimension and `:` means all. A single index counts positions in column order (linear index).

## Data Types

| Kind | Create with | Example |
| --- | --- | --- |
| Real · complex | `double`, `single` | `x = 1.5` |
| Integer | `int8` … `int64`, `uint8` … `uint64` | `n = int32(7)` |
| Logical | `true`, `false`, comparison results | `m = x > 0` |
| Character array | Single quotes | `c = 'hello'` |
| String | Double quotes, `string` | `s = "hello"` |
| Cell array | Braces | `C = {1, 'a', [1 2 3]}` |
| Struct | Dot notation, `struct` | `p.name = "Kim"; p.age = 30;` |
| Table | `table`, `readtable` | `T = table(x', y')` |
| Function handle | `@` | `f = @(x) x.^2 + 1` |
| Date · time | `datetime`, `duration` | `d = datetime('now')` |
| Categorical | `categorical` | `g = categorical({'a','b','a'})` |
| Map | `containers.Map` | `m = containers.Map()` |

```m
C = {1, 'text', magic(3)};
C{3}(2,2)            % value inside a cell
s = struct('a', 1, 'b', "two");
s.c = [1 2 3];
fieldnames(s)
str = "The value is " + string(42)
T = table([1;2;3], ["a";"b";"c"], 'VariableNames', {'n', 'name'});
T.n'
```

## Control Flow

```m
for k = 1:3
    fprintf('k = %d\n', k);
end

n = 10;
while n > 1
    if mod(n, 2) == 0
        n = n / 2;
    else
        n = 3*n + 1;
    end
end

switch 'b'
    case {'a', 'b'}
        disp('a or b')
    otherwise
        disp('something else')
end
```

`break` exits a loop, and `continue` skips to the next iteration.

## Functions

```m
f = @(x, y) x.^2 + y.^2;     % anonymous function
f(3, 4)
g = @sin;                     % function handle
integral(g, 0, pi)
arrayfun(@(k) k^2, 1:4)
cellfun(@numel, {'ab', 'cde', ''})
```

A function file (`name.mym`) starts with `function [outputs…] = name(inputs…)`. Use `nargin` and `nargout` for the number of arguments, and `varargin` and `varargout` for variable arguments. Validate inputs with an `arguments` block, `validateattributes` or `inputParser`.

## Scripts

> File extension: this program saves M files as `.mym`. Existing `.m` files still open, run and are found on the path. When a `.mym` and a `.m` file have the same name, the `.mym` file is used.

A script is a `.mym` file that lists statements without `function`. It reads and writes the workspace variables directly. Typing its name runs it (when it is in the current folder or on the path), and `run path` also works. You can put local functions at the end of the file.

## Strings and Output

```m
name = "world";
msg = sprintf('Hello, %s! pi = %.4f', name, pi)
parts = strsplit('a,b,c', ',')
upper("abc")
regexprep('2026-10-28', '(\d+)-(\d+)-(\d+)', '$3.$2.$1')
num2str(pi, 8)
fprintf('%5.2f\n', [1.234 5.678])
```

## Classes

```m
classdef Account < handle
    properties
        Owner string
        Balance double = 0
    end
    methods
        function obj = Account(owner)
            obj.Owner = owner;
        end
        function deposit(obj, amount)
            if amount <= 0
                error('Account:amount', 'The amount must be greater than 0.');
            end
            obj.Balance = obj.Balance + amount;
        end
    end
end
```

After saving the code above as `Account.mym`:

```m
a = Account("Kim");
a.deposit(100);
a.Balance
```

A class that inherits from `handle` is handled by reference; otherwise it is handled by value. `properties` (access restrictions, default values, types), `methods` (static methods with `Static`), `events`, `enumeration` and inheritance (`<`) are supported.

## Error Handling

```m
try
    x = [1 2 3];
    y = x(5);
catch err
    disp(err.identifier)
    disp(err.message)
end

warning('off', 'all');   % turn warnings off
warning('on', 'all');
assert(1 + 1 == 2, 'Math is broken')
```

Raise an error with `error('id:name', 'message %d', value)`, or create an `MException` object and `throw` or `rethrow` it. Clicking the file:line link in an error message takes you to that location.

## Finding Help

- `help function` — description and usage of a function
- `lookfor word` — list of functions whose description contains the word
- `doc function` — detailed help
- `which function`, `exist name` — where it comes from and what it is
