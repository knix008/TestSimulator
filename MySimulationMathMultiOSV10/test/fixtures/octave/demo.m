#!/usr/bin/octave -qf
## A typical Octave script: script-file functions, # comments, double-quoted
## strings with escapes, printf, ++ / += , do-until, endXXX keywords.
1;

function r = sq (x)
  r = x .^ 2;
endfunction

function [s, n] = describe (v)
  s = sprintf ("%d,", v);
  s(end) = [];
  n = numel (v);
endfunction

x = 1:5;
printf ("%d squared is %d\n", [x; sq(x)]);
name = "Octave";
printf ("length of name: %d, first char: %s\n", length (name), name(1));
s = "tab\there";
printf ("[%s] has %d chars\n", s, numel (s));
words = {"alpha", "beta", "gamma"};
for i = 1:numel (words)
  printf ("%d: %s\n", i, words{i});
endfor
if any (x > 3)
  disp ("some are big");
else
  disp ("all small");
endif
k = 0;
do
  k++;
until (k >= 3)
printf ("k = %d\n", k);
y = zeros (1, 3);
for i = 1:3, y(i) += i * 10; endfor
disp (y);
z = 2 ** 3;
printf ("z = %g, ne = %d\n", z, z != 8);
[str, cnt] = describe (x);
printf ("%s (%d values)\n", str, cnt);
try
  unwind_protect
    error ("demo:boom", "boom %d", 42);
  unwind_protect_cleanup
    disp ("cleanup ran");
  end_unwind_protect
catch err
  printf ("caught: %s (%s)\n", err.message, err.identifier);
end_try_catch
st.a = 1; st.b = "two";
printf ("fields: %s\n", strjoin (fieldnames (st)', ", "));
m = containers.Map ();
m("one") = 1;
printf ("map has one: %d\n", isKey (m, "one"));
c = num2cell ([1 2 3]);
printf ("sum via cellfun: %d\n", sum (cellfun (@(v) v * 2, c)));
t = strsplit ("a,b,c", ",");
printf ("%s|", t{:}); printf ("\n");
A = magic (3);
printf ("det = %g, rows = %d, columns = %d\n", det (A), rows (A), columns (A));
b = A \ [1; 2; 3];
printf ("%.4f ", b); printf ("\n");
fprintf ("%s\n", upper ("done"));
