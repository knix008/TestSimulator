########################################################################
##
## A function file the way Octave's own sources look.
##
########################################################################

## -*- texinfo -*-
## @deftypefn  {} {@var{y} =} clampv (@var{x}, @var{lo}, @var{hi})
## @deftypefnx {} {@var{y} =} clampv (@var{x})
## Limit each element of @var{x} to the range [@var{lo}, @var{hi}].
##
## With one argument the range is [0, 1].  Example:
##
## @example
## @group
## clampv ([-1 0.5 2])
##     @result{} 0   0.5000   1
## @end group
## @end example
##
## @seealso{min, max}
## @end deftypefn

function y = clampv (x, lo, hi)

  if (nargin < 1)
    print_usage ();
  elseif (nargin == 1)
    lo = 0;  hi = 1;
  endif

  y = min (max (x, lo), hi);

endfunction

%!assert (clampv ([-1 0.5 2]), [0 0.5 1])
%!assert (clampv (5, 1, 3), 3)
%!error <Invalid call> clampv ()
