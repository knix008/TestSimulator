## -*- texinfo -*-
## @deftypefn {} {@var{s} =} oct_greet (@var{name})
## Greets NAME.
## @end deftypefn
function s = oct_greet (name)
  if (nargin < 1)
    print_usage ();
  endif
  s = ["Hello, " name "!\n"];
endfunction

%!assert (oct_greet ("x"), "Hello, x!\n")
